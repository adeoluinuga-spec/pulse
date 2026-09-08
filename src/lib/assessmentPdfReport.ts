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
import { aggregateCohort, DEFAULT_WEIGHTS } from "./assessmentScoring.ts";
import type { RaterGroup } from "./raterRelationship.ts";

export type ReportSubjectProfile = {
  id: string;
  name: string;
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
    narrativeThemes: buildNarrativeThemes(input.scores.verbatims, itemNames),
    developmentPriorities: buildDevelopmentPriorities(competencies, input.scores.gaps),
  };
}

export function buildAggregatePdfReport(input: {
  brandName?: string;
  generatedAt?: string;
  cycle: ReportCycleProfile;
  subjects: CohortSubject[];
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
    capabilityGaps: weakest.map((item) => `${item.name} is a cohort capability gap at ${scoreLabel(item.mean)}.`),
    recommendedInterventions: weakest.map((item) => `Run focused coaching and manager-led action learning on ${item.name}.`),
  };
}

export function createMockSubjectScores(subjectId: string, seed = 1): SubjectScores {
  const competencyIds = ["strategic_leadership", "people_leadership", "execution", "customer_focus"];
  const competencies = competencyIds.map((competencyId, index): CompetencyScore => {
    const base = 3.25 + ((seed + index) % 5) * 0.18;
    const suppressed: GroupCompetencyScore = {
      competencyId,
      raterGroup: "customer",
      mean: null,
      raterCount: 2,
      responseCount: 6,
      notObservedCount: 1,
      suppressed: true,
      exempt: false,
    };
    return {
      competencyId,
      mean: round(base),
      selfMean: round(base + (index === 0 ? 0.65 : -0.2)),
      othersMean: round(base),
      raterCount: 8,
      responseCount: 28,
      notObservedCount: 2,
      byGroup: [
        { competencyId, raterGroup: "self", mean: round(base + 0.25), raterCount: 1, responseCount: 4, notObservedCount: 0, suppressed: false, exempt: true },
        { competencyId, raterGroup: "line_manager", mean: round(base - 0.1), raterCount: 1, responseCount: 4, notObservedCount: 0, suppressed: false, exempt: true },
        { competencyId, raterGroup: "colleague", mean: round(base + 0.05), raterCount: 3, responseCount: 12, notObservedCount: 1, suppressed: false, exempt: false },
        { competencyId, raterGroup: "direct_report", mean: round(base - 0.15), raterCount: 3, responseCount: 12, notObservedCount: 1, suppressed: false, exempt: false },
        suppressed,
      ],
      items: [1, 2, 3, 4].map((item): ScoringItemScore => ({
        itemId: `${competencyId}_item_${item}`,
        competencyId,
        mean: item === 4 && index === 1 ? null : round(base + item * 0.05),
        raterCount: item === 4 && index === 1 ? 2 : 7,
        responseCount: item === 4 && index === 1 ? 2 : 21,
        notObservedCount: item % 2,
        suppressed: item === 4 && index === 1,
        selfRating: Math.min(5, Math.max(1, Math.round(base + 0.5))),
      })),
    };
  });

  return {
    subjectId,
    overall: mean(competencies.map((competency) => competency.mean).filter((value): value is number => value !== null)),
    competencies,
    gaps: competencies.map((competency) => {
      const gap = competency.selfMean !== null && competency.othersMean !== null ? round(competency.selfMean - competency.othersMean) : null;
      return {
        competencyId: competency.competencyId,
        selfMean: competency.selfMean,
        othersMean: competency.othersMean,
        gap,
        blindSpot: gap !== null && gap >= 0.5,
        hiddenStrength: gap !== null && gap <= -0.5,
      };
    }),
    verbatims: [
      { competencyId: null, itemId: "start_doing", raterGroup: "colleague", comment: "Clarify decision rights earlier when initiatives cross functions." },
      { competencyId: "people_leadership", itemId: "people_leadership_item_2", raterGroup: "direct_report", comment: "Coaching conversations are practical and respectful." },
      { competencyId: "customer_focus", itemId: "customer_focus_item_1", raterGroup: "customer", comment: "More proactive escalation updates would help customers plan better." },
    ],
    release: { ready: true, hasLineManager: true, qualifyingCategories: ["colleague", "direct_report"], reasons: [] },
    insufficientData: false,
  };
}

export function createMockLabels(): { competencies: CompetencyLabel[]; items: ItemLabel[] } {
  const competencies: CompetencyLabel[] = [
    { id: "strategic_leadership", name: "Strategic Leadership", description: "Sets direction and translates priorities into action." },
    { id: "people_leadership", name: "People Leadership", description: "Builds trust, coaching rhythm, and accountable teams." },
    { id: "execution", name: "Execution Discipline", description: "Turns commitments into reliable delivery." },
    { id: "customer_focus", name: "Customer Focus", description: "Keeps customer outcomes visible in leadership decisions." },
  ];
  const items: ItemLabel[] = competencies.flatMap((competency) =>
    [1, 2, 3, 4].map((index) => ({
      id: `${competency.id}_item_${index}`,
      competencyId: competency.id,
      text: `${competency.name} behaviour ${index}`,
    })),
  );
  items.push({ id: "start_doing", competencyId: null, text: "What should this leader start doing?" });
  return { competencies, items };
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export { DEFAULT_WEIGHTS };
