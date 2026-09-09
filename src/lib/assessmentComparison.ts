import type { CohortSubject, CompetencyScore, SubjectScores } from "./assessmentScoring.ts";

export type FrameworkProvenance = {
  frameworkId?: string | null;
  frameworkVersion?: number | null;
};

export type Comparability = {
  comparable: boolean;
  reason: "same_framework" | "missing_framework" | "different_framework" | "different_version";
  message: string;
};

export type CompetencyMovement = {
  competencyId: string;
  label: string;
  priorScore: number | null;
  currentScore: number | null;
  delta: number | null;
  direction: "improved" | "declined" | "flat" | "missing_prior" | "missing_current" | "suppressed" | "not_comparable";
  suppressed: boolean;
};

export type IndividualMovement = {
  subjectId: string;
  priorSubjectId?: string | null;
  currentSubjectId?: string | null;
  comparability: Comparability;
  competencies: CompetencyMovement[];
};

export type CohortMovement = {
  comparability: Comparability;
  headline: string;
  overall: {
    priorScore: number | null;
    currentScore: number | null;
    delta: number | null;
    direction: CompetencyMovement["direction"];
    suppressed: boolean;
  };
  competencies: CompetencyMovement[];
  segments: Array<{
    dimension: "level" | "functionName" | "region";
    value: string;
    priorScore: number | null;
    currentScore: number | null;
    delta: number | null;
    direction: CompetencyMovement["direction"];
    suppressed: boolean;
  }>;
};

export type CycleCloneSource = {
  id: string;
  name: string;
  clientContext?: string | null;
  assessmentType?: string | null;
  levels?: string[] | null;
  reviewerWeights?: Record<string, number> | null;
  competencyModel?: unknown;
};

