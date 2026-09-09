import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildReportPayload } from "@/lib/assessmentReporting";
import {
  canManageReportState,
  canReadAggregateReport,
  canReadCompletionTracking,
  canReadIndividualReport,
  isValidReportState,
  nextReportState,
  reportStateOf,
  type ReportState,
} from "@/lib/assessmentReportAccess";
import { scoreSubjectFromDatabase } from "@/lib/assessmentScoringService";

type Admin = SupabaseClient;

type Caller = {
  userId: string;
  employeeId: string;
  orgId: string;
  role: string;
};

type SubjectRow = {
  id: string;
  employee_id: string | null;
  name: string | null;
  level: string | null;
  function_name: string | null;
  region: string | null;
  withdrawn_at?: string | null;
};

type ReportRow = {
  id: string;
  cycle_id: string;
  subject_id: string;
  weighted_score: number | string | null;
  group_scores: Record<string, number | null>;
  competency_scores: Array<Record<string, unknown>>;
  strengths: string[];
  development_areas: string[];
  risk_notes: string[];
  released_at: string | null;
  generated_at: string;
  report_status?: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getCaller(): Promise<
  { caller: Caller; admin: Admin; error: null } | { caller: null; admin: Admin; error: NextResponse }
> {
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
  const admin = getAdminClient();
  if (!user) return { caller: null, admin, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; platform_role: string | null }>();

  if (!employee?.org_id || !employee.platform_role) {
    return { caller: null, admin, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    caller: {
      userId: user.id,
      employeeId: employee.id,
      orgId: employee.org_id,
      role: employee.platform_role,
    },
    admin,
    error: null,
  };
}

async function loadCycle(admin: Admin, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id, line_manager_report_access_enabled")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; line_manager_report_access_enabled?: boolean | null }>();

  return data;
}

async function loadSubject(admin: Admin, cycleId: string, subjectId: string) {
  const { data } = await admin
    .from("assessment_subjects")
    .select("id, employee_id, name, level, function_name, region, withdrawn_at")
    .eq("id", subjectId)
    .eq("cycle_id", cycleId)
    .maybeSingle<SubjectRow>();

  return data;
}

async function callerManagesSubject(admin: Admin, caller: Caller, subject: SubjectRow) {
  if (!subject.employee_id) return false;
  const { data } = await admin
    .from("employees")
    .select("line_manager_id")
    .eq("id", subject.employee_id)
    .maybeSingle<{ line_manager_id: string | null }>();

  return data?.line_manager_id === caller.employeeId;
}

async function logReportAccess(input: {
  admin: Admin;
  request: NextRequest;
  caller: Caller;
  cycleId: string;
  subjectId?: string | null;
  action: "report_viewed" | "report_released" | "report_exported";
  metadata?: Record<string, unknown>;
}) {
  const ip = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? input.request.headers.get("x-real-ip")
    ?? null;
  const userAgent = input.request.headers.get("user-agent");

  await input.admin.from("assessment_audit_events").insert({
    cycle_id: input.cycleId,
    subject_id: input.subjectId ?? null,
    action: input.action,
    metadata: {
      actorUserId: input.caller.userId,
      actorEmployeeId: input.caller.employeeId,
      actorRole: input.caller.role,
      ip,
      userAgent,
      ...input.metadata,
    },
  });
}

function serializeReport(row: ReportRow) {
  return {
    ...row,
    weighted_score: row.weighted_score === null ? null : Number(row.weighted_score),
    report_status: reportStateOf({ reportStatus: row.report_status, releasedAt: row.released_at }),
  };
}

function completionRows(subjects: SubjectRow[], reports: ReportRow[]) {
  const bySubject = new Map(reports.map((report) => [report.subject_id, report]));
  return subjects.map((subject) => {
    const report = bySubject.get(subject.id);
    return {
      subject_id: subject.id,
      subject_name: subject.name,
      level: subject.level,
      function_name: subject.function_name,
      region: subject.region,
      report_status: report ? reportStateOf({ reportStatus: report.report_status, releasedAt: report.released_at }) : "draft",
      released_at: report?.released_at ?? null,
      generated_at: report?.generated_at ?? null,
    };
  });
}

function mean(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildReleasedAggregate(subjects: SubjectRow[], reports: ReportRow[]) {
  const released = reports.filter((report) => report.released_at);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const dimensions = ["level", "function_name", "region"] as const;

  const segments = dimensions.flatMap((dimension) => {
    const buckets = new Map<string, number[]>();
    for (const report of released) {
      const subject = subjectById.get(report.subject_id);
      const key = String(subject?.[dimension] ?? "").trim();
      if (!key || report.weighted_score === null) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(Number(report.weighted_score));
      else buckets.set(key, [Number(report.weighted_score)]);
    }
    return [...buckets.entries()].map(([value, scores]) => ({
      dimension,
      value,
      subjectCount: scores.length,
      mean: scores.length < 3 ? null : mean(scores),
      suppressed: scores.length < 3,
    }));
  });

  const competencyBuckets = new Map<string, number[]>();
  for (const report of released) {
    for (const competency of report.competency_scores ?? []) {
      const id = String(competency.competencyId ?? competency.competency_id ?? "");
      const label = String(competency.competencyName ?? competency.label ?? id);
      const score = Number(competency.mean ?? competency.score);
      if (!id || !Number.isFinite(score)) continue;
      const key = `${id}|${label}`;
      const bucket = competencyBuckets.get(key);
      if (bucket) bucket.push(score);
      else competencyBuckets.set(key, [score]);
    }
  }

  return {
    cohortSize: released.length,
    cohortMean: mean(released.map((report) => Number(report.weighted_score)).filter(Number.isFinite)),
    competencyHeatMap: [...competencyBuckets.entries()].map(([key, scores]) => {
      const [competencyId, name] = key.split("|");
      return {
        competencyId,
        name,
        mean: scores.length < 3 ? null : mean(scores),
        suppressed: scores.length < 3,
      };
    }),
    segments,
    excluded: "No named individuals and no participant ranking table are returned by this endpoint.",
  };
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");
  const wantsAggregate = request.nextUrl.searchParams.get("cohort") === "1"
    || request.nextUrl.searchParams.get("aggregate") === "1";

  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

  const { caller, admin, error } = await getCaller();
  if (!caller) return error;

  const cycle = await loadCycle(admin, cycleId, caller.orgId);
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  if (wantsAggregate) {
    if (!canReadAggregateReport(caller.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [{ data: subjects }, { data: reports }] = await Promise.all([
      admin
        .from("assessment_subjects")
        .select("id, employee_id, name, level, function_name, region")
        .eq("cycle_id", cycleId)
        // Withdrawn participants drop out of the report console and every count on it.
        .is("withdrawn_at", null)
        .returns<SubjectRow[]>(),
      admin
        .from("assessment_reports")
        .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at, report_status")
        .eq("cycle_id", cycleId)
        .not("released_at", "is", null)
        .returns<ReportRow[]>(),
    ]);

    await logReportAccess({
      admin,
      request,
      caller,
      cycleId,
      action: "report_viewed",
      metadata: { reportType: "aggregate" },
    });

    return NextResponse.json({ aggregate: buildReleasedAggregate(subjects ?? [], reports ?? []) });
  }

  if (!subjectId) {
    if (!canReadCompletionTracking(caller.role)) {
      return NextResponse.json({ error: "subjectId required" }, { status: 400 });
    }

    const [{ data: subjects }, { data: reports }] = await Promise.all([
      admin
        .from("assessment_subjects")
        .select("id, employee_id, name, level, function_name, region")
        .eq("cycle_id", cycleId)
        // Withdrawn participants drop out of the report console and every count on it.
        .is("withdrawn_at", null)
        .returns<SubjectRow[]>(),
      admin
        .from("assessment_reports")
        .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at, report_status")
        .eq("cycle_id", cycleId)
        .returns<ReportRow[]>(),
    ]);

    return NextResponse.json({ reports: completionRows(subjects ?? [], reports ?? []) });
  }

  const subject = await loadSubject(admin, cycleId, subjectId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const { data: report } = await admin
    .from("assessment_reports")
    .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at, report_status")
    .eq("cycle_id", cycleId)
    .eq("subject_id", subjectId)
    .maybeSingle<ReportRow>();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const ownsSubject = subject.employee_id === caller.employeeId;
  const managesSubject = await callerManagesSubject(admin, caller, subject);
  const reportState = reportStateOf({ reportStatus: report.report_status, releasedAt: report.released_at });
  const allowed = canReadIndividualReport({
    role: caller.role,
    reportState,
    ownsSubject,
    managesSubject,
    lineManagerAccessEnabled: Boolean(cycle.line_manager_report_access_enabled),
  });

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await logReportAccess({
    admin,
    request,
    caller,
    cycleId,
    subjectId,
    action: "report_viewed",
    metadata: { reportType: "individual", reportState },
  });

  return NextResponse.json({ report: serializeReport(report) });
}

export async function POST(request: NextRequest) {
  const { caller, admin, error } = await getCaller();
  if (!caller) return error;
  if (!canManageReportState(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    weights?: Record<string, number>;
    release?: boolean;
    reportStatus?: string;
    suppressionMode?: "suppress" | "merge";
  };

  if (!body.cycleId || !body.subjectId) {
    return NextResponse.json({ error: "cycleId and subjectId are required" }, { status: 400 });
  }

  const cycle = await loadCycle(admin, body.cycleId, caller.orgId);
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const subject = await loadSubject(admin, body.cycleId, body.subjectId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  // A withdrawn participant is out of the cohort, so producing a report for
  // them would contradict the withdrawal — and releasing it would hand a
  // document to somebody the organisation has taken out of the assessment.
  if (subject.withdrawn_at) {
    return NextResponse.json(
      {
        error:
          "This participant has been withdrawn from the cycle, so no report can be generated for them. Reinstate them first if that was a mistake.",
      },
      { status: 409 },
    );
  }

  let scores;
  let config;
  try {
    ({ scores, config } = await scoreSubjectFromDatabase(admin, body.cycleId, body.subjectId, {
      weights: body.weights,
      suppressionMode: body.suppressionMode ?? "suppress",
    }));
  } catch (thrown) {
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : "Failed to score subject" },
      { status: 500 },
    );
  }

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

  const existing = await admin
    .from("assessment_reports")
    .select("report_status, released_at")
    .eq("cycle_id", body.cycleId)
    .eq("subject_id", body.subjectId)
    .maybeSingle<{ report_status?: string | null; released_at: string | null }>();

  const currentState = reportStateOf({
    reportStatus: existing.data?.report_status,
    releasedAt: existing.data?.released_at,
  });
  const requestedState: ReportState = body.release
    ? "released"
    : isValidReportState(body.reportStatus)
      ? body.reportStatus
      : "draft";
  const nextState = nextReportState(currentState, requestedState);

  if (!nextState) {
    return NextResponse.json({ error: `Invalid report state transition: ${currentState} to ${requestedState}` }, { status: 409 });
  }
  if (nextState === "released" && !scores.release.ready) {
    return NextResponse.json(
      { error: "This report cannot be released yet", release: scores.release, reasons: scores.release.reasons },
      { status: 409 },
    );
  }

  const payload = {
    ...buildReportPayload(
      body.cycleId,
      scores,
      config.competencyNames,
      nextState === "released",
    ),
    report_status: nextState,
  };

  const { data, error: writeError } = await admin
    .from("assessment_reports")
    .upsert(payload, { onConflict: "cycle_id,subject_id" })
    .select("id, cycle_id, subject_id, weighted_score, group_scores, competency_scores, strengths, development_areas, risk_notes, released_at, generated_at, report_status")
    .single<ReportRow>();

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  if (nextState === "released") {
    await logReportAccess({
      admin,
      request,
      caller,
      cycleId: body.cycleId,
      subjectId: body.subjectId,
      action: "report_released",
      metadata: { previousState: currentState },
    });
  }

  return NextResponse.json({ report: serializeReport(data), scores }, { status: 201 });
}
