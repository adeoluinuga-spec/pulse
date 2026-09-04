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

export function calculateWeightedAssessmentScore(
  reviewers: ReviewerGroupScore[],
  weights: Record<string, number> = {
    line_manager: 30,
    direct_report: 25,
    colleague: 25,
    customer: 20,
  },
): number {
  if (!reviewers.length) return 0;

  const totalWeight = reviewers.reduce((sum, reviewer) => sum + (weights[reviewer.reviewer_group] ?? 0), 0);

  if (!totalWeight) {
    return Math.round(reviewers.reduce((sum, reviewer) => sum + reviewer.score, 0) / reviewers.length);
  }

  const weightedTotal = reviewers.reduce((sum, reviewer) => {
    const weight = weights[reviewer.reviewer_group] ?? 0;
    return sum + reviewer.score * weight;
  }, 0);

  return Math.round(weightedTotal / totalWeight);
}

export function buildAssessmentReportSummary(
  reviewers: ReviewerGroupScore[],
  weights: Record<string, number> = {
    line_manager: 30,
    direct_report: 25,
    colleague: 25,
    customer: 20,
  },
): AssessmentReportSummary {
  const requiredGroups = ["line_manager", "direct_report", "colleague", "customer"] as const;
  const missingGroups = requiredGroups.filter(
    (group) => !reviewers.some((reviewer) => reviewer.reviewer_group === group),
  );

  const groupScores = reviewers.reduce<Record<string, number>>((acc, reviewer) => {
    acc[reviewer.reviewer_group] = reviewer.score;
    return acc;
  }, {});

  const overallScore = calculateWeightedAssessmentScore(reviewers, weights);
  const ready = missingGroups.length === 0 && reviewers.length >= requiredGroups.length;

  const strengths = [
    overallScore >= 80 ? "Strong cross-functional confidence and consistent service leadership." : "Leadership momentum is visible but still needs stronger evidence across groups.",
    reviewers.some((reviewer) => reviewer.reviewer_group === "customer" && reviewer.score >= 80)
      ? "Customer experience signals are notably positive and supportive of the leadership narrative."
      : "Customer experience feedback is a critical area to deepen and validate.",
  ];

  const developmentAreas = [
    missingGroups.length > 0 ? `Outstanding input still needed from: ${missingGroups.join(", ")}.` : "All required review groups have been captured.",
    overallScore < 75 ? "More targeted coaching and 90-day follow-through would likely improve leadership effectiveness." : "A focused development plan should maintain this level of leadership momentum.",
  ];

  const notes = [
    "Score is calculated using configured reviewer weights and release requirements.",
    "Customer and executive experience signals are treated as distinct review modes and weighted accordingly.",
  ];

  return {
    ready,
    overallScore,
    groupScores,
    missingGroups,
    strengths,
    developmentAreas,
    notes,
  };
}
