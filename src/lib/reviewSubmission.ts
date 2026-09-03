export type ReviewResponse = {
  competencyId?: string;
  score: number;
  comment: string;
};

export type ReviewSubmissionPayload = {
  token?: string;
  responses?: ReviewResponse[];
};

export type ReviewSubmissionSummary = {
  average: number;
  completion: number;
  status: "complete" | "incomplete";
};

export function getReviewPayloadErrors(payload: ReviewSubmissionPayload): string[] {
  const errors: string[] = [];

  if (!payload.token?.trim()) {
    errors.push("A valid reviewer token is required.");
  }

  if (!Array.isArray(payload.responses) || payload.responses.length === 0) {
    errors.push("At least one review response is required.");
    return errors;
  }

  payload.responses.forEach((response, index) => {
    if (!response.competencyId?.trim()) {
      errors.push(`Response ${index + 1} must reference a competency.`);
    }

    if (!Number.isFinite(response.score) || response.score < 1 || response.score > 5) {
      errors.push(`Response ${index + 1} must have a score between 1 and 5.`);
    }

    if (!response.comment?.trim()) {
      errors.push(`Response ${index + 1} must include an evidence comment.`);
    }
  });

  return errors;
}

export function validateReviewPayload(payload: ReviewSubmissionPayload): boolean {
  return getReviewPayloadErrors(payload).length === 0;
}

export function buildReviewSubmissionSummary(responses: ReviewResponse[]): ReviewSubmissionSummary {
  if (!responses.length) {
    return { average: 0, completion: 0, status: "incomplete" };
  }

  const average = Math.round(
    responses.reduce((sum, response) => sum + response.score, 0) / responses.length,
  );

  const completion = 100;
  const status = responses.every((response) => response.score >= 1 && response.score <= 5) ? "complete" : "incomplete";

  return { average, completion, status };
}
