/**
 * Gross to net, for one employee, for one month.
 *
 * Everything here is a pure function of its inputs: the same compensation,
 * profile, adjustments, period and rule set always produce the same payslip,
 * to the kobo. That is what lets an approved run be re-derived and audited, and
 * what lets the worked examples in PAYROLL_TAX_EXAMPLES.md be generated from
 * this code rather than typed beside it and allowed to drift.
 *
 * Method, stated once so it can be checked:
 *
 *  1. PAYE is an annual tax. Recurring monthly pay is annualised (×12) at the
 *     full monthly rate, the annual tax is computed, and one month's share is
 *     taken — prorated for a joiner or leaver by calendar days worked.
 *  2. One-off taxable earnings (bonus, arrears, overtime) are taxed
 *     incrementally: the annual tax with the one-off added, minus the annual
 *     tax without it, all charged in the month it is paid. This taxes a bonus at
 *     the employee's marginal rate instead of pretending it recurs monthly.
 *  3. Pension (employee and employer) is a share of the month's pensionable
 *     pay. NHF is a share of the month's basic. NSITF and ITF are employer
 *     costs on the month's gross.
 *  4. Life assurance and rent are reliefs only — declared by the employee, not
 *     deducted from pay. NHIS is both deducted and relieved.
 *
 * Nothing here moves money or files anything. It produces figures for a person
 * to review and approve.
 */

import { percentOf } from "./payrollMoney.ts";
import type { NtaPaye, PitaPaye, RuleSet, TaxBand } from "./payrollRules.ts";

export type RecurringComponent = {
  code: string;
  label: string;
  /** Full-month amount, before any proration. */
  amountKobo: number;
  taxable: boolean;
  pensionable: boolean;
  isBasic: boolean;
};

export type Adjustment = {
  id: string;
  label: string;
  kind: "earning" | "deduction";
  amountKobo: number;
  /** Earnings only. Deductions in v1 are always taken after tax. */
  taxable: boolean;
  pensionable: boolean;
};

export type PayrollProfile = {
  taxState: string | null;
  /** Declared annual rent paid, for NTA rent relief. */
  annualRentKobo: number;
  /** Deducted from pay each month and relieved from tax. */
  nhisMonthlyKobo: number;
  /** Declared annual life assurance premium. Relief only. */
  lifeAssuranceAnnualKobo: number;
  pensionExempt: boolean;
  nhfExempt: boolean;
  hasBankDetails: boolean;
  hasPensionDetails: boolean;
  hasTin: boolean;
};

export type PayrollSettings = {
  pensionEnabled: boolean;
  nhfEnabled: boolean;
  nsitfEnabled: boolean;
  itfEnabled: boolean;
};

export type EmployeePayInput = {
  employeeId: string;
  name: string;
  components: RecurringComponent[];
  adjustments: Adjustment[];
  profile: PayrollProfile;
  joinDate: string | null;
  exitDate: string | null;
};

export type Period = { year: number; month: number };

export type TaxWorking = {
  regime: "pita" | "nta";
  ruleSetId: string;
  annualGrossKobo: number;
  reliefs: Array<{ label: string; amountKobo: number }>;
  chargeableKobo: number;
  bands: Array<{ fromKobo: number; toKobo: number | null; rateBps: number; taxKobo: number }>;
  bandedTaxKobo: number;
  minimumTaxKobo: number | null;
  minimumTaxApplied: boolean;
  exempt: boolean;
  annualTaxKobo: number;
};

export type PayLine = {
  employeeId: string;
  name: string;
  included: boolean;
  excludedReason: string | null;
  daysPaid: number;
  daysInPeriod: number;
  earnings: Array<{ code: string; label: string; amountKobo: number; taxable: boolean; pensionable: boolean; source: "recurring" | "adjustment" }>;
  deductions: Array<{ code: string; label: string; amountKobo: number; statutory: boolean }>;
  employer: Array<{ code: string; label: string; amountKobo: number }>;
  grossKobo: number;
  /** Basic salary actually paid this month, after proration. The NHF base. */
  basicKobo: number;
  payeKobo: number;
  payeRecurringKobo: number;
  payeOneOffKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfKobo: number;
  nhisKobo: number;
  nsitfKobo: number;
  itfKobo: number;
  otherDeductionsKobo: number;
  totalDeductionsKobo: number;
  netKobo: number;
  employerCostKobo: number;
  taxState: string | null;
  taxWorking: TaxWorking | null;
  /** Stop the run being approved. */
  blockers: string[];
  /** Worth a look, but do not stop approval. */
  warnings: string[];
};

