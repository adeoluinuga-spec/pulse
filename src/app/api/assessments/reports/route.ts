import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { buildReportPayload } from "@/lib/assessmentReporting";
import { scoreCohortFromDatabase, scoreSubjectFromDatabase } from "@/lib/assessmentScoringService";

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

  // ?cohort=1 aggregates live scores by level, function, region and portfolio.
  // Segments of fewer than three subjects are suppressed, on the same reasoning
  // as thin rater categories.
  if (request.nextUrl.searchParams.get("cohort") === "1") {
    try {
      const { segments } = await scoreCohortFromDatabase(admin, cycleId);
      return NextResponse.json({ segments });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to aggregate cohort" },
        { status: 500 },
      );
    }
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

  // Scores are computed from assessment_responses. Any scores in the request
  // body are ignored: a caller must not be able to assert what a subject's
  // feedback said, and the previous implementation wrote whatever it was handed.
  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    weights?: Record<string, number>;
    release?: boolean;
    suppressionMode?: "suppress" | "merge";
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

  let scores;
  let config;
  try {
    ({ scores, config } = await scoreSubjectFromDatabase(admin, body.cycleId, body.subjectId, {
      weights: body.weights,
      suppressionMode: body.suppressionMode ?? "suppress",
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to score subject" },
      { status: 500 },
    );
  }

  // Enforced here, not merely reported. A subject who cannot clear the minimum-N
  // rule gets no report row at all, rather than a thin one that looks releasable.
  if (scores.insufficientData) {
    return NextResponse.json(
      {
        error: "Not enough responses to report on this subject",
        release: scores.release,
        reasons: scores.release.reasons,
      },
      { status: 422 },
    );
  }

  // An explicit release request that fails the rule is refused outright rather
  // than quietly downgraded to a draft write.
  if (body.release && !scores.release.ready) {
    return NextResponse.json(
      { error: "This report cannot be released yet", release: scores.release, reasons: scores.release.reasons },
      { status: 409 },
    );
  }

  const payload = buildReportPayload(
    body.cycleId,
    scores,
    config.competencyNames,
    Boolean(body.release),
  );

  const { data, error } = await admin
    .from("assessment_reports")
    .upsert(payload, { onConflict: "cycle_id,subject_id" })
    .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data, scores }, { status: 201 });
}
