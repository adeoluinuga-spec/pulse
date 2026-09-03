import test from "node:test";
import assert from "node:assert/strict";

import { buildReviewSubmissionSummary, validateReviewPayload } from "./reviewSubmission.ts";

test("builds a submission summary from valid responses", () => {
  const summary = buildReviewSubmissionSummary([
    { score: 5, comment: "Strong leadership and clarity" },
    { score: 4, comment: "Good coaching rhythm" },
    { score: 3, comment: "Could improve execution pace" },
  ]);

  assert.equal(summary.average, 4);
  assert.equal(summary.completion, 100);
  assert.equal(summary.status, "complete");
});

test("rejects incomplete or invalid review payloads", () => {
  assert.equal(
    validateReviewPayload({
      token: "abc",
      responses: [{ competencyId: "network_execution", score: 0, comment: "" }],
    }),
    false,
  );

  assert.equal(
    validateReviewPayload({
      token: "abc",
      responses: [{ competencyId: "network_execution", score: 4, comment: "Strong" }],
    }),
    true,
  );

  assert.equal(
    validateReviewPayload({
      token: "abc",
      responses: [{ score: 4, comment: "Strong" }],
    }),
    false,
  );
});
