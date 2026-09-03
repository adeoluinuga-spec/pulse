import test from "node:test";
import assert from "node:assert/strict";

import { buildAssessmentReportSummary, calculateWeightedAssessmentScore } from "./assessmentReporting.ts";

test("calculates weighted assessment score from submitted review groups", () => {
  const score = calculateWeightedAssessmentScore(
    [
      { reviewer_group: "direct_report", score: 81 },
      { reviewer_group: "subordinate", score: 76 },
      { reviewer_group: "colleague", score: 79 },
      { reviewer_group: "customer", score: 88 },
    ],
    {
      direct_report: 30,
      subordinate: 25,
      colleague: 25,
      customer: 20,
    },
  );

  assert.equal(score, 81);
});

test("builds a release-ready report summary with strengths and development areas", () => {
  const report = buildAssessmentReportSummary(
    [
      { reviewer_group: "direct_report", score: 84 },
      { reviewer_group: "subordinate", score: 78 },
      { reviewer_group: "colleague", score: 81 },
      { reviewer_group: "customer", score: 87 },
    ],
    {
      direct_report: 30,
      subordinate: 25,
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
