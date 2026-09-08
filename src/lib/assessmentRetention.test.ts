import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeletionCertificate,
  cycleSubmissionClosed,
  isCycleDueForPurge,
  parseRetentionConfig,
  retentionCutoffDate,
  withRetentionConfig,
} from "./assessmentRetention.ts";

test("retention config is read from cycle client context", () => {
  assert.deepEqual(parseRetentionConfig('{"retentionDays":90}'), { retentionDays: 90 });
  assert.deepEqual(parseRetentionConfig("plain context", 180), { retentionDays: 180 });
  assert.equal(JSON.parse(withRetentionConfig("plain context", 30)).retentionDays, 30);
});

test("retention cutoff and purge due checks are deterministic", () => {
  assert.equal(retentionCutoffDate("2026-01-01", 30)?.toISOString(), "2026-01-31T23:59:59.999Z");
  assert.equal(isCycleDueForPurge({ closesOn: "2026-01-01", clientContext: '{"retentionDays":30}', now: new Date("2026-02-01T00:00:00Z") }), true);
  assert.equal(isCycleDueForPurge({ closesOn: "2026-01-01", clientContext: '{"retentionDays":30}', now: new Date("2026-01-20T00:00:00Z") }), false);
});

test("closed or non-collecting cycles reject submissions", () => {
  assert.equal(cycleSubmissionClosed({ status: "collecting", closesOn: "2026-09-04" }, new Date("2026-09-04T20:00:00Z")), null);
  assert.match(cycleSubmissionClosed({ status: "closed", closesOn: "2026-09-30" }) ?? "", /no longer collecting/);
  assert.match(cycleSubmissionClosed({ status: "collecting", closesOn: "2026-09-01" }, new Date("2026-09-02T00:00:00Z")) ?? "", /has closed/);
});

test("manual and scheduled purge produce deletion certificates", () => {
  const certificate = buildDeletionCertificate({
    cycleId: "cycle-1",
    retentionDays: 90,
    reason: "manual",
    counts: { assessment_responses: 10 },
    deletedAt: "2026-09-04T12:34:56.000Z",
  });

  assert.equal(certificate.certificateId, "pulse-delete-cycle-1-20260904123456");
  assert.equal(certificate.counts.assessment_responses, 10);
});
