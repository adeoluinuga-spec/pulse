/**
 * 360 scoring service — pure computation, no database access.
 *
 * The data-access half lives in assessmentScoringService.ts. Keeping this module
 * free of I/O is what makes the suppression rules testable, and suppression is
 * the part that is contractually promised to raters.
 *
 * Four rules govern everything below.
 *
 *   1. NOT-OBSERVED IS EXCLUDED, NOT ZEROED. A not_observed response leaves the
 *      denominator as well as the numerator. Three raters where one could not
 *      observe is a mean of two, never a mean of three including a zero.
 *
 *   2. AVERAGE WITHIN A RATER CATEGORY. Each rater's items within a competency
 *      are meaned into one rater score; the category is the mean of those. A
 *      rater who answered six items does not outweigh one who answered two.
 *
 *   3. THIN CATEGORIES ARE SUPPRESSED. See MINIMUM_RESPONSES_PER_GROUP.
 *
 *   4. SELF IS SCORED BUT NEVER WEIGHTED.
 *
 * @see CONTRACT.md
 */

import type { RaterGroup } from "./raterRelationship.ts";

/**
 * Minimum DISTINCT RATERS before a rater category may be reported on its own.
 *
 * The unit is raters, not item responses: three colleagues answering four items
 * each is three, not twelve. What identifies someone is being one of a small
 * number of people, not having answered a lot of questions.
 */
export const MINIMUM_RESPONSES_PER_GROUP = 3;

/**
 * Minimum subjects before a cohort segment may be reported. A segment of one or
 * two people identifies them exactly as surely as a thin rater category does.
 */
export const MINIMUM_SUBJECTS_PER_SEGMENT = 3;

/**
 * How far self and others must diverge, on the 1-5 scale, before the difference
 * is called a blind spot or a hidden strength.
 *
 * Half a scale point. Below this, the difference is inside the noise you would
 * expect from three or four people using a five-point scale slightly
 * differently, and calling it a finding in a debrief would be over-reading the
 * data. Raise it to be more conservative; it is a reporting convention, not a
 * statistical result, which is why it is a named constant rather than a literal
 * buried in the comparison.
 */
export const SELF_OTHERS_GAP_THRESHOLD = 0.5;

/**
 * Categories that are single-rater by definition. They are exempt from
 * suppression because the participant already knows who they are — concealing a
 * line manager's score protects nobody and removes the most useful comparison
 * in the report.
 */
export const SINGLE_RATER_GROUPS: readonly string[] = ["self", "line_manager"];

/** Mirrors assessment_cycles.reviewer_weights. Self is 0 by construction. */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  self: 0,
  line_manager: 30,
  colleague: 25,
  direct_report: 25,
  customer: 20,
};

const CATEGORY_ORDER: readonly string[] = [
  "self",
  "line_manager",
  "colleague",
  "direct_report",
  "customer",
  "others",
];

export type SuppressionMode = "suppress" | "merge";

/** One stored response, flattened: assessment_responses joined to its reviewer. */
export type ScoredResponse = {
  reviewerId: string;
  raterGroup: RaterGroup;
  itemId: string;
  /** Null on a standalone open-text item. */
  competencyId: string | null;
  itemType: "scale" | "text";
  rating: number | null;
  notObserved: boolean;
  comment: string | null;
  /** The item's wording, carried through so reports can print the statement. */
  itemBody?: string | null;
};

export type GroupCompetencyScore = {
  competencyId: string;
  raterGroup: RaterGroup | "others";
  /** Null when suppressed — never a number a caller might render anyway. */
  mean: number | null;
  raterCount: number;
  responseCount: number;
  notObservedCount: number;
  suppressed: boolean;
  exempt: boolean;
};

export type ItemScore = {
  itemId: string;
  /**
   * The behavioural statement itself, when the caller supplied item bodies.
   * Optional so that callers constructing ItemScore directly (report fixtures,
   * PDF builders) are not forced to carry wording they may not have.
   */
  text?: string | null;
  competencyId: string | null;
  /** Across non-self raters. Null when suppressed. */
  mean: number | null;
  raterCount: number;
  responseCount: number;
  notObservedCount: number;
  suppressed: boolean;
  selfRating: number | null;
};

export type CompetencyScore = {
  competencyId: string;
  /** Weighted across reported non-self categories, renormalised. */
  mean: number | null;
  selfMean: number | null;
  othersMean: number | null;
  raterCount: number;
  responseCount: number;
  notObservedCount: number;
  byGroup: GroupCompetencyScore[];
  items: ItemScore[];
};

