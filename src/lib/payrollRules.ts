/**
 * Nigerian statutory payroll rules, as dated data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  STATUS: UNVERIFIED. Every figure below was entered by an engineer from their
 *  understanding of the law and must be checked by a payroll professional
 *  against current legislation and state IRS guidance before any real run.
 *  PAYROLL_TAX_EXAMPLES.md shows each rule applied to worked cases, with the
 *  points of genuine uncertainty called out, so the check can be done against
 *  numbers rather than code.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why data and not code: Nigerian personal income tax changed completely on
 * 1 January 2026, and the national minimum wage changed mid-2024. A payroll
 * that writes the bands into its arithmetic miscalculates silently the day the
 * law moves. Here the arithmetic is fixed and the rates are chosen by the date
 * of the period being paid, so a correction for December 2025 is taxed under
 * December 2025's law even when it is calculated in March 2026.
 *
 * Each locked payroll run stores a copy of the rule set it used. Editing a rule
 * here never changes a run that has already been approved.
 */

export type TaxBand = {
  /** Width of this band in annual kobo. Null means "everything above". */
  widthKobo: number | null;
  rateBps: number;
};

export type PitaPaye = {
  regime: "pita";
  bands: TaxBand[];
  /** Consolidated Relief Allowance: max(fixed, 1% of base) + 20% of base. */
  consolidatedRelief: {
    fixedKobo: number;
    percentBps: number;
    additionalPercentBps: number;
    /**
     * What the percentages are taken of. The Finance Act 2020 amended PITA so
     * CRA is computed on gross income *after* tax-exempt items (pension, NHF,
     * NHIS, life assurance). Kept switchable because this is the single most
     * likely point of disagreement in the worked examples.
     */
    base: "gross" | "gross_less_exempt";
  };
  /** Minimum tax as a share of annual gross income, when banded tax is lower. */
  minimumTaxBps: number;
};

export type NtaPaye = {
  regime: "nta";
  bands: TaxBand[];
  /** Rent relief: a share of annual rent paid, capped. */
  rentRelief: { percentBps: number; capKobo: number };
};

export type RuleSet = {
  id: string;
  label: string;
  jurisdiction: "NG";
  /** Inclusive. Selected against the last day of the pay period. */
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  verification: "unverified" | "verified";
  paye: PitaPaye | NtaPaye;
  /** Annual gross at or below which PAYE is not charged. */
  minimumWageExemptionAnnualKobo: number;
  pension: { employeeBps: number; employerBps: number };
  nhf: { employeeBps: number };
  nsitf: { employerBps: number };
  itf: { employerBps: number };
};

const naira = (amount: number) => amount * 100;

const PITA_BANDS: TaxBand[] = [
  { widthKobo: naira(300_000), rateBps: 700 },
  { widthKobo: naira(300_000), rateBps: 1100 },
  { widthKobo: naira(500_000), rateBps: 1500 },
  { widthKobo: naira(500_000), rateBps: 1900 },
  { widthKobo: naira(1_600_000), rateBps: 2100 },
  { widthKobo: null, rateBps: 2400 },
];

const PITA_PAYE: PitaPaye = {
  regime: "pita",
  bands: PITA_BANDS,
  consolidatedRelief: {
    fixedKobo: naira(200_000),
    percentBps: 100,
    additionalPercentBps: 2000,
    base: "gross_less_exempt",
  },
  minimumTaxBps: 100,
};

const SHARED_CONTRIBUTIONS = {
  pension: { employeeBps: 800, employerBps: 1000 },
  nhf: { employeeBps: 250 },
  nsitf: { employerBps: 100 },
  itf: { employerBps: 100 },
};

export const RULE_SETS: RuleSet[] = [
  {
    id: "ng-pita-2020",
    label: "Personal Income Tax Act (as amended by Finance Act 2020), minimum wage ₦30,000",
    jurisdiction: "NG",
    effectiveFrom: "2020-01-01",
    effectiveTo: "2024-07-28",
    source: "PITA 2011 as amended; Finance Act 2020; Pension Reform Act 2014; NHF Act; Employees' Compensation Act 2010; ITF Act",
    verification: "unverified",
    paye: PITA_PAYE,
    minimumWageExemptionAnnualKobo: naira(30_000 * 12),
    ...SHARED_CONTRIBUTIONS,
  },
  {
    id: "ng-pita-2024",
    label: "Personal Income Tax Act (as amended), minimum wage ₦70,000",
    jurisdiction: "NG",
    effectiveFrom: "2024-07-29",
    effectiveTo: "2025-12-31",
    source: "As ng-pita-2020, with the National Minimum Wage (Amendment) Act 2024",
    verification: "unverified",
    paye: PITA_PAYE,
    minimumWageExemptionAnnualKobo: naira(70_000 * 12),
    ...SHARED_CONTRIBUTIONS,
  },
  {
    id: "ng-nta-2026",
    label: "Nigeria Tax Act 2025 (in force from 1 January 2026)",
    jurisdiction: "NG",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    source: "Nigeria Tax Act 2025, Fourth Schedule; Pension Reform Act 2014; NHF Act; Employees' Compensation Act 2010; ITF Act",
    verification: "unverified",
    paye: {
      regime: "nta",
      bands: [
        { widthKobo: naira(800_000), rateBps: 0 },
        { widthKobo: naira(2_200_000), rateBps: 1500 },
        { widthKobo: naira(9_000_000), rateBps: 1800 },
        { widthKobo: naira(13_000_000), rateBps: 2100 },
        { widthKobo: naira(25_000_000), rateBps: 2300 },
        { widthKobo: null, rateBps: 2500 },
      ],
      rentRelief: { percentBps: 2000, capKobo: naira(500_000) },
    },
    minimumWageExemptionAnnualKobo: naira(70_000 * 12),
    ...SHARED_CONTRIBUTIONS,
  },
];

/**
 * The rule set in force for a pay period, chosen by the period's last day.
 *
 * Throws rather than guessing: a period with no rules is a period Pulse does
 * not know how to tax, and falling back to the nearest set would produce a
 * plausible, wrong payslip.
 */
export function ruleSetFor(periodEnd: string, sets: RuleSet[] = RULE_SETS): RuleSet {
  const match = sets.find(
    (set) => set.effectiveFrom <= periodEnd && (set.effectiveTo === null || periodEnd <= set.effectiveTo),
  );
  if (!match) {
    throw new Error(`No statutory rule set covers a pay period ending ${periodEnd}.`);
  }
  return match;
}

export function ruleSetById(id: string, sets: RuleSet[] = RULE_SETS): RuleSet | null {
  return sets.find((set) => set.id === id) ?? null;
}
