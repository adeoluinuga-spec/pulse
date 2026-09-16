import test from "node:test";
import assert from "node:assert/strict";

import {
  annualTax,
  bandedTax,
  calculatePayLine,
  daysEmployed,
  totalsFor,
  type EmployeePayInput,
  type PayrollSettings,
  type RecurringComponent,
} from "./payrollGrossToNet.ts";
import { ruleSetById, ruleSetFor, type RuleSet } from "./payrollRules.ts";

// Every expected figure in this file was calculated by hand from the rules as
// written, and written here in naira so a reviewer can redo the arithmetic.
// None was copied from the engine's own output.

const N = (naira: number) => Math.round(naira * 100);

const NTA = ruleSetById("ng-nta-2026") as RuleSet;
const PITA = ruleSetById("ng-pita-2024") as RuleSet;

const ALL_ON: PayrollSettings = { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: true };

const component = (code: string, naira: number, overrides: Partial<RecurringComponent> = {}): RecurringComponent => ({
  code,
  label: code,
  amountKobo: N(naira),
  taxable: true,
  pensionable: ["basic", "housing", "transport"].includes(code),
  isBasic: code === "basic",
  ...overrides,
});

function employee(overrides: Partial<EmployeePayInput> = {}): EmployeePayInput {
  return {
    employeeId: "e1",
    name: "Ada",
    components: [component("basic", 300_000), component("housing", 150_000), component("transport", 50_000)],
    adjustments: [],
    profile: {
      taxState: "Lagos",
      annualRentKobo: 0,
      nhisMonthlyKobo: 0,
      lifeAssuranceAnnualKobo: 0,
      pensionExempt: false,
      nhfExempt: false,
      hasBankDetails: true,
      hasPensionDetails: true,
      hasTin: true,
    },
    joinDate: "2020-01-01",
    exitDate: null,
    ...overrides,
  };
}

const SEPT_2026 = { year: 2026, month: 9 };
const JUNE_2025 = { year: 2025, month: 6 };

// ── rule selection ───────────────────────────────────────────────────────────

test("rules are chosen by the last day of the period being paid", () => {
  assert.equal(ruleSetFor("2026-01-31").id, "ng-nta-2026");
  assert.equal(ruleSetFor("2025-12-31").id, "ng-pita-2024");
  assert.equal(ruleSetFor("2024-07-31").id, "ng-pita-2024");
  assert.equal(ruleSetFor("2024-07-28").id, "ng-pita-2020");
});

test("a period with no rules is refused, not taxed under the nearest rules", () => {
  assert.throws(() => ruleSetFor("2019-12-31"), /No statutory rule set covers/);
});

test("every rule set is marked unverified until a professional has checked it", () => {
  for (const id of ["ng-pita-2020", "ng-pita-2024", "ng-nta-2026"]) {
    assert.equal(ruleSetById(id)?.verification, "unverified");
  }
});

// ── bands ────────────────────────────────────────────────────────────────────

test("NTA bands: ₦5,430,000 chargeable is ₦767,400", () => {
  // 0 on the first 800,000; 15% of 2,200,000 = 330,000; 18% of 2,430,000 = 437,400.
  assert.equal(bandedTax(N(5_430_000), NTA.paye.bands).taxKobo, N(767_400));
});

test("NTA bands reach the top rate: ₦65,340,000 chargeable is ₦14,265,000", () => {
  // 330,000 + 1,620,000 + 2,730,000 + 5,750,000 + 25% of 15,340,000 (3,835,000).
  assert.equal(bandedTax(N(65_340_000), NTA.paye.bands).taxKobo, N(14_265_000));
});

test("PITA bands: ₦4,144,000 chargeable is ₦786,560", () => {
  // 21,000 + 33,000 + 75,000 + 95,000 + 336,000 on the first 3,200,000; 24% of 944,000 = 226,560.
  assert.equal(bandedTax(N(4_144_000), PITA.paye.bands).taxKobo, N(786_560));
});

// ── scenario A: the reference case under NTA 2026 ────────────────────────────

test("A. NTA: basic 300k, housing 150k, transport 50k", () => {
  const line = calculatePayLine({ employee: employee(), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });

  assert.equal(line.grossKobo, N(500_000));
  assert.equal(line.pensionEmployeeKobo, N(40_000), "8% of 500,000 pensionable");
  assert.equal(line.nhfKobo, N(7_500), "2.5% of 300,000 basic");
  // Annual: 6,000,000 − 480,000 pension − 90,000 NHF = 5,430,000 → 767,400 → /12.
  assert.equal(line.payeKobo, N(63_950));
  assert.equal(line.netKobo, N(388_550));
  assert.equal(line.pensionEmployerKobo, N(50_000));
  assert.equal(line.nsitfKobo, N(5_000));
  assert.equal(line.itfKobo, N(5_000));
  assert.equal(line.employerCostKobo, N(560_000));
  assert.deepEqual(line.blockers, []);
});

