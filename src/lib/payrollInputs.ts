/**
 * Turning what is stored into what the payroll engine needs.
 *
 * Compensation is kept as dated records — a pay rise is a new record from a
 * date, never an edit — so for any month Pulse has to work out what somebody
 * was actually entitled to. Usually that is one record. The case this file
 * exists for is the other one: a rise taking effect on the 16th, where paying
 * the whole month at either rate would be wrong.
 */

import type { PayrollProfile, Period, RecurringComponent } from "./payrollGrossToNet.ts";
import { periodBounds } from "./payrollGrossToNet.ts";
import { toKobo } from "./payrollMoney.ts";

/**
 * A real calendar date in YYYY-MM-DD form.
 *
 * Checks the date parses before formatting it: `toISOString` throws on an
 * impossible date such as 2026-13-40, which would turn a typo into a crash.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export type CompensationRecord = {
  effectiveFrom: string;
  components: RecurringComponent[];
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Full-month-equivalent pay for the days a person was employed in the period.
 *
 * Each record in force during the employed window contributes in proportion to
 * the days it covered. The result is expressed as if for a full month, because
 * the engine then prorates by days employed — so a joiner is not prorated
 * twice, and a rise on the 16th of a 30-day month pays half the month at each
 * rate.
 *
 * Days before the earliest record contribute nothing and are reported, rather
 * than being paid at a rate that did not yet exist.
 */
export function compensationForPeriod(input: {
  records: CompensationRecord[];
  period: Period;
  joinDate: string | null;
  exitDate: string | null;
}): { components: RecurringComponent[]; notes: string[] } {
  const { start, end } = periodBounds(input.period);
  const from = input.joinDate && input.joinDate > start ? input.joinDate : start;
  const to = input.exitDate && input.exitDate < end ? input.exitDate : end;
  if (from > to) return { components: [], notes: [] };

  const records = [...input.records].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const employedDays = daysBetweenInclusive(from, to);

  // Boundaries: the window start, plus every record that begins inside it.
  const boundaries = [from, ...records.map((r) => r.effectiveFrom).filter((date) => date > from && date <= to)];
  const unique = [...new Set(boundaries)].sort();

  const totals = new Map<string, { component: RecurringComponent; weighted: number }>();
  const notes: string[] = [];
  let uncoveredDays = 0;

  unique.forEach((segmentStart, index) => {
    const segmentEnd = index + 1 < unique.length ? addDays(unique[index + 1], -1) : to;
    const days = daysBetweenInclusive(segmentStart, segmentEnd);
    const inForce = [...records].reverse().find((record) => record.effectiveFrom <= segmentStart);

    if (!inForce) {
      uncoveredDays += days;
      return;
    }

    for (const component of inForce.components) {
      const entry = totals.get(component.code) ?? { component, weighted: 0 };
      // The most recent record's label and flags describe the component.
      entry.component = component;
      entry.weighted += component.amountKobo * days;
      totals.set(component.code, entry);
    }
  });

  const changes = records.map((r) => r.effectiveFrom).filter((date) => date > from && date <= to);
  if (changes.length) {
    notes.push(`Pay changed on ${changes.join(", ")}; each rate is paid for the days it applied.`);
  }
  if (uncoveredDays > 0 && totals.size) {
    notes.push(`No pay was on record for ${uncoveredDays} employed day${uncoveredDays === 1 ? "" : "s"} this period, so nothing is paid for them.`);
  }

  const components = [...totals.values()].map(({ component, weighted }) => ({
    ...component,
    amountKobo: Math.round(weighted / employedDays),
  }));

  return { components, notes };
}

export type CompensationInput = {
  effectiveFrom?: unknown;
  reason?: unknown;
  grade?: unknown;
  components?: Array<{
    code?: unknown;
    label?: unknown;
    amount?: unknown;
    taxable?: unknown;
    pensionable?: unknown;
    isBasic?: unknown;
  }>;
};

const CODE = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Validates a new compensation record typed in naira by a person.
 *
 * Exactly one component must be basic salary, because NHF is charged on basic
 * and there is no defensible way to guess which component that is.
 */
