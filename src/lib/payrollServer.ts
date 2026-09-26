/**
 * Server-side plumbing shared by every payroll route.
 *
 * Every payroll table is closed to the browser roles, so these routes are the
 * only way in, and they all read and write with the service-role client —
 * which bypasses row-level security entirely. The organisation check in
 * `payrollContext` is therefore the tenant boundary for salaries, and every
 * query below is scoped by `org_id` explicitly rather than trusting an id from
 * the request to belong to the caller.
 *
 * Failure rule: anything a payroll control depends on — settings, the run, its
 * lines, who has worked on it, the audit log — throws when it cannot be read or
 * written. A control that silently falls back to "no blockers", "nobody has
 * touched this run" or "default settings" is not a control. Routes turn the
 * thrown error into a 503 and nothing is changed.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import {
  calculatePayLine,
  periodBounds,
  totalsFor,
  type Adjustment,
  type EmployeePayInput,
  type PayLine,
  type PayrollSettings,
  type RecurringComponent,
} from "@/lib/payrollGrossToNet";
import {
  compensationForPeriod,
  paymentSnapshotFrom,
  toPayrollProfile,
  type PaymentSnapshot,
  type ProfileRow,
} from "@/lib/payrollInputs";
import { ruleSetFor, type RuleSet } from "@/lib/payrollRules";
import { fingerprint, payrollCapabilities, type PayrollActor, type RunState, type RunStatus } from "@/lib/payrollWorkflow";

export type Admin = SupabaseClient;

export const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE });
}

export function getAdmin(): Admin {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Raised when data a payroll control depends on could not be read or written. */
export class PayrollControlError extends Error {
  constructor(what: string, cause?: { message?: string }) {
    super(`Payroll could not ${what}. Please retry.`);
    this.name = "PayrollControlError";
    if (cause?.message) this.cause = cause.message;
  }
}

/** A thrown control failure, as the response a person sees. */
export function controlFailure(thrown: unknown) {
  if (thrown instanceof PayrollControlError) return reply({ error: thrown.message }, 503);
  return reply({ error: thrown instanceof Error ? thrown.message : "Payroll could not complete that. Please retry." }, 500);
}

/**
 * A route handler whose thrown control failures become a clear response
 * instead of an unexplained crash.
 */
export function handled<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (thrown) {
      return controlFailure(thrown);
    }
  };
}

const PAGE = 1000;

/**
 * Every row a query matches, a page at a time.
 *
 * PostgREST caps a single response. For most screens a truncated list is an
 * inconvenience; for payroll it is somebody silently left unpaid, so every
 * payroll read that can grow with the organisation goes through here.
 */
export async function readAll<T>(
  what: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new PayrollControlError(`read ${what}`, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export type PayrollContext = {
  admin: Admin;
  orgId: string;
  actor: PayrollActor;
  actorName: string;
  can: ReturnType<typeof payrollCapabilities>;
};

/** Who is asking, and what payroll lets them do. */
export async function payrollContext(): Promise<{ ok: true; ctx: PayrollContext } | { ok: false; response: NextResponse }> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: reply({ error: "Sign in to use payroll." }, 401) };

  const admin = getAdmin();
  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id, org_id, name, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; name: string | null; platform_role: string | null }>();

  if (employeeError) return { ok: false, response: controlFailure(new PayrollControlError("confirm who you are", employeeError)) };
  if (!employee?.org_id) {
    return { ok: false, response: reply({ error: "Your account is not linked to an organisation." }, 403) };
  }

  const { data: grant, error: grantError } = await admin
    .from("payroll_permissions")
    .select("can_prepare, can_approve, can_view_all")
    .eq("org_id", employee.org_id)
    .eq("employee_id", employee.id)
    .maybeSingle<{ can_prepare: boolean; can_approve: boolean; can_view_all: boolean }>();

  if (grantError) return { ok: false, response: controlFailure(new PayrollControlError("read your payroll access", grantError)) };

  const actor: PayrollActor = {
    employeeId: employee.id,
    platformRole: employee.platform_role,
    grant: grant ? { canPrepare: grant.can_prepare, canApprove: grant.can_approve, canViewAll: grant.can_view_all } : null,
  };

  return {
    ok: true,
    ctx: { admin, orgId: employee.org_id, actor, actorName: employee.name ?? "Someone", can: payrollCapabilities(actor) },
  };
}

