import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNominationSummary,
  buildSelfAssessmentSummary,
  validateSelfAssessmentSubmission,
} from "./assessmentParticipation.ts";

test("builds a valid self-assessment summary from complete competency entries", () => {
  const summary = buildSelfAssessmentSummary([
    { competencyId: "leadership", score: 4, comment: "Strong coaching and clear direction." },
    { competencyId: "service_quality", score: 5, comment: "Very consistent service standards." },
  ]);

  assert.equal(summary.average, 5);
  assert.equal(summary.status, "complete");
  assert.equal(summary.completion, 100);
});

test("rejects incomplete self-assessment submissions", () => {
  const result = validateSelfAssessmentSubmission({
    cycleId: "cycle-1",
    assigneeId: "emp-1",
    entries: [
      { competencyId: "leadership", score: 4, comment: "" },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("comment")));
});

test("builds nomination readiness using approved coverage and missing groups", () => {
  const summary = buildNominationSummary([
    { reviewerGroup: "direct_report", status: "approved" },
    { reviewerGroup: "colleague", status: "approved" },
  ]);

  assert.equal(summary.ready, false);
  assert.ok(summary.missingGroups.includes("subordinate"));
  assert.equal(summary.approved, 2);
});
