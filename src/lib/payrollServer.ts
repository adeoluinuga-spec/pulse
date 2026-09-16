/**
 * Server-side plumbing shared by every payroll route.
 *
 * Every payroll table is closed to the browser roles, so these routes are the
 * only way in, and they all read and write with the service-role client —
 * which bypasses row-level security entirely. The organisation check in
 * `payrollContext` is therefore the tenant boundary for salaries, and every
 * query below is scoped by `org_id` explicitly rather than trusting an id from
 * the request to belong to the caller.
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
import { compensationForPeriod, toPayrollProfile, type ProfileRow } from "@/lib/payrollInputs";
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
  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, name, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; name: string | null; platform_role: string | null }>();

  if (!employee?.org_id) {
    return { ok: false, response: reply({ error: "Your account is not linked to an organisation." }, 403) };
  }

  const { data: grant } = await admin
    .from("payroll_permissions")
    .select("can_prepare, can_approve, can_view_all")
    .eq("org_id", employee.org_id)
    .eq("employee_id", employee.id)
    .maybeSingle<{ can_prepare: boolean; can_approve: boolean; can_view_all: boolean }>();

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
};

/**
 * The organisation's payroll settings, or sensible defaults if none are saved.
 *
 * ITF defaults on only for five or more staff, the statutory threshold. The
 * default is a starting point for a person to confirm, not a legal judgement.
 */
