import type { SupabaseClient } from "@supabase/supabase-js";

import type { CohortSubject, SubjectScores } from "./assessmentScoring.ts";
import { scoreSubjectFromDatabase } from "./assessmentScoringService.ts";
import {
  buildAggregatePdfReport,
  buildIndividualPdfReport,
  type AggregatePdfReport,
  type CompetencyLabel,
  type IndividualPdfReport,
  type ItemLabel,
  type ReportCycleProfile,
  type ReportSubjectProfile,
} from "./assessmentPdfReport.ts";

type Admin = SupabaseClient;

type CycleRow = {
  id: string;
  name: string;
  client_context: string | null;
  closes_on: string | null;
  prior_cycle_id?: string | null;
};

type SubjectRow = {
  id: string;
  employee_id?: string | null;
  name: string | null;
  level: string | null;
  function_name: string | null;
  region: string | null;
  email?: string | null;
};

type CompetencyRow = {
  id: string;
  framework_id?: string | null;
  framework_version?: number | null;
  name: string | null;
  description: string | null;
  display_order?: number | null;
  sort_order?: number | null;
};

type ItemRow = {
  id: string;
  competency_id: string | null;
  body: string | null;
  display_order: number | null;
};

export type PdfReportData = {
  cycle: ReportCycleProfile;
  subjects: ReportSubjectProfile[];
  competencies: CompetencyLabel[];
  items: ItemLabel[];
  /**
   * Real scores, computed by the scoring service from assessment_responses —
   * one entry per subject. Loaded here so the report builders stay pure, and so
   * suppression is computed from actual rater counts rather than asserted.
   */
  scores: Map<string, SubjectScores>;
  prior?: PdfReportData | null;
};

async function loadCycle(admin: Admin, cycleId: string): Promise<CycleRow> {
  const { data, error } = await admin
    .from("assessment_cycles")
    .select("id, name, client_context, closes_on, prior_cycle_id")
    .eq("id", cycleId)
    .maybeSingle<CycleRow>();

  if (error) throw new Error(`Failed to load cycle: ${error.message}`);
  if (!data) throw new Error("Cycle not found");
  return data;
}

export async function loadPdfReportData(admin: Admin, cycleId: string, options: { includePrior?: boolean } = {}): Promise<PdfReportData> {
  const [cycle, subjectsResult, competenciesResult, itemsResult] = await Promise.all([
    loadCycle(admin, cycleId),
    admin
      .from("assessment_subjects")
      .select("id, employee_id, name, email, level, function_name, region")
      .eq("cycle_id", cycleId)
      // A withdrawn participant gets no report and appears in no aggregate.
      .is("withdrawn_at", null)
      .order("name", { ascending: true })
      .returns<SubjectRow[]>(),
    admin
      .from("assessment_competencies")
      .select("id, framework_id, framework_version, name, description, sort_order")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true })
      .returns<CompetencyRow[]>(),
    admin
      .from("assessment_items")
      .select("id, competency_id, body, display_order")
      .eq("cycle_id", cycleId)
      .order("display_order", { ascending: true })
      .returns<ItemRow[]>(),
  ]);

  if (subjectsResult.error) throw new Error(`Failed to load subjects: ${subjectsResult.error.message}`);

  if (competenciesResult.error) throw new Error(`Failed to load competencies: ${competenciesResult.error.message}`);
  if (itemsResult.error) throw new Error(`Failed to load items: ${itemsResult.error.message}`);

  // No invented instrument. A cycle with no competencies renders an empty
  // report; it does not borrow four placeholder competency names.
  const competencies = (competenciesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? row.id,
    description: row.description,
  }));

  const items = (itemsResult.data ?? []).map((row) => ({
    id: row.id,
    competencyId: row.competency_id,
    text: row.body ?? row.id,
  }));

  const firstCompetencyWithFramework = (competenciesResult.data ?? []).find(
    (row) => row.framework_id || row.framework_version,
  );
  const prior = options.includePrior && cycle.prior_cycle_id
    ? await loadPdfReportData(admin, cycle.prior_cycle_id, { includePrior: false })
    : null;

  // Score every subject through the scoring service. Suppression, unable-to-
  // observe exclusion and the self-versus-others gap are all computed there, so
  // the PDF inherits them rather than restating them.
  const subjectRows = subjectsResult.data ?? [];
  const scoredEntries = await Promise.all(
    subjectRows.map(async (row): Promise<[string, SubjectScores]> => {
      const { scores } = await scoreSubjectFromDatabase(admin, cycleId, row.id);
      return [row.id, scores];
    }),
  );
  const scores = new Map(scoredEntries);

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      clientName: cycle.client_context,
      closesOn: cycle.closes_on,
      frameworkId: firstCompetencyWithFramework?.framework_id ?? null,
      frameworkVersion: firstCompetencyWithFramework?.framework_version ?? null,
      priorCycleId: cycle.prior_cycle_id ?? null,
      priorCycleName: prior?.cycle.name ?? null,
    },
    subjects: (subjectsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? "Participant",
      employeeId: row.employee_id,
      email: row.email,
      role: row.level,
      level: row.level,
      functionName: row.function_name,
      region: row.region,
    })),
    competencies,
    items,
    scores,
    prior,
  };
}

/**
 * Builds one participant's report from the scores the scoring service computed.
 * Every number here came out of assessment_responses; nothing is synthesised.
 */
export function buildIndividualReport(data: PdfReportData, subjectId: string, generatedAt?: string): IndividualPdfReport {
  const subject = data.subjects.find((entry) => entry.id === subjectId);
  if (!subject) throw new Error("Subject not found");

  const scores = data.scores.get(subjectId);
  if (!scores) throw new Error(`No scores loaded for subject ${subjectId}`);

  const priorSubject = findPriorSubject(data, subject);
  const priorScores = priorSubject ? data.prior?.scores.get(priorSubject.id) ?? null : null;

  return buildIndividualPdfReport({
    cycle: data.cycle,
    subject,
    scores,
    priorCycle: data.prior?.cycle ?? null,
    priorScores,
    competencyLabels: data.competencies,
    itemLabels: data.items,
    generatedAt,
  });
}

function cohortSubjects(data: PdfReportData): CohortSubject[] {
  return data.subjects.flatMap((subject) => {
    const scores = data.scores.get(subject.id);
    if (!scores) return [];
    return [{
      subjectId: subject.id,
      level: subject.level,
      functionName: subject.functionName,
      region: subject.region,
      scores,
    }];
  });
}

/**
 * Cohort report. Segment suppression is applied by aggregateCohort inside
 * buildAggregatePdfReport, over the same real scores.
 */
export function buildAggregateReport(data: PdfReportData, generatedAt?: string): AggregatePdfReport {
  return buildAggregatePdfReport({
    cycle: data.cycle,
    subjects: cohortSubjects(data),
    priorCycle: data.prior?.cycle ?? null,
    priorSubjects: data.prior ? cohortSubjects(data.prior) : [],
    competencyLabels: data.competencies,
    generatedAt,
  });
}

function findPriorSubject(data: PdfReportData, subject: ReportSubjectProfile): ReportSubjectProfile | null {
  if (!data.prior) return null;
  const byEmployee = subject.employeeId
    ? data.prior.subjects.find((candidate) => candidate.employeeId === subject.employeeId)
    : null;
  if (byEmployee) return byEmployee;
  const email = subject.email?.trim().toLowerCase();
  if (email) {
    const byEmail = data.prior.subjects.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return data.prior.subjects.find((candidate) => candidate.name.trim().toLowerCase() === subject.name.trim().toLowerCase()) ?? null;
}