export type SettingsView = {
  settings: PayrollSettings;
  defaultTaxState: string | null;
  payDay: number | null;
  stored: boolean;
  salaryStructure: import("./payrollSalaryStructure.ts").SalaryComponent[] | null;
  salaryStructureVersion: number;
};

/**
 * The organisation's payroll settings, or defaults if none have been saved.
 *
 * Defaults apply only when there is genuinely no saved row. A failed read
 * throws: substituting defaults would quietly switch pension or ITF back on for
 * an organisation that turned them off, and every figure in the run would move.
 */
export async function loadSettings(admin: Admin, orgId: string): Promise<SettingsView> {
  const [settings, headcount] = await Promise.all([
    admin
      .from("payroll_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle<{
        pension_enabled: boolean;
        nhf_enabled: boolean;
        nsitf_enabled: boolean;
        itf_enabled: boolean;
        default_tax_state: string | null;
        pay_day: number | null;
        salary_structure?: import("./payrollSalaryStructure.ts").SalaryComponent[] | null;
        salary_structure_version?: number;
      }>(),
    admin.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  if (settings.error) throw new PayrollControlError("read payroll settings", settings.error);
  if (headcount.error) throw new PayrollControlError("count staff", headcount.error);

  const data = settings.data;
  if (data) {
    return {
      settings: {
        pensionEnabled: data.pension_enabled,
        nhfEnabled: data.nhf_enabled,
        nsitfEnabled: data.nsitf_enabled,
        itfEnabled: data.itf_enabled,
      },
      defaultTaxState: data.default_tax_state,
      payDay: data.pay_day,
      stored: true,
      salaryStructure: data.salary_structure ?? null,
      salaryStructureVersion: data.salary_structure_version ?? 0,
    };
  }

  // ITF defaults on only at five or more staff, the statutory threshold — a
  // starting point for a person to confirm, not a legal judgement.
  return {
    settings: { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: (headcount.count ?? 0) >= 5 },
    defaultTaxState: null,
    payDay: null,
    stored: false,
    salaryStructure: null,
    salaryStructureVersion: 0,
  };
}

export type RunRow = {
  id: string;
  org_id: string;
  period_year: number;
  period_month: number;
  status: RunStatus;
  rule_set_id: string | null;
  totals: Record<string, number>;
  input_fingerprint: string | null;
  calculated_at: string | null;
  calculated_by: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  returned_reason: string | null;
  revision: number;
  created_at: string;
};

export const RUN_COLUMNS =
  "id, org_id, period_year, period_month, status, rule_set_id, totals, input_fingerprint, calculated_at, calculated_by, submitted_at, submitted_by, approved_at, approved_by, returned_reason, revision, created_at";

/** The run, or null if it does not exist in this organisation. Throws if it could not be read. */
export async function loadRun(admin: Admin, orgId: string, runId: string): Promise<RunRow | null> {
  const { data, error } = await admin.from("payroll_runs").select(RUN_COLUMNS).eq("id", runId).eq("org_id", orgId).maybeSingle<RunRow>();
  if (error) throw new PayrollControlError("read the payroll run", error);
  return data ?? null;
}

type AdjustmentRow = {
  id: string;
  employee_id: string;
  label: string;
  kind: "earning" | "deduction";
  amount_kobo: number;
  taxable: boolean;
  pensionable: boolean;
};

export type RunInputs = {
  ruleSet: RuleSet;
  settings: PayrollSettings;
  employees: EmployeePayInput[];
  notesByEmployee: Map<string, string[]>;
  /** Where each person's money and contributions go, frozen with the calculation. */
  snapshots: Map<string, PaymentSnapshot>;
  fingerprint: string;
};

/**
 * Everything a run's figures and payments depend on, gathered for one period.
 *
 * Only people with a compensation record are on payroll at all; somebody with
 * none is simply not set up yet, and blocking every run on them would stop an
 * organisation paying anybody until everybody was entered.
 *
 * The fingerprint covers payment destinations as well as pay. Changing a bank
 * account after calculating makes the calculation stale, so the change has to
 * be recalculated and seen by an approver before any money can go there.
 */
export async function loadRunInputs(admin: Admin, orgId: string, run: Pick<RunRow, "id" | "period_year" | "period_month">): Promise<RunInputs> {
  const period = { year: run.period_year, month: run.period_month };
  const { end } = periodBounds(period);
  const ruleSet = ruleSetFor(end);

  const [settingsView, employees, compensation, profiles, adjustments] = await Promise.all([
    loadSettings(admin, orgId),
    readAll<{ id: string; name: string | null; join_date: string | null }>("staff", (from, to) =>
      admin.from("employees").select("id, name, join_date").eq("org_id", orgId).order("id").range(from, to),
    ),
    readAll<{ employee_id: string; effective_from: string; components: RecurringComponent[] }>("pay records", (from, to) =>
      admin.from("employee_compensation").select("employee_id, effective_from, components").eq("org_id", orgId).order("id").range(from, to),
    ),
    readAll<ProfileRow & { employee_id: string }>("payroll details", (from, to) =>
      admin
        .from("employee_payroll_profiles")
        .select("employee_id, tax_state, tin, pfa_name, rsa_pin, nhf_number, bank_name, bank_code, account_number, account_name, annual_rent_kobo, nhis_monthly_kobo, life_assurance_annual_kobo, pension_exempt, nhf_exempt, exit_date")
        .eq("org_id", orgId)
        .order("employee_id")
        .range(from, to),
    ),
    readAll<AdjustmentRow>("adjustments", (from, to) =>
      admin
        .from("payroll_adjustments")
        .select("id, employee_id, label, kind, amount_kobo, taxable, pensionable")
        .eq("org_id", orgId)
        .eq("run_id", run.id)
        .order("id")
        .range(from, to),
    ),
  ]);

  const recordsBy = new Map<string, Array<{ effectiveFrom: string; components: RecurringComponent[] }>>();
  for (const row of compensation) {
    const list = recordsBy.get(row.employee_id) ?? [];
    list.push({ effectiveFrom: row.effective_from, components: row.components });
    recordsBy.set(row.employee_id, list);
  }

  const profileBy = new Map(profiles.map((row) => [row.employee_id, row]));
  const adjustmentsBy = new Map<string, Adjustment[]>();
  for (const row of adjustments) {
    const list = adjustmentsBy.get(row.employee_id) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      kind: row.kind,
      amountKobo: Number(row.amount_kobo),
      taxable: row.taxable,
      pensionable: row.pensionable,
    });
    adjustmentsBy.set(row.employee_id, list);
  }

  const inputs: EmployeePayInput[] = [];
  const notesByEmployee = new Map<string, string[]>();
  const snapshots = new Map<string, PaymentSnapshot>();

  for (const employee of [...employees].sort((a, b) => a.id.localeCompare(b.id))) {
    const records = recordsBy.get(employee.id);
    const extra = adjustmentsBy.get(employee.id) ?? [];
    if (!records?.length && !extra.length) continue;

    const profileRow = profileBy.get(employee.id) ?? null;
    const exitDate = profileRow?.exit_date ?? null;
    const { components, notes } = compensationForPeriod({ records: records ?? [], period, joinDate: employee.join_date, exitDate });

    if (!components.length && !extra.length) continue;

    inputs.push({
      employeeId: employee.id,
      name: employee.name ?? "Unnamed",
      components,
      adjustments: extra.sort((a, b) => a.id.localeCompare(b.id)),
      profile: toPayrollProfile(profileRow, settingsView.defaultTaxState),
      joinDate: employee.join_date,
      exitDate,
    });
    snapshots.set(employee.id, paymentSnapshotFrom(profileRow));
    if (notes.length) notesByEmployee.set(employee.id, notes);
  }

  return {
    ruleSet,
    settings: settingsView.settings,
    employees: inputs,
    notesByEmployee,
    snapshots,
    fingerprint: fingerprint({
      ruleSetId: ruleSet.id,
      settings: settingsView.settings,
      period,
      employees: inputs,
      destinations: inputs.map((input) => [input.employeeId, snapshots.get(input.employeeId)]),
    }),
  };
}

