/**
 * Scoring service — INTERFACE ONLY. No implementation lands in Stage 1.
 *
 * This is the surface every downstream branch codes against. The signatures and
 * the rules documented here are the contract; the bodies are deliberately
 * unimplemented so that nobody builds against guessed behaviour.
 *
 * Four rules govern every function below. They are the reason this service
 * exists rather than each caller averaging responses itself:
 *
 *   1. NOT-OBSERVED IS EXCLUDED, NOT ZEROED. A response with not_observed = true
 *      leaves the denominator as well as the numerator. Three raters where one
 *      could not observe gives a mean of two, never a mean of three including a 0.
 *
 *   2. AVERAGE WITHIN A RATER GROUP BEFORE WEIGHTING ACROSS GROUPS. Four
 *      colleagues produce one colleague mean, which then carries the colleague
 *      weight. (The current assessmentReporting.ts builds groupScores with a
 *      reduce that overwrites on key collision, keeping only the last rater in
 *      each group. Do not reproduce that.)
 *
 *   3. THIN GROUPS ARE SUPPRESSED. Where a (competency, raterGroup) cell has
 *      fewer than `minimumResponsesPerGroup` scored responses — default 3 — that
 *      cell must not be reported at its own granularity. It is either merged
 *      into an "other raters" aggregate or withheld. A group of one is
 *      attributable, and attributable feedback breaks the anonymity the raters
 *      were promised.
 *
 *   4. SELF IS SCORED BUT NOT WEIGHTED. reviewer_group 'self' flows through the
 *      same responses pipeline so that self-versus-others gaps can be computed,
 *      but it carries weight 0 and never contributes to the others-weighted
 *      score.
 *
 * @see CONTRACT.md for the response shape in plain English.
 */

import type { RaterGroup } from "./raterRelationship.ts";

/** Default minimum scored responses before a rater-group cell may be reported alone. */
export const MINIMUM_RESPONSES_PER_GROUP = 3;

/**
 * One stored response, flattened for scoring. Mirrors a row of
 * assessment_responses joined to its reviewer's group.
 */
export type ScoredResponse = {
  itemId: string;
  /** Null for standalone open-text items, which hang off the cycle. */
  competencyId: string | null;
  itemType: "scale" | "text";
  raterGroup: RaterGroup;
  /** 1..5 on an observed scale item; null when notObserved, or on a text item. */
  rating: number | null;
  notObserved: boolean;
  comment: string | null;
};

/** A (competency, raterGroup) cell. */
export type GroupCompetencyScore = {
  competencyId: string;
  raterGroup: RaterGroup;
  /** Null when suppressed — never a number the caller might render anyway. */
  mean: number | null;
  /** Scored responses behind the mean. Excludes not-observed. */
  responseCount: number;
  notObservedCount: number;
  /** True when responseCount fell below the minimum and the cell was withheld. */
  suppressed: boolean;
};

/** A competency rolled up across all non-self rater groups. */
export type CompetencyScore = {
  competencyId: string;
  /** Weighted across rater groups, self excluded. Null if nothing survives suppression. */
  mean: number | null;
  responseCount: number;
  notObservedCount: number;
  /** Per-group breakdown, including suppressed cells so the caller can show why. */
  byGroup: GroupCompetencyScore[];
};

export type SelfOthersGap = {
  competencyId: string;
  selfMean: number | null;
  othersMean: number | null;
  /** selfMean - othersMean. Null when either side is unavailable. */
  gap: number | null;
  /** Rates self materially below others — a strength the subject does not claim. */
  hiddenStrength: boolean;
  /** Rates self materially above others — the classic blind spot. */
  blindSpot: boolean;
};

export type SubjectScores = {
  subjectId: string;
  /** Overall weighted score, self excluded. Null when too little survives suppression. */
  overall: number | null;
  competencies: CompetencyScore[];
  gaps: SelfOthersGap[];
  /** Verbatims from text items, and comments on scale items. */
  verbatims: Array<{ competencyId: string | null; raterGroup: RaterGroup; comment: string }>;
  /** True when the subject has too few total responses to report on at all. */
  insufficientData: boolean;
};

export type ScoringOptions = {
  /** Defaults to MINIMUM_RESPONSES_PER_GROUP. */
  minimumResponsesPerGroup?: number;
  /** Defaults to the cycle's reviewer_weights. Self must be 0. */
  weights?: Partial<Record<RaterGroup, number>>;
  /** Absolute gap at which a difference counts as a blind spot / hidden strength. */
  gapThreshold?: number;
};

const NOT_IMPLEMENTED = "assessmentScoring: interface only — implementation lands in a later stage.";

/**
 * Scores one subject from their raw responses.
 *
 * Applies all four rules above. Callers must not pre-filter not-observed rows or
 * pre-average anything — pass every response for the subject and let this decide.
 */
export function scoreSubject(
  _subjectId: string,
  _responses: ScoredResponse[],
  _options?: ScoringOptions,
): SubjectScores {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Collapses responses into (competency, raterGroup) cells, applying not-observed
 * exclusion and the minimum-response threshold. Exposed separately so completion
 * dashboards can show which cells will be suppressed before a cycle closes.
 */
export function scoreByGroup(
  _responses: ScoredResponse[],
  _options?: ScoringOptions,
): GroupCompetencyScore[] {
  throw new Error(NOT_IMPLEMENTED);
}

/** Self-versus-others gaps per competency, derived from reviewer_group 'self'. */
export function computeSelfOthersGaps(
  _responses: ScoredResponse[],
  _options?: ScoringOptions,
): SelfOthersGap[] {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Whether a subject has enough data to report on at all, ahead of scoring.
 * Cheap enough to call per subject across a whole cohort.
 */
export function hasSufficientData(
  _responses: ScoredResponse[],
  _options?: ScoringOptions,
): boolean {
  throw new Error(NOT_IMPLEMENTED);
}
