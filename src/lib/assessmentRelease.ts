export type ReviewStatus = "not_started" | "in_progress" | "submitted";

export function canReleaseAssessmentReport(
  reviewers: Array<{ status?: ReviewStatus | string; reviewer_group?: string; group?: string }>,
  requiredGroups: string[] = ["line_manager", "direct_report", "colleague", "customer"],
): boolean {
  if (!reviewers.length) return false;

  const hasAllGroups = requiredGroups.every((group) =>
    reviewers.some((reviewer) => (reviewer.reviewer_group ?? reviewer.group) === group),
  );

  const allSubmitted = reviewers.every((reviewer) => reviewer.status === "submitted");
  return hasAllGroups && allSubmitted;
}

export function releaseReadinessSummary(
  reviewers: Array<{ status?: ReviewStatus | string; reviewer_group?: string; group?: string }>,
): { ready: boolean; missingGroups: string[]; remaining: number } {
  const requiredGroups = ["line_manager", "direct_report", "colleague", "customer"];
  const missingGroups = requiredGroups.filter(
    (group) => !reviewers.some((reviewer) => (reviewer.reviewer_group ?? reviewer.group) === group),
  );

  const remaining = reviewers.filter((reviewer) => reviewer.status !== "submitted").length;
  return {
    ready: missingGroups.length === 0 && remaining === 0,
    missingGroups,
    remaining,
  };
}
