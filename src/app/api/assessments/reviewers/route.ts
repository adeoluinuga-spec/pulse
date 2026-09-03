import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

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

async function cycleBelongsToOrg(admin: ReturnType<typeof getAdminClient>, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();

  return Boolean(data);
}

async function subjectBelongsToCycle(admin: ReturnType<typeof getAdminClient>, subjectId: string, cycleId: string) {
  const { data } = await admin
    .from("assessment_subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("cycle_id", cycleId)
    .maybeSingle();

  return Boolean(data);
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

  const hasSubjectAccess = await subjectBelongsToCycle(admin, body.subjectId, body.cycleId);
  if (!hasSubjectAccess) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const inviteChannel = body.inviteChannel ?? (body.reviewerGroup === "customer" ? "whatsapp" : "email");
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
      invite_status: "sent",
      invite_channel: inviteChannel,
      assessment_scope: assessmentScope,
      status: "not_started",
    })
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reviewer: data,
    invite: {
      token,
      reviewerId: data.id,
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      expiresAt,
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
  const inviteChannel = body.inviteChannel ?? existing.invite_channel ?? (existing.reviewer_group === "customer" ? "whatsapp" : "email");
  const assessmentScope = body.assessmentScope ?? existing.assessment_scope ?? (existing.reviewer_group === "customer" ? "customer_experience" : "individual");

  const { data, error } = await admin
    .from("assessment_reviewers")
    .update({
      token_hash: hashToken(token),
      token_expires_at: expiresAt,
      invite_status: "sent",
      invite_channel: inviteChannel,
      assessment_scope: assessmentScope,
    })
    .eq("id", existing.id)
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at, submitted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    reviewer: data,
    invite: {
      token,
      reviewerId: data.id,
      reviewerName: data.reviewer_name,
      reviewerEmail: data.reviewer_email,
      channel: data.invite_channel,
      scope: data.assessment_scope,
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      expiresAt,
      status: data.invite_status,
    },
  });
}
