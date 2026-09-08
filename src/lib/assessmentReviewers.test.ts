import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateReviewScores,
  buildReviewerWorkflowSummary,
  normalizeAssessmentScope,
  reviewerAssignmentIsValid,
  supportsReviewChannel,
} from "./assessmentReviewers.ts";

test("builds reviewer workflow summary and readiness", () => {
  const summary = buildReviewerWorkflowSummary([
    { reviewer_group: "line_manager", status: "submitted" },
    { reviewer_group: "direct_report", status: "submitted" },
    { reviewer_group: "colleague", status: "submitted" },
    { reviewer_group: "customer", status: "submitted" },
  ]);

  assert.equal(summary.ready, true);
  assert.deepEqual(summary.missingGroups, []);
  assert.equal(summary.pending, 0);
});

test("validates complete reviewer assignments and blocks invalid group values", () => {
  assert.equal(
    reviewerAssignmentIsValid({
      reviewer_name: "Amina Lawal",
      reviewer_email: "amina@example.com",
      reviewer_group: "line_manager",
    }),
    true,
  );

  assert.equal(
    reviewerAssignmentIsValid({
      reviewer_name: "",
      reviewer_email: "amina@example.com",
      reviewer_group: "unknown_group",
    }),
    false,
  );
});

test("supports configurable assessment scopes and enforces email for reviewer delivery", () => {
  assert.equal(normalizeAssessmentScope("customer_experience"), "customer_experience");
  assert.equal(normalizeAssessmentScope("team"), "team");
  assert.equal(normalizeAssessmentScope("random"), "individual");
  assert.equal(supportsReviewChannel("email"), true);
  assert.equal(supportsReviewChannel("whatsapp"), false);
  assert.equal(supportsReviewChannel("telegram"), false);
});

test("aggregates submitted review scores with customer-experience weight applied", () => {
  const score = aggregateReviewScores([
    { score: 80, weight: 30, scope: "individual", channel: "email" },
    { score: 75, weight: 35, scope: "customer_experience", channel: "whatsapp" },
    { score: 82, weight: 35, scope: "team", channel: "portal" },
  ]);

  assert.equal(score, 81);
});
