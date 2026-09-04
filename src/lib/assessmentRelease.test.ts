import test from "node:test";
import assert from "node:assert/strict";

import { canReleaseAssessmentReport, releaseReadinessSummary } from "./assessmentRelease.ts";

test("reports can release only when all reviewer groups are present and submitted", () => {
  const reviewers = [
    { reviewer_group: "line_manager", status: "submitted" },
    { reviewer_group: "direct_report", status: "submitted" },
    { reviewer_group: "colleague", status: "submitted" },
    { reviewer_group: "customer", status: "submitted" },
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), true);
  assert.deepEqual(releaseReadinessSummary(reviewers), {
    ready: true,
    missingGroups: [],
    remaining: 0,
  });
});

test("reports remain blocked while reviewer groups are incomplete or pending", () => {
  const reviewers = [
    { reviewer_group: "line_manager", status: "submitted" },
    { reviewer_group: "direct_report", status: "submitted" },
    { reviewer_group: "colleague", status: "in_progress" },
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), false);
  assert.equal(releaseReadinessSummary(reviewers).ready, false);
  assert.equal(releaseReadinessSummary(reviewers).missingGroups.includes("customer"), true);
  assert.equal(releaseReadinessSummary(reviewers).remaining > 0, true);
});

test("accepts in-memory reviewer group names from the assessment workbench", () => {
  const reviewers = [
    { group: "line_manager", status: "submitted" },
    { group: "direct_report", status: "submitted" },
    { group: "colleague", status: "submitted" },
    { group: "customer", status: "submitted" },
  ];

  assert.equal(canReleaseAssessmentReport(reviewers), true);
  assert.equal(releaseReadinessSummary(reviewers).ready, true);
});