export type SelfOthersGap = {
  competencyId: string;
  selfMean: number | null;
  othersMean: number | null;
  /** selfMean - othersMean. Null when either side is missing or suppressed. */
  gap: number | null;
  blindSpot: boolean;
  hiddenStrength: boolean;
};

export type Verbatim = {
  competencyId: string | null;
  itemId: string;
  raterGroup: RaterGroup;
  comment: string;
};

export type ReleaseDecision = {
  ready: boolean;
  hasLineManager: boolean;
  /** Non-self, non-manager categories with at least MINIMUM_RESPONSES_PER_GROUP raters. */
  qualifyingCategories: string[];
  reasons: string[];
};

export type SubjectScores = {
  subjectId: string;
  overall: number | null;
  competencies: CompetencyScore[];
  gaps: SelfOthersGap[];
  verbatims: Verbatim[];
  release: ReleaseDecision;
  insufficientData: boolean;
};

export type ScoringOptions = {
  minimumResponsesPerGroup?: number;
  /** Thin categories are withheld ("suppress", default) or pooled ("merge"). */
  suppressionMode?: SuppressionMode;
  weights?: Partial<Record<string, number>>;
  gapThreshold?: number;
};

// ── helpers ────────────────────────────────────────────────────────────────

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function meanOf(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isScored(response: ScoredResponse): boolean {
  return (
    response.itemType === "scale" &&
    !response.notObserved &&
    response.rating !== null &&
    Number.isFinite(response.rating)
  );
}

function categoryRank(group: string): number {
  const index = CATEGORY_ORDER.indexOf(group);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Mean of one rater's scored items — rule 2's inner average. Returns null when
 * the rater observed nothing in this competency, which is how they drop out of
 * the rater count entirely.
 */
function raterMean(responses: ScoredResponse[]): number | null {
  const scored = responses.filter(isScored);
  if (!scored.length) return null;
  return scored.reduce((sum, response) => sum + Number(response.rating), 0) / scored.length;
}

function scaleResponsesByCompetency(responses: ScoredResponse[]): Map<string, ScoredResponse[]> {
  const scale = (responses ?? []).filter(
    (response) => response.itemType === "scale" && response.competencyId,
  );
  return groupBy(scale, (response) => response.competencyId as string);
}

// ── per-category scoring ───────────────────────────────────────────────────

function scoreCompetencyGroups(
  competencyId: string,
  responses: ScoredResponse[],
  minimum: number,
  mode: SuppressionMode,
): GroupCompetencyScore[] {
  const byGroup = groupBy(responses, (response) => response.raterGroup);
  const cells: GroupCompetencyScore[] = [];
  /** Rater means from thin, non-exempt categories, kept for the merge bucket. */
  const pooled: number[] = [];
  let pooledNotObserved = 0;

  for (const [raterGroup, groupResponses] of byGroup) {
    const byRater = groupBy(groupResponses, (response) => response.reviewerId);
    const raterMeans: number[] = [];

    for (const [, raterResponses] of byRater) {
      const mean = raterMean(raterResponses);
      if (mean !== null) raterMeans.push(mean);
    }

    const notObservedCount = groupResponses.filter((response) => response.notObserved).length;
    const responseCount = groupResponses.filter(isScored).length;
    const exempt = SINGLE_RATER_GROUPS.includes(raterGroup);
    const suppressed = !exempt && raterMeans.length < minimum;

    if (suppressed && mode === "merge") {
      pooled.push(...raterMeans);
      pooledNotObserved += notObservedCount;
    }

    cells.push({
      competencyId,
      raterGroup: raterGroup as RaterGroup,
      mean: suppressed ? null : meanOf(raterMeans),
      raterCount: raterMeans.length,
      responseCount,
      notObservedCount,
      suppressed,
      exempt,
    });
  }

  if (mode === "merge" && pooled.length > 0) {
    const suppressed = pooled.length < minimum;
    cells.push({
      competencyId,
      raterGroup: "others",
      mean: suppressed ? null : meanOf(pooled),
      raterCount: pooled.length,
      responseCount: pooled.length,
      notObservedCount: pooledNotObserved,
      suppressed,
      exempt: false,
    });
  }

  return cells.sort((a, b) => categoryRank(a.raterGroup) - categoryRank(b.raterGroup));
}

export function scoreByGroup(
  responses: ScoredResponse[],
  options: ScoringOptions = {},
): GroupCompetencyScore[] {
  const minimum = options.minimumResponsesPerGroup ?? MINIMUM_RESPONSES_PER_GROUP;
  const mode = options.suppressionMode ?? "suppress";

  return [...scaleResponsesByCompetency(responses)].flatMap(([competencyId, group]) =>
    scoreCompetencyGroups(competencyId, group, minimum, mode),
  );
}

/**
 * Weighted mean across the categories actually reported, renormalised over the
 * weights that survived. Self is excluded outright; suppressed categories drop
 * out rather than contributing a zero.
 *
 * In merge mode the pooled "others" bucket inherits the summed weight of the
 * thin categories that went into it, so pooling does not quietly change how much
 * the remaining categories count for.
 */
function weightedMean(
  cells: GroupCompetencyScore[],
  weights: Record<string, number>,
): number | null {
  const merged = cells.find((cell) => cell.raterGroup === "others" && !cell.suppressed);
  const mergedWeight = merged
    ? cells
        .filter((cell) => cell.suppressed && !cell.exempt && cell.raterGroup !== "others")
        .reduce((sum, cell) => sum + (weights[cell.raterGroup] ?? 0), 0)
    : 0;

  const contributors: Array<{ mean: number; weight: number }> = [];

  for (const cell of cells) {
    if (cell.raterGroup === "self" || cell.suppressed || cell.mean === null) continue;
    const weight =
      cell.raterGroup === "others" ? mergedWeight : (weights[cell.raterGroup] ?? 0);
    if (weight > 0) contributors.push({ mean: cell.mean, weight });
  }

  if (!contributors.length) return null;

  const totalWeight = contributors.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  return round(
    contributors.reduce((sum, entry) => sum + entry.mean * entry.weight, 0) / totalWeight,
  );
}

function scoreItems(
  responses: ScoredResponse[],
  minimum: number,
): ItemScore[] {
  return [...groupBy(responses, (response) => response.itemId)].map(([itemId, itemResponses]) => {
    const nonSelf = itemResponses.filter((response) => response.raterGroup !== "self");
    const scored = nonSelf.filter(isScored);
    const raters = new Set(scored.map((response) => response.reviewerId));
    const suppressed = raters.size < minimum;
    const selfResponse = itemResponses.find(
      (response) => response.raterGroup === "self" && isScored(response),
    );

    return {
      itemId,
      text: itemResponses.find((response) => response.itemBody)?.itemBody ?? null,
      competencyId: itemResponses[0]?.competencyId ?? null,
      mean: suppressed ? null : meanOf(scored.map((response) => Number(response.rating))),
      raterCount: raters.size,
      responseCount: scored.length,
      notObservedCount: nonSelf.filter((response) => response.notObserved).length,
      suppressed,
      selfRating: selfResponse ? Number(selfResponse.rating) : null,
    };
  });
}

function buildCompetencies(
  responses: ScoredResponse[],
  options: ScoringOptions,
): CompetencyScore[] {
  const minimum = options.minimumResponsesPerGroup ?? MINIMUM_RESPONSES_PER_GROUP;
  const mode = options.suppressionMode ?? "suppress";
  const weights: Record<string, number> = { ...DEFAULT_WEIGHTS };
  for (const [group, weight] of Object.entries(options.weights ?? {})) {
    if (typeof weight === "number" && Number.isFinite(weight)) weights[group] = weight;
  }

  return [...scaleResponsesByCompetency(responses)].map(([competencyId, group]) => {
    const byGroup = scoreCompetencyGroups(competencyId, group, minimum, mode);
    const mean = weightedMean(byGroup, weights);
    const selfCell = byGroup.find((cell) => cell.raterGroup === "self");

    return {
      competencyId,
      mean,
      selfMean: selfCell?.mean ?? null,
      // The others-weighted mean is exactly the non-self weighted mean.
      othersMean: mean,
      raterCount: new Set(group.filter(isScored).map((response) => response.reviewerId)).size,
      responseCount: group.filter(isScored).length,
      notObservedCount: group.filter((response) => response.notObserved).length,
      byGroup,
      items: scoreItems(group, minimum),
    };
  });
}

export function computeSelfOthersGaps(
  responses: ScoredResponse[],
  options: ScoringOptions = {},
): SelfOthersGap[] {
  const threshold = options.gapThreshold ?? SELF_OTHERS_GAP_THRESHOLD;

  return buildCompetencies(responses, options).map((competency) => {
    const { selfMean, othersMean } = competency;
    const gap = selfMean !== null && othersMean !== null ? round(selfMean - othersMean) : null;

    return {
      competencyId: competency.competencyId,
      selfMean,
      othersMean,
      gap,
      blindSpot: gap !== null && gap >= threshold,
      hiddenStrength: gap !== null && gap <= -threshold,
    };
  });
}

/**
 * Replaces the old all-groups-present-and-everyone-submitted gate, under which a
 * single non-responder permanently blocked a subject — across 568 assignments,
 * that blocked most of the cohort.
 *
 * The rule: the line manager must have responded, and at least two further rater
 * categories must clear the suppression threshold. A category that cannot be
 * reported cannot support a report.
 */
export function decideRelease(
  responses: ScoredResponse[],
  options: ScoringOptions = {},
): ReleaseDecision {
  const minimum = options.minimumResponsesPerGroup ?? MINIMUM_RESPONSES_PER_GROUP;
  const scored = (responses ?? []).filter(isScored);
  const byGroup = groupBy(scored, (response) => response.raterGroup);

  const raterCounts = new Map<string, number>();
  for (const [raterGroup, groupResponses] of byGroup) {
    raterCounts.set(raterGroup, new Set(groupResponses.map((r) => r.reviewerId)).size);
  }

  const hasLineManager = (raterCounts.get("line_manager") ?? 0) >= 1;
  const qualifyingCategories = [...raterCounts.entries()]
    .filter(([group, count]) => group !== "self" && group !== "line_manager" && count >= minimum)
    .map(([group]) => group);

  const reasons: string[] = [];
  if (!hasLineManager) {
    reasons.push("No line manager response — a line manager assessment is required before release.");
  }
  if (qualifyingCategories.length < 2) {
    reasons.push(
      `Only ${qualifyingCategories.length} of the required two further rater categories have ${minimum} or more responses.`,
    );
  }

  return {
    ready: hasLineManager && qualifyingCategories.length >= 2,
    hasLineManager,
    qualifyingCategories,
    reasons,
  };
}

export function hasSufficientData(
  responses: ScoredResponse[],
  options: ScoringOptions = {},
): boolean {
  return decideRelease(responses, options).ready;
}

function collectVerbatims(responses: ScoredResponse[]): Verbatim[] {
  return (responses ?? [])
    .filter((response) => Boolean(response.comment?.trim()))
    .map((response) => ({
      competencyId: response.competencyId,
      itemId: response.itemId,
      raterGroup: response.raterGroup,
      comment: response.comment!.trim(),
    }));
}

export function scoreSubject(
  subjectId: string,
  responses: ScoredResponse[],
  options: ScoringOptions = {},
): SubjectScores {
  const competencies = buildCompetencies(responses, options);
  const release = decideRelease(responses, options);
  const means = competencies
    .map((competency) => competency.mean)
    .filter((mean): mean is number => mean !== null);

  return {
    subjectId,
    overall: meanOf(means),
    competencies,
    gaps: computeSelfOthersGaps(responses, options),
    verbatims: collectVerbatims(responses),
    release,
    insufficientData: !release.ready,
  };
}

// ── cohort aggregation ─────────────────────────────────────────────────────

export type CohortDimension = "level" | "functionName" | "region" | "portfolio";

export type CohortSubject = {
  subjectId: string;
  level?: string | null;
  functionName?: string | null;
  region?: string | null;
  portfolio?: string | null;
  scores: SubjectScores;
};

export type CohortSegment = {
  dimension: CohortDimension;
  value: string;
  subjectCount: number;
  mean: number | null;
  competencies: Array<{ competencyId: string; mean: number | null }>;
  suppressed: boolean;
};

const COHORT_DIMENSIONS: CohortDimension[] = ["level", "functionName", "region", "portfolio"];

export function aggregateCohort(
  subjects: CohortSubject[],
  options: ScoringOptions & { minimumSubjectsPerSegment?: number } = {},
): CohortSegment[] {
  const minimum = options.minimumSubjectsPerSegment ?? MINIMUM_SUBJECTS_PER_SEGMENT;
  const segments: CohortSegment[] = [];

  for (const dimension of COHORT_DIMENSIONS) {
    const buckets = new Map<string, CohortSubject[]>();

    for (const subject of subjects ?? []) {
      const value = String(subject[dimension] ?? "").trim();
      if (!value) continue;
      const bucket = buckets.get(value);
      if (bucket) bucket.push(subject);
      else buckets.set(value, [subject]);
    }

    for (const [value, members] of buckets) {
      const suppressed = members.length < minimum;

      const competencyMeans = new Map<string, number[]>();
      for (const member of members) {
        for (const competency of member.scores.competencies) {
          if (competency.mean === null) continue;
          const list = competencyMeans.get(competency.competencyId);
          if (list) list.push(competency.mean);
          else competencyMeans.set(competency.competencyId, [competency.mean]);
        }
      }

      segments.push({
        dimension,
        value,
        subjectCount: members.length,
        mean: suppressed
          ? null
          : meanOf(
              members
                .map((member) => member.scores.overall)
                .filter((mean): mean is number => mean !== null),
            ),
        competencies: [...competencyMeans].map(([competencyId, values]) => ({
          competencyId,
          mean: suppressed ? null : meanOf(values),
        })),
        suppressed,
      });
    }
  }

  return segments;
}
