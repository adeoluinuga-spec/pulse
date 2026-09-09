import test from "node:test";
import assert from "node:assert/strict";

import { raterRulesUpdate, shouldLockRules, type RaterRules } from "./assessmentRaterRules.ts";

const current: RaterRules = {
  minimumPerGroup: 3,
  suppressionMode: "merge",
  quota: { colleague: 3, direct_report: 3 },
};

test("a valid change is accepted and merged over the current rules", () => {
  const outcome = raterRulesUpdate({ current, requested: { minimumPerGroup: 2 }, lockedAt: null });

  assert.ok(outcome.ok);
  assert.equal(outcome.rules.minimumPerGroup, 2);
  assert.equal(outcome.rules.suppressionMode, "merge", "untouched fields keep their value");
  assert.deepEqual(outcome.rules.quota, { colleague: 3, direct_report: 3 });
});

test("a minimum of one is refused, because the group would be the individual", () => {
  const outcome = raterRulesUpdate({ current, requested: { minimumPerGroup: 1 }, lockedAt: null });

  assert.equal(outcome.ok, false);
  assert.match(outcome.ok ? "" : outcome.reason, /no confidentiality can be promised/);
});

test("a minimum above the ceiling is refused", () => {
  assert.equal(raterRulesUpdate({ current, requested: { minimumPerGroup: 6 }, lockedAt: null }).ok, false);
});

test("a non-integer minimum is refused rather than rounded", () => {
  assert.equal(raterRulesUpdate({ current, requested: { minimumPerGroup: 2.5 }, lockedAt: null }).ok, false);
});

test("locked rules cannot be changed at all, and the refusal says why", () => {
  const outcome = raterRulesUpdate({
    current,
    requested: { minimumPerGroup: 2 },
    lockedAt: "2026-09-09T10:00:00Z",
  });

  assert.equal(outcome.ok, false);
  assert.match(outcome.ok ? "" : outcome.reason, /first invitation was sent/);
  assert.match(outcome.ok ? "" : outcome.reason, /Clone this cycle/);
});

test("tightening locked rules is refused too, not only loosening them", () => {
  const outcome = raterRulesUpdate({
    current,
    requested: { minimumPerGroup: 5 },
    lockedAt: "2026-09-09T10:00:00Z",
  });

  assert.equal(outcome.ok, false);
});

test("an unknown scoring mode is refused", () => {
  assert.equal(raterRulesUpdate({ current, requested: { suppressionMode: "hide" }, lockedAt: null }).ok, false);
});

test("a quota of zero is refused, and ten is allowed", () => {
  assert.equal(raterRulesUpdate({ current, requested: { quota: { colleague: 0 } }, lockedAt: null }).ok, false);
  assert.equal(raterRulesUpdate({ current, requested: { quota: { colleague: 10 } }, lockedAt: null }).ok, true);
  assert.equal(raterRulesUpdate({ current, requested: { quota: { colleague: 11 } }, lockedAt: null }).ok, false);
});

test("the lock is stamped once and never moved", () => {
  assert.equal(shouldLockRules(null), true);
  assert.equal(shouldLockRules("2026-09-09T10:00:00Z"), false);
});