export type CycleClonePlan = {
  cycle: {
    name: string;
    client_context: string | null;
    assessment_type: string;
    status: string;
    levels: string[];
    starts_on: string | null;
    closes_on: string | null;
    reviewer_weights: Record<string, number>;
    competency_model: unknown;
    prior_cycle_id: string;
  };
  populationMode: "carry_forward" | "replace";
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoreMap(scores?: SubjectScores | null): Map<string, CompetencyScore> {
  return new Map((scores?.competencies ?? []).map((competency) => [competency.competencyId, competency]));
}

export function compareFrameworkProvenance(
  prior: FrameworkProvenance,
  current: FrameworkProvenance,
): Comparability {
  if (!prior.frameworkId || !current.frameworkId || !prior.frameworkVersion || !current.frameworkVersion) {
    return {
      comparable: false,
      reason: "missing_framework",
      message: "Framework provenance is incomplete, so movement should be treated as directional only.",
    };
  }
  if (prior.frameworkId !== current.frameworkId) {
    return {
      comparable: false,
      reason: "different_framework",
      message: "The cycles use different frameworks and are not strictly comparable.",
    };
  }
  if (prior.frameworkVersion !== current.frameworkVersion) {
    return {
      comparable: false,
      reason: "different_version",
      message: "The cycles use different framework versions and are not strictly comparable.",
    };
  }
  return {
    comparable: true,
    reason: "same_framework",
    message: `Comparable against framework version ${current.frameworkVersion}.`,
  };
}

export function directionForDelta(delta: number | null): CompetencyMovement["direction"] {
  if (delta === null) return "suppressed";
  if (delta > 0.05) return "improved";
  if (delta < -0.05) return "declined";
  return "flat";
}

export function compareCompetencyMovement(input: {
  prior?: SubjectScores | null;
  current?: SubjectScores | null;
  labels?: Map<string, string>;
  comparability?: Comparability;
}): CompetencyMovement[] {
  const priorMap = scoreMap(input.prior);
  const currentMap = scoreMap(input.current);
  const ids = [...new Set([...priorMap.keys(), ...currentMap.keys()])].sort((a, b) =>
    (input.labels?.get(a) ?? a).localeCompare(input.labels?.get(b) ?? b),
  );
  const comparable = input.comparability?.comparable ?? true;

  return ids.map((competencyId) => {
    const prior = priorMap.get(competencyId);
    const current = currentMap.get(competencyId);
    const priorScore = prior?.mean ?? null;
    const currentScore = current?.mean ?? null;
    const suppressed = priorScore === null || currentScore === null;
    const delta = !suppressed && comparable ? round(Number(currentScore) - Number(priorScore)) : null;
    let direction: CompetencyMovement["direction"] = directionForDelta(delta);
    if (!prior) direction = "missing_prior";
    else if (!current) direction = "missing_current";
    else if (!comparable) direction = "not_comparable";
    else if (suppressed) direction = "suppressed";

    return {
      competencyId,
      label: input.labels?.get(competencyId) ?? competencyId,
      priorScore,
      currentScore,
      delta,
      direction,
      suppressed,
    };
  });
}

export function buildIndividualMovement(input: {
  subjectId: string;
  priorSubjectId?: string | null;
  current?: SubjectScores | null;
  prior?: SubjectScores | null;
  currentFramework: FrameworkProvenance;
  priorFramework: FrameworkProvenance;
  labels?: Map<string, string>;
}): IndividualMovement {
  const comparability = compareFrameworkProvenance(input.priorFramework, input.currentFramework);
  return {
    subjectId: input.subjectId,
    priorSubjectId: input.priorSubjectId ?? input.prior?.subjectId ?? null,
    currentSubjectId: input.current?.subjectId ?? null,
    comparability,
    competencies: compareCompetencyMovement({
      prior: input.prior,
      current: input.current,
      labels: input.labels,
      comparability,
    }),
  };
}

export function buildCohortMovement(input: {
  priorSubjects: CohortSubject[];
  currentSubjects: CohortSubject[];
  priorFramework: FrameworkProvenance;
  currentFramework: FrameworkProvenance;
  labels?: Map<string, string>;
}): CohortMovement {
  const comparability = compareFrameworkProvenance(input.priorFramework, input.currentFramework);
  const priorOverall = cohortMean(input.priorSubjects);
  const currentOverall = cohortMean(input.currentSubjects);
  const suppressed = priorOverall === null || currentOverall === null;
  const delta = !suppressed && comparability.comparable ? round(Number(currentOverall) - Number(priorOverall)) : null;
  const direction = comparability.comparable ? directionForDelta(delta) : "not_comparable";

  return {
    comparability,
    headline: movementHeadline(delta, direction, comparability),
    overall: { priorScore: priorOverall, currentScore: currentOverall, delta, direction, suppressed },
    competencies: compareCohortCompetencies(input),
    segments: compareCohortSegments(input),
  };
}

function cohortMean(subjects: CohortSubject[]): number | null {
  if (subjects.length < 3) return null;
  return mean(subjects.map((subject) => subject.scores.overall).filter((value): value is number => value !== null));
}

function compareCohortCompetencies(input: {
  priorSubjects: CohortSubject[];
  currentSubjects: CohortSubject[];
  priorFramework: FrameworkProvenance;
  currentFramework: FrameworkProvenance;
  labels?: Map<string, string>;
}): CompetencyMovement[] {
  const comparability = compareFrameworkProvenance(input.priorFramework, input.currentFramework);
  const ids = new Set<string>();
  for (const subject of [...input.priorSubjects, ...input.currentSubjects]) {
    for (const competency of subject.scores.competencies) ids.add(competency.competencyId);
  }

  return [...ids].sort().map((competencyId) => {
    const priorScore = meanCompetency(input.priorSubjects, competencyId);
    const currentScore = meanCompetency(input.currentSubjects, competencyId);
    const suppressed = priorScore === null || currentScore === null;
    const delta = !suppressed && comparability.comparable ? round(Number(currentScore) - Number(priorScore)) : null;
    return {
      competencyId,
      label: input.labels?.get(competencyId) ?? competencyId,
      priorScore,
      currentScore,
      delta,
      direction: comparability.comparable ? directionForDelta(delta) : "not_comparable",
      suppressed,
    };
  });
}

function meanCompetency(subjects: CohortSubject[], competencyId: string): number | null {
  const values = subjects
    .map((subject) => subject.scores.competencies.find((competency) => competency.competencyId === competencyId)?.mean ?? null)
    .filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  return mean(values);
}

function compareCohortSegments(input: {
  priorSubjects: CohortSubject[];
  currentSubjects: CohortSubject[];
  priorFramework: FrameworkProvenance;
  currentFramework: FrameworkProvenance;
}) {
  const comparability = compareFrameworkProvenance(input.priorFramework, input.currentFramework);
  const dimensions = ["level", "functionName", "region"] as const;

  return dimensions.flatMap((dimension) => {
    const values = new Set<string>();
    for (const subject of [...input.priorSubjects, ...input.currentSubjects]) {
      const value = String(subject[dimension] ?? "").trim();
      if (value) values.add(value);
    }

    return [...values].sort().map((value) => {
      const priorScore = segmentMean(input.priorSubjects, dimension, value);
      const currentScore = segmentMean(input.currentSubjects, dimension, value);
      const suppressed = priorScore === null || currentScore === null;
      const delta = !suppressed && comparability.comparable ? round(Number(currentScore) - Number(priorScore)) : null;
      return {
        dimension,
        value,
        priorScore,
        currentScore,
        delta,
        direction: comparability.comparable ? directionForDelta(delta) : "not_comparable",
        suppressed,
      };
    });
  });
}

function segmentMean(subjects: CohortSubject[], dimension: "level" | "functionName" | "region", value: string): number | null {
  const matching = subjects.filter((subject) => String(subject[dimension] ?? "").trim() === value);
  if (matching.length < 3) return null;
  return mean(matching.map((subject) => subject.scores.overall).filter((score): score is number => score !== null));
}

function movementHeadline(delta: number | null, direction: CompetencyMovement["direction"], comparability: Comparability): string {
  if (!comparability.comparable) return comparability.message;
  if (delta === null) return "Movement is suppressed because one or both cohorts are below the reporting threshold.";
  if (direction === "improved") return `Cohort movement improved by ${delta.toFixed(2)} points.`;
  if (direction === "declined") return `Cohort movement declined by ${Math.abs(delta).toFixed(2)} points.`;
  return "Cohort movement is broadly flat against the baseline.";
}

export function buildCycleClonePlan(input: {
  prior: CycleCloneSource;
  name?: string | null;
  startsOn?: string | null;
  closesOn?: string | null;
  status?: string | null;
  populationMode?: "carry_forward" | "replace";
}): CycleClonePlan {
  return {
    cycle: {
      name: input.name?.trim() || `${input.prior.name} - follow-up`,
      client_context: input.prior.clientContext ?? null,
      assessment_type: input.prior.assessmentType ?? "360",
      status: input.status ?? "setup",
      levels: input.prior.levels?.length ? input.prior.levels : ["director", "assistant_director"],
      starts_on: input.startsOn ?? null,
      closes_on: input.closesOn ?? null,
      reviewer_weights: input.prior.reviewerWeights ?? {
        self: 0,
        line_manager: 30,
        colleague: 25,
        direct_report: 25,
        customer: 20,
      },
      competency_model: input.prior.competencyModel ?? [],
      prior_cycle_id: input.prior.id,
    },
    populationMode: input.populationMode ?? "carry_forward",
  };
}

/**
 * Which participants a cloned cycle starts with.
 *
 * This was decided inline in the clone route as:
 *
 *     mode === "replace" && replacements ? replacements : priorSubjects
 *
 * which reads as "replace when a list was supplied" but behaves as "carry
 * everyone forward whenever one was not". Asking to replace the population and
 * supplying nothing therefore copied the entire prior population — the opposite
 * of the request, silently.
 *
 * Replace now means replace: an absent list is an empty population, not a
 * licence to reuse the old one. A cycle that starts empty is easy to see and
 * fix; one that quietly inherits five people is not.
 */
export function resolveClonePopulation<T>(input: {
  populationMode: "carry_forward" | "replace";
  /** Subjects posted with the clone request; null when the caller sent none. */
  replacements: T[] | null;
  priorSubjects: T[];
}): T[] {
  if (input.populationMode === "replace") return input.replacements ?? [];
  return input.priorSubjects;
}