export function calculateLines(inputs: RunInputs, run: Pick<RunRow, "period_year" | "period_month">): PayLine[] {
  const period = { year: run.period_year, month: run.period_month };
  return inputs.employees
    .map((employee) => {
      const line = calculatePayLine({ employee, period, ruleSet: inputs.ruleSet, settings: inputs.settings });
      const notes = inputs.notesByEmployee.get(employee.employeeId);
      return notes ? { ...line, warnings: [...notes, ...line.warnings] } : line;
    })
    .filter((line) => line.included);
}

/** Lines as the database stores them: the calculation plus the frozen payment destination. */
export function linesForStorage(lines: PayLine[], inputs: RunInputs) {
  return lines.map((line) => ({ ...line, paymentSnapshot: inputs.snapshots.get(line.employeeId) ?? paymentSnapshotFrom(null) }));
}

export { totalsFor };

/**
 * People who have worked on a run. None of them may approve or return it.
 *
 * Asks the database, which is the same function the approval transaction
 * enforces — so what the page shows and what the database refuses cannot
 * disagree. Throws rather than returning nobody if it cannot be read.
 */
export async function contributorsOf(admin: Admin, runId: string): Promise<string[]> {
  const { data, error } = await admin.rpc("payroll_contributors", { p_run: runId });
  if (error) throw new PayrollControlError("confirm who has worked on this run", error);
  return (data as string[] | null) ?? [];
}

