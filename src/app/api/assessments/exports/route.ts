import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  buildAggregateRows,
  buildAssessmentExportCsv,
  buildAssessmentExportXlsx,
  type AssessmentExportDataset,
  type CompetencyExportRow,
  type CompletionExportRow,
  type ItemScoreExportRow,
} from "@/lib/assessmentExports";
import {
  canReadAggregateReport,
  canReadCompletionTracking,
  canReadIndividualReport,
} from "@/lib/assessmentReportAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = SupabaseClient;
type Caller = { userId: string; employeeId: string; orgId: string; role: string };

type SubjectRow = {
  id: string;
  name: string | null;
  level: string | null;
  function_name: string | null;
  region: string | null;
};

type ReviewerRow = {
  subject_id: string;
  status: string;
};

type ReportRow = {
  subject_id: string;
  weighted_score: number | string | null;
  competency_scores: Array<Record<string, unknown>>;
  released_at: string | null;
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
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
    caller: { userId: user.id, employeeId: employee.id, orgId: employee.org_id, role: employee.platform_role },
    admin,
    error: null,
  };
}

async function cycleBelongsToOrg(admin: Admin, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

function exportScopeFor(caller: Caller, requested: string) {
  const scope = requested === "completion" || requested === "scores" || requested === "aggregate" || requested === "all"
    ? requested
    : "all";
  const wantsScores = scope === "scores" || scope === "all";
  const wantsCompletion = scope === "completion" || scope === "all";
  const wantsAggregate = scope === "aggregate" || scope === "all";

  if (wantsScores && !canReadIndividualReport({ role: caller.role, reportState: "released" })) return null;
  if (wantsCompletion && !canReadCompletionTracking(caller.role)) return null;
  if (wantsAggregate && !canReadAggregateReport(caller.role)) return null;

  return { wantsScores, wantsCompletion, wantsAggregate, scope };
}

function subjectCompletion(subjects: SubjectRow[], reviewers: ReviewerRow[], reports: ReportRow[]): CompletionExportRow[] {
  const reviewersBySubject = new Map<string, ReviewerRow[]>();
  for (const reviewer of reviewers) {
    const bucket = reviewersBySubject.get(reviewer.subject_id);
    if (bucket) bucket.push(reviewer);
    else reviewersBySubject.set(reviewer.subject_id, [reviewer]);
  }
  const reportBySubject = new Map(reports.map((report) => [report.subject_id, report]));

  return subjects.map((subject) => {
    const assigned = reviewersBySubject.get(subject.id) ?? [];
    const submitted = assigned.filter((row) => row.status === "submitted").length;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      level: subject.level,
      functionName: subject.function_name,
      region: subject.region,
      assigned: assigned.length,
      submitted,
      inProgress: assigned.filter((row) => row.status === "in_progress").length,
      notStarted: assigned.filter((row) => row.status === "not_started").length,
      completionPercent: assigned.length ? Math.round((submitted / assigned.length) * 100) : 0,
      reportStatus: reportBySubject.get(subject.id)?.released_at ? "released" : "unreleased",
      releasedAt: reportBySubject.get(subject.id)?.released_at ?? null,
    };
  });
}

function scoreRows(subjects: SubjectRow[], reports: ReportRow[]) {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const competencies: CompetencyExportRow[] = [];
  const items: ItemScoreExportRow[] = [];

  for (const report of reports.filter((row) => row.released_at)) {
    const subject = subjectById.get(report.subject_id);
    for (const competency of report.competency_scores ?? []) {
      const competencyId = String(competency.competencyId ?? competency.competency_id ?? "");
      const competencyName = String(competency.competencyName ?? competency.label ?? competencyId);
      competencies.push({
        subjectId: report.subject_id,
        subjectName: subject?.name ?? null,
        competencyId,
        competencyName,
        mean: numberOrNull(competency.mean ?? competency.score),
        selfMean: numberOrNull(competency.selfMean),
        gap: numberOrNull(competency.gap),
        blindSpot: Boolean(competency.blindSpot),
        hiddenStrength: Boolean(competency.hiddenStrength),
      });

      for (const item of Array.isArray(competency.items) ? competency.items as Array<Record<string, unknown>> : []) {
        items.push({
          subjectId: report.subject_id,
          subjectName: subject?.name ?? null,
          competencyId,
          itemId: String(item.itemId ?? item.item_id ?? ""),
          itemText: typeof item.text === "string" ? item.text : null,
          mean: numberOrNull(item.mean ?? item.score),
          raterCount: Number(item.raterCount ?? item.rater_count ?? 0),
          suppressed: Boolean(item.suppressed),
          selfRating: numberOrNull(item.selfRating ?? item.self_rating),
        });
      }
    }
  }

  return { competencies, items };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function logExport(input: {
  admin: Admin;
  request: NextRequest;
  caller: Caller;
  cycleId: string;
  format: string;
  scope: string;
}) {
  const ip = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? input.request.headers.get("x-real-ip")
    ?? null;
  await input.admin.from("assessment_audit_events").insert({
    cycle_id: input.cycleId,
    action: "report_exported",
    metadata: {
      actorUserId: input.caller.userId,
      actorEmployeeId: input.caller.employeeId,
      actorRole: input.caller.role,
      ip,
      userAgent: input.request.headers.get("user-agent"),
      format: input.format,
      scope: input.scope,
      excludes: "raw verbatims, reviewer_name, reviewer_email",
    },
  });
}

function responseFor(content: Buffer | string, filename: string, contentType: string) {
  return new Response(typeof content === "string" ? content : new Uint8Array(content), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const scope = request.nextUrl.searchParams.get("scope") ?? "all";
  if (!cycleId) return NextResponse.json({ error: "cycleId required" }, { status: 400 });

  const { caller, admin, error } = await getCaller();
  if (!caller) return error;
  const allowed = exportScopeFor(caller, scope);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await cycleBelongsToOrg(admin, cycleId, caller.orgId))) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const [{ data: subjects }, { data: reviewers }, { data: reports }] = await Promise.all([
    admin.from("assessment_subjects").select("id, name, level, function_name, region").eq("cycle_id", cycleId).returns<SubjectRow[]>(),
    admin.from("assessment_reviewers").select("subject_id, status").eq("cycle_id", cycleId).returns<ReviewerRow[]>(),
    admin
      .from("assessment_reports")
      .select("subject_id, weighted_score, competency_scores, released_at, report_status")
      .eq("cycle_id", cycleId)
      .not("released_at", "is", null)
      .returns<ReportRow[]>(),
  ]);

  const completion = allowed.wantsCompletion ? subjectCompletion(subjects ?? [], reviewers ?? [], reports ?? []) : [];
  const scoreDataset = allowed.wantsScores ? scoreRows(subjects ?? [], reports ?? []) : { competencies: [], items: [] };
  const aggregate = allowed.wantsAggregate
    ? buildAggregateRows(subjectCompletion(subjects ?? [], reviewers ?? [], reports ?? []), scoreRows(subjects ?? [], reports ?? []).competencies)
    : [];
  const dataset: AssessmentExportDataset = {
    completion,
    competencies: scoreDataset.competencies,
    items: scoreDataset.items,
    aggregate,
  };

  await logExport({ admin, request, caller, cycleId, format, scope: allowed.scope });

  if (format === "xlsx") {
    return responseFor(
      buildAssessmentExportXlsx(dataset),
      `pulse-360-export-${cycleId}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  return responseFor(buildAssessmentExportCsv(dataset), `pulse-360-export-${cycleId}.csv`, "text/csv; charset=utf-8");
}