test("B. NTA rent relief: ₦1,200,000 rent relieves ₦240,000", () => {
  const line = calculatePayLine({
    employee: employee({ profile: { ...employee().profile, annualRentKobo: N(1_200_000) } }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  // 5,430,000 − 240,000 = 5,190,000 → 330,000 + 18% of 2,190,000 (394,200) = 724,200 → /12.
  assert.equal(line.payeKobo, N(60_350));
  assert.equal(line.netKobo, N(392_150));
});

test("B2. NTA rent relief is capped at ₦500,000", () => {
  const working = annualTax(NTA, {
    annualGrossKobo: N(6_000_000),
    annualPensionKobo: 0,
    annualNhfKobo: 0,
    annualNhisKobo: 0,
    annualLifeAssuranceKobo: 0,
    annualRentKobo: N(10_000_000),
  });
  assert.equal(working.reliefs.find((r) => r.label === "Rent relief")?.amountKobo, N(500_000));
});

test("C. a minimum-wage earner pays no PAYE but still contributes", () => {
  const line = calculatePayLine({
    employee: employee({ components: [component("basic", 70_000)] }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  assert.equal(line.taxWorking?.exempt, true, "840,000 a year is the minimum wage");
  assert.equal(line.payeKobo, 0);
  assert.equal(line.pensionEmployeeKobo, N(5_600));
  assert.equal(line.nhfKobo, N(1_750));
  assert.equal(line.netKobo, N(62_650));
});

test("C2. one naira above the minimum wage is not exempt, though it may still owe nothing", () => {
  const line = calculatePayLine({
    employee: employee({ components: [component("basic", 70_001)] }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  assert.equal(line.taxWorking?.exempt, false);
  assert.equal(line.payeKobo, 0, "chargeable falls inside the 0% band after pension and NHF");
});

test("D. NTA high earner reaches the 25% band", () => {
  const line = calculatePayLine({
    employee: employee({
      components: [component("basic", 3_000_000), component("housing", 2_000_000), component("transport", 1_000_000)],
    }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  // 72,000,000 − 5,760,000 − 900,000 = 65,340,000 → 14,265,000 → /12.
  assert.equal(line.payeKobo, N(1_188_750));
  assert.equal(line.pensionEmployeeKobo, N(480_000));
  assert.equal(line.nhfKobo, N(75_000));
  assert.equal(line.netKobo, N(4_256_250));
});

// ── PITA: the pre-2026 regime ────────────────────────────────────────────────

test("E. PITA, CRA on gross less exempt items (Finance Act 2020 reading)", () => {
  const line = calculatePayLine({ employee: employee(), period: JUNE_2025, ruleSet: PITA, settings: ALL_ON });
  // Exempt 570,000; CRA base 5,430,000; CRA 200,000 + 1,086,000 = 1,286,000.
  // Chargeable 6,000,000 − 570,000 − 1,286,000 = 4,144,000 → 786,560 → /12 = 65,546.666…
  assert.equal(line.payeKobo, N(65_546.67));
  assert.equal(line.netKobo, N(386_953.33));
});

test("E2. PITA, CRA on gross income — the alternative reading, for comparison", () => {
  const onGross: RuleSet = {
    ...PITA,
    paye: { ...(PITA.paye as Extract<RuleSet["paye"], { regime: "pita" }>), consolidatedRelief: { ...(PITA.paye as Extract<RuleSet["paye"], { regime: "pita" }>).consolidatedRelief, base: "gross" } },
  };
  const line = calculatePayLine({ employee: employee(), period: JUNE_2025, ruleSet: onGross, settings: ALL_ON });
  // CRA 200,000 + 1,200,000 = 1,400,000; chargeable 4,030,000 → 759,200 → /12 = 63,266.666…
  assert.equal(line.payeKobo, N(63_266.67));
  assert.equal(line.netKobo, N(389_233.33));
});

test("PITA minimum tax applies when banded tax falls below 1% of gross", () => {
  const line = calculatePayLine({
    employee: employee({
      components: [component("basic", 75_000)],
      profile: { ...employee().profile, lifeAssuranceAnnualKobo: N(500_000) },
    }),
    period: JUNE_2025,
    ruleSet: PITA,
    settings: ALL_ON,
  });
  // Gross 900,000. Exempt 72,000 + 22,500 + 500,000 = 594,500. CRA 200,000 + 61,100 = 261,100.
  // Chargeable 44,400 → 7% = 3,108. Minimum tax 1% of 900,000 = 9,000 wins → 750/month.
  assert.equal(line.taxWorking?.bandedTaxKobo, N(3_108));
  assert.equal(line.taxWorking?.minimumTaxApplied, true);
  assert.equal(line.payeKobo, N(750));
  assert.equal(line.netKobo, N(66_375));
  assert.ok(line.warnings.some((w) => /Minimum tax applies/.test(w)));
});

test("NTA has no minimum tax", () => {
  const working = annualTax(NTA, {
    annualGrossKobo: N(900_000),
    annualPensionKobo: 0,
    annualNhfKobo: 0,
    annualNhisKobo: 0,
    annualLifeAssuranceKobo: N(500_000),
    annualRentKobo: 0,
  });
  assert.equal(working.minimumTaxKobo, null);
  assert.equal(working.annualTaxKobo, 0);
});

// ── one-offs, proration, settings ────────────────────────────────────────────

test("F. a bonus is taxed at the marginal rate in the month it is paid", () => {
  const line = calculatePayLine({
    employee: employee({
      adjustments: [{ id: "b1", label: "Bonus", kind: "earning", amountKobo: N(1_000_000), taxable: true, pensionable: false }],
    }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  // Chargeable rises 5,430,000 → 6,430,000, entirely in the 18% band: 180,000 extra.
  assert.equal(line.payeOneOffKobo, N(180_000));
  assert.equal(line.payeKobo, N(243_950));
  assert.equal(line.grossKobo, N(1_500_000));
  assert.equal(line.pensionEmployeeKobo, N(40_000), "a non-pensionable bonus leaves pension unchanged");
  assert.equal(line.netKobo, N(1_208_550));
  assert.equal(line.nsitfKobo, N(15_000), "employer levies follow the whole month's gross");
});

test("G. a joiner on the 16th of September is paid for 15 of 30 days", () => {
  const line = calculatePayLine({ employee: employee({ joinDate: "2026-09-16" }), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  assert.equal(line.daysPaid, 15);
  assert.equal(line.grossKobo, N(250_000));
  // Annual tax on the full-month position (767,400) × 15 / 360.
  assert.equal(line.payeKobo, N(31_975));
  assert.equal(line.pensionEmployeeKobo, N(20_000));
  assert.equal(line.nhfKobo, N(3_750));
  assert.equal(line.netKobo, N(194_275));
  assert.ok(line.warnings.some((w) => /15 of 30 days/.test(w)));
});

test("a leaver on the 10th is prorated and rounded once per component", () => {
  const line = calculatePayLine({ employee: employee({ exitDate: "2026-09-10" }), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  assert.equal(line.daysPaid, 10);
  // 100,000 + 50,000 + 16,666.666… (rounds to 16,666.67).
  assert.equal(line.grossKobo, N(100_000) + N(50_000) + N(16_666.67));
});

test("someone not yet employed is left out, not paid zero", () => {
  const line = calculatePayLine({ employee: employee({ joinDate: "2026-10-01" }), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  assert.equal(line.included, false);
  assert.match(line.excludedReason ?? "", /Not employed/);
});

test("switching pension off removes both the deduction and its tax relief", () => {
  const line = calculatePayLine({
    employee: employee(),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: { ...ALL_ON, pensionEnabled: false },
  });
  // 6,000,000 − 90,000 = 5,910,000 → 330,000 + 18% of 2,910,000 (523,800) = 853,800 → /12.
  assert.equal(line.pensionEmployeeKobo, 0);
  assert.equal(line.pensionEmployerKobo, 0);
  assert.equal(line.payeKobo, N(71_150));
  assert.equal(line.netKobo, N(421_350));
});

test("days employed counts both ends of the period inclusively", () => {
  assert.equal(daysEmployed({ year: 2026, month: 2 }, null, null), 28);
  assert.equal(daysEmployed({ year: 2028, month: 2 }, null, null), 29, "leap year");
  assert.equal(daysEmployed(SEPT_2026, "2026-09-30", null), 1);
  assert.equal(daysEmployed(SEPT_2026, "2026-09-10", "2026-09-05"), 0);
});

// ── things that must stop an approval ────────────────────────────────────────

test("H. deductions larger than pay block the run instead of producing negative pay", () => {
  const line = calculatePayLine({
    employee: employee({
      adjustments: [{ id: "l1", label: "Loan", kind: "deduction", amountKobo: N(600_000), taxable: false, pensionable: false }],
    }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  assert.ok(line.netKobo < 0);
  assert.ok(line.blockers.some((b) => /Deductions exceed pay/.test(b)));
});

test("PAYE with nowhere to send it blocks; missing bank details only warns", () => {
  const line = calculatePayLine({
    employee: employee({ profile: { ...employee().profile, taxState: null, hasBankDetails: false } }),
    period: SEPT_2026,
    ruleSet: NTA,
    settings: ALL_ON,
  });
  assert.ok(line.blockers.some((b) => /No tax state/.test(b)));
  assert.ok(line.warnings.some((w) => /bank payment schedule/.test(w)));
});

test("someone with no compensation on record is included and blocked, not silently skipped", () => {
  const line = calculatePayLine({ employee: employee({ components: [] }), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  assert.equal(line.included, true);
  assert.ok(line.blockers.some((b) => /No compensation/.test(b)));
});

test("run totals add up the included lines only", () => {
  const a = calculatePayLine({ employee: employee(), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  const out = calculatePayLine({ employee: employee({ employeeId: "e2", joinDate: "2026-10-01" }), period: SEPT_2026, ruleSet: NTA, settings: ALL_ON });
  const totals = totalsFor([a, a, out]);
  assert.equal(totals.headcount, 2);
  assert.equal(totals.netKobo, N(388_550) * 2);
  assert.equal(totals.employerCostKobo, N(560_000) * 2);
});
