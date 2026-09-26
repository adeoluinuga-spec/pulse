import { toKobo } from "./payrollMoney.ts";
import type { RecurringComponent } from "./payrollGrossToNet.ts";

export type SalaryComponent = {
  code: string;
  label: string;
  percentBps: number;
  taxable: boolean;
  pensionable: boolean;
  isBasic: boolean;
};

const CODE = /^[a-z][a-z0-9_]{1,39}$/;

export function validateSalaryStructure(value: unknown):
  | { ok: true; components: SalaryComponent[] }
  | { ok: false; errors: string[] } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    return { ok: false, errors: ["Add between 1 and 30 salary components."] };
  }
  const errors: string[] = [];
  const codes = new Set<string>();
  const components: SalaryComponent[] = [];
  value.forEach((raw, index) => {
    const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const code = typeof entry.code === "string" ? entry.code.trim().toLowerCase() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const percent = Number(entry.percent);
    const at = `Component ${index + 1}`;
    if (!CODE.test(code)) errors.push(`${at}: use a short code of lowercase letters, numbers and underscores.`);
    if (codes.has(code)) errors.push(`${at}: the code is repeated.`);
    codes.add(code);
    if (label.length < 2 || label.length > 80) errors.push(`${at}: give it a name between 2 and 80 characters.`);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100 || Math.abs(Math.round(percent * 100) - percent * 100) > 1e-7) {
      errors.push(`${at}: enter a percentage greater than zero, with at most two decimal places.`);
    }
    if (typeof entry.taxable !== "boolean" || typeof entry.pensionable !== "boolean" || typeof entry.isBasic !== "boolean") {
      errors.push(`${at}: confirm its taxable, pensionable and basic settings.`);
    }
    if (CODE.test(code) && label.length >= 2 && label.length <= 80 && Number.isFinite(percent) && percent > 0 && percent <= 100) {
      components.push({ code, label, percentBps: Math.round(percent * 100), taxable: entry.taxable === true, pensionable: entry.pensionable === true, isBasic: entry.isBasic === true });
    }
  });
  if (components.filter((entry) => entry.isBasic).length !== 1) errors.push("Mark exactly one component as basic salary.");
  const total = components.reduce((sum, entry) => sum + entry.percentBps, 0);
  if (total !== 10_000) errors.push(`Percentages must add to 100%. They currently add to ${(total / 100).toFixed(2)}%.`);
  return errors.length ? { ok: false, errors } : { ok: true, components };
}

export function splitAnnualGross(annualGrossNaira: number, structure: SalaryComponent[]): {
  annualGrossKobo: number;
  monthlyGrossKobo: number;
  components: RecurringComponent[];
} {
  if (!Number.isFinite(annualGrossNaira) || annualGrossNaira <= 0 || annualGrossNaira > 12_000_000_000) {
    throw new Error("Annual gross must be a positive amount within the supported payroll range.");
  }
  if (!structure.length || structure.reduce((sum, entry) => sum + entry.percentBps, 0) !== 10_000) {
    throw new Error("The organisation salary structure is incomplete.");
  }
  const annualGrossKobo = toKobo(annualGrossNaira);
  const monthlyGrossKobo = Math.round(annualGrossKobo / 12);
  let assigned = 0;
  const components = structure.map((entry, index) => {
    const amountKobo = index === structure.length - 1 ? monthlyGrossKobo - assigned : Math.round(monthlyGrossKobo * entry.percentBps / 10_000);
    assigned += amountKobo;
    return { code: entry.code, label: entry.label, amountKobo, taxable: entry.taxable, pensionable: entry.pensionable, isBasic: entry.isBasic };
  });
  return { annualGrossKobo, monthlyGrossKobo, components };
}
