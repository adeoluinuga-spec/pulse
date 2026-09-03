export type AssessmentScope = "individual" | "team" | "customer_experience" | "functional";
export type ReviewChannel = "email" | "sms" | "whatsapp" | "portal";

export interface ReviewerInvite {
  token: string;
  reviewerName: string;
  reviewerEmail: string;
  channel: ReviewChannel;
  scope: AssessmentScope;
  secureLink: string;
  expiresAt: string;
  status: "sent" | "opened" | "submitted";
}

export type ReviewerWorkflowSummary = {
  total: number;
  submitted: number;
  pending: number;
  missingGroups: string[];
  coverage: number;
  ready: boolean;
};

export function normalizeAssessmentScope(scope?: string): AssessmentScope {
  const validScopes: AssessmentScope[] = ["individual", "team", "customer_experience", "functional"];
  const normalized = (scope ?? "individual").trim().toLowerCase();

  if (validScopes.includes(normalized as AssessmentScope)) {
    return normalized as AssessmentScope;
  }

  return "individual";
}

export function supportsReviewChannel(channel: string): boolean {
  return ["email", "sms", "whatsapp", "portal"].includes((channel ?? "").trim().toLowerCase());
}

export function createSecureReviewerInvite(
  reviewer: { name: string; email: string; group?: string },
  scope: string = "individual",
  channel: string = "email",
  baseUrl: string = "https://pulse.local/review",
): ReviewerInvite {
  const validChannel = supportsReviewChannel(channel) ? (channel.trim().toLowerCase() as ReviewChannel) : "email";
  const validScope = normalizeAssessmentScope(scope);
  const token = `${reviewer.name.trim().toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    token,
    reviewerName: reviewer.name.trim(),
    reviewerEmail: reviewer.email.trim(),
    channel: validChannel,
    scope: validScope,
    secureLink: `${baseUrl}/${token}?channel=${validChannel}&scope=${validScope}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    status: "sent",
  };
}

export function applyCustomerExperienceWeight(score: number, scope: string, channel: string): number {
  const normalizedScope = normalizeAssessmentScope(scope);
  const channelName = (channel ?? "").trim().toLowerCase();
  if (normalizedScope === "customer_experience" || channelName === "whatsapp") {
    return Math.min(100, Math.round(score * 1.08));
  }
  return score;
}

export function aggregateReviewScores(
  reviews: Array<{ score: number; weight: number; scope?: string; channel?: string }>,
): number {
  if (!reviews.length) return 0;

  const weightedTotal = reviews.reduce((sum, review) => {
    const adjusted = applyCustomerExperienceWeight(review.score, review.scope ?? "individual", review.channel ?? "email");
    return sum + adjusted * review.weight;
  }, 0);

  const totalWeight = reviews.reduce((sum, review) => sum + review.weight, 0);
  return Math.round(weightedTotal / totalWeight);
}

export function buildReviewerWorkflowSummary(
  reviewers: Array<{ status?: string; reviewer_group?: string; group?: string }>,
): ReviewerWorkflowSummary {
  const requiredGroups = ["direct_report", "subordinate", "colleague", "customer"] as const;
  const submitted = reviewers.filter((reviewer) => reviewer.status === "submitted").length;
  const pending = reviewers.filter((reviewer) => reviewer.status !== "submitted").length;
  const reviewerGroups = reviewers
    .map((reviewer) => reviewer.reviewer_group ?? reviewer.group)
    .filter((group): group is string => Boolean(group));

  const missingGroups = requiredGroups.filter((group) => !reviewerGroups.includes(group));

  const coverage = Math.min(
    100,
    Math.round((new Set(reviewerGroups).size / requiredGroups.length) * 100),
  );

  return {
    total: reviewers.length,
    submitted,
    pending,
    missingGroups,
    coverage,
    ready: missingGroups.length === 0 && pending === 0,
  };
}

export function reviewerAssignmentIsValid(
  reviewer: { reviewer_name?: string; reviewer_email?: string; reviewer_group?: string },
): boolean {
  return Boolean(
    reviewer.reviewer_name?.trim() &&
      reviewer.reviewer_email?.trim() &&
      reviewer.reviewer_group &&
      ["direct_report", "subordinate", "colleague", "customer"].includes(reviewer.reviewer_group),
  );
}
