export type ReviewItemType = "scale" | "text";

export type ReviewResponse = {
  itemId?: string;
  itemType?: ReviewItemType | string;
  /** 1..5 on a scale item; null/absent when the item was not observed. */
  score?: number | null;
  /** Set on a scale item the rater cannot speak to. Excluded from all means. */
  notObserved?: boolean;
  /** Optional everywhere. On a text item this is the response itself. */
  comment?: string;
};

export type ReviewSubmissionPayload = {
  token?: string;
  responses?: ReviewResponse[];
  /** A draft save may be partial; a submit may not. Defaults to "submit". */
  mode?: "draft" | "submit";
};

export type ReviewSubmissionSummary = {
  /** Mean of scored scale items. Not-observed items are excluded from the denominator. */
  average: number;
  /** Scale items carrying a 1..5 rating. */
  scored: number;
  /** Scale items explicitly marked not observed. */
  notObserved: number;
  /** Text items carrying a non-empty response. */
  textAnswered: number;
  /** Percentage of supplied responses that are answered. */
  completion: number;
  status: "complete" | "incomplete";
};

const VALID_ITEM_TYPES: ReviewItemType[] = ["scale", "text"];

export function isReviewItemType(value: unknown): value is ReviewItemType {
  return VALID_ITEM_TYPES.includes(String(value ?? "").trim().toLowerCase() as ReviewItemType);
}

function hasScore(response: ReviewResponse): boolean {
  return response.score !== undefined && response.score !== null;
}

/**
 * True when the rater has actually acted on this item: a scale item is answered
 * once it is either rated or marked not observed; a text item is answered once
 * it carries text. Comments on scale items are optional and never required.
 */
export function isResponseAnswered(response: ReviewResponse): boolean {
  const itemType = String(response.itemType ?? "").trim().toLowerCase();

  if (itemType === "text") {
    return Boolean(response.comment?.trim());
  }

  return hasScore(response) || response.notObserved === true;
}

export function getReviewPayloadErrors(payload: ReviewSubmissionPayload): string[] {
  const errors: string[] = [];

  if (!payload.token?.trim()) {
    errors.push("A valid reviewer token is required.");
  }

  if (!Array.isArray(payload.responses) || payload.responses.length === 0) {
    errors.push("At least one review response is required.");
    return errors;
  }

  const mode = payload.mode ?? "submit";
  const seenItemIds = new Set<string>();

  payload.responses.forEach((response, index) => {
    const label = `Response ${index + 1}`;
    const itemId = response.itemId?.trim();

    if (!itemId) {
      errors.push(`${label} must reference an item.`);
    } else if (seenItemIds.has(itemId)) {
      errors.push(`${label} duplicates item ${itemId}.`);
    } else {
      seenItemIds.add(itemId);
    }

    if (!isReviewItemType(response.itemType)) {
      errors.push(`${label} must have an itemType of "scale" or "text".`);
      return;
    }

    const itemType = String(response.itemType).trim().toLowerCase() as ReviewItemType;
    const scored = hasScore(response);
    const notObserved = response.notObserved === true;

    if (itemType === "text") {
      if (scored) {
        errors.push(`${label} is a text item and must not carry a score.`);
      }
      if (notObserved) {
        errors.push(`${label} is a text item and cannot be marked not observed.`);
      }
      return;
    }

    // Scale item: rated, or not observed — never both, and on submit never neither.
    if (scored && notObserved) {
      errors.push(`${label} cannot be both scored and marked not observed.`);
      return;
    }

    if (scored) {
      const score = Number(response.score);
      if (!Number.isFinite(score) || score < 1 || score > 5) {
        errors.push(`${label} must have a score between 1 and 5.`);
      }
      return;
    }

    if (!notObserved && mode === "submit") {
      errors.push(`${label} must be scored 1 to 5, or marked not observed.`);
    }
  });

  return errors;
}

export function validateReviewPayload(payload: ReviewSubmissionPayload): boolean {
  return getReviewPayloadErrors(payload).length === 0;
}

export function buildReviewSubmissionSummary(responses: ReviewResponse[]): ReviewSubmissionSummary {
  const empty: ReviewSubmissionSummary = {
    average: 0,
    scored: 0,
    notObserved: 0,
    textAnswered: 0,
    completion: 0,
    status: "incomplete",
  };

  if (!Array.isArray(responses) || responses.length === 0) {
    return empty;
  }

  const scaleResponses = responses.filter(
    (response) => String(response.itemType ?? "").trim().toLowerCase() !== "text",
  );

  const scoredResponses = scaleResponses.filter(
    (response) => hasScore(response) && response.notObserved !== true,
  );
  const notObserved = scaleResponses.filter((response) => response.notObserved === true).length;
  const textAnswered = responses.filter(
    (response) =>
      String(response.itemType ?? "").trim().toLowerCase() === "text" && Boolean(response.comment?.trim()),
  ).length;

  // Not-observed items are excluded from the denominator, not counted as zero.
  const average = scoredResponses.length
    ? Number(
        (
          scoredResponses.reduce((sum, response) => sum + Number(response.score), 0) / scoredResponses.length
        ).toFixed(2),
      )
    : 0;

  const answered = responses.filter(isResponseAnswered).length;

  return {
    average,
    scored: scoredResponses.length,
    notObserved,
    textAnswered,
    completion: Math.round((answered / responses.length) * 100),
    status: answered === responses.length ? "complete" : "incomplete",
  };
}
