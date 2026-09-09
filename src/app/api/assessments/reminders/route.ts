import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import { assessmentReminderEmail, resolveReplyTo, sendPulseEmail } from "@/lib/pulseEmail";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type EmployeeContext = {
  id: string;
  org_id: string;
  platform_role: string | null;
};

type ReviewerRow = {
  id: string;
  cycle_id: string;
  subject_id: string;
  reviewer_name: string | null;
  reviewer_email: string;
  status: string | null;
  token_expires_at: string | null;
};

type SubjectRow = {
  id: string;
  name: string;
};

function canSendAssessmentReminders(role?: string | null) {
  return role === "hr_admin" || role === "super_admin";
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  if (!employee || !canSendAssessmentReminders(employee.platform_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { cycleId?: string };
  const cycleId = body.cycleId?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id, name, closes_on, org_id")
    .eq("id", cycleId)
    .eq("org_id", employee.org_id)
    .maybeSingle<{ id: string; name: string | null; closes_on: string | null; org_id: string }>();

  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const { data: reviewers, error: reviewersError } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, reviewer_name, reviewer_email, status, token_expires_at")
    .eq("cycle_id", cycle.id)
    .neq("status", "submitted")
    .not("token_expires_at", "is", null)
    .gt("token_expires_at", new Date().toISOString())
    .returns<ReviewerRow[]>();

  if (reviewersError) {
    return NextResponse.json({ error: reviewersError.message }, { status: 500 });
  }

  const subjectIds = Array.from(new Set((reviewers ?? []).map((row) => row.subject_id)));
  // Only participants still in the cycle. Chasing someone for feedback on a
  // person who has been withdrawn is the most visible way a withdrawal can leak.
  const { data: subjects } = subjectIds.length
    ? await admin
        .from("assessment_subjects")
        .select("id, name")
        .in("id", subjectIds)
        .is("withdrawn_at", null)
        .returns<SubjectRow[]>()
    : { data: [] as SubjectRow[] };
  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject.name]));

  const [orgResult, hrResult] = await Promise.all([
    admin
      .from("organisations")
      .select("reply_to_email")
      .eq("id", employee.org_id)
      .maybeSingle<{ reply_to_email: string | null }>(),
    admin
      .from("employees")
      .select("email")
      .eq("org_id", employee.org_id)
      .eq("platform_role", "hr_admin")
      .returns<Array<{ email: string | null }>>(),
  ]);

  const replyTo = resolveReplyTo({
    orgReplyTo: orgResult.data?.reply_to_email,
    hrAdminEmails: (hrResult.data ?? []).map((row) => row.email),
  });

  const contactUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/review/contact`;
  // A rater whose participant is no longer in the map is one assigned to a
  // withdrawn participant. They are dropped rather than emailed: the template
  // falls back to "this assessment" when it cannot name a subject, so leaving
  // them in would send a real chaser for someone who is no longer being assessed.
  const dueReviewers = (reviewers ?? []).filter((reviewer) => subjectById.has(reviewer.subject_id));
  const skippedWithdrawn = (reviewers ?? []).length - dueReviewers.length;

  const results = await Promise.all(
    dueReviewers.map(async (reviewer) => {
      const message = assessmentReminderEmail({
        reviewerName: reviewer.reviewer_name ?? "there",
        subjectName: subjectById.get(reviewer.subject_id) ?? "this assessment",
        cycleName: cycle.name ?? "the current 360 assessment",
        closesOn: cycle.closes_on,
        contactUrl,
      });
      const sent = await sendPulseEmail({
        to: reviewer.reviewer_email,
        subject: message.subject,
        html: message.html,
        replyTo,
      });

      return {
        reviewerId: reviewer.id,
        email: reviewer.reviewer_email,
        status: sent.ok ? "sent" : "delivery_failed",
        error: sent.ok ? undefined : sent.error,
      };
    }),
  );

  const failed = results.filter((result) => result.status === "delivery_failed").length;
  return NextResponse.json({
    reminded: results.length - failed,
    failed,
    skippedWithdrawn,
    results,
  });
}
