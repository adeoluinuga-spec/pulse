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

  if (!(employee as { org_id?: string } | null)?.org_id) {
    return NextResponse.json({ reviewers: [] }, { status: 200 });
  }

  const { data: reviewers } = await admin
    .from("assessment_reviewers")
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at")
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
    .select("id, subject_id, reviewer_name, reviewer_group, organisation, reviewer_email, status, invite_status, invite_channel, assessment_scope, token_expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reviewer: data,
    invite: {
      token,
      secureLink: `${request.nextUrl.origin}/review/${token}`,
      expiresAt,
    },
  }, { status: 201 });
}
