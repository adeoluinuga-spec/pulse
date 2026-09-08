import type {
  CohortSegment,
  CohortSubject,
  CompetencyScore,
  GroupCompetencyScore,
  ItemScore as ScoringItemScore,
  SelfOthersGap,
  SubjectScores,
  Verbatim,
} from "./assessmentScoring.ts";
import {
  buildCohortMovement,
  buildIndividualMovement,
  type CohortMovement,
  type FrameworkProvenance,
  type IndividualMovement,
} from "./assessmentComparison.ts";
import { aggregateCohort, DEFAULT_WEIGHTS } from "./assessmentScoring.ts";
import type { RaterGroup } from "./raterRelationship.ts";

export type ReportSubjectProfile = {
  id: string;
  name: string;
  employeeId?: string | null;
  email?: string | null;
  role?: string | null;
  level?: string | null;
  functionName?: string | null;
  region?: string | null;
};

export type ReportCycleProfile = {
  id: string;
  name: string;
  clientName?: string | null;
  closesOn?: string | null;
  frameworkId?: string | null;
  frameworkVersion?: number | null;
  priorCycleId?: string | null;
  priorCycleName?: string | null;
};

export type CompetencyLabel = {
  id: string;
  name: string;
  description?: string | null;
};

export type ItemLabel = {
  id: string;
  competencyId: string | null;
  text: string;
};

export type IndividualPdfReport = {
  kind: "individual";
  brandName: string;
  generatedAt: string;
  cycle: ReportCycleProfile;
  subject: ReportSubjectProfile;
  scores: SubjectScores;
  competencies: Array<Omit<CompetencyScore, "items"> & { name: string; description?: string | null; items: Array<ScoringItemScore & { text: string }> }>;
  movement?: IndividualMovement | null;
  narrativeThemes: Array<{ theme: string; comments: string[] }>;
  developmentPriorities: string[];
};

export type AggregatePdfReport = {
  kind: "aggregate";
  brandName: string;
  generatedAt: string;
  cycle: ReportCycleProfile;
  cohortSize: number;
  cohortMean: number | null;
  competencyHeatMap: Array<{ competencyId: string; name: string; mean: number | null; suppressed: boolean }>;
  segments: CohortSegment[];
  movement?: CohortMovement | null;
  movementNarrative?: string | null;
  capabilityGaps: string[];
  recommendedInterventions: string[];
};

export const raterGroupLabels: Record<RaterGroup | "others", string> = {
  self: "Self",
  line_manager: "Line Manager",
  colleague: "Colleagues",
  direct_report: "Direct Reports",
  customer: "Customers",
  others: "Other Raters",
};

export function scoreLabel(mean: number | null): string {
  return mean === null ? "Suppressed" : `${mean.toFixed(2)} / 5`;
}

export function groupScoreLabel(cell: Pick<GroupCompetencyScore, "mean" | "suppressed">): string {
  return cell.suppressed || cell.mean === null ? "Suppressed (n<3)" : scoreLabel(cell.mean);
}

export function buildNarrativeThemes(verbatims: Verbatim[], itemLabels: Map<string, string>): Array<{ theme: string; comments: string[] }> {
  const buckets = new Map<string, string[]>();
  for (const verbatim of verbatims) {
    const label = itemLabels.get(verbatim.itemId) ?? "Narrative feedback";
    const theme = verbatim.competencyId ? label : "Open narrative feedback";
    const list = buckets.get(theme);
    if (list) list.push(verbatim.comment);
    else buckets.set(theme, [verbatim.comment]);
  }

  return [...buckets.entries()].map(([theme, comments]) => ({
    theme,
    comments: comments.slice(0, 6),
  }));
}

export function buildDevelopmentPriorities(
  competencies: Array<CompetencyScore & { name: string }>,
  gaps: SelfOthersGap[],
): string[] {
  const byGap = new Map(gaps.map((gap) => [gap.competencyId, gap]));
  const lowCompetencies = competencies
    .filter((competency) => competency.mean !== null)
    .sort((a, b) => Number(a.mean) - Number(b.mean))
    .slice(0, 2)
    .map((competency) => `Build consistency in ${competency.name}; it is one of the lower reported competency areas.`);

  const blindSpot = competencies.find((competency) => byGap.get(competency.competencyId)?.blindSpot);
  if (blindSpot) {
    lowCompetencies.push(`Calibrate self-perception in ${blindSpot.name}; others scored this lower than the self-rating.`);
  }

  return lowCompetencies.slice(0, 3);
}