export function validateCompensation(input: CompensationInput):
  | { ok: true; record: { effectiveFrom: string; reason: string | null; grade: string | null; components: RecurringComponent[] } }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const effectiveFrom = typeof input.effectiveFrom === "string" ? input.effectiveFrom : "";
  if (!isCalendarDate(effectiveFrom)) {
    errors.push("Choose the date this pay takes effect.");
  }

  const raw = Array.isArray(input.components) ? input.components : [];
  if (!raw.length) errors.push("Add at least one pay component.");
  if (raw.length > 30) errors.push("Keep it to 30 components or fewer.");

  const components: RecurringComponent[] = [];
  const seen = new Set<string>();

  raw.forEach((entry, index) => {
    const at = `Component ${index + 1}`;
    const code = typeof entry.code === "string" ? entry.code.trim().toLowerCase() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const amount = Number(entry.amount);

    if (!CODE.test(code)) errors.push(`${at}: use a short code of lowercase letters, numbers and underscores.`);
    else if (seen.has(code)) errors.push(`${at}: the code "${code}" is used twice.`);
    seen.add(code);

    if (label.length < 2 || label.length > 80) errors.push(`${at}: give it a name between 2 and 80 characters.`);
    if (!Number.isFinite(amount) || amount < 0) errors.push(`${at}: the amount must be zero or more.`);
    else if (amount > 1_000_000_000) errors.push(`${at}: that amount is larger than Pulse accepts for one month.`);

    if (Number.isFinite(amount) && amount >= 0 && CODE.test(code)) {
      components.push({
        code,
        label: label || code,
        amountKobo: toKobo(amount),
        taxable: entry.taxable !== false,
        pensionable: entry.pensionable === true,
        isBasic: entry.isBasic === true,
      });
    }
  });

  const basics = components.filter((component) => component.isBasic).length;
  if (raw.length && basics !== 1) {
    errors.push(
      basics === 0
        ? "Mark one component as basic salary. National Housing Fund is charged on basic, and Pulse will not guess which component that is."
        : "Only one component can be basic salary.",
    );
  }

  if (components.length && components.every((component) => component.amountKobo === 0)) {
    errors.push("At least one component needs an amount above zero.");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    record: {
      effectiveFrom,
      reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 300) : null,
      grade: typeof input.grade === "string" && input.grade.trim() ? input.grade.trim().slice(0, 60) : null,
      components,
    },
  };
}

export type ProfileRow = {
  tax_state: string | null;
  tin: string | null;
  pfa_name: string | null;
  rsa_pin: string | null;
  nhf_number: string | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  annual_rent_kobo: number | null;
  nhis_monthly_kobo: number | null;
  life_assurance_annual_kobo: number | null;
  pension_exempt: boolean | null;
  nhf_exempt: boolean | null;
  exit_date: string | null;
};

/** A stored profile as the engine sees it. A missing profile is an empty one. */
export function toPayrollProfile(row: ProfileRow | null, defaultTaxState: string | null): PayrollProfile {
  return {
    taxState: row?.tax_state || defaultTaxState || null,
    annualRentKobo: Number(row?.annual_rent_kobo ?? 0),
    nhisMonthlyKobo: Number(row?.nhis_monthly_kobo ?? 0),
    lifeAssuranceAnnualKobo: Number(row?.life_assurance_annual_kobo ?? 0),
    pensionExempt: Boolean(row?.pension_exempt),
    nhfExempt: Boolean(row?.nhf_exempt),
    hasBankDetails: Boolean(row?.account_number && row?.bank_name),
    hasPensionDetails: Boolean(row?.pfa_name && row?.rsa_pin),
    hasTin: Boolean(row?.tin),
  };
}

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

/**
 * Validates a payroll profile typed by a person.
 *
 * Amounts arrive in naira and leave in kobo. A tax state must be a real state,
 * because PAYE is remitted to it and a typo would send the money nowhere.
 */
export function validateProfile(input: Record<string, unknown>):
  | { ok: true; row: Omit<ProfileRow, never> }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const text = (key: string, max: number): string | null => {
    const value = input[key];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string") {
      errors.push(`${key} must be text.`);
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) errors.push(`${key} is too long.`);
    return trimmed || null;
  };
  const naira = (key: string): number => {
    const value = input[key];
    if (value === null || value === undefined || value === "") return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push(`${key} must be zero or more.`);
      return 0;
    }
    return toKobo(amount);
  };

  const taxState = text("taxState", 40);
  if (taxState && !(NIGERIAN_STATES as readonly string[]).includes(taxState)) {
    errors.push("Tax state must be one of Nigeria's 36 states or the FCT.");
  }

  const accountNumber = text("accountNumber", 10);
  if (accountNumber && !/^\d{10}$/.test(accountNumber)) {
    errors.push("A Nigerian bank account number (NUBAN) is exactly 10 digits.");
  }

  const exitDate = text("exitDate", 10);
  if (exitDate && !isCalendarDate(exitDate)) errors.push("Exit date must be a real date.");

  const row: ProfileRow = {
    tax_state: taxState,
    tin: text("tin", 30),
    pfa_name: text("pfaName", 120),
    rsa_pin: text("rsaPin", 30),
    nhf_number: text("nhfNumber", 30),
    bank_name: text("bankName", 80),
    bank_code: text("bankCode", 10),
    account_number: accountNumber,
    account_name: text("accountName", 120),
    annual_rent_kobo: naira("annualRent"),
    nhis_monthly_kobo: naira("nhisMonthly"),
    life_assurance_annual_kobo: naira("lifeAssuranceAnnual"),
    pension_exempt: input.pensionExempt === true,
    nhf_exempt: input.nhfExempt === true,
    exit_date: exitDate,
  };

  if ((row.account_number && !row.bank_name) || (!row.account_number && row.bank_name)) {
    errors.push("Give both the bank and the account number, or neither.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, row };
}
