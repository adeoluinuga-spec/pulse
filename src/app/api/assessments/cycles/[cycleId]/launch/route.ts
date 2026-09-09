import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

import { getRouteUser } from "@/lib/apiAuth";
import {
  assessmentCycleLaunchEmail,
  assessmentReviewerInviteEmail,
  emailDeliveryFailureMessage,
  resolveReplyTo,
  sendPulseEmail,
} from "@/lib/pulseEmail";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type EmployeeContext = {
  org_id: string;
  platform_role: string | null;
};

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type PendingReviewer = {
  id: string;
  subject_id: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_group: string;
};

function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function canLaunchAssessmentCycle(role?: string | null) {
  return role === "hr_admin" || role === "super_admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params;
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  if (!employee || !canLaunchAssessmentCycle(employee.platform_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { retryLaunchEmails?: boolean };

  const { data: cycle, error: cycleError } = await admin
    .from("assessment_cycles")
    .select("id, org_id, name, status, starts_on, closes_on, client_context, reviewer_weights, levels")
    .eq("id", cycleId)
    .eq("org_id", employee.org_id)
    .maybeSingle<{
      id: string;
      org_id: string;
      name: string | null;
      status: string | null;
      starts_on: string | null;
      closes_on: string | null;
      client_context: string | null;
      reviewer_weights: Record<string, number> | null;
      levels: string[] | null;
    }>();

  if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  if (cycle.status === "closed") {
    return NextResponse.json({ error: "Closed cycles cannot be launched again." }, { status: 409 });
  }

  if (cycle.status === "collecting" && !body.retryLaunchEmails) {
    return NextResponse.json({
      launched: false,
      notified: 0,
      emailed: 0,
      failed: 0,
      cycle,
      message: "This assessment cycle is already collecting feedback.",
    });
  }

  const retryingLaunchEmails = cycle.status === "collecting";
  let launchedCycle = cycle;
  if (!retryingLaunchEmails) {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error: updateError } = await admin
      .from("assessment_cycles")
      .update({
        status: "collecting",
        starts_on: cycle.starts_on ?? today,
      })
      .eq("id", cycle.id)
      .eq("org_id", employee.org_id)
      .select("id, org_id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    launchedCycle = data;
  }

  const [employeesResult, orgResult, hrResult] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, email")
      .eq("org_id", employee.org_id)
      .returns<EmployeeRow[]>(),
    admin
      .from("organisations")
      .select("name, reply_to_email")
      .eq("id", employee.org_id)
      .maybeSingle<{ name: string | null; reply_to_email: string | null }>(),
    admin
      .from("employees")
      .select("email")
      .eq("org_id", employee.org_id)
      .eq("platform_role", "hr_admin")
      .returns<Array<{ email: string | null }>>(),
  ]);

  const employees = employeesResult.data ?? [];
  const cycleName = launchedCycle.name?.trim() || "a 360 assessment";
  const organisationName = orgResult.data?.name?.trim() || launchedCycle.client_context?.trim() || "Your organisation";
  const notificationRows = employees.map((row) => ({
    employee_id: row.id,
    title: "360 assessment cycle launched",
    body: `${cycleName} has started. If you are selected to provide feedback, you will receive a separate secure invitation.`,
    type: "assessment_cycle_launched",
    action_url: "/dashboard",
  }));

  let notified = 0;
  if (!retryingLaunchEmails && notificationRows.length > 0) {
    const { error: notificationError } = await admin.from("notifications").insert(notificationRows);
    if (!notificationError) notified = notificationRows.length;
  }

  const replyTo = resolveReplyTo({
    orgReplyTo: orgResult.data?.reply_to_email,
    hrAdminEmails: (hrResult.data ?? []).map((row) => row.email),
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  // A retry is for outstanding reviewer assignments, not an excuse to mail the
  // whole organisation that the cycle started for a second time.
  const emailResults = retryingLaunchEmails
    ? []
    : await Promise.all(
      employees
        .filter((row) => Boolean(row.email?.trim()))
        .map(async (row) => {
          const message = assessmentCycleLaunchEmail({
            employeeName: row.name ?? "there",
            cycleName,
            organisationName,
            closesOn: launchedCycle.closes_on,
            appUrl,
          });
          const sent = await sendPulseEmail({
            to: row.email!.trim(),
            subject: message.subject,
            html: message.html,
            replyTo,
          });
          return sent;
        }),
    );

  const emailed = emailResults.filter((result) => result.ok).length;
  const failed = emailResults.length - emailed;
  const firstFailure = emailResults.find((result) => !result.ok);

  // Assigning raters is deliberately a reversible planning step. Launching is
  // the irreversible hand-off: every draft reviewer receives a fresh token and
  // the invitation that carries it. A token created during planning is only a
  // hash at rest, so issuing here also rotates it to a usable secret.
  const [{ data: pendingReviewers, error: pendingReviewersError }, { data: subjects }] = await Promise.all([
    admin
      .from("assessment_reviewers")
      .select("id, subject_id, reviewer_name, reviewer_email, reviewer_group")
      .eq("cycle_id", cycle.id)
      .eq("invite_status", "draft")
      .neq("status", "submitted")
      .returns<PendingReviewer[]>(),
    admin
      .from("assessment_subjects")
      .select("id, name")
      .eq("cycle_id", cycle.id)
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  if (pendingReviewersError) {
    return NextResponse.json({ error: pendingReviewersError.message }, { status: 500 });
  }

  const subjectNames = new Map((subjects ?? []).map((subject) => [subject.id, subject.name]));
  const invitationResults = await Promise.all((pendingReviewers ?? []).map(async (reviewer) => {
    const subjectName = subjectNames.get(reviewer.subject_id);
    if (!subjectName) return { ok: false as const, reviewer, error: "Assessment participant was not found" };

    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    const { error: tokenError } = await admin
      .from("assessment_reviewers")
      .update({
        token_hash: hashToken(token),
        token_expires_at: expiresAt,
        invite_status: "draft",
        invite_channel: "email",
      })
      .eq("id", reviewer.id)
      .eq("invite_status", "draft");

    if (tokenError) return { ok: false as const, reviewer, error: tokenError.message };

    const mail = assessmentReviewerInviteEmail({
      reviewerName: reviewer.reviewer_name,
      subjectName,
      isSelfAssessment: reviewer.reviewer_group === "self",
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      queueLink: `${request.nextUrl.origin}/review/queue/${token}`,
      expiresAt,
    });
    const sent = await sendPulseEmail({
      to: reviewer.reviewer_email,
      subject: mail.subject,
      html: mail.html,
      replyTo,
    });
    if (!sent.ok) return { ok: false as const, reviewer, error: sent.error };

    const { error: sentUpdateError } = await admin
      .from("assessment_reviewers")
      .update({ invite_status: "sent" })
      .eq("id", reviewer.id);
    if (sentUpdateError) return { ok: false as const, reviewer, error: sentUpdateError.message };

    return { ok: true as const, reviewer, expiresAt };
  }));

  const issuedReviewerInvites = invitationResults.filter((result) => result.ok).length;
  const failedReviewerInvites = invitationResults.length - issuedReviewerInvites;
  const firstReviewerFailure = invitationResults.find((result) => !result.ok);

  if (issuedReviewerInvites > 0) {
    await Promise.all([
      admin
        .from("assessment_cycles")
        .update({ rater_rules_locked_at: new Date().toISOString() })
        .eq("id", cycle.id)
        .is("rater_rules_locked_at", null),
      admin.from("assessment_audit_events").insert(
        invitationResults
          .filter((result): result is Extract<typeof result, { ok: true }> => result.ok)
          .map((result) => ({
            cycle_id: cycle.id,
            subject_id: result.reviewer.subject_id,
            reviewer_id: result.reviewer.id,
            action: "reviewer_invite_issued",
            metadata: { channel: "email", scope: "launch", issuedBy: user.id, expiresAt: result.expiresAt },
          })),
      ),
    ]);
  }

  return NextResponse.json({
    launched: !retryingLaunchEmails,
    retried: retryingLaunchEmails,
    notified,
    emailed,
    failed,
    deliveryMessage: firstFailure && !firstFailure.ok ? emailDeliveryFailureMessage(firstFailure.error) : undefined,
    reviewerInvites: {
      issued: issuedReviewerInvites,
      failed: failedReviewerInvites,
      pending: (pendingReviewers ?? []).length,
      deliveryMessage: firstReviewerFailure && !firstReviewerFailure.ok
        ? emailDeliveryFailureMessage(firstReviewerFailure.error)
        : undefined,
    },
    cycle: launchedCycle,
  });
}