export function buildIndividualPdfReport(input: {
  brandName?: string;
  generatedAt?: string;
  cycle: ReportCycleProfile;
  subject: ReportSubjectProfile;
  scores: SubjectScores;
  priorCycle?: ReportCycleProfile | null;
  priorScores?: SubjectScores | null;
  competencyLabels: CompetencyLabel[];
  itemLabels: ItemLabel[];
}): IndividualPdfReport {
  const competencyNames = new Map(input.competencyLabels.map((item) => [item.id, item]));
  const itemNames = new Map(input.itemLabels.map((item) => [item.id, item.text]));
  const competencies = input.scores.competencies.map((competency) => {
    const label = competencyNames.get(competency.competencyId);
    return {
      ...competency,
      name: label?.name ?? competency.competencyId,
      description: label?.description,
      items: competency.items.map((item) => ({
        ...item,
        text: itemNames.get(item.itemId) ?? item.itemId,
      })),
    };
  });

  return {
    kind: "individual",
    brandName: input.brandName ?? "Stuart Davidson",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    cycle: input.cycle,
    subject: input.subject,
    scores: input.scores,
    competencies,
    movement: input.priorCycle
      ? buildIndividualMovement({
          subjectId: input.subject.id,
          priorSubjectId: input.priorScores?.subjectId ?? null,
          current: input.scores,
          prior: input.priorScores,
          currentFramework: frameworkOf(input.cycle),
          priorFramework: frameworkOf(input.priorCycle),
          labels: new Map(input.competencyLabels.map((item) => [item.id, item.name])),
        })
      : null,
    narrativeThemes: buildNarrativeThemes(input.scores.verbatims, itemNames),
    developmentPriorities: buildDevelopmentPriorities(competencies, input.scores.gaps),
  };
}

export function buildAggregatePdfReport(input: {
  brandName?: string;
  generatedAt?: string;
  cycle: ReportCycleProfile;
  subjects: CohortSubject[];
  priorCycle?: ReportCycleProfile | null;
  priorSubjects?: CohortSubject[];
  competencyLabels: CompetencyLabel[];
  segments?: CohortSegment[];
}): AggregatePdfReport {
  const segments = input.segments ?? aggregateCohort(input.subjects);
  const labels = new Map(input.competencyLabels.map((item) => [item.id, item.name]));
  const means = new Map<string, number[]>();
  for (const subject of input.subjects) {
    for (const competency of subject.scores.competencies) {
      if (competency.mean === null) continue;
      const list = means.get(competency.competencyId);
      if (list) list.push(competency.mean);
      else means.set(competency.competencyId, [competency.mean]);
    }
  }

  const competencyHeatMap = input.competencyLabels.map((competency) => {
    const values = means.get(competency.id) ?? [];
    return {
      competencyId: competency.id,
      name: labels.get(competency.id) ?? competency.id,
      mean: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
      suppressed: values.length < 3,
    };
  });

  const visibleMeans = competencyHeatMap.filter((item) => item.mean !== null && !item.suppressed);
  const weakest = [...visibleMeans].sort((a, b) => Number(a.mean) - Number(b.mean)).slice(0, 3);

  return {
    kind: "aggregate",
    brandName: input.brandName ?? "Stuart Davidson",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    cycle: input.cycle,
    cohortSize: input.subjects.length,
    cohortMean: mean(input.subjects.map((subject) => subject.scores.overall).filter((value): value is number => value !== null)),
    competencyHeatMap,
    segments,
    movement: input.priorCycle
      ? buildCohortMovement({
          priorSubjects: input.priorSubjects ?? [],
          currentSubjects: input.subjects,
          priorFramework: frameworkOf(input.priorCycle),
          currentFramework: frameworkOf(input.cycle),
          labels: new Map(input.competencyLabels.map((item) => [item.id, item.name])),
        })
      : null,
    movementNarrative: input.priorCycle
      ? buildMovementNarrative(
          buildCohortMovement({
            priorSubjects: input.priorSubjects ?? [],
            currentSubjects: input.subjects,
            priorFramework: frameworkOf(input.priorCycle),
            currentFramework: frameworkOf(input.cycle),
            labels: new Map(input.competencyLabels.map((item) => [item.id, item.name])),
          }),
        )
      : null,
    capabilityGaps: weakest.map((item) => `${item.name} is a cohort capability gap at ${scoreLabel(item.mean)}.`),
    recommendedInterventions: weakest.map((item) => `Run focused coaching and manager-led action learning on ${item.name}.`),
  };
}

function frameworkOf(cycle: ReportCycleProfile): FrameworkProvenance {
  return {
    frameworkId: cycle.frameworkId,
    frameworkVersion: cycle.frameworkVersion,
  };
}

export function buildMovementNarrative(movement: CohortMovement): string {
  if (!movement.comparability.comparable) return movement.comparability.message;
  const visible = movement.competencies
    .filter((item) => item.delta !== null && !item.suppressed)
    .sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)));
  const leader = visible[0];
  if (!leader) return movement.headline;
  const direction = leader.direction === "declined" ? "declined" : leader.direction === "improved" ? "improved" : "held broadly flat";
  const delta = leader.delta === null ? "" : ` by ${Math.abs(leader.delta).toFixed(2)} points`;
  return `${movement.headline} The clearest competency movement is ${leader.label}, which ${direction}${delta}.`;
}


function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export { DEFAULT_WEIGHTS };
