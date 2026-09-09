import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

import { assessmentReviewerInviteEmail, resolveOrgReplyTo, sendPulseEmail } from "@/lib/pulseEmail";
import { resolveRaterRemoval } from "@/lib/assessmentRemoval";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Sends one rater invitation through the shared Pulse sender.
 *
 * The body and the Resend call used to live here in full, behind a sender that
 * fell back to an unverified domain. Both now come from pulseEmail, so a missing
 * FROM_EMAIL is reported rather than silently rejected at the provider.
 */
async function sendReviewerEmailInvite(input: {
  to: string;
  reviewerName: string;
  subjectName: string;
  isSelfAssessment: boolean;
  secureLink: string;
  queueLink?: string;
  expiresAt: string;
  replyTo?: string;
}) {
  const mail = assessmentReviewerInviteEmail({
    reviewerName: input.reviewerName,
    subjectName: input.subjectName,
    isSelfAssessment: input.isSelfAssessment,
    secureLink: input.secureLink,
    queueLink: input.queueLink,
    expiresAt: input.expiresAt,
  });

  return sendPulseEmail({ to: input.to, subject: mail.subject, html: mail.html, replyTo: input.replyTo });
}

async function cycleBelongsToOrg(admin: ReturnType<typeof getAdminClient>, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Confirms the subject is in this cycle and returns their name.
 *
 * The name is returned rather than a bare boolean because the invitation has to
 * say who is being assessed. Both call sites previously passed the rater's own
 * name in that slot, so every invite read "give feedback on <yourself>" and the
 * rater was never told whose assessment they had been sent.
 */
async function findSubjectInCycle(
  admin: ReturnType<typeof getAdminClient>,
  subjectId: string,
  cycleId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from("assessment_subjects")
    .select("id, name")
    .eq("id", subjectId)
    .eq("cycle_id", cycleId)
    .maybeSingle<{ id: string; name: string }>();

  return data ?? null;
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId) {
    return NextResponse.json({ reviewers: [] }, { status: 200 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const { data: reviewers } = await admin
    .from("assessment_reviewers")
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .eq("cycle_id", cycleId)
    .order("reviewer_name", { ascending: true });

  return NextResponse.json({ reviewers: reviewers ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (employee as { platform_role?: string } | null)?.platform_role;
  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    reviewerName?: string;
    reviewerEmail?: string;
    reviewerGroup?: string;
    organisation?: string;
    inviteChannel?: string;
    assessmentScope?: string;
  };

  if (!body.cycleId || !body.subjectId || !body.reviewerName?.trim() || !body.reviewerEmail?.trim()) {
    return NextResponse.json({ error: "cycleId, subjectId, reviewerName, and reviewerEmail are required" }, { status: 400 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, body.cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const subject = await findSubjectInCycle(admin, body.subjectId, body.cycleId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const inviteChannel = "email";
  const assessmentScope = body.assessmentScope ?? (body.reviewerGroup === "customer" ? "customer_experience" : "individual");

  const { data, error } = await admin
    .from("assessment_reviewers")
    .insert({
      cycle_id: body.cycleId,
      subject_id: body.subjectId,
      reviewer_name: body.reviewerName.trim(),
      reviewer_email: body.reviewerEmail.trim(),
      reviewer_group: body.reviewerGroup ?? "colleague",
      organisation: body.organisation ?? null,
      token_hash: hashToken(token),
      token_expires_at: expiresAt,
      invite_status: "draft",
      invite_channel: inviteChannel,
      assessment_scope: assessmentScope,
      status: "not_started",
    })
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sendResult = await sendReviewerEmailInvite({
    to: body.reviewerEmail.trim(),
    reviewerName: body.reviewerName.trim(),
    subjectName: subject.name,
    isSelfAssessment: (body.reviewerGroup ?? "colleague") === "self",
    secureLink: `${request.nextUrl.origin}/review/${token}`,
    queueLink: `${request.nextUrl.origin}/review/queue/${token}`,
    replyTo: await resolveOrgReplyTo(admin, orgId),
    expiresAt,
  });

  if (!sendResult.ok) {
    await admin
      .from("assessment_reviewers")
      .update({ invite_status: "draft" })
      .eq("id", data.id);

    return NextResponse.json({
      error: sendResult.error ?? "Invite delivery failed",
      reviewer: { ...data, invite_status: "draft", invite_channel: inviteChannel },
      invite: {
        token,
        reviewerId: data.id,
        secureLink: `${request.nextUrl.origin}/review/${token}`,
        expiresAt,
        status: "draft",
      },
    }, { status: 502 });
  }

  const { data: updatedReviewer, error: updateError } = await admin
    .from("assessment_reviewers")
    .update({ invite_status: "sent" })
    .eq("id", data.id)
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    reviewer: updatedReviewer,
    invite: {
      token,
      reviewerId: updatedReviewer.id,
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      expiresAt,
      status: "sent",
    },
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (employee as { platform_role?: string } | null)?.platform_role;
  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    reviewerId?: string;
    action?: "issue_invite";
    inviteChannel?: string;
    assessmentScope?: string;
  };

  if (!body.reviewerId || body.action !== "issue_invite") {
    return NextResponse.json({ error: "reviewerId and issue_invite action are required" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, reviewer_name, reviewer_email, reviewer_group, status, invite_channel, assessment_scope")
    .eq("id", body.reviewerId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Reviewer not found" }, { status: 404 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, existing.cycle_id, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Reviewer not found" }, { status: 404 });
  }

  if (existing.status === "submitted") {
    return NextResponse.json({ error: "Submitted reviewers cannot be re-invited" }, { status: 409 });
  }

  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const inviteChannel = "email";
  const assessmentScope = body.assessmentScope ?? existing.assessment_scope ?? (existing.reviewer_group === "customer" ? "customer_experience" : "individual");

  const { data, error } = await admin
    .from("assessment_reviewers")
    .update({
      token_hash: hashToken(token),
      token_expires_at: expiresAt,
      invite_status: "draft",
      invite_channel: inviteChannel,
      assessment_scope: assessmentScope,
    })
    .eq("id", existing.id)
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const subject = await findSubjectInCycle(admin, existing.subject_id, existing.cycle_id);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const sendResult = await sendReviewerEmailInvite({
    to: existing.reviewer_email,
    reviewerName: existing.reviewer_name,
    subjectName: subject.name,
    isSelfAssessment: existing.reviewer_group === "self",
    secureLink: `${request.nextUrl.origin}/review/${token}`,
    queueLink: `${request.nextUrl.origin}/review/queue/${token}`,
    replyTo: await resolveOrgReplyTo(admin, orgId),
    expiresAt,
  });

  if (!sendResult.ok) {
    await admin
      .from("assessment_reviewers")
      .update({ invite_status: "draft" })
      .eq("id", existing.id);

    return NextResponse.json({
      error: sendResult.error ?? "Invite delivery failed",
      reviewer: { ...data, invite_status: "draft", invite_channel: inviteChannel },
      invite: {
        token,
        reviewerId: data.id,
        reviewerName: data.reviewer_name,
        reviewerEmail: data.reviewer_email,
        channel: inviteChannel,
        scope: assessmentScope,
        secureLink: `${request.nextUrl.origin}/review/${token}`,
        expiresAt,
        status: "draft",
      },
    }, { status: 502 });
  }

  const { data: updatedReviewer, error: updateError } = await admin
    .from("assessment_reviewers")
    .update({ invite_status: "sent" })
    .eq("id", existing.id)
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("assessment_audit_events").insert({
    cycle_id: existing.cycle_id,
    subject_id: existing.subject_id,
    reviewer_id: existing.id,
    action: "reviewer_invite_issued",
    metadata: {
      channel: inviteChannel,
      scope: assessmentScope,
      issuedBy: user.id,
      expiresAt,
    },
  });

  return NextResponse.json({
    reviewer: updatedReviewer,
    invite: {
      token,
      reviewerId: updatedReviewer.id,
      reviewerName: updatedReviewer.reviewer_name,
      reviewerEmail: updatedReviewer.reviewer_email,
      channel: updatedReviewer.invite_channel,
      scope: updatedReviewer.assessment_scope,
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      expiresAt,
      status: updatedReviewer.invite_status,
    },
  });
}

/**
 * Takes a rater off an assessment.
 *
 * As with participants, the verb comes from the evidence rather than from the
 * caller. A rater who has answered is never deleted: their responses feed the
 * subject's report, and removing them would change the per-group counts that
 * decide which cells are suppressed — a report could silently start showing a
 * group that was correctly hidden a moment before. Their link is revoked
 * instead, which stops further answering and leaves the arithmetic alone.
 */
export async function DELETE(request: NextRequest) {
  const reviewerId = request.nextUrl.searchParams.get("id");
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  if (!reviewerId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ org_id: string | null; platform_role: string | null }>();

  const orgId = employee?.org_id;
  const role = employee?.platform_role;
  if (!orgId || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, reviewer_name, reviewer_email, status, invite_status")
    .eq("id", reviewerId)
    .maybeSingle<{
      id: string;
      cycle_id: string;
      subject_id: string;
      reviewer_name: string;
      reviewer_email: string;
      status: string;
      invite_status: string;
    }>();

  if (!existing) return NextResponse.json({ error: "Rater not found" }, { status: 404 });

  // Tenant boundary. This route runs as service-role from here on, so nothing
  // below is protected by policy.
  const hasCycleAccess = await cycleBelongsToOrg(admin, existing.cycle_id, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Rater not found" }, { status: 404 });
  }

  const { count: responseCount, error: countError } = await admin
    .from("assessment_responses")
    .select("id", { count: "exact", head: true })
    .eq("reviewer_id", existing.id);

  if (countError) {
    // Failing open would delete answers we could not prove were absent.
    return NextResponse.json(
      { error: "Could not confirm whether this rater has answered, so nothing was changed." },
      { status: 503 },
    );
  }

  const decision = resolveRaterRemoval({ status: existing.status, responseCount: responseCount ?? 0 });
  const evidence = { status: existing.status, responseCount: responseCount ?? 0 };

  if (dryRun) {
    return NextResponse.json({
      decision,
      evidence,
      rater: { id: existing.id, name: existing.reviewer_name, email: existing.reviewer_email },
    });
  }

  if (decision.action === "revoke") {
    // Expire the token rather than clearing it: an expired link tells the rater
    // their window has closed, whereas a missing one looks like a broken invite.
    const { error } = await admin
      .from("assessment_reviewers")
      .update({ token_expires_at: new Date().toISOString(), invite_status: "expired" })
      .eq("id", existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("assessment_audit_events").insert({
      cycle_id: existing.cycle_id,
      subject_id: existing.subject_id,
      reviewer_id: existing.id,
      action: "assessment_rater_revoked",
      metadata: { actorId: user.id, ...evidence },
    });

    return NextResponse.json({ decision, evidence, revoked: true });
  }

  const { error } = await admin.from("assessment_reviewers").delete().eq("id", existing.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("assessment_audit_events").insert({
    cycle_id: existing.cycle_id,
    subject_id: existing.subject_id,
    action: "assessment_rater_deleted",
    metadata: { actorId: user.id, raterName: existing.reviewer_name, raterEmail: existing.reviewer_email },
  });

  return NextResponse.json({ decision, evidence, deleted: true });
}