/** Everything the workflow needs to decide an action on a run, read fresh. */
export async function runStateFor(admin: Admin, orgId: string, run: RunRow): Promise<{ state: RunState; inputs: RunInputs | null }> {
  const [contributorIds, lines] = await Promise.all([
    contributorsOf(admin, run.id),
    readAll<{ blockers: string[] }>("the run's lines", (from, to) =>
      admin.from("payroll_run_lines").select("blockers").eq("org_id", orgId).eq("run_id", run.id).order("id").range(from, to),
    ),
  ]);

  // Approved and voided runs are frozen: their inputs are history, and
  // recomputing them against today's records would say nothing useful.
  const live = run.status === "draft" || run.status === "submitted";
  const inputs = live ? await loadRunInputs(admin, orgId, run) : null;

  return {
    inputs,
    state: {
      status: run.status,
      contributorIds,
      blockerCount: lines.reduce((sum, line) => sum + (Array.isArray(line.blockers) ? line.blockers.length : 0), 0),
      hasBeenCalculated: Boolean(run.calculated_at),
      calculationIsCurrent: inputs ? inputs.fingerprint === run.input_fingerprint : true,
    },
  };
}

/**
 * Records an event. Throws if it cannot.
 *
 * Events that decide who may approve a run are written inside the database
 * functions that make the change, so they commit or fail together. This is for
 * the rest — settings, access, profiles, pay records, downloads — where an
 * unrecorded change is still a failure somebody needs to know about.
 */
export async function logEvent(admin: Admin, input: { orgId: string; runId: string | null; actorId: string; action: string; payload?: Record<string, unknown> }) {
  const { error } = await admin.from("payroll_events").insert({
    org_id: input.orgId,
    run_id: input.runId,
    actor_id: input.actorId,
    action: input.action,
    payload: input.payload ?? {},
  });
  if (error) throw new PayrollControlError("record this change in the audit log", error);
}

/** Whether an employee id belongs to the caller's organisation. The tenant check for every per-person route. */
export async function employeeInOrg(admin: Admin, orgId: string, employeeId: string) {
  const { data, error } = await admin
    .from("employees")
    .select("id, name, email, department, join_date")
    .eq("id", employeeId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string | null; email: string | null; department: string | null; join_date: string | null }>();
  if (error) throw new PayrollControlError("confirm that person belongs to your organisation", error);
  return data ?? null;
}

/** Maps a Postgres error from a guard or function to a status a person can act on. */
export function databaseFailure(error: { code?: string; message?: string }) {
  if (error.code === "40001") return reply({ error: error.message }, 409);
  if (error.code === "42501") return reply({ error: error.message }, 403);
  if (error.code === "22023" || error.code === "23514") return reply({ error: error.message }, 422);
  if (error.code === "23505") return reply({ error: error.message?.includes("already in a payroll run") ? error.message : "That already exists." }, 409);
  if (error.code === "P0002") return reply({ error: error.message }, 404);
  return reply({ error: "Payroll could not be saved. Please retry." }, 500);
}
