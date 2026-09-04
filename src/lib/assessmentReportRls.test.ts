import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904_000002_assessment_report_access_tiers.sql",
  "utf8",
);

test("report RLS migration removes broad HR/executive individual report access", () => {
  assert.match(migration, /drop policy if exists "hr can read assessment reports"/);
  assert.match(migration, /participant can read own released assessment report/);
  assert.match(migration, /line manager can read released direct report assessment report/);
  assert.match(migration, /super admin can read assessment reports/);
  assert.doesNotMatch(migration, /platform_role in \('hr_admin', 'super_admin', 'executive_view'\)/);
});

test("response RLS migration removes HR raw verbatim access and adds pseudonymized view", () => {
  assert.match(migration, /drop policy if exists "hr can read assessment responses"/);
  assert.match(migration, /assessment_response_verbatims_pseudonymized/);
  assert.match(migration, /md5\(ar\.id::text\) as rater_key/);
  assert.doesNotMatch(migration, /reviewer_email/);
});

test("report access audit actions are indexed for incident review", () => {
  assert.match(migration, /report_viewed/);
  assert.match(migration, /report_released/);
  assert.match(migration, /report_exported/);
});
