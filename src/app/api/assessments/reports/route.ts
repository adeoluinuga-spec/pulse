import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { buildAssessmentReportSummary } from "@/lib/assessmentReporting";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
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
    return NextResponse.json({ reports: [] }, { status: 200 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  let query = admin
    .from("assessment_reports")
    .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at")
    .eq("cycle_id", cycleId);

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data: reports } = await query.order("generated_at", { ascending: false });

  return NextResponse.json({ reports: reports ?? [] });
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
    reviewerScores?: Array<{ reviewer_group?: string; score?: number; status?: string }>;
    weights?: Record<string, number>;
    release?: boolean;
    competencyScores?: Array<{ competencyId?: string; score?: number; label?: string }>;
    strengths?: string[];
    developmentAreas?: string[];
    riskNotes?: string[];
  };

  if (!body.cycleId || !body.subjectId) {
    return NextResponse.json({ error: "cycleId and subjectId are required" }, { status: 400 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, body.cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const { data: subject } = await admin
    .from("assessment_subjects")
    .select("id")
    .eq("id", body.subjectId)
    .eq("cycle_id", body.cycleId)
    .maybeSingle();

  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const reviewerScores = (body.reviewerScores ?? []).map((entry) => ({
    reviewer_group: entry.reviewer_group ?? "colleague",
    score: Number(entry.score ?? 0),
    status: entry.status ?? "submitted",
  }));

  if (!reviewerScores.length) {
    return NextResponse.json({ error: "At least one reviewer score is required" }, { status: 400 });
  }

  const summary = buildAssessmentReportSummary(reviewerScores, body.weights ?? {
    direct_report: 30,
    subordinate: 25,
    colleague: 25,
    customer: 20,
  });

  const payload = {
    cycle_id: body.cycleId,
    subject_id: body.subjectId,
    weighted_score: summary.overallScore,
    group_scores: Object.fromEntries(
      reviewerScores.map((entry) => [entry.reviewer_group, entry.score]),
    ),
    competency_scores: (body.competencyScores ?? []).map((entry) => ({
      competencyId: entry.competencyId ?? "unknown",
      score: Number(entry.score ?? 0),
      label: entry.label ?? "competency",
    })),
    strengths: body.strengths ?? summary.strengths,
    development_areas: body.developmentAreas ?? summary.developmentAreas,
    risk_notes: body.riskNotes ?? summary.notes,
    released_at: body.release && summary.ready ? new Date().toISOString() : null,
  };

  const { data, error } = await admin
    .from("assessment_reports")
    .upsert(payload, { onConflict: "cycle_id,subject_id" })
    .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data, summary }, { status: 201 });
}
