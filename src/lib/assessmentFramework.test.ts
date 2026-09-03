import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssessmentFramework,
  buildRaterCoverage,
  normalizeAssessmentFramework,
  validateSelfAssessmentConfig,
  validateRaterNomination,
} from "./assessmentFramework.ts";

test("builds a configurable organisation competency framework by level and function", () => {
  const framework = buildAssessmentFramework({
    orgId: "org-1",
    name: "Telco Leadership Capability",
    levels: ["director", "assistant_director"],
    businessFunctions: ["network", "customer_experience"],
    defaultGroups: ["direct_report", "subordinate", "colleague", "customer"],
    competencies: [
      { id: "leadership", name: "Leadership", group: "leadership", level: "director", function: "all" },
      { id: "service_quality", name: "Service Quality", group: "functional", level: "all", function: "customer_experience" },
    ],
    selfAssessmentEnabled: true,
  });

  assert.equal(framework.ready, true);
  assert.equal(framework.competencies.length, 2);
  assert.equal(framework.selfAssessmentEnabled, true);
  assert.ok(framework.levels.includes("director"));
});

test("validates self-assessment configuration and blocks invalid setup", () => {
  const valid = validateSelfAssessmentConfig({ enabled: true, required: true, allowAnonymous: false });
  const invalid = validateSelfAssessmentConfig({ enabled: true, required: true, allowAnonymous: false, minimumResponses: 0 });

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("minimum")));
});

test("validates rater nominations and detects invalid or duplicate entries", () => {
  const valid = validateRaterNomination({
    employeeId: "emp-1",
    assigneeId: "assignee-1",
    nominations: [
      { reviewerId: "r1", reviewerGroup: "direct_report" },
      { reviewerId: "r2", reviewerGroup: "colleague" },
    ],
    allowedGroups: ["direct_report", "colleague"],
  });

  const invalid = validateRaterNomination({
    employeeId: "emp-1",
    assigneeId: "assignee-1",
    nominations: [
      { reviewerId: "dup", reviewerGroup: "direct_report" },
      { reviewerId: "dup", reviewerGroup: "colleague" },
      { reviewerId: "x", reviewerGroup: "unknown_group" },
    ],
    allowedGroups: ["direct_report", "colleague"],
  });

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("duplicate")));
  assert.ok(invalid.errors.some((error) => error.includes("unknown_group")));
});

test("builds rater coverage summary with missing groups and exact counts", () => {
  const coverage = buildRaterCoverage([
    { reviewerGroup: "direct_report", status: "submitted" },
    { reviewerGroup: "colleague", status: "submitted" },
  ]);

  assert.equal(coverage.ready, false);
  assert.ok(coverage.missingGroups.includes("subordinate"));
  assert.equal(coverage.submitted, 2);
  assert.equal(coverage.total, 2);
});

test("normalises framework values and defaults unsafe input", () => {
  const framework = normalizeAssessmentFramework({
    orgId: "org-1",
    levels: ["director", "unknown"],
    businessFunctions: ["network", "customer_experience"],
    defaultGroups: ["direct_report", "random"],
    selfAssessmentEnabled: "yes",
  });

  assert.equal(framework.levels.includes("director"), true);
  assert.equal(framework.levels.includes("unknown"), false);
  assert.equal(framework.defaultGroups.includes("direct_report"), true);
  assert.equal(framework.defaultGroups.includes("random"), false);
  assert.equal(framework.selfAssessmentEnabled, true);
});
