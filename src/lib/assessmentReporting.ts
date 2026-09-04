/**
 * Report assembly.
 *
 * Scoring itself lives in assessmentScoring.ts (pure) and
 * assessmentScoringService.ts (database). This module turns a scored subject
 * into the columns of assessment_reports, and keeps the legacy summary helpers
 * alive for src/app/assessments/page.tsx, which is frozen and still imports them.
 */

import {
  MINIMUM_RESPONSES_PER_GROUP,
  type CompetencyScore,
  type SubjectScores,
} from "./assessmentScoring.ts";

export type ReviewerGroupScore = {
  reviewer_group: string;
  score: number;
  status?: string;
};

export type AssessmentReportSummary = {
  ready: boolean;
  overallScore: number;
  groupScores: Record<string, number>;
  missingGroups: string[];
  strengths: string[];
  developmentAreas: string[];
  notes: string[];
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  self: 0,
  line_manager: 30,
  colleague: 25,
  direct_report: 25,
  customer: 20,
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function label(group: string): string {
  const labels: Record<string, string> = {
    self: "Self",
    line_manager: "Line manager",
    colleague: "Colleagues",
    direct_report: "Direct reports",
    customer: "Customers",
    others: "Other raters",
  };
  return labels[group] ?? group;
}

/**
 * Collapses repeated entries for the same rater category into one mean.
 *
 * This is the bug fix at the heart of this module. The previous implementation
 * built groupScores with a reduce that assigned straight into an accumulator, so
 * four colleague entries kept only whichever landed last and silently discarded
 * the other three.
 */
export function meanByReviewerGroup(reviewers: ReviewerGroupScore[]): Record<string, number> {
  const buckets = new Map<string, number[]>();

  for (const reviewer of reviewers ?? []) {
    if (!reviewer?.reviewer_group) continue;
    const score = Number(reviewer.score);
    if (!Number.isFinite(score)) continue;

    const bucket = buckets.get(reviewer.reviewer_group);
    if (bucket) bucket.push(score);
    else buckets.set(reviewer.reviewer_group, [score]);
  }

  const result: Record<string, number> = {};
  for (const [group, scores] of buckets) {
    result[group] = round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }
  return result;
}

export function calculateWeightedAssessmentScore(
  reviewers: ReviewerGroupScore[],
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): number {
  const means = meanByReviewerGroup(reviewers);
  const groups = Object.keys(means).filter((group) => group !== "self");

  if (!groups.length) return 0;

  const totalWeight = groups.reduce((sum, group) => sum + (weights[group] ?? 0), 0);

  if (!totalWeight) {
    return Math.round(groups.reduce((sum, group) => sum + means[group], 0) / groups.length);
  }

  return Math.round(
    groups.reduce((sum, group) => sum + means[group] * (weights[group] ?? 0), 0) / totalWeight,
  );
}

/**
 * Legacy summary, retained for the frozen assessments console.
 *
 * It sees only per-category scores, never rater counts, so it cannot apply the
 * n<3 suppression rule — it approximates readiness as "a line manager score plus
 * two other categories". Anything that must be confidentiality-safe should use
 * assessmentScoring.ts directly rather than this.
 */
export function buildAssessmentReportSummary(
  reviewers: ReviewerGroupScore[],
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): AssessmentReportSummary {
  const requiredGroups = ["line_manager", "colleague", "direct_report", "customer"];
  const groupScores = meanByReviewerGroup(reviewers);
  const present = Object.keys(groupScores);
  const missingGroups = requiredGroups.filter((group) => !present.includes(group));
  const overallScore = calculateWeightedAssessmentScore(reviewers, weights);

  const hasLineManager = present.includes("line_manager");
  const otherCategories = present.filter(
    (group) => group !== "self" && group !== "line_manager",
  ).length;
  const ready = hasLineManager && otherCategories >= 2;

  const ranked = Object.entries(groupScores)
    .filter(([group]) => group !== "self")
    .sort((a, b) => b[1] - a[1]);

  const strengths = ranked
    .slice(0, 2)
    .map(([group, score]) => `${label(group)} rate this leader highest, at ${score}.`);
  const developmentAreas = ranked
    .slice(-2)
    .reverse()
    .map(([group, score]) => `${label(group)} rate this leader lowest, at ${score}.`);

  const notes = [
    "Scores use the cycle's configured reviewer weights; self-assessment is excluded from the weighted score.",
    missingGroups.length
      ? `No responses yet from: ${missingGroups.join(", ")}.`
      : "All rater categories have responded.",
    ready
      ? "Meets the release rule: a line manager response plus at least two further categories."
      : "Does not yet meet the release rule: a line manager response plus at least two further categories.",
  ];

  return {
    ready,
    overallScore,
    groupScores,
    missingGroups,
    strengths: strengths.length ? strengths : ["Not enough responses to identify relative strengths."],
    developmentAreas: developmentAreas.length
      ? developmentAreas
      : ["Not enough responses to identify relative development areas."],
    notes,
  };
}

// ── database-backed report payload ─────────────────────────────────────────

export type AssessmentReportPayload = {
  cycle_id: string;
  subject_id: string;
  weighted_score: number | null;
  group_scores: Record<string, number | null>;
  competency_scores: Array<{
    competencyId: string;
    competencyName: string;
    mean: number | null;
    selfMean: number | null;
    gap: number | null;
    blindSpot: boolean;
    hiddenStrength: boolean;
    byGroup: Array<{
      raterGroup: string;
      mean: number | null;
      raterCount: number;
      suppressed: boolean;
    }>;
    items: Array<{
      itemId: string;
      text: string | null;
      mean: number | null;
      raterCount: number;
      suppressed: boolean;
      selfRating: number | null;
    }>;
  }>;
  strengths: string[];
  development_areas: string[];
  risk_notes: string[];
  released_at: string | null;
};

/**
 * Subject-level score per rater category: the mean of that category's competency
 * means, across the competencies where it was reportable. A category suppressed
 * everywhere comes back null rather than absent, so a reader can see that it was
 * withheld rather than silently missing.
 */
export function subjectGroupScores(scores: SubjectScores): Record<string, number | null> {
  const buckets = new Map<string, number[]>();
  const seen = new Set<string>();

  for (const competency of scores.competencies) {
    for (const cell of competency.byGroup) {
      seen.add(cell.raterGroup);
      if (cell.suppressed || cell.mean === null) continue;
      const bucket = buckets.get(cell.raterGroup);
      if (bucket) bucket.push(cell.mean);
      else buckets.set(cell.raterGroup, [cell.mean]);
    }
  }

  const result: Record<string, number | null> = {};
  for (const group of seen) {
    const values = buckets.get(group);
    result[group] = values?.length
      ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }
  return result;
}

function competencyLabel(competency: CompetencyScore, names: Map<string, string>): string {
  return names.get(competency.competencyId) ?? competency.competencyId;
}

/**
 * Turns a scored subject into the assessment_reports columns.
 *
 * Strengths and development areas are derived from the scores rather than picked
 * from canned prose, which is what the previous implementation did. risk_notes
 * carry the confidentiality and release story, so whoever reads the report knows
 * what was withheld and why.
 */
export function buildReportPayload(
  cycleId: string,
  scores: SubjectScores,
  competencyNames: Map<string, string> = new Map(),
  release = false,
): AssessmentReportPayload {
  const reportable = scores.competencies
    .filter((competency) => competency.mean !== null)
    .sort((a, b) => (b.mean as number) - (a.mean as number));

  const gapsByCompetency = new Map(scores.gaps.map((gap) => [gap.competencyId, gap]));

  const strengths = reportable
    .slice(0, 3)
    .map((competency) => `${competencyLabel(competency, competencyNames)} — ${competency.mean}`);

  const developmentAreas = reportable
    .slice(-3)
    .reverse()
    .map((competency) => `${competencyLabel(competency, competencyNames)} — ${competency.mean}`);

  const suppressedGroups = [
    ...new Set(
      scores.competencies.flatMap((competency) =>
        competency.byGroup.filter((cell) => cell.suppressed).map((cell) => cell.raterGroup),
      ),
    ),
  ];

  const blindSpots = scores.gaps.filter((gap) => gap.blindSpot).length;
  const hiddenStrengths = scores.gaps.filter((gap) => gap.hiddenStrength).length;

  const riskNotes = [
    "Scores are on the 1-5 instrument scale. Not-observed responses are excluded from every denominator.",
    suppressedGroups.length
      ? `Withheld for confidentiality — fewer than ${MINIMUM_RESPONSES_PER_GROUP} responses in: ${suppressedGroups.map(label).join(", ")}.`
      : `No rater category fell below the ${MINIMUM_RESPONSES_PER_GROUP}-response confidentiality threshold.`,
    blindSpots || hiddenStrengths
      ? `${blindSpots} potential blind spot(s) and ${hiddenStrengths} hidden strength(s) identified against self-assessment.`
      : "No material self-versus-others divergence identified.",
    ...scores.release.reasons,
  ];

  return {
    cycle_id: cycleId,
    subject_id: scores.subjectId,
    weighted_score: scores.overall,
    group_scores: subjectGroupScores(scores),
    competency_scores: scores.competencies.map((competency) => {
      const gap = gapsByCompetency.get(competency.competencyId);
      return {
        competencyId: competency.competencyId,
        competencyName: competencyLabel(competency, competencyNames),
        mean: competency.mean,
        selfMean: competency.selfMean,
        gap: gap?.gap ?? null,
        blindSpot: gap?.blindSpot ?? false,
        hiddenStrength: gap?.hiddenStrength ?? false,
        byGroup: competency.byGroup.map((cell) => ({
          raterGroup: cell.raterGroup,
          mean: cell.mean,
          raterCount: cell.raterCount,
          suppressed: cell.suppressed,
        })),
        items: competency.items.map((item) => ({
          itemId: item.itemId,
          text: item.text ?? null,
          mean: item.mean,
          raterCount: item.raterCount,
          suppressed: item.suppressed,
          selfRating: item.selfRating,
        })),
      };
    }),
    strengths: strengths.length ? strengths : ["Not enough reportable data to identify strengths."],
    development_areas: developmentAreas.length
      ? developmentAreas
      : ["Not enough reportable data to identify development areas."],
    risk_notes: riskNotes,
    released_at: release && scores.release.ready ? new Date().toISOString() : null,
  };
}