// ── dates ────────────────────────────────────────────────────────────────────

export function periodBounds(period: Period): { start: string; end: string; days: number } {
  const days = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const mm = String(period.month).padStart(2, "0");
  return { start: `${period.year}-${mm}-01`, end: `${period.year}-${mm}-${String(days).padStart(2, "0")}`, days };
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** Calendar days employed within the period, inclusive of both ends. */
export function daysEmployed(period: Period, joinDate: string | null, exitDate: string | null): number {
  const { start, end } = periodBounds(period);
  const from = joinDate && joinDate > start ? joinDate : start;
  const to = exitDate && exitDate < end ? exitDate : end;
  if (from > to) return 0;
  return dayNumber(to) - dayNumber(from) + 1;
}

// ── tax ──────────────────────────────────────────────────────────────────────

/** Tax on an annual chargeable amount across progressive bands. Rounds once. */
export function bandedTax(chargeableKobo: number, bands: TaxBand[]): { taxKobo: number; working: TaxWorking["bands"] } {
  let remaining = Math.max(0, chargeableKobo);
  let floor = 0;
  let exact = 0;
  const working: TaxWorking["bands"] = [];

  for (const band of bands) {
    if (remaining <= 0) break;
    const slice = band.widthKobo === null ? remaining : Math.min(remaining, band.widthKobo);
    const product = slice * band.rateBps;
    exact += product;
    working.push({
      fromKobo: floor,
      toKobo: band.widthKobo === null ? null : floor + band.widthKobo,
      rateBps: band.rateBps,
      taxKobo: Math.round(product / 10_000),
    });
    floor += slice;
    remaining -= slice;
  }

  return { taxKobo: Math.round(exact / 10_000), working };
}

export type AnnualTaxInput = {
  annualGrossKobo: number;
  annualPensionKobo: number;
  annualNhfKobo: number;
  annualNhisKobo: number;
  annualLifeAssuranceKobo: number;
  annualRentKobo: number;
};

export function annualTax(ruleSet: RuleSet, input: AnnualTaxInput): TaxWorking {
  const exempt = input.annualGrossKobo <= ruleSet.minimumWageExemptionAnnualKobo;
  const base: Omit<TaxWorking, "reliefs" | "chargeableKobo" | "bands" | "bandedTaxKobo" | "minimumTaxKobo" | "minimumTaxApplied" | "annualTaxKobo"> = {
    regime: ruleSet.paye.regime,
    ruleSetId: ruleSet.id,
    annualGrossKobo: input.annualGrossKobo,
    exempt,
  };

  const statutoryReliefs = [
    { label: "Pension contribution (employee)", amountKobo: input.annualPensionKobo },
    { label: "National Housing Fund", amountKobo: input.annualNhfKobo },
    { label: "NHIS contribution", amountKobo: input.annualNhisKobo },
    { label: "Life assurance premium", amountKobo: input.annualLifeAssuranceKobo },
  ].filter((relief) => relief.amountKobo > 0);

  const exemptItems = statutoryReliefs.reduce((sum, relief) => sum + relief.amountKobo, 0);

  let reliefs: TaxWorking["reliefs"];
  let chargeable: number;
  let minimumTaxKobo: number | null = null;

  if (ruleSet.paye.regime === "pita") {
    const paye = ruleSet.paye as PitaPaye;
    const craBase =
      paye.consolidatedRelief.base === "gross_less_exempt"
        ? Math.max(0, input.annualGrossKobo - exemptItems)
        : input.annualGrossKobo;
    const cra =
      Math.max(paye.consolidatedRelief.fixedKobo, percentOf(craBase, paye.consolidatedRelief.percentBps)) +
      percentOf(craBase, paye.consolidatedRelief.additionalPercentBps);
    reliefs = [...statutoryReliefs, { label: "Consolidated Relief Allowance", amountKobo: cra }];
    chargeable = Math.max(0, input.annualGrossKobo - exemptItems - cra);
    minimumTaxKobo = percentOf(input.annualGrossKobo, paye.minimumTaxBps);
  } else {
    const paye = ruleSet.paye as NtaPaye;
    const rentRelief = Math.min(percentOf(input.annualRentKobo, paye.rentRelief.percentBps), paye.rentRelief.capKobo);
    reliefs = rentRelief > 0 ? [...statutoryReliefs, { label: "Rent relief", amountKobo: rentRelief }] : statutoryReliefs;
    chargeable = Math.max(0, input.annualGrossKobo - exemptItems - rentRelief);
  }

  const banded = bandedTax(chargeable, ruleSet.paye.bands);

  if (exempt) {
    return {
      ...base,
      reliefs,
      chargeableKobo: chargeable,
      bands: banded.working,
      bandedTaxKobo: banded.taxKobo,
      minimumTaxKobo,
      minimumTaxApplied: false,
      annualTaxKobo: 0,
    };
  }

  const minimumTaxApplied = minimumTaxKobo !== null && banded.taxKobo < minimumTaxKobo;

  return {
    ...base,
    reliefs,
    chargeableKobo: chargeable,
    bands: banded.working,
    bandedTaxKobo: banded.taxKobo,
    minimumTaxKobo,
    minimumTaxApplied,
    annualTaxKobo: minimumTaxApplied ? (minimumTaxKobo as number) : banded.taxKobo,
  };
}

// ── the payslip ──────────────────────────────────────────────────────────────

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function calculatePayLine(input: {
  employee: EmployeePayInput;
  period: Period;
  ruleSet: RuleSet;
  settings: PayrollSettings;
}): PayLine {
  const { employee, period, ruleSet, settings } = input;
  const { days: daysInPeriod } = periodBounds(period);
  const daysPaid = daysEmployed(period, employee.joinDate, employee.exitDate);

  const empty: PayLine = {
    employeeId: employee.employeeId,
    name: employee.name,
    included: false,
    excludedReason: null,
    daysPaid,
    daysInPeriod,
    earnings: [],
    deductions: [],
    employer: [],
    grossKobo: 0,
    basicKobo: 0,
    payeKobo: 0,
    payeRecurringKobo: 0,
    payeOneOffKobo: 0,
    pensionEmployeeKobo: 0,
    pensionEmployerKobo: 0,
    nhfKobo: 0,
    nhisKobo: 0,
    nsitfKobo: 0,
    itfKobo: 0,
    otherDeductionsKobo: 0,
    totalDeductionsKobo: 0,
    netKobo: 0,
    employerCostKobo: 0,
    taxState: employee.profile.taxState,
    taxWorking: null,
    blockers: [],
    warnings: [],
  };

  if (daysPaid === 0) {
    return { ...empty, excludedReason: "Not employed during this period." };
  }
  if (!employee.components.length) {
    return {
      ...empty,
      included: true,
      blockers: ["No compensation is on record for this period, so there is nothing to pay."],
    };
  }

  const prorate = (amount: number) =>
    daysPaid === daysInPeriod ? amount : Math.round((amount * daysPaid) / daysInPeriod);

  // Earnings actually paid this month.
  const recurringEarnings = employee.components.map((component) => ({
    code: component.code,
    label: component.label,
    amountKobo: prorate(component.amountKobo),
    taxable: component.taxable,
    pensionable: component.pensionable,
    source: "recurring" as const,
  }));

  const earningAdjustments = employee.adjustments.filter((adjustment) => adjustment.kind === "earning");
  const deductionAdjustments = employee.adjustments.filter((adjustment) => adjustment.kind === "deduction");

  const oneOffEarnings = earningAdjustments.map((adjustment) => ({
    code: `adj:${adjustment.id}`,
    label: adjustment.label,
    amountKobo: adjustment.amountKobo,
    taxable: adjustment.taxable,
    pensionable: adjustment.pensionable,
    source: "adjustment" as const,
  }));

  const earnings = [...recurringEarnings, ...oneOffEarnings];
  const grossKobo = sum(earnings.map((earning) => earning.amountKobo));

  // Contributions for this month, on what is actually paid this month.
  const pensionApplies = settings.pensionEnabled && !employee.profile.pensionExempt;
  const nhfApplies = settings.nhfEnabled && !employee.profile.nhfExempt;

  const pensionableThisMonth = sum(earnings.filter((earning) => earning.pensionable).map((earning) => earning.amountKobo));
  const basicThisMonth = sum(
    recurringEarnings.filter((_, index) => employee.components[index].isBasic).map((earning) => earning.amountKobo),
  );

  const pensionEmployeeKobo = pensionApplies ? percentOf(pensionableThisMonth, ruleSet.pension.employeeBps) : 0;
  const pensionEmployerKobo = pensionApplies ? percentOf(pensionableThisMonth, ruleSet.pension.employerBps) : 0;
  const nhfKobo = nhfApplies ? percentOf(basicThisMonth, ruleSet.nhf.employeeBps) : 0;
  const nhisKobo = employee.profile.nhisMonthlyKobo;
  const nsitfKobo = settings.nsitfEnabled ? percentOf(grossKobo, ruleSet.nsitf.employerBps) : 0;
  const itfKobo = settings.itfEnabled ? percentOf(grossKobo, ruleSet.itf.employerBps) : 0;

  // PAYE: annualise the full-month recurring position, not the prorated one.
  const fullTaxable = sum(employee.components.filter((c) => c.taxable).map((c) => c.amountKobo));
  const fullPensionable = sum(employee.components.filter((c) => c.pensionable).map((c) => c.amountKobo));
  const fullBasic = sum(employee.components.filter((c) => c.isBasic).map((c) => c.amountKobo));

  const recurringAnnual: AnnualTaxInput = {
    annualGrossKobo: fullTaxable * 12,
    annualPensionKobo: pensionApplies ? percentOf(fullPensionable, ruleSet.pension.employeeBps) * 12 : 0,
    annualNhfKobo: nhfApplies ? percentOf(fullBasic, ruleSet.nhf.employeeBps) * 12 : 0,
    annualNhisKobo: nhisKobo * 12,
    annualLifeAssuranceKobo: employee.profile.lifeAssuranceAnnualKobo,
    annualRentKobo: employee.profile.annualRentKobo,
  };

  const baseWorking = annualTax(ruleSet, recurringAnnual);
  const payeRecurringKobo = Math.round((baseWorking.annualTaxKobo * daysPaid) / (12 * daysInPeriod));

  const taxableOneOff = sum(oneOffEarnings.filter((e) => e.taxable).map((e) => e.amountKobo));
  const pensionableOneOff = sum(oneOffEarnings.filter((e) => e.pensionable).map((e) => e.amountKobo));

  let payeOneOffKobo = 0;
  let taxWorking = baseWorking;
  if (taxableOneOff > 0) {
    const withOneOff = annualTax(ruleSet, {
      ...recurringAnnual,
      annualGrossKobo: recurringAnnual.annualGrossKobo + taxableOneOff,
      annualPensionKobo:
        recurringAnnual.annualPensionKobo + (pensionApplies ? percentOf(pensionableOneOff, ruleSet.pension.employeeBps) : 0),
    });
    payeOneOffKobo = Math.max(0, withOneOff.annualTaxKobo - baseWorking.annualTaxKobo);
    taxWorking = withOneOff;
  }

  const payeKobo = payeRecurringKobo + payeOneOffKobo;
  const otherDeductionsKobo = sum(deductionAdjustments.map((adjustment) => adjustment.amountKobo));

  const deductions: PayLine["deductions"] = [
    { code: "paye", label: "PAYE", amountKobo: payeKobo, statutory: true },
    ...(pensionEmployeeKobo ? [{ code: "pension", label: "Pension (employee)", amountKobo: pensionEmployeeKobo, statutory: true }] : []),
    ...(nhfKobo ? [{ code: "nhf", label: "National Housing Fund", amountKobo: nhfKobo, statutory: true }] : []),
    ...(nhisKobo ? [{ code: "nhis", label: "NHIS", amountKobo: nhisKobo, statutory: true }] : []),
    ...deductionAdjustments.map((adjustment) => ({
      code: `adj:${adjustment.id}`,
      label: adjustment.label,
      amountKobo: adjustment.amountKobo,
      statutory: false,
    })),
  ];

  const employer: PayLine["employer"] = [
    ...(pensionEmployerKobo ? [{ code: "pension_employer", label: "Pension (employer)", amountKobo: pensionEmployerKobo }] : []),
    ...(nsitfKobo ? [{ code: "nsitf", label: "NSITF", amountKobo: nsitfKobo }] : []),
    ...(itfKobo ? [{ code: "itf", label: "ITF", amountKobo: itfKobo }] : []),
  ];

  const totalDeductionsKobo = sum(deductions.map((deduction) => deduction.amountKobo));
  const netKobo = grossKobo - totalDeductionsKobo;
  const employerCostKobo = grossKobo + sum(employer.map((cost) => cost.amountKobo));

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (netKobo < 0) {
    blockers.push("Deductions exceed pay for this month. Reduce a deduction or spread it over later months.");
  }
  if (!employee.profile.taxState && payeKobo > 0) {
    blockers.push("No tax state is recorded, so this PAYE cannot be allocated to a state tax authority.");
  }
  if (!employee.profile.hasBankDetails) {
    warnings.push("No bank details — this person will be left off the bank payment schedule.");
  }
  if (pensionApplies && !employee.profile.hasPensionDetails) {
    warnings.push("No PFA or RSA PIN — this person's pension cannot be put on the remittance schedule.");
  }
  if (!employee.profile.hasTin && payeKobo > 0) {
    warnings.push("No tax identification number recorded.");
  }
  if (baseWorking.minimumTaxApplied) {
    warnings.push("Minimum tax applies: banded tax came to less than the statutory minimum.");
  }
  if (daysPaid < daysInPeriod) {
    warnings.push(`Paid for ${daysPaid} of ${daysInPeriod} days in this period.`);
  }

  return {
    ...empty,
    included: true,
    earnings,
    deductions,
    employer,
    grossKobo,
    basicKobo: basicThisMonth,
    payeKobo,
    payeRecurringKobo,
    payeOneOffKobo,
    pensionEmployeeKobo,
    pensionEmployerKobo,
    nhfKobo,
    nhisKobo,
    nsitfKobo,
    itfKobo,
    otherDeductionsKobo,
    totalDeductionsKobo,
    netKobo,
    employerCostKobo,
    taxWorking,
    blockers,
    warnings,
  };
}

export type RunTotals = {
  headcount: number;
  grossKobo: number;
  payeKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfKobo: number;
  nhisKobo: number;
  nsitfKobo: number;
  itfKobo: number;
  otherDeductionsKobo: number;
  netKobo: number;
  employerCostKobo: number;
  blockerCount: number;
  warningCount: number;
};

export function totalsFor(lines: PayLine[]): RunTotals {
  const included = lines.filter((line) => line.included);
  const add = (key: keyof PayLine) => sum(included.map((line) => line[key] as number));
  return {
    headcount: included.length,
    grossKobo: add("grossKobo"),
    payeKobo: add("payeKobo"),
    pensionEmployeeKobo: add("pensionEmployeeKobo"),
    pensionEmployerKobo: add("pensionEmployerKobo"),
    nhfKobo: add("nhfKobo"),
    nhisKobo: add("nhisKobo"),
    nsitfKobo: add("nsitfKobo"),
    itfKobo: add("itfKobo"),
    otherDeductionsKobo: add("otherDeductionsKobo"),
    netKobo: add("netKobo"),
    employerCostKobo: add("employerCostKobo"),
    blockerCount: sum(included.map((line) => line.blockers.length)),
    warningCount: sum(included.map((line) => line.warnings.length)),
  };
}
