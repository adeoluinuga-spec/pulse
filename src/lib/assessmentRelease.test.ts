import test from "node:test";
import assert from "node:assert/strict";

import { canReleaseAssessmentReport, releaseReadinessSummary } from "./assessmentRelease.ts";

/** `count` submitted reviewers in `group`. */
const submitted = (group: string, count: number) =>
  Array.from({ length: count }, () => ({ reviewer_group: group, status: "submitted" }));

test("releases on a line manager plus two categories clearing the threshold", () => {
  const reviewers = [
    ...submitted("line_manager", 1),
    ...submitted("colleague", 3),
    ...submitted("direct_report", 3),
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), true);
  const summary = releaseReadinessSummary(reviewers);
  assert.equal(summary.ready, true);
  assert.equal(summary.hasLineManager, true);
  assert.deepEqual(summary.qualifyingCategories.sort(), ["colleague", "direct_report"]);
});

// The old rule required every group present and every reviewer submitted, so a
// single non-responder blocked a subject forever.
test("one non-responding category no longer blocks release", () => {
  const reviewers = [
    ...submitted("line_manager", 1),
    ...submitted("colleague", 4),
    ...submitted("direct_report", 3),
    { reviewer_group: "customer", status: "not_started" },
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), true);
});

test("blocks when only one category clears the threshold", () => {
  const reviewers = [
    ...submitted("line_manager", 1),
    ...submitted("colleague", 3),
    ...submitted("direct_report", 2),
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), false);
  assert.equal(releaseReadinessSummary(reviewers).qualifyingCategories.length, 1);
  assert.ok(releaseReadinessSummary(reviewers).missingGroups.includes("direct_report"));
});

test("blocks without a line manager however many others responded", () => {
  const reviewers = [
    ...submitted("colleague", 5),
    ...submitted("direct_report", 5),
    ...submitted("customer", 5),
  ];

  const summary = releaseReadinessSummary(reviewers);
  assert.equal(summary.ready, false);
  assert.equal(summary.hasLineManager, false);
  assert.ok(summary.missingGroups.includes("line_manager"));
});

test("counts only submitted reviewers toward the threshold", () => {
  const reviewers = [
    ...submitted("line_manager", 1),
    ...submitted("colleague", 2),
    { reviewer_group: "colleague", status: "in_progress" },
    ...submitted("direct_report", 3),
  ];

  // The in-progress colleague does not make three.
  assert.equal(canReleaseAssessmentReport(reviewers), false);
  assert.ok(releaseReadinessSummary(reviewers).remaining > 0);
});

test("accepts in-memory reviewer group names from the assessment workbench", () => {
  const reviewers = [
    { group: "line_manager", status: "submitted" },
    ...Array.from({ length: 3 }, () => ({ group: "colleague", status: "submitted" })),
    ...Array.from({ length: 3 }, () => ({ group: "customer", status: "submitted" })),
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), true);
  assert.equal(releaseReadinessSummary(reviewers).ready, true);
});

test("handles an empty reviewer list", () => {
  assert.equal(canReleaseAssessmentReport([]), false);
  assert.equal(releaseReadinessSummary([]).ready, false);
  assert.equal(releaseReadinessSummary([]).remaining, 0);
});
