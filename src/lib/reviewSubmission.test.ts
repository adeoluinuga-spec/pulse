import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewSubmissionSummary,
  getReviewPayloadErrors,
  isResponseAnswered,
  validateReviewPayload,
} from "./reviewSubmission.ts";

const scale = (itemId: string, score: number | null, extra: Record<string, unknown> = {}) => ({
  itemId,
  itemType: "scale" as const,
  score,
  ...extra,
});

test("builds a submission summary from valid responses", () => {
  const summary = buildReviewSubmissionSummary([
    scale("item-1", 5, { comment: "Strong leadership and clarity" }),
    scale("item-2", 4),
    scale("item-3", 3, { comment: "Could improve execution pace" }),
  ]);

  assert.equal(summary.average, 4);
  assert.equal(summary.scored, 3);
  assert.equal(summary.notObserved, 0);
  assert.equal(summary.completion, 100);
  assert.equal(summary.status, "complete");
});

test("excludes not-observed items from the mean rather than scoring them zero", () => {
  const summary = buildReviewSubmissionSummary([
    scale("item-1", 5),
    scale("item-2", 3),
    scale("item-3", null, { notObserved: true }),
  ]);

  // Mean of 5 and 3, not of 5, 3 and 0.
  assert.equal(summary.average, 4);
  assert.equal(summary.scored, 2);
  assert.equal(summary.notObserved, 1);
  // A not-observed item is still an answered item.
  assert.equal(summary.status, "complete");
});

test("a wholly unobserved assessment yields no mean rather than a zero", () => {
  const summary = buildReviewSubmissionSummary([
    scale("item-1", null, { notObserved: true }),
    scale("item-2", null, { notObserved: true }),
  ]);

  assert.equal(summary.average, 0);
  assert.equal(summary.scored, 0);
  assert.equal(summary.notObserved, 2);
});

test("counts text items separately and does not fold them into the mean", () => {
  const summary = buildReviewSubmissionSummary([
    scale("item-1", 4),
    { itemId: "item-2", itemType: "text", comment: "Should delegate more in Q3." },
    { itemId: "item-3", itemType: "text", comment: "   " },
  ]);

  assert.equal(summary.average, 4);
  assert.equal(summary.scored, 1);
  assert.equal(summary.textAnswered, 1);
  // The blank text item is unanswered, so the set is incomplete.
  assert.equal(summary.status, "incomplete");
});

// ── The rating / not_observed contract, both directions ────────────────────

test("accepts a scale item that is rated 1..5 with not_observed false", () => {
  for (const score of [1, 2.5, 3, 5]) {
    assert.equal(
      validateReviewPayload({ token: "abc", responses: [scale("item-1", score, { notObserved: false })] }),
      true,
      `score ${score} should be accepted`,
    );
  }
});

test("accepts a scale item that is not observed with a null rating", () => {
  assert.equal(
    validateReviewPayload({ token: "abc", responses: [scale("item-1", null, { notObserved: true })] }),
    true,
  );

  // score omitted entirely, rather than passed as null
  assert.equal(
    validateReviewPayload({
      token: "abc",
      responses: [{ itemId: "item-1", itemType: "scale", notObserved: true }],
    }),
    true,
  );
});

test("rejects a scale item that is both rated and marked not observed", () => {
  const errors = getReviewPayloadErrors({
    token: "abc",
    responses: [scale("item-1", 4, { notObserved: true })],
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /both scored and marked not observed/);
});

test("rejects a scale item that is neither rated nor marked not observed on submit", () => {
  const errors = getReviewPayloadErrors({
    token: "abc",
    responses: [{ itemId: "item-1", itemType: "scale" }],
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /scored 1 to 5, or marked not observed/);
});

test("rejects out-of-range scale ratings", () => {
  for (const score of [0, 6, -1]) {
    assert.equal(
      validateReviewPayload({ token: "abc", responses: [scale("item-1", score)] }),
      false,
      `score ${score} should be rejected`,
    );
  }
});

test("allows a partially answered assessment to be saved as a draft", () => {
  const responses = [scale("item-1", 4), { itemId: "item-2", itemType: "scale" }];

  assert.equal(validateReviewPayload({ token: "abc", responses, mode: "draft" }), true);
  assert.equal(validateReviewPayload({ token: "abc", responses, mode: "submit" }), false);
});

// ── Text items ─────────────────────────────────────────────────────────────

test("rejects a text item carrying a score or a not-observed flag", () => {
  const scored = getReviewPayloadErrors({
    token: "abc",
    responses: [{ itemId: "item-1", itemType: "text", score: 4 }],
  });
  assert.match(scored[0], /must not carry a score/);

  const unobserved = getReviewPayloadErrors({
    token: "abc",
    responses: [{ itemId: "item-1", itemType: "text", notObserved: true }],
  });
  assert.match(unobserved[0], /cannot be marked not observed/);
});

// ── Comments are optional (change 4) ───────────────────────────────────────

test("accepts scale responses with no comment", () => {
  assert.equal(
    validateReviewPayload({
      token: "abc",
      responses: [scale("item-1", 4), scale("item-2", 2, { comment: "" })],
    }),
    true,
  );
});

// ── Structural validation ──────────────────────────────────────────────────

test("rejects payloads missing a token, an item id, or a valid item type", () => {
  assert.equal(validateReviewPayload({ responses: [scale("item-1", 4)] }), false);
  assert.equal(
    validateReviewPayload({ token: "abc", responses: [{ itemType: "scale", score: 4 }] }),
    false,
  );
  assert.equal(
    validateReviewPayload({ token: "abc", responses: [{ itemId: "item-1", itemType: "rating", score: 4 }] }),
    false,
  );
  assert.equal(validateReviewPayload({ token: "abc", responses: [] }), false);
});

test("rejects two responses against the same item", () => {
  const errors = getReviewPayloadErrors({
    token: "abc",
    responses: [scale("item-1", 4), scale("item-1", 2)],
  });

  assert.ok(errors.some((error) => /duplicates item item-1/.test(error)));
});

test("isResponseAnswered treats rating, not-observed and text alike", () => {
  assert.equal(isResponseAnswered(scale("item-1", 3)), true);
  assert.equal(isResponseAnswered(scale("item-1", null, { notObserved: true })), true);
  assert.equal(isResponseAnswered({ itemId: "item-1", itemType: "scale" }), false);
  assert.equal(isResponseAnswered({ itemId: "item-2", itemType: "text", comment: "Yes" }), true);
  assert.equal(isResponseAnswered({ itemId: "item-2", itemType: "text", comment: "  " }), false);
});
