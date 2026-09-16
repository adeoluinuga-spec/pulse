/**
 * Files that leave Pulse after a run is approved: the bank payment schedule
 * and the statutory remittance schedules.
 *
 * Pulse never pays anybody and never files with a tax authority. It hands a
 * finance team files to upload to their bank and to send to each state IRS,
 * pension administrator and the NHF — so the files have to be right, and they
 * have to be safe to open.
 *
 * Safe to open matters more here than anywhere else in the product. These CSVs
 * contain text that employees typed themselves — their account name, their
 * bank — and spreadsheet software executes a cell beginning with `=`, `+`, `-`
 * or `@` as a formula. An account name of `=HYPERLINK(...)` would run on the
 * finance officer's machine. Every text cell is neutralised; numbers are left
 * exactly as numbers so a bank upload still parses.
 */

import { nairaString } from "./payrollMoney.ts";

export type ExportLine = {
  employeeId: string;
  name: string;
  included: boolean;
  grossKobo: number;
  payeKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfKobo: number;
  netKobo: number;
  basicKobo: number;
  taxState: string | null;
};

export type ExportProfile = {
  tin: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  pfaName: string | null;
  rsaPin: string | null;
  nhfNumber: string | null;
};

type Omitted = { name: string; reason: string };

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** One CSV cell. Neutralises formulas in text; leaves real numbers alone. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

const monthName = (month: number) =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

export function periodLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

/**
 * The file a bank ingests to pay salaries.
 *
 * Anybody who cannot be paid by transfer is left off and listed separately, so
 * finance sees exactly who needs paying another way instead of discovering it
 * when somebody reports an empty account.
 */
export function bankSchedule(input: {
  lines: ExportLine[];
  profiles: Map<string, ExportProfile>;
  year: number;
  month: number;
}): { csv: string; omitted: Omitted[]; totalKobo: number; count: number } {
  const omitted: Omitted[] = [];
  const rows: unknown[][] = [];
  let totalKobo = 0;
  const narration = `Salary ${periodLabel(input.year, input.month)}`;

  for (const line of input.lines.filter((l) => l.included)) {
    const profile = input.profiles.get(line.employeeId);
    if (line.netKobo <= 0) {
      omitted.push({ name: line.name, reason: "Net pay is zero or less." });
      continue;
    }
    if (!profile?.accountNumber || !profile.bankName) {
      omitted.push({ name: line.name, reason: "No bank account on record." });
      continue;
    }
    rows.push([
      profile.accountName || line.name,
      profile.accountNumber,
      profile.bankName,
      profile.bankCode ?? "",
      nairaString(line.netKobo),
      narration,
    ]);
    totalKobo += line.netKobo;
  }

  return {
    csv: toCsv(["Account name", "Account number", "Bank", "Bank code", "Amount (NGN)", "Narration"], rows),
    omitted,
    totalKobo,
    count: rows.length,
  };
}

/**
 * PAYE by state.
 *
 * PAYE is remitted to the state where the employee lives, not where the office
 * is, so one run can owe several state IRS offices. The file is sorted by state
 * so each office's rows sit together, and the totals are returned per state.
 */
export function payeSchedule(input: {
  lines: ExportLine[];
  profiles: Map<string, ExportProfile>;
  year: number;
  month: number;
}): { csv: string; byState: Array<{ state: string; payeKobo: number; headcount: number }>; omitted: Omitted[] } {
  const omitted: Omitted[] = [];
  const byState = new Map<string, { payeKobo: number; headcount: number }>();
  const eligible = input.lines.filter((line) => line.included && line.payeKobo > 0);

  const rows = eligible
    .filter((line) => {
      if (!line.taxState) {
        omitted.push({ name: line.name, reason: "No tax state recorded." });
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.taxState as string).localeCompare(b.taxState as string) || a.name.localeCompare(b.name))
    .map((line) => {
      const state = line.taxState as string;
      const bucket = byState.get(state) ?? { payeKobo: 0, headcount: 0 };
      bucket.payeKobo += line.payeKobo;
      bucket.headcount += 1;
      byState.set(state, bucket);
      return [
        state,
        line.name,
        input.profiles.get(line.employeeId)?.tin ?? "",
        periodLabel(input.year, input.month),
        nairaString(line.grossKobo),
        nairaString(line.payeKobo),
      ];
    });

  return {
    csv: toCsv(["State", "Employee", "TIN", "Period", "Gross pay (NGN)", "PAYE (NGN)"], rows),
    byState: [...byState.entries()].map(([state, totals]) => ({ state, ...totals })).sort((a, b) => a.state.localeCompare(b.state)),
    omitted,
  };
}

/** Pension contributions, grouped by pension fund administrator. */
export function pensionSchedule(input: {
  lines: ExportLine[];
  profiles: Map<string, ExportProfile>;
  year: number;
  month: number;
}): { csv: string; omitted: Omitted[]; totalKobo: number } {
  const omitted: Omitted[] = [];
  let totalKobo = 0;

  const rows = input.lines
    .filter((line) => line.included && (line.pensionEmployeeKobo > 0 || line.pensionEmployerKobo > 0))
    .filter((line) => {
      const profile = input.profiles.get(line.employeeId);
      if (!profile?.pfaName || !profile.rsaPin) {
        omitted.push({ name: line.name, reason: "No PFA or RSA PIN recorded." });
        return false;
      }
      return true;
    })
    .map((line) => ({ line, profile: input.profiles.get(line.employeeId) as ExportProfile }))
    .sort((a, b) => (a.profile.pfaName as string).localeCompare(b.profile.pfaName as string) || a.line.name.localeCompare(b.line.name))
    .map(({ line, profile }) => {
      const total = line.pensionEmployeeKobo + line.pensionEmployerKobo;
      totalKobo += total;
      return [
        profile.pfaName,
        profile.rsaPin,
        line.name,
        periodLabel(input.year, input.month),
        nairaString(line.pensionEmployeeKobo),
        nairaString(line.pensionEmployerKobo),
        nairaString(total),
      ];
    });

  return {
    csv: toCsv(["PFA", "RSA PIN", "Employee", "Period", "Employee (NGN)", "Employer (NGN)", "Total (NGN)"], rows),
    omitted,
    totalKobo,
  };
}

/** National Housing Fund contributions. */
export function nhfSchedule(input: {
  lines: ExportLine[];
  profiles: Map<string, ExportProfile>;
  year: number;
  month: number;
}): { csv: string; omitted: Omitted[]; totalKobo: number } {
  const omitted: Omitted[] = [];
  let totalKobo = 0;

  const rows = input.lines
    .filter((line) => line.included && line.nhfKobo > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((line) => {
      const number = input.profiles.get(line.employeeId)?.nhfNumber ?? "";
      if (!number) omitted.push({ name: line.name, reason: "No NHF number recorded — included, but the number is blank." });
      totalKobo += line.nhfKobo;
      return [number, line.name, periodLabel(input.year, input.month), nairaString(line.basicKobo), nairaString(line.nhfKobo)];
    });

  return {
    csv: toCsv(["NHF number", "Employee", "Period", "Basic salary (NGN)", "Contribution (NGN)"], rows),
    omitted,
    totalKobo,
  };
}
