import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPerformanceAppraisalSummary,
  normalizeAppraisalMode,
  validatePerformanceAppraisalConfig,
} from "./performanceAppraisal.ts";

test("normalises the appraisal mode and preserves the performance flow", () => {
  assert.equal(normalizeAppraisalMode("performance"), "performance");
  assert.equal(normalizeAppraisalMode("integrated"), "integrated");
  assert.equal(normalizeAppraisalMode("360"), "360");
});

test("accepts a valid performance appraisal configuration", () => {
  const validation = validatePerformanceAppraisalConfig({
    mode: "performance",
    cycleName: "Q3 2026 Performance Review",
    goalScore: 88,
    kpiScore: 82,
    managerScore: 90,
    hasGoals: true,
    hasKpis: true,
    hasManagerReview: true,
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test("builds a summary with missing sections for incomplete appraisal data", () => {
  const summary = buildPerformanceAppraisalSummary({
    mode: "integrated",
    cycleName: "Q3 2026 Integrated Review",
    goalScore: 80,
    kpiScore: 75,
    managerScore: 85,
    hasGoals: true,
    hasKpis: true,
    hasManagerReview: true,
  });

  assert.equal(summary.ready, false);
  assert.ok(summary.missingSections.includes("competency review"));
  assert.ok(summary.missingSections.includes("self-assessment"));
  assert.ok(summary.missingSections.includes("peer feedback"));
});
