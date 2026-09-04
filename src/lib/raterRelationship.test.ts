import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOrgChartIndex,
  checkRaterRelationship,
  checkRaterRelationships,
  isRaterGroup,
} from "./raterRelationship.ts";

// ada manages ben; ben manages cara. dele is external to the chart.
const orgChart = buildOrgChartIndex([
  { employeeId: "ada", lineManagerId: null },
  { employeeId: "ben", lineManagerId: "ada" },
  { employeeId: "cara", lineManagerId: "ben" },
  { employeeId: "eze", lineManagerId: "ada" },
]);

test("accepts a correctly declared line manager and direct report", () => {
  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: "ada", reviewerGroup: "line_manager" },
      orgChart,
    ),
    null,
  );

  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: "cara", reviewerGroup: "direct_report" },
      orgChart,
    ),
    null,
  );
});

test("warns when a declared line manager does not manage the subject", () => {
  const warning = checkRaterRelationship(
    { subjectEmployeeId: "ben", raterEmployeeId: "eze", reviewerGroup: "line_manager" },
    orgChart,
  );

  assert.ok(warning);
  assert.equal(warning.code, "not_line_manager");
  assert.match(warning.message, /is not their manager/);
});

test("warns when a declared direct report does not report to the subject", () => {
  const warning = checkRaterRelationship(
    { subjectEmployeeId: "ben", raterEmployeeId: "eze", reviewerGroup: "direct_report" },
    orgChart,
  );

  assert.ok(warning);
  assert.equal(warning.code, "not_direct_report");
});

// The case the rename in 20260904_000001 makes likely.
test("detects the two groups being set the wrong way round", () => {
  const asLineManager = checkRaterRelationship(
    { subjectEmployeeId: "ben", raterEmployeeId: "cara", reviewerGroup: "line_manager" },
    orgChart,
  );
  assert.ok(asLineManager);
  assert.equal(asLineManager.code, "groups_inverted");
  assert.equal(asLineManager.impliedGroup, "direct_report");

  const asDirectReport = checkRaterRelationship(
    { subjectEmployeeId: "ben", raterEmployeeId: "ada", reviewerGroup: "direct_report" },
    orgChart,
  );
  assert.ok(asDirectReport);
  assert.equal(asDirectReport.code, "groups_inverted");
  assert.equal(asDirectReport.impliedGroup, "line_manager");
});

test("makes no claim about colleague or customer raters", () => {
  for (const reviewerGroup of ["colleague", "customer"]) {
    assert.equal(
      checkRaterRelationship(
        { subjectEmployeeId: "ben", raterEmployeeId: "cara", reviewerGroup },
        orgChart,
      ),
      null,
    );
  }
});

test("warns when a self-assessment is assigned to somebody else", () => {
  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: "ben", reviewerGroup: "self" },
      orgChart,
    ),
    null,
  );

  const warning = checkRaterRelationship(
    { subjectEmployeeId: "ben", raterEmployeeId: "ada", reviewerGroup: "self" },
    orgChart,
  );
  assert.ok(warning);
  assert.equal(warning.code, "self_mismatch");
});

test("stays silent when the relationship cannot be verified", () => {
  // External rater — no employee id at all.
  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: null, reviewerGroup: "colleague" },
      orgChart,
    ),
    null,
  );

  // Employee absent from the org chart tells us nothing either way.
  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: "dele", reviewerGroup: "line_manager" },
      orgChart,
    ),
    null,
  );

  // Unrecognised group.
  assert.equal(
    checkRaterRelationship(
      { subjectEmployeeId: "ben", raterEmployeeId: "ada", reviewerGroup: "subordinate" },
      orgChart,
    ),
    null,
  );
});

test("checks a batch and accepts a raw org chart array", () => {
  const warnings = checkRaterRelationships(
    [
      { subjectEmployeeId: "ben", raterEmployeeId: "ada", reviewerGroup: "line_manager" },
      { subjectEmployeeId: "ben", raterEmployeeId: "cara", reviewerGroup: "line_manager" },
      { subjectEmployeeId: "ben", raterEmployeeId: "eze", reviewerGroup: "colleague" },
    ],
    [
      { employeeId: "ada", lineManagerId: null },
      { employeeId: "ben", lineManagerId: "ada" },
      { employeeId: "cara", lineManagerId: "ben" },
      { employeeId: "eze", lineManagerId: "ada" },
    ],
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "groups_inverted");
});

test("uses names in warning text when supplied", () => {
  const warning = checkRaterRelationship(
    {
      subjectEmployeeId: "ben",
      raterEmployeeId: "eze",
      reviewerGroup: "line_manager",
      subjectName: "Ben Okafor",
      raterName: "Eze Nwosu",
    },
    orgChart,
  );

  assert.ok(warning);
  assert.match(warning.message, /Eze Nwosu/);
  assert.match(warning.message, /Ben Okafor/);
});

test("isRaterGroup recognises the new vocabulary and rejects the old", () => {
  for (const group of ["self", "line_manager", "colleague", "direct_report", "customer"]) {
    assert.equal(isRaterGroup(group), true, `${group} should be valid`);
  }
  assert.equal(isRaterGroup("subordinate"), false);
  assert.equal(isRaterGroup(undefined), false);
});
