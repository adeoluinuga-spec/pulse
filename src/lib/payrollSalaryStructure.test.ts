import assert from "node:assert/strict";
import test from "node:test";
import { splitAnnualGross, validateSalaryStructure } from "./payrollSalaryStructure.ts";

const input = [
  { code: "basic", label: "Basic salary", percent: 40, taxable: true, pensionable: true, isBasic: true },
  { code: "housing", label: "Housing", percent: 5, taxable: true, pensionable: true, isBasic: false },
  { code: "transport", label: "Transport", percent: 5, taxable: true, pensionable: true, isBasic: false },
  { code: "other", label: "Other allowance", percent: 50, taxable: true, pensionable: false, isBasic: false },
];

test("a tenant salary structure must sum to 100% and identify basic pay", () => {
  assert.equal(validateSalaryStructure(input).ok, true);
  assert.equal(validateSalaryStructure(input.slice(0, 3)).ok, false);
  assert.equal(validateSalaryStructure(input.map((entry) => ({ ...entry, isBasic: false }))).ok, false);
  assert.equal(validateSalaryStructure([...input, { ...input[0] }]).ok, false);
});

test("two-decimal component percentages remain valid", () => {
  const thirds = [
    { ...input[0], percent: 33.33 },
    { ...input[1], percent: 33.33 },
    { ...input[2], percent: 33.34 },
  ];
  assert.equal(validateSalaryStructure(thirds).ok, true);
});

test("annual gross splits into monthly components without losing a kobo", () => {
  const structure = validateSalaryStructure(input);
  assert.equal(structure.ok, true);
  if (!structure.ok) return;
  const result = splitAnnualGross(12_000_000.01, structure.components);
  assert.equal(result.annualGrossKobo, 1_200_000_001);
  assert.equal(result.components.reduce((sum, entry) => sum + entry.amountKobo, 0), result.monthlyGrossKobo);
  assert.equal(result.components.filter((entry) => entry.isBasic).length, 1);
});
