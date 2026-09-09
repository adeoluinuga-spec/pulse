import test from "node:test";
import assert from "node:assert/strict";

import {
  canReinstateParticipant,
  resolveParticipantRemoval,
  resolveRaterRemoval,
} from "./assessmentRemoval.ts";

const untouched = { responseCount: 0, submittedReviewers: 0, releasedReports: 0 };

test("a participant nobody has rated is deleted outright", () => {
  const decision = resolveParticipantRemoval(untouched);
  assert.equal(decision.action, "delete");
  assert.match(decision.explanation, /removed from the cycle completely/);
});

test("a single response about a participant turns removal into withdrawal", () => {
  const decision = resolveParticipantRemoval({ ...untouched, responseCount: 1 });
  assert.equal(decision.action, "withdraw");
  assert.match(decision.explanation, /will not be deleted/);
});

test("a submitted rater counts as feedback even before responses are read back", () => {
  assert.equal(resolveParticipantRemoval({ ...untouched, submittedReviewers: 1 }).action, "withdraw");
});

test("a released report blocks removal, because it cannot be recalled", () => {
  const decision = resolveParticipantRemoval({ ...untouched, releasedReports: 1 });
  assert.equal(decision.action, "blocked");
  assert.match(decision.explanation, /cannot be recalled/);
});

test("a release blocks removal even when nothing else was collected", () => {
  const decision = resolveParticipantRemoval({
    responseCount: 0,
    submittedReviewers: 0,
    releasedReports: 2,
  });
  assert.equal(decision.action, "blocked");
});

test("withdrawing twice is refused rather than repeated", () => {
  const decision = resolveParticipantRemoval({ ...untouched, alreadyWithdrawn: true });
  assert.equal(decision.action, "blocked");
  assert.match(decision.explanation, /already withdrawn/);
});

test("a rater who has answered nothing is deleted", () => {
  const decision = resolveRaterRemoval({ status: "not_started", responseCount: 0 });
  assert.equal(decision.action, "delete");
});

test("a rater with a draft in progress is revoked, not deleted", () => {
  const decision = resolveRaterRemoval({ status: "in_progress", responseCount: 4 });
  assert.equal(decision.action, "revoke");
  assert.match(decision.explanation, /still count/);
});

test("a submitted rater is revoked even if their responses are not counted here", () => {
  assert.equal(resolveRaterRemoval({ status: "submitted", responseCount: 0 }).action, "revoke");
});

test("the rater refusal explains the suppression consequence, not just the rule", () => {
  const decision = resolveRaterRemoval({ status: "submitted", responseCount: 12 });
  assert.match(decision.explanation, /rater groups are large enough to be shown/);
});

test("only a withdrawn participant can be reinstated", () => {
  assert.equal(canReinstateParticipant({ withdrawnAt: "2026-09-09T00:00:00Z" }), true);
  assert.equal(canReinstateParticipant({ withdrawnAt: null }), false);
});
