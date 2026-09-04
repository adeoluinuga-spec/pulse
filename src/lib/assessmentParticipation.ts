export type SelfAssessmentEntry = {
  competencyId: string;
  score: number;
  comment: string;
};

export type NominationStatus = "pending" | "approved" | "rejected" | "submitted";

export type Nomination = {
  reviewerGroup: string;
  status: NominationStatus;
};

export type SelfAssessmentSummary = {
  average: number;
  completion: number;
  status: "complete" | "incomplete";
};

export type NominationSummary = {
  total: number;
  approved: number;
  ready: boolean;
  missingGroups: string[];
};

export type SelfAssessmentSubmission = {
  cycleId?: string;
  assigneeId?: string;
  entries?: SelfAssessmentEntry[];
};

export function buildSelfAssessmentSummary(entries: SelfAssessmentEntry[]): SelfAssessmentSummary {
  if (!entries.length) {
    return { average: 0, completion: 0, status: "incomplete" };
  }

  const validEntries = entries.filter((entry) => entry.competencyId && Number.isFinite(entry.score) && entry.score >= 1 && entry.score <= 5 && entry.comment.trim());
  const average = Math.round(validEntries.reduce((sum, entry) => sum + entry.score, 0) / validEntries.length);
  const completion = Math.min(100, Math.round((validEntries.length / entries.length) * 100));

  return {
    average: validEntries.length ? average : 0,
    completion,
    status: validEntries.length === entries.length ? "complete" : "incomplete",
  };
}

export function validateSelfAssessmentSubmission(payload: SelfAssessmentSubmission): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.cycleId?.trim()) {
    errors.push("A cycleId is required for self-assessment.");
  }

  if (!payload.assigneeId?.trim()) {
    errors.push("An assigneeId is required for self-assessment.");
  }

  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    errors.push("At least one self-assessment entry is required.");
    return { valid: false, errors };
  }

  payload.entries.forEach((entry, index) => {
    if (!entry.competencyId?.trim()) {
      errors.push(`Entry ${index + 1} must include a competencyId.`);
    }

    if (!Number.isFinite(entry.score) || entry.score < 1 || entry.score > 5) {
      errors.push(`Entry ${index + 1} must have a score between 1 and 5.`);
    }

    if (!entry.comment?.trim()) {
      errors.push(`Entry ${index + 1} must include a comment.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildNominationSummary(
  nominations: Nomination[],
  requiredGroups: string[] = ["line_manager", "direct_report", "colleague", "customer"],
): NominationSummary {
  const total = nominations.length;
  const approved = nominations.filter((nomination) => nomination.status === "approved").length;
  const missingGroups = requiredGroups.filter(
    (group) => !nominations.some((nomination) => nomination.reviewerGroup === group && nomination.status === "approved"),
  );

  return {
    total,
    approved,
    ready: missingGroups.length === 0 && approved >= 1,
    missingGroups,
  };
}
