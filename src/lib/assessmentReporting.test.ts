import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssessmentReportSummary,
  calculateWeightedAssessmentScore,
  meanByReviewerGroup,
  subjectGroupScores,
} from "./assessmentReporting.ts";
import { scoreSubject, type ScoredResponse } from "./assessmentScoring.ts";

test("calculates weighted assessment score from submitted review groups", () => {
  const score = calculateWeightedAssessmentScore(
    [
      { reviewer_group: "line_manager", score: 81 },
      { reviewer_group: "direct_report", score: 76 },
      { reviewer_group: "colleague", score: 79 },
      { reviewer_group: "customer", score: 88 },
    ],
    {
      line_manager: 30,
      direct_report: 25,
      colleague: 25,
      customer: 20,
    },
  );

  assert.equal(score, 81);
});

test("builds a release-ready report summary with strengths and development areas", () => {
  const report = buildAssessmentReportSummary(
    [
      { reviewer_group: "line_manager", score: 84 },
      { reviewer_group: "direct_report", score: 78 },
      { reviewer_group: "colleague", score: 81 },
      { reviewer_group: "customer", score: 87 },
    ],
    {
      line_manager: 30,
      direct_report: 25,
      colleague: 25,
      customer: 20,
    },
  );

  assert.equal(report.ready, true);
  assert.equal(report.overallScore, 82);
  assert.deepEqual(report.missingGroups, []);
  assert.ok(report.strengths.length > 0);
  assert.ok(report.developmentAreas.length > 0);
});

// The bug: groupScores was built with a reduce that assigned straight into an
// accumulator, so four colleagues kept only whichever landed last.
test("averages repeated entries for one category instead of keeping the last", () => {
  const means = meanByReviewerGroup([
    { reviewer_group: "colleague", score: 5 },
    { reviewer_group: "colleague", score: 4 },
    { reviewer_group: "colleague", score: 3 },
    { reviewer_group: "colleague", score: 2 },
  ]);

  assert.equal(means.colleague, 3.5, "must be the mean, not the last value (2)");
});

test("the summary's groupScores no longer discard duplicate raters", () => {
  const report = buildAssessmentReportSummary([
    { reviewer_group: "line_manager", score: 4 },
    { reviewer_group: "colleague", score: 5 },
    { reviewer_group: "colleague", score: 1 },
    { reviewer_group: "direct_report", score: 3 },
  ]);

  assert.equal(report.groupScores.colleague, 3);
  assert.equal(report.ready, true);
});

test("the weighted score reflects every rater, not one per category", () => {
  const score = calculateWeightedAssessmentScore(
    [
      { reviewer_group: "line_manager", score: 4 },
      { reviewer_group: "colleague", score: 5 },
      { reviewer_group: "colleague", score: 1 },
    ],
    { line_manager: 50, colleague: 50 },
  );

  // (4*50 + 3*50) / 100 = 3.5 -> 4 after rounding, not (4*50 + 1*50)/100 = 2.5.
  assert.equal(score, 4);
});

test("self is excluded from the weighted score", () => {
  const withSelf = calculateWeightedAssessmentScore([
    { reviewer_group: "self", score: 1 },
    { reviewer_group: "line_manager", score: 4 },
    { reviewer_group: "colleague", score: 4 },
  ]);

  assert.equal(withSelf, 4);
});

// ── report payload ─────────────────────────────────────────────────────────

const response = (over: Partial<ScoredResponse> = {}): ScoredResponse => ({
  reviewerId: "r1",
  raterGroup: "colleague",
  itemId: "i1",
  competencyId: "c1",
  itemType: "scale",
  rating: 4,
  notObserved: false,
  comment: null,
  ...over,
});

test("subject group scores report a suppressed category as null, not absent", () => {
  const scores = scoreSubject("s1", [
    response({ reviewerId: "m1", raterGroup: "line_manager", rating: 5 }),
    response({ reviewerId: "c1", rating: 4 }),
    response({ reviewerId: "c2", rating: 4 }),
  ]);

  const groups = subjectGroupScores(scores);
  assert.equal(groups.line_manager, 5, "exempt category is reported");
  assert.ok("colleague" in groups, "a suppressed category must still be visible as withheld");
  assert.equal(groups.colleague, null);
});
