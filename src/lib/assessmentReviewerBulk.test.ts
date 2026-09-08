import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBulkReviewerErrorReportCsv,
  parseBulkReviewerCsv,
  summarizeRaterLoad,
  validateBulkReviewerRows,
} from "./assessmentReviewerBulk.ts";

const subjects = [
  { id: "subject-1", email: "leader@example.com", name: "Leader One", employeeId: "emp-leader" },
  { id: "subject-2", email: "leader-two@example.com", name: "Leader Two", employeeId: "emp-two" },
];

const employees = [
  { id: "emp-leader", email: "leader@example.com", name: "Leader One", lineManagerId: "emp-manager" },
  { id: "emp-manager", email: "manager@example.com", name: "Manager One" },
  { id: "emp-report", email: "report@example.com", name: "Report One", lineManagerId: "emp-leader" },
  { id: "emp-peer", email: "peer@example.com", name: "Peer One", lineManagerId: "emp-manager" },
];

test("parses CSV rows without silently dropping malformed rows", () => {
  const rows = parseBulkReviewerCsv(`subject_email,rater_name,rater_email,relationship_type,organisation
leader@example.com,Peer One,peer@example.com,colleague,Internal
,Missing Subject,missing@example.com,colleague,Internal`);

  assert.equal(rows.length, 2);
  assert.equal(rows[1].subject_email, "");
  assert.equal(rows[1].rater_email, "missing@example.com");
});

test("validates bulk reviewer rows with missing subjects, invalid groups and duplicates", () => {
  const result = validateBulkReviewerRows({
    rows: [
      { subject_email: "leader@example.com", rater_name: "Peer One", rater_email: "peer@example.com", relationship_type: "colleague" },
      { subject_email: "leader@example.com", rater_name: "Peer One", rater_email: "peer@example.com", relationship_type: "colleague" },
      { subject_email: "unknown@example.com", rater_name: "No Subject", rater_email: "nosubject@example.com", relationship_type: "customer" },
      { subject_email: "leader@example.com", rater_name: "Wrong", rater_email: "wrong@example.com", relationship_type: "subordinate" },
    ],
    subjects,
    employees,
  });

  assert.equal(result.canImport, false);
  assert.equal(result.validAssignments.length, 1);
  assert.ok(result.rows[1].errors.some((error) => error.includes("duplicated")));
  assert.ok(result.rows[2].errors.some((error) => error.includes("does not belong")));
  assert.ok(result.rows[3].errors.some((error) => error.includes("relationship_type")));
});

test("flags existing duplicates and warns when org chart contradicts relationship type", () => {
  const result = validateBulkReviewerRows({
    rows: [
      { subject_email: "leader@example.com", rater_name: "Manager One", rater_email: "manager@example.com", relationship_type: "direct_report" },
      { subject_email: "leader-two@example.com", rater_name: "Customer", rater_email: "customer@example.com", relationship_type: "customer" },
    ],
    subjects,
    employees,
    existingAssignments: [{ subjectId: "subject-2", reviewerEmail: "customer@example.com", reviewerGroup: "customer" }],
  });

  assert.equal(result.rows[0].status, "valid");
  assert.ok(result.rows[0].warnings.some((warning) => warning.includes("Did you mean line_manager")));
  assert.equal(result.rows[1].status, "error");
  assert.ok(result.rows[1].errors.some((error) => error.includes("already exists")));
});

test("summarises rater load and exports a row-level CSV report", () => {
  const load = summarizeRaterLoad(
    [
      { reviewerEmail: "busy@example.com" },
      { reviewerEmail: "busy@example.com" },
      { reviewerEmail: "ok@example.com" },
    ],
    1,
  );

  assert.deepEqual(load[0], { reviewerEmail: "busy@example.com", assignmentCount: 2, overCap: true });

  const result = validateBulkReviewerRows({
    rows: [{ subject_email: "", rater_name: "Missing", rater_email: "bad", relationship_type: "colleague" }],
    subjects,
    employees,
  });
  const csv = buildBulkReviewerErrorReportCsv(result.rows);

  assert.match(csv, /row_number,status,subject_email/);
  assert.match(csv, /subject_email is required/);
  assert.match(csv, /rater_email must be a valid email/);
});
