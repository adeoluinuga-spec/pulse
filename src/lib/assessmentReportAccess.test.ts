import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageReportState,
  canReadAggregateReport,
  canReadCompletionTracking,
  canReadIndividualReport,
  canReadNamedVerbatims,
  nextReportState,
  reportStateOf,
} from "./assessmentReportAccess.ts";

test("participants and line managers can only read released permitted individual reports", () => {
  assert.equal(canReadIndividualReport({ role: "standard", reportState: "released", ownsSubject: true }), true);
  assert.equal(canReadIndividualReport({ role: "standard", reportState: "in_review", ownsSubject: true }), false);
  assert.equal(
    canReadIndividualReport({
      role: "manager",
      reportState: "released",
      managesSubject: true,
      lineManagerAccessEnabled: true,
    }),
    true,
  );
  assert.equal(
    canReadIndividualReport({
      role: "manager",
      reportState: "released",
      managesSubject: true,
      lineManagerAccessEnabled: false,
    }),
    false,
  );
});

test("hr and executive users cannot read individual reports through the app policy", () => {
  assert.equal(canReadIndividualReport({ role: "hr_admin", reportState: "released" }), false);
  assert.equal(canReadIndividualReport({ role: "executive_view", reportState: "released" }), false);
  assert.equal(canReadIndividualReport({ role: "super_admin", reportState: "draft" }), true);
});

test("aggregate, completion, verbatim and release privileges match the contracted tiers", () => {
  assert.equal(canReadAggregateReport("hr_admin"), true);
  assert.equal(canReadAggregateReport("executive_view"), true);
  assert.equal(canReadAggregateReport("standard"), false);
  assert.equal(canReadCompletionTracking("hr_admin"), true);
  assert.equal(canReadCompletionTracking("executive_view"), false);
  assert.equal(canReadNamedVerbatims("hr_admin"), false);
  assert.equal(canReadNamedVerbatims("super_admin"), true);
  assert.equal(canManageReportState("hr_admin"), false);
  assert.equal(canManageReportState("super_admin"), true);
});

test("report state machine is explicit", () => {
  assert.equal(reportStateOf({ releasedAt: "2026-09-04T12:00:00Z", reportStatus: "draft" }), "released");
  assert.equal(reportStateOf({ reportStatus: "in_review" }), "in_review");
  assert.equal(nextReportState("draft", "in_review"), "in_review");
  assert.equal(nextReportState("in_review", "released"), "released");
  assert.equal(nextReportState("draft", "released"), null);
  assert.equal(nextReportState("released", "draft"), null);
});
