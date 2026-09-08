import type { SupabaseClient } from "@supabase/supabase-js";

import type { CohortSubject } from "./assessmentScoring.ts";
import {
  buildAggregatePdfReport,
  buildIndividualPdfReport,
  createMockLabels,
  createMockSubjectScores,
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
};

type SubjectRow = {
  id: string;
  name: string | null;
  level: string | null;
  function_name: string | null;
  region: string | null;
  email?: string | null;
};

type CompetencyRow = {
  id: string;
  name: string | null;
  description: string | null;
  display_order: number | null;
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
};

export async function loadPdfReportData(admin: Admin, cycleId: string): Promise<PdfReportData> {
  const [cycleResult, subjectsResult, competenciesResult, itemsResult] = await Promise.all([
    admin
      .from("assessment_cycles")
      .select("id, name, client_context, closes_on")
      .eq("id", cycleId)
      .maybeSingle<CycleRow>(),
    admin
      .from("assessment_subjects")
      .select("id, name, level, function_name, region")
      .eq("cycle_id", cycleId)
      .order("name", { ascending: true })
      .returns<SubjectRow[]>(),
    admin
      .from("assessment_competencies")
      .select("id, name, description, display_order")
      .eq("cycle_id", cycleId)
      .order("display_order", { ascending: true })
      .returns<CompetencyRow[]>(),
    admin
      .from("assessment_items")
      .select("id, competency_id, body, display_order")
      .eq("cycle_id", cycleId)
      .order("display_order", { ascending: true })
      .returns<ItemRow[]>(),
  ]);

  if (cycleResult.error) throw new Error(`Failed to load cycle: ${cycleResult.error.message}`);
  if (subjectsResult.error) throw new Error(`Failed to load subjects: ${subjectsResult.error.message}`);

  const fallback = createMockLabels();
  const competencies = (competenciesResult.data ?? []).length
    ? (competenciesResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        description: row.description,
      }))
    : fallback.competencies;

  const items = (itemsResult.data ?? []).length
    ? (itemsResult.data ?? []).map((row) => ({
        id: row.id,
        competencyId: row.competency_id,
        text: row.body ?? row.id,
      }))
    : fallback.items;

  if (!cycleResult.data) {
    throw new Error("Cycle not found");
  }

  return {
    cycle: {
      id: cycleResult.data.id,
      name: cycleResult.data.name,
      clientName: cycleResult.data.client_context,
      closesOn: cycleResult.data.closes_on,
    },
    subjects: (subjectsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? "Participant",
      role: row.level,
      level: row.level,
      functionName: row.function_name,
      region: row.region,
    })),
    competencies,
    items,
  };
}

export function buildMockIndividualReport(data: PdfReportData, subjectId: string, generatedAt?: string): IndividualPdfReport {
  const subjectIndex = data.subjects.findIndex((subject) => subject.id === subjectId);
  const subject = data.subjects[subjectIndex];
  if (!subject) throw new Error("Subject not found");

  return buildIndividualPdfReport({
    cycle: data.cycle,
    subject,
    scores: createMockSubjectScores(subject.id, subjectIndex + 1),
    competencyLabels: data.competencies,
    itemLabels: data.items,
    generatedAt,
  });
}

export function buildMockAggregateReport(data: PdfReportData, generatedAt?: string): AggregatePdfReport {
  const subjects: CohortSubject[] = data.subjects.map((subject, index) => ({
    subjectId: subject.id,
    level: subject.level,
    functionName: subject.functionName,
    region: subject.region,
    scores: createMockSubjectScores(subject.id, index + 1),
  }));

  return buildAggregatePdfReport({
    cycle: data.cycle,
    subjects,
    competencyLabels: data.competencies,
    generatedAt,
  });
}
