/**
 * Small helpers shared by the payroll screens.
 *
 * Money arrives from the API in kobo and is only ever turned into naira here,
 * for display. Nothing in the browser does payroll arithmetic.
 */

import { formatNaira } from "@/lib/payrollMoney";

export const naira = formatNaira;

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  void: "Voided",
};

export type ApiError = Error & { errors?: string[]; status?: number };

/** Fetches JSON and turns a failed response into an Error carrying the server's reasons. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed (${response.status})`) as ApiError;
    error.errors = body.errors;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function errorParts(thrown: unknown): { message: string; errors: string[] } {
  if (thrown instanceof Error) return { message: thrown.message, errors: (thrown as ApiError).errors ?? [] };
  return { message: "Something went wrong.", errors: [] };
}
