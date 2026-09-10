import test from "node:test";
import assert from "node:assert/strict";

import { trendFor, validateKpi } from "./kpiRules.ts";

const base = { name: "Win rate", employeeId: "emp-1", targetValue: 40, currentValue: 32, weight: 25 };

test("a complete KPI validates and defaults sensibly", () => {
  const result = validateKpi(base);
  assert.ok(result.ok);
  assert.equal(result.kpi.measureDirection, "higher");
  assert.equal(result.kpi.frequency, "monthly");
  assert.equal(result.kpi.isActive, true);
  assert.equal(result.kpi.baselineValue, null);
  assert.equal(result.kpi.strategyNodeId, null, "a KPI can stand outside the cascade");
});

test("a KPI without a target is refused, because nothing could measure it", () => {
  const result = validateKpi({ ...base, targetValue: undefined });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /nothing to measure against/.test(e)));
});

test("a KPI without an owner is refused", () => {
  const result = validateKpi({ ...base, employeeId: "" });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /ties it to an appraisal/.test(e)));
});

test("a baseline equal to the target is refused rather than dividing by zero", () => {
  const result = validateKpi({ ...base, baselineValue: 40, targetValue: 40 });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /no movement to measure/.test(e)));
});

test("every problem is reported at once", () => {
  const result = validateKpi({ name: "x", weight: 200, measureDirection: "sideways", frequency: "hourly" });
  const errors = result.ok ? [] : result.errors;
  assert.ok(errors.length >= 5, `expected several errors, got ${errors.length}`);
});

test("a current reading of zero is kept, not treated as missing", () => {
  const result = validateKpi({ ...base, currentValue: 0 });
  assert.ok(result.ok);
  assert.equal(result.kpi.currentValue, 0);
});

test("a missing current reading starts at zero", () => {
  const result = validateKpi({ ...base, currentValue: undefined });
  assert.ok(result.ok);
  assert.equal(result.kpi.currentValue, 0);
});

test("non-numeric values are refused rather than coerced", () => {
  assert.equal(validateKpi({ ...base, targetValue: "many" }).ok, false);
  assert.equal(validateKpi({ ...base, currentValue: "some" }).ok, false);
});

test("trend follows improvement, not direction of travel", () => {
  assert.equal(trendFor({ previous: 30, next: 35, direction: "higher" }), "up");
  assert.equal(trendFor({ previous: 30, next: 25, direction: "higher" }), "down");

  // For a lower-is-better measure — cost, churn, defects — falling is improving.
  assert.equal(trendFor({ previous: 30, next: 25, direction: "lower" }), "up");
  assert.equal(trendFor({ previous: 30, next: 35, direction: "lower" }), "down");
});

test("an unchanged or first reading is flat", () => {
  assert.equal(trendFor({ previous: 30, next: 30, direction: "higher" }), "flat");
  assert.equal(trendFor({ previous: null, next: 30, direction: "higher" }), "flat");
});