export async function loadSettings(admin: Admin, orgId: string): Promise<SettingsView> {
  const [{ data }, { count }] = await Promise.all([
    admin
      .from("payroll_settings")
      .select("pension_enabled, nhf_enabled, nsitf_enabled, itf_enabled, default_tax_state, pay_day")
      .eq("org_id", orgId)
      .maybeSingle<{
        pension_enabled: boolean;
        nhf_enabled: boolean;
        nsitf_enabled: boolean;
        itf_enabled: boolean;
        default_tax_state: string | null;
        pay_day: number | null;
      }>(),
    admin.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

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
    };
  }

  return {
    settings: { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: (count ?? 0) >= 5 },
    defaultTaxState: null,
    payDay: null,
    stored: false,
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

export async function loadRun(admin: Admin, orgId: string, runId: string): Promise<RunRow | null> {
  const { data } = await admin.from("payroll_runs").select(RUN_COLUMNS).eq("id", runId).eq("org_id", orgId).maybeSingle<RunRow>();
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
  fingerprint: string;
  profiles: Map<string, ProfileRow>;
};

/**
 * Everything a run's figures depend on, gathered for one period.
 *
 * Only people with a compensation record are on payroll at all; somebody with
 * none is simply not set up yet, and blocking every run on them would stop an
 * organisation paying anybody until everybody was entered.
 */
export async function loadRunInputs(admin: Admin, orgId: string, run: Pick<RunRow, "id" | "period_year" | "period_month">): Promise<RunInputs> {
  const period = { year: run.period_year, month: run.period_month };
  const { end } = periodBounds(period);
  const ruleSet = ruleSetFor(end);

  const [settingsView, employees, compensation, profiles, adjustments] = await Promise.all([
    loadSettings(admin, orgId),
    admin.from("employees").select("id, name, join_date").eq("org_id", orgId).returns<Array<{ id: string; name: string | null; join_date: string | null }>>(),
    admin
      .from("employee_compensation")
      .select("employee_id, effective_from, components")
      .eq("org_id", orgId)
      .returns<Array<{ employee_id: string; effective_from: string; components: RecurringComponent[] }>>(),
    admin
      .from("employee_payroll_profiles")
      .select("employee_id, tax_state, tin, pfa_name, rsa_pin, nhf_number, bank_name, bank_code, account_number, account_name, annual_rent_kobo, nhis_monthly_kobo, life_assurance_annual_kobo, pension_exempt, nhf_exempt, exit_date")
      .eq("org_id", orgId)
      .returns<Array<ProfileRow & { employee_id: string }>>(),
    admin
      .from("payroll_adjustments")
      .select("id, employee_id, label, kind, amount_kobo, taxable, pensionable")
      .eq("org_id", orgId)
      .eq("run_id", run.id)
      .returns<AdjustmentRow[]>(),
  ]);

  for (const result of [employees, compensation, profiles, adjustments]) {
    if (result.error) throw new Error(`Could not load payroll inputs: ${result.error.message}`);
  }

  const recordsBy = new Map<string, Array<{ effectiveFrom: string; components: RecurringComponent[] }>>();
  for (const row of compensation.data ?? []) {
    const list = recordsBy.get(row.employee_id) ?? [];
    list.push({ effectiveFrom: row.effective_from, components: row.components });
    recordsBy.set(row.employee_id, list);
  }

  const profileBy = new Map((profiles.data ?? []).map((row) => [row.employee_id, row]));
  const adjustmentsBy = new Map<string, Adjustment[]>();
  for (const row of adjustments.data ?? []) {
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

  for (const employee of [...(employees.data ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
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
    if (notes.length) notesByEmployee.set(employee.id, notes);
  }

  return {
    ruleSet,
    settings: settingsView.settings,
    employees: inputs,
    notesByEmployee,
    fingerprint: fingerprint({ ruleSetId: ruleSet.id, settings: settingsView.settings, period, employees: inputs }),
    profiles: new Map([...profileBy.entries()].map(([id, row]) => [id, row])),
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

export { totalsFor };

/** People who touched a run. None of them may approve or return it. */
export async function contributorsOf(admin: Admin, orgId: string, runId: string): Promise<string[]> {
  const { data } = await admin
    .from("payroll_events")
    .select("actor_id")
    .eq("org_id", orgId)
    .eq("run_id", runId)
    .in("action", ["calculated", "adjustment_added", "adjustment_removed", "submitted", "performance_bonuses_imported"])
    .returns<Array<{ actor_id: string | null }>>();
  return [...new Set((data ?? []).map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
}

/** Everything the workflow needs to decide an action on a run, read fresh. */
export async function runStateFor(admin: Admin, orgId: string, run: RunRow): Promise<{ state: RunState; inputs: RunInputs | null }> {
  const [contributorIds, { data: lines }] = await Promise.all([
    contributorsOf(admin, orgId, run.id),
    admin.from("payroll_run_lines").select("blockers").eq("org_id", orgId).eq("run_id", run.id).returns<Array<{ blockers: string[] }>>(),
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
      blockerCount: (lines ?? []).reduce((sum, line) => sum + (Array.isArray(line.blockers) ? line.blockers.length : 0), 0),
      hasBeenCalculated: Boolean(run.calculated_at),
      calculationIsCurrent: inputs ? inputs.fingerprint === run.input_fingerprint : true,
    },
  };
}

export async function logEvent(admin: Admin, input: { orgId: string; runId: string | null; actorId: string; action: string; payload?: Record<string, unknown> }) {
  await admin.from("payroll_events").insert({
    org_id: input.orgId,
    run_id: input.runId,
    actor_id: input.actorId,
    action: input.action,
    payload: input.payload ?? {},
  });
}

/** Whether an employee id belongs to the caller's organisation. The tenant check for every per-person route. */
export async function employeeInOrg(admin: Admin, orgId: string, employeeId: string) {
  const { data } = await admin
    .from("employees")
    .select("id, name, email, department, join_date")
    .eq("id", employeeId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string | null; email: string | null; department: string | null; join_date: string | null }>();
  return data ?? null;
}

/** Maps a Postgres error from a guard trigger to a status a person can act on. */
export function databaseFailure(error: { code?: string; message?: string }) {
  if (error.code === "40001") return reply({ error: error.message }, 409);
  if (error.code === "42501") return reply({ error: error.message }, 403);
  if (error.code === "22023" || error.code === "23514") return reply({ error: error.message }, 422);
  if (error.code === "23505") return reply({ error: "That already exists." }, 409);
  if (error.code === "P0002") return reply({ error: error.message }, 404);
  return reply({ error: "Payroll could not be saved. Please retry." }, 500);
}
