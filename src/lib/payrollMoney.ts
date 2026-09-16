/**
 * Money, in kobo.
 *
 * Every amount inside payroll is an integer number of kobo. Floating-point
 * naira is how a payroll ends up a kobo out on one payslip and nobody can find
 * why: 0.1 + 0.2 is not 0.3, and a run multiplies and sums thousands of those.
 * Percentages are basis points (8% = 800) so a rate times an amount stays in
 * integers until the one rounding step at the end.
 */

export const KOBO_PER_NAIRA = 100;

/** Naira (as typed by a person) to kobo. Rounds half away from zero, once. */
export function toKobo(naira: number): number {
  if (!Number.isFinite(naira)) throw new Error("Amount must be a finite number.");
  return Math.round(naira * KOBO_PER_NAIRA);
}

export function toNaira(kobo: number): number {
  return kobo / KOBO_PER_NAIRA;
}

/**
 * A percentage of an amount, rounded to the kobo.
 *
 * `amount * bps` is an exact integer; the division is the only step that can
 * produce a fraction, so this rounds exactly once.
 */
export function percentOf(amountKobo: number, basisPoints: number): number {
  return Math.round((amountKobo * basisPoints) / 10_000);
}

/** Formats kobo as naira for people. Never used in arithmetic. */
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const absolute = Math.abs(kobo);
  const naira = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}₦${naira.toLocaleString("en-NG")}.${String(remainder).padStart(2, "0")}`;
}

/** Plain two-decimal naira, for CSV files a bank or tax portal will ingest. */
export function nairaString(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const absolute = Math.abs(kobo);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
