/**
 * Release gating.
 *
 * The rule changed in the scoring build. It used to require ALL four rater
 * groups present AND every single reviewer submitted, which across 568
 * assignments meant one non-responder permanently blocked that subject.
 *
 * It is now a minimum-N rule: the line manager must have submitted, and at least
 * two further rater categories must clear the suppression threshold. A category
 * that cannot be reported cannot support a report, so the release rule and the
 * confidentiality rule use the same number.
 *
 * assessmentScoring.decideRelease is the authority — it works from actual
 * responses. These helpers apply the same rule to a list of reviewer assignments
 * for the assessments console, which has assignment status but not responses.
 */

import { MINIMUM_RESPONSES_PER_GROUP } from "./assessmentScoring.ts";

export type ReviewStatus = "not_started" | "in_progress" | "submitted";

type ReviewerLike = { status?: ReviewStatus | string; reviewer_group?: string; group?: string };

const EXEMPT_GROUPS = ["self", "line_manager"];

function groupOf(reviewer: ReviewerLike): string {
  return reviewer.reviewer_group ?? reviewer.group ?? "";
}

/** Submitted reviewers per category. */
function submittedCounts(reviewers: ReviewerLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reviewer of reviewers ?? []) {
    if (reviewer.status !== "submitted") continue;
    const group = groupOf(reviewer);
    if (!group) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

export function canReleaseAssessmentReport(
  reviewers: ReviewerLike[],
  minimumPerGroup: number = MINIMUM_RESPONSES_PER_GROUP,
): boolean {
  return releaseReadinessSummary(reviewers, minimumPerGroup).ready;
}

export function releaseReadinessSummary(
  reviewers: ReviewerLike[],
  minimumPerGroup: number = MINIMUM_RESPONSES_PER_GROUP,
): {
  ready: boolean;
  missingGroups: string[];
  remaining: number;
  hasLineManager: boolean;
  qualifyingCategories: string[];
} {
  const counts = submittedCounts(reviewers);
  const hasLineManager = (counts.get("line_manager") ?? 0) >= 1;

  const qualifyingCategories = [...counts.entries()]
    .filter(([group, count]) => !EXEMPT_GROUPS.includes(group) && count >= minimumPerGroup)
    .map(([group]) => group);

  // Categories that were assigned but have not yet reached a reportable count.
  const assignedGroups = new Set(
    (reviewers ?? []).map(groupOf).filter((group) => group && !EXEMPT_GROUPS.includes(group)),
  );
  const missingGroups = [...assignedGroups].filter(
    (group) => !qualifyingCategories.includes(group),
  );
  if (!hasLineManager) missingGroups.unshift("line_manager");

  return {
    ready: hasLineManager && qualifyingCategories.length >= 2,
    missingGroups,
    remaining: (reviewers ?? []).filter((reviewer) => reviewer.status !== "submitted").length,
    hasLineManager,
    qualifyingCategories,
  };
}
