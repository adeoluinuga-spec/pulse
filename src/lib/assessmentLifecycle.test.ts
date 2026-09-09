import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedTransitions,
  isReopen,
  isTransitionAllowed,
  reopenBlockedReason,
  reopenPatch,
} from "./assessmentLifecycle.ts";

const untouched = {
  status: "closed",
  responseCount: 0,
  submittedReviewers: 0,
  releasedReports: 0,
};

test("a cycle cannot skip setup straight into calibration", () => {
  assert.equal(isTransitionAllowed("setup", "collecting"), true);
  assert.equal(isTransitionAllowed("setup", "calibration"), false);
  assert.equal(isTransitionAllowed("setup", "closed"), false);
});

test("collecting and calibration are the two states that can close", () => {
  assert.deepEqual(allowedTransitions("collecting"), ["calibration", "closed"]);
  assert.deepEqual(allowedTransitions("calibration"), ["collecting", "closed"]);
});

test("an unknown status offers no transitions rather than throwing", () => {
  assert.deepEqual(allowedTransitions("archived"), []);
  assert.equal(isTransitionAllowed("archived", "setup"), false);
});

test("closed leads only back to setup, and that is the reopen path", () => {
  assert.deepEqual(allowedTransitions("closed"), ["setup"]);
  assert.equal(isReopen("closed", "setup"), true);
  assert.equal(isReopen("calibration", "collecting"), false);
});

test("a closed cycle that collected nothing may be reopened", () => {
  assert.equal(reopenBlockedReason(untouched), null);
});

test("a single recorded response blocks the reopen", () => {
  const reason = reopenBlockedReason({ ...untouched, responseCount: 1 });
  assert.match(reason ?? "", /1 response has been recorded/);
  assert.match(reason ?? "", /Clone it into a new cycle/);
});

test("a submitted rater blocks the reopen even with no responses stored", () => {
  const reason = reopenBlockedReason({ ...untouched, submittedReviewers: 2 });
  assert.match(reason ?? "", /2 raters have submitted/);
});

test("a released report is named first, because it is already in someone's hands", () => {
  const reason = reopenBlockedReason({
    status: "closed",
    responseCount: 40,
    submittedReviewers: 5,
    releasedReports: 1,
  });
  assert.match(reason ?? "", /^This cycle cannot be reopened because 1 report has already been released/);
});

test("only a closed cycle is reopenable, and the reason says so", () => {
  const reason = reopenBlockedReason({ ...untouched, status: "collecting" });
  assert.equal(reason, "Only a closed cycle can be reopened. This cycle is collecting.");
});

test("reopening clears the close date so the cycle does not relaunch expired", () => {
  assert.deepEqual(reopenPatch(), { status: "setup", closes_on: null });
});
