import test from "node:test";
import assert from "node:assert/strict";

import { bandFor, DEFAULT_BONUS_BANDS, planPerformanceBonuses, validateBands, type AppraisalForBonus } from "./payrollPerformance.ts";

const N = (naira: number) => Math.round(naira * 100);

const appraisal = (overrides: Partial<AppraisalForBonus> = {}): AppraisalForBonus => ({
  appraisalId: "a1",
  employeeId: "e1",
  name: "Ada",
  workflowStatus: "released",
  totalScore: 92,
  ...overrides,
});

const plan = (appraisals: AppraisalForBonus[], basic = new Map([["e1", N(300_000)]]), imported = new Set<string>()) =>
  planPerformanceBonuses({ appraisals, bands: DEFAULT_BONUS_BANDS, cycleName: "2026 H1", basicByEmployee: basic, alreadyImported: imported });

test("a released score of 92 earns 100% of monthly basic under the default bands", () => {
  const result = plan([appraisal()]);
  assert.equal(result.add.length, 1);
  assert.equal(result.add[0].amountKobo, N(300_000));
  assert.equal(result.add[0].label, "Performance bonus — 2026 H1");
  assert.equal(result.totalKobo, N(300_000));
});

test("a score of 80 earns half of basic", () => {
  assert.equal(plan([appraisal({ totalScore: 80 })]).add[0].amountKobo, N(150_000));
});

test("band edges: the lower bound is inclusive, the upper exclusive, and 100 is covered", () => {
  assert.equal(bandFor(90, DEFAULT_BONUS_BANDS)?.percentOfBasicBps, 10_000);
  assert.equal(bandFor(89.99, DEFAULT_BONUS_BANDS)?.percentOfBasicBps, 5_000);
  assert.equal(bandFor(100, DEFAULT_BONUS_BANDS)?.percentOfBasicBps, 10_000);
  assert.equal(bandFor(0, DEFAULT_BONUS_BANDS)?.percentOfBasicBps, 0);
});

test("an appraisal still in calibration pays nothing, and says why", () => {
  const result = plan([appraisal({ workflowStatus: "calibration" })]);
  assert.equal(result.add.length, 0);
  assert.match(result.skip[0].reason, /can still change/);
});

test("an acknowledged appraisal counts as released", () => {
  assert.equal(plan([appraisal({ workflowStatus: "acknowledged" })]).add.length, 1);
});

test("a low score is named as skipped rather than silently given a zero bonus", () => {
  const result = plan([appraisal({ totalScore: 40 })]);
  assert.equal(result.add.length, 0);
  assert.match(result.skip[0].reason, /band with no bonus/);
});

test("somebody not on this month's payroll is skipped", () => {
  const result = plan([appraisal({ employeeId: "e9" })]);
  assert.match(result.skip[0].reason, /Not on this month's payroll/);
});

test("nothing is imported twice", () => {
  const result = plan([appraisal()], undefined, new Set(["a1"]));
  assert.equal(result.add.length, 0);
  assert.match(result.skip[0].reason, /Already imported/);
});

test("an appraisal with no final score is skipped", () => {
  assert.match(plan([appraisal({ totalScore: null })]).skip[0].reason, /no final score/);
});

test("the default bands are valid", () => {
  assert.ok(validateBands(DEFAULT_BONUS_BANDS).ok);
});

test("overlapping bands are refused, because a score could land in both", () => {
  const result = validateBands([
    { minScore: 80, maxScore: 100, percentOfBasicBps: 10_000 },
    { minScore: 70, maxScore: 85, percentOfBasicBps: 5_000 },
  ]);
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /overlap/.test(e)));
});

test("a bonus above two years of basic is refused as a likely typo", () => {
  assert.equal(validateBands([{ minScore: 0, maxScore: 100, percentOfBasicBps: 250_000 }]).ok, false);
});

test("scores outside 0–100 or a band running backwards are refused", () => {
  assert.equal(validateBands([{ minScore: 90, maxScore: 80, percentOfBasicBps: 100 }]).ok, false);
  assert.equal(validateBands([{ minScore: -5, maxScore: 50, percentOfBasicBps: 100 }]).ok, false);
});
