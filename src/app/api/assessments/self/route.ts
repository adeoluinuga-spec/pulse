import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { validateSelfAssessmentSubmission } from "@/lib/assessmentParticipation";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");

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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId) {
    return NextResponse.json({ assessments: [] }, { status: 200 });
  }

  let query = admin
    .from("assessment_self_assessments")
    .select("id, cycle_id, subject_id, assignee_id, responses, status, submitted_at, created_at")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId);

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data: assessments } = await query.order("created_at", { ascending: false });

  return NextResponse.json({ assessments: assessments ?? [] });
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  const role = (employee as { platform_role?: string } | null)?.platform_role;

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin" && role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    assigneeId?: string;
    entries?: Array<{ competencyId?: string; score?: number; comment?: string }>;
  };

  const validation = validateSelfAssessmentSubmission({
    cycleId: body.cycleId,
    assigneeId: body.assigneeId ?? body.subjectId,
    entries: (body.entries ?? []).map((entry) => ({
      competencyId: entry.competencyId ?? "",
      score: typeof entry.score === "number" ? entry.score : 0,
      comment: entry.comment ?? "",
    })),
  });

  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid self-assessment payload", errors: validation.errors }, { status: 400 });
  }

  const payload = {
    org_id: orgId,
    cycle_id: body.cycleId,
    subject_id: body.subjectId ?? body.assigneeId,
    assignee_id: body.assigneeId ?? body.subjectId,
    responses: (body.entries ?? []).map((entry) => ({
      competencyId: entry.competencyId,
      score: entry.score,
      comment: (entry.comment ?? "").trim(),
    })),
    status: "submitted",
    submitted_at: new Date().toISOString(),
    created_by: user.id,
  };

  const { data, error } = await admin
    .from("assessment_self_assessments")
    .insert(payload)
    .select("id, cycle_id, subject_id, assignee_id, responses, status, submitted_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assessment: data }, { status: 201 });
}
