/**
 * Database half of the scoring service.
 *
 * Loads responses for a subject and hands them to the pure scorer in
 * assessmentScoring.ts. Kept separate from the API route so the access-tier
 * branch can own authentication without touching scoring, and separate from the
 * pure module so the suppression rules stay testable without a database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aggregateCohort,
  scoreSubject,
  type CohortSegment,
  type CohortSubject,
  type ScoredResponse,
  type ScoringOptions,
  type SubjectScores,
} from "./assessmentScoring.ts";

/** Deliberately untyped against a generated Database type — this repo has none. */
type Admin = SupabaseClient;

type ResponseRow = {
  reviewer_id: string;
  item_id: string;
  competency_id: string | null;
  item_type: string;
  rating: number | string | null;
  not_observed: boolean;
  comment: string | null;
  assessment_reviewers: { reviewer_group: string; status: string } | null;
  assessment_items: { body: string | null } | null;
};

type SubjectRow = {
  id: string;
  level: string | null;
  function_name: string | null;
  region: string | null;
  portfolio: string | null;
};

export type CycleScoringConfig = {
  weights: Record<string, number>;
  competencyNames: Map<string, string>;
};

/**
 * Only SUBMITTED reviewers are scored. A draft is a rater's private working
 * copy: counting it would move a subject's scores as they typed, and would let a
 * half-finished draft push a category over the suppression threshold.
 */
const SUBMITTED = "submitted";

export async function loadScoredResponses(
  admin: Admin,
  cycleId: string,
  subjectId: string,
): Promise<ScoredResponse[]> {
  const { data, error } = await admin
    .from("assessment_responses")
    .select(
      "reviewer_id, item_id, competency_id, item_type, rating, not_observed, comment, assessment_reviewers!inner(reviewer_group, status), assessment_items(body)",
    )
    .eq("cycle_id", cycleId)
    .eq("subject_id", subjectId)
    .eq("assessment_reviewers.status", SUBMITTED)
    .returns<ResponseRow[]>();

  if (error) throw new Error(`Failed to load responses: ${error.message}`);

  return (data ?? []).map((row) => ({
    reviewerId: row.reviewer_id,
    raterGroup: (row.assessment_reviewers?.reviewer_group ?? "colleague") as ScoredResponse["raterGroup"],
    itemId: row.item_id,
    competencyId: row.competency_id,
    itemType: row.item_type === "text" ? "text" : "scale",
    rating: row.rating === null ? null : Number(row.rating),
    notObserved: Boolean(row.not_observed),
    comment: row.comment,
    itemBody: row.assessment_items?.body ?? null,
  }));
}

export async function loadCycleScoringConfig(
  admin: Admin,
  cycleId: string,
): Promise<CycleScoringConfig> {
  const [cycleResult, competencyResult] = await Promise.all([
    admin.from("assessment_cycles").select("reviewer_weights").eq("id", cycleId).maybeSingle<{
      reviewer_weights: Record<string, number> | null;
    }>(),
    admin.from("assessment_competencies").select("id, name").eq("cycle_id", cycleId).returns<
      Array<{ id: string; name: string | null }>
    >(),
  ]);

  const rawWeights = cycleResult.data?.reviewer_weights ?? {};
  const weights: Record<string, number> = {};
  for (const [group, value] of Object.entries(rawWeights)) {
    const weight = Number(value);
    if (Number.isFinite(weight)) weights[group] = weight;
  }
  // Self never carries weight, whatever the cycle says.
  weights.self = 0;

  return {
    weights,
    competencyNames: new Map(
      (competencyResult.data ?? []).map((row) => [row.id, row.name ?? row.id]),
    ),
  };
}

/** The entry point: cycleId + subjectId in, the full score set out. */
export async function scoreSubjectFromDatabase(
  admin: Admin,
  cycleId: string,
  subjectId: string,
  options: ScoringOptions = {},
): Promise<{ scores: SubjectScores; config: CycleScoringConfig }> {
  const [responses, config] = await Promise.all([
    loadScoredResponses(admin, cycleId, subjectId),
    loadCycleScoringConfig(admin, cycleId),
  ]);

  const scores = scoreSubject(subjectId, responses, {
    ...options,
    weights: options.weights ?? config.weights,
  });

  return { scores, config };
}

/**
 * Scores every subject in a cycle and aggregates by level, function, region and
 * portfolio. Runs the per-subject queries in parallel; at cohort sizes around 70
 * that is well inside what PostgREST will take in one pass.
 */
export async function scoreCohortFromDatabase(
  admin: Admin,
  cycleId: string,
  options: ScoringOptions & { minimumSubjectsPerSegment?: number } = {},
): Promise<{ subjects: CohortSubject[]; segments: CohortSegment[] }> {
  const [{ data: subjectRows, error }, config] = await Promise.all([
    admin
      .from("assessment_subjects")
      .select("id, level, function_name, region, portfolio")
      .eq("cycle_id", cycleId)
      // Withdrawn participants are out of the cohort: they must not appear in
      // aggregates, nor contribute to the counts that gate suppression.
      .is("withdrawn_at", null)
      .returns<SubjectRow[]>(),
    loadCycleScoringConfig(admin, cycleId),
  ]);

  if (error) throw new Error(`Failed to load subjects: ${error.message}`);

  const subjects = await Promise.all(
    (subjectRows ?? []).map(async (row): Promise<CohortSubject> => {
      const responses = await loadScoredResponses(admin, cycleId, row.id);
      return {
        subjectId: row.id,
        level: row.level,
        functionName: row.function_name,
        region: row.region,
        portfolio: row.portfolio,
        scores: scoreSubject(row.id, responses, {
          ...options,
          weights: options.weights ?? config.weights,
        }),
      };
    }),
  );

  return { subjects, segments: aggregateCohort(subjects, options) };
}
