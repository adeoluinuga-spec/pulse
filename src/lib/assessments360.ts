export type AssessmentLevel = "director" | "assistant_director";
export type ReviewerGroup = "self" | "line_manager" | "direct_report" | "colleague" | "customer";
export type AssessmentCycleStatus = "setup" | "collecting" | "calibration" | "closed";
export type ReviewerStatus = "not_started" | "in_progress" | "submitted";

export interface Competency {
  id: string;
  name: string;
  description: string;
  weight: number;
  telcoSignals: string[];
}

export interface ReviewQuestion {
  id: string;
  competencyId: string;
  prompt: string;
  kind: "rating" | "comment";
}

export interface Assessee {
  id: string;
  name: string;
  initials: string;
  email?: string;
  level: AssessmentLevel;
  functionName: string;
  region: string;
  portfolio: string;
  tenureYears: number;
}

export interface Reviewer {
  id: string;
  assesseeId: string;
  name: string;
  group: ReviewerGroup;
  organisation?: string;
  email: string;
  status: ReviewerStatus;
  submittedAt?: string;
  inviteStatus?: "draft" | "sent" | "opened" | "submitted" | "expired";
  inviteChannel?: "email" | "sms" | "whatsapp" | "portal";
  assessmentScope?: "individual" | "team" | "customer_experience" | "functional";
  tokenExpiresAt?: string;
}

export interface CompetencyScore {
  competencyId: string;
  score: number;
  benchmark: number;
}

export interface AssesseeResult {
  assesseeId: string;
  groupScores: Record<ReviewerGroup, number>;
  competencyScores: CompetencyScore[];
  strongestSignals: string[];
  developmentSignals: string[];
  riskNotes: string[];
}

export interface AssessmentCycle {
  id: string;
  name: string;
  clientName: string;
  status: AssessmentCycleStatus;
  startDate: string;
  closeDate: string;
  levels: AssessmentLevel[];
  reviewerWeights: Record<ReviewerGroup, number>;
}

export const reviewerGroups: Array<{
  key: ReviewerGroup;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: "self",
    label: "Self",
    shortLabel: "Self",
    description: "The participant's own assessment, used for gap analysis and excluded from the others-weighted score.",
  },
  {
    key: "line_manager",
    label: "Line Manager",
    shortLabel: "Manager",
    description: "The participant's own manager or supervising executive.",
  },
  {
    key: "direct_report",
    label: "Direct Report",
    shortLabel: "Report",
    description: "Team members and employees who report to the participant.",
  },
  {
    key: "colleague",
    label: "Colleague",
    shortLabel: "Colleague",
    description: "Cross-functional peers and internal stakeholders.",
  },
  {
    key: "customer",
    label: "Customer",
    shortLabel: "Customer",
    description: "External customers, partners, regulators, or enterprise accounts.",
  },
];

// Self is weighted 0: it flows through the same responses pipeline so that
// self-versus-others gap analysis is possible, but it must not pull the
// others-weighted score toward the participant's own view. Mirrors the
// assessment_cycles.reviewer_weights default.
export const defaultReviewerWeights: Record<ReviewerGroup, number> = {
  self: 0,
  line_manager: 30,
  direct_report: 25,
  colleague: 25,
  customer: 20,
};

export const telcoCompetencies: Competency[] = [];
export const assessmentQuestions: ReviewQuestion[] = [];
export const assessees: Assessee[] = [];
export const reviewers: Reviewer[] = [];
export const results: AssesseeResult[] = [];

export const active360Cycle: AssessmentCycle = {
  id: "",
  name: "No active 360 cycle",
  clientName: "Current organisation",
  status: "setup",
  startDate: "",
  closeDate: "",
  levels: ["director", "assistant_director"],
  reviewerWeights: defaultReviewerWeights,
};

export const defaultAssessmentLevelLabels = ["Director", "Assistant Director"] as const;

export function normalizeAssessmentLevelLabels(labels?: Array<string | null | undefined> | null): string[] {
  const values = Array.isArray(labels) ? labels : [];
  return values
    .map((label, index) => {
      const value = String(label ?? "").trim();
      return value || defaultAssessmentLevelLabels[index] || `Level ${index + 1}`;
    })
    .slice(0, 2)
    .concat(["", ""])
    .slice(0, 2);
}

export function resolveAssessmentLevelLabel(level: AssessmentLevel | string | null, labels?: Array<string | null | undefined> | null): string {
  const normalized = String(level ?? "").trim().toLowerCase();
  const overrides = normalizeAssessmentLevelLabels(labels);
  const order: Record<string, number> = {
    director: 0,
    assistant_director: 1,
    level_1: 0,
    level_2: 1,
    manager: 0,
    senior_manager: 1,
  };

  const matchIndex = order[normalized] ?? -1;
  if (matchIndex >= 0 && overrides[matchIndex]) return overrides[matchIndex];

  if (normalized === "assistant_director") return overrides[1] || "Assistant Director";
  if (normalized === "director") return overrides[0] || "Director";
  if (normalized === "senior_manager") return overrides[1] || "Senior Manager";
  if (normalized === "manager") return overrides[0] || "Manager";

  return overrides[0] || "Level 1";
}

export function levelLabel(level: AssessmentLevel | string, labels?: Array<string | null | undefined> | null): string {
  return resolveAssessmentLevelLabel(level, labels);
}

export function statusLabel(status: AssessmentCycleStatus): string {
  if (status === "setup") return "Setup";
  if (status === "collecting") return "Collecting feedback";
  if (status === "calibration") return "Calibration";
  return "Closed";
}

export function weightedScore(result: AssesseeResult, weights = defaultReviewerWeights): number {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (!totalWeight) return 0;

  const total = Object.entries(weights).reduce(
    (sum, [group, weight]) => sum + (result.groupScores[group as ReviewerGroup] ?? 0) * weight,
    0,
  );
  return Math.round(total / totalWeight);
}

export function completionForAssessee(assesseeId: string, source: Reviewer[] = []): number {
  const assigned = source.filter((reviewer) => reviewer.assesseeId === assesseeId);
  if (!assigned.length) return 0;
  const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
  return Math.round((submitted / assigned.length) * 100);
}

export function completionByGroup(group: ReviewerGroup, source: Reviewer[] = []): number {
  const assigned = source.filter((reviewer) => reviewer.group === group);
  if (!assigned.length) return 0;
  const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
  return Math.round((submitted / assigned.length) * 100);
}

export function assessmentReadiness(sourceAssessees: Assessee[] = [], sourceReviewers: Reviewer[] = []): number {
  if (!sourceReviewers.length || !sourceAssessees.length) return 0;

  const submitted = sourceReviewers.filter((reviewer) => reviewer.status === "submitted").length;
  const completion = Math.round((submitted / sourceReviewers.length) * 100);
  // Coverage is measured across the four required rater groups. Self is
  // deliberately excluded, matching requiredGroups everywhere else — a missing
  // self-assessment should not read as missing 360 coverage.
  const coveredGroups = reviewerGroups.filter((group) => group.key !== "self");
  const coverage = coveredGroups.filter((group) =>
    sourceAssessees.every((assessee) =>
      sourceReviewers.some((reviewer) => reviewer.assesseeId === assessee.id && reviewer.group === group.key),
    ),
  ).length;
  return Math.round(completion * 0.7 + (coverage / coveredGroups.length) * 30);
}
