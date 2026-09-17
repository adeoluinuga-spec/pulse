/**
 * Turning released appraisal scores into performance bonuses in a payroll run.
 *
 * This is where performance management and pay meet, and it is deliberately
 * conservative about what counts:
 *
 *  - Only a released or acknowledged appraisal pays out. A score still in
 *    calibration can move, and a bonus paid on it cannot be taken back.
 *  - The bonus is a share of the person's own basic salary, by score band, so
 *    the same score means the same thing for everybody.
 *  - Nothing is imported twice. Each bonus remembers the appraisal it came
 *    from, and re-running the import adds only what is missing.
 *  - Every person left out is named with the reason, because "12 bonuses
 *    imported" hides the three people who expected one.
 *
 * Bonuses land as ordinary one-off adjustments on a draft run, so the maker-
 * checker rule applies to them like any other: whoever imports them cannot
 * approve the run.
 */

import { percentOf } from "./payrollMoney.ts";

export type BonusBand = {
  /** Inclusive lower bound, on the appraisal's 0–100 scale. */
  minScore: number;
  /** Exclusive upper bound — except 100, which includes a perfect score. */
  maxScore: number;
  /** Bonus as a share of monthly basic salary, in basis points (100% = 10000). */
  percentOfBasicBps: number;
};

/** A starting point to edit, not a recommendation. */
export const DEFAULT_BONUS_BANDS: BonusBand[] = [
  { minScore: 90, maxScore: 100, percentOfBasicBps: 10_000 },
  { minScore: 75, maxScore: 90, percentOfBasicBps: 5_000 },
  { minScore: 60, maxScore: 75, percentOfBasicBps: 2_500 },
  { minScore: 0, maxScore: 60, percentOfBasicBps: 0 },
];

/** Two years of basic. Anything above this is almost certainly a typo. */
export const MAX_BONUS_BPS = 240_000;

export function validateBands(bands: unknown): { ok: true; bands: BonusBand[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(bands) || !bands.length) return { ok: false, errors: ["Add at least one score band."] };
  if (bands.length > 20) errors.push("Keep it to 20 bands or fewer.");

  const parsed: BonusBand[] = [];
  bands.forEach((raw, index) => {
    const band = raw as Record<string, unknown>;
    const at = `Band ${index + 1}`;
    const minScore = Number(band.minScore);
    const maxScore = Number(band.maxScore);
    const bps = Number(band.percentOfBasicBps);
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || minScore < 0 || maxScore > 100 || minScore >= maxScore) {
      errors.push(`${at}: scores must run from a lower to a higher number between 0 and 100.`);
    }
    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BONUS_BPS) {
      errors.push(`${at}: the bonus must be between 0% and ${MAX_BONUS_BPS / 100}% of basic.`);
    }
    parsed.push({ minScore, maxScore, percentOfBasicBps: bps });
  });

  const sorted = [...parsed].sort((a, b) => a.minScore - b.minScore);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].minScore < sorted[index - 1].maxScore) {
      errors.push(`Bands ${sorted[index - 1].minScore}–${sorted[index - 1].maxScore} and ${sorted[index].minScore}–${sorted[index].maxScore} overlap, so a score could fall into both.`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, bands: parsed };
}

export function bandFor(score: number, bands: BonusBand[]): BonusBand | null {
  return (
    bands.find((band) => score >= band.minScore && (score < band.maxScore || (band.maxScore === 100 && score === 100))) ?? null
  );
}

export type AppraisalForBonus = {
  appraisalId: string;
  employeeId: string;
  name: string;
  workflowStatus: string;
  totalScore: number | null;
};

export type BonusPlan = {
  add: Array<{
    appraisalId: string;
    employeeId: string;
    name: string;
    score: number;
    percentOfBasicBps: number;
    basicKobo: number;
    amountKobo: number;
    label: string;
  }>;
  skip: Array<{ employeeId: string; name: string; reason: string }>;
  totalKobo: number;
};

const RELEASED = new Set(["released", "acknowledged"]);

export function planPerformanceBonuses(input: {
  appraisals: AppraisalForBonus[];
  bands: BonusBand[];
  cycleName: string;
  /** Monthly basic in force for the run's period, for people on payroll. */
  basicByEmployee: Map<string, number>;
  /** Appraisal ids already paid as a bonus in a live (not voided) run of the organisation. An appraisal pays out once. */
  alreadyImported: Set<string>;
}): BonusPlan {
  const plan: BonusPlan = { add: [], skip: [], totalKobo: 0 };

  for (const appraisal of [...input.appraisals].sort((a, b) => a.name.localeCompare(b.name))) {
    const skip = (reason: string) => plan.skip.push({ employeeId: appraisal.employeeId, name: appraisal.name, reason });

    if (input.alreadyImported.has(appraisal.appraisalId)) {
      skip("Already paid from this appraisal in a payroll run.");
      continue;
    }
    if (!RELEASED.has(appraisal.workflowStatus)) {
      skip("Appraisal not released yet, so its score can still change.");
      continue;
    }
    if (appraisal.totalScore === null || !Number.isFinite(appraisal.totalScore)) {
      skip("Appraisal has no final score.");
      continue;
    }
    const basic = input.basicByEmployee.get(appraisal.employeeId);
    if (basic === undefined) {
      skip("Not on this month's payroll.");
      continue;
    }
    if (basic <= 0) {
      skip("No basic salary this month to calculate a share of.");
      continue;
    }

    const band = bandFor(appraisal.totalScore, input.bands);
    if (!band) {
      skip(`Score ${appraisal.totalScore} is not covered by any band.`);
      continue;
    }

    const amountKobo = percentOf(basic, band.percentOfBasicBps);
    if (amountKobo <= 0) {
      skip(`Score ${appraisal.totalScore} falls in a band with no bonus.`);
      continue;
    }

    plan.add.push({
      appraisalId: appraisal.appraisalId,
      employeeId: appraisal.employeeId,
      name: appraisal.name,
      score: appraisal.totalScore,
      percentOfBasicBps: band.percentOfBasicBps,
      basicKobo: basic,
      amountKobo,
      label: `Performance bonus — ${input.cycleName}`.slice(0, 120),
    });
    plan.totalKobo += amountKobo;
  }

  return plan;
}
