import { loadSettings, payrollContext, reply, RUN_COLUMNS, type RunRow } from "@/lib/payrollServer";
import { ruleSetFor } from "@/lib/payrollRules";

/**
 * Everything the payroll workspace opens with.
 *
 * Refused outright to anyone with no payroll access — an ordinary employee
 * reaches their own pay through /api/payroll/me and /api/payroll/payslips, and
 * nothing here is theirs to see.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canAccessPayroll) return reply({ error: "You do not have access to payroll." }, 403);

  const [settings, employees, compensation, profiles, runs, permissions] = await Promise.all([
    loadSettings(admin, orgId),
    admin
      .from("employees")
      .select("id, name, email, department, role, platform_role, join_date")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; name: string | null; email: string | null; department: string | null; role: string | null; platform_role: string | null; join_date: string | null }>>(),
    admin
      .from("employee_compensation")
      .select("employee_id, effective_from, components")
      .eq("org_id", orgId)
      .order("effective_from", { ascending: false })
      .returns<Array<{ employee_id: string; effective_from: string; components: Array<{ amountKobo: number; taxable: boolean }> }>>(),
    admin
      .from("employee_payroll_profiles")
      .select("employee_id, tax_state, tin, pfa_name, rsa_pin, bank_name, account_number, exit_date")
      .eq("org_id", orgId)
      .returns<Array<{ employee_id: string; tax_state: string | null; tin: string | null; pfa_name: string | null; rsa_pin: string | null; bank_name: string | null; account_number: string | null; exit_date: string | null }>>(),
    admin.from("payroll_runs").select(RUN_COLUMNS).eq("org_id", orgId).order("period_year", { ascending: false }).order("period_month", { ascending: false }).returns<RunRow[]>(),
    admin
      .from("payroll_permissions")
      .select("employee_id, can_prepare, can_approve, can_view_all")
      .eq("org_id", orgId)
      .returns<Array<{ employee_id: string; can_prepare: boolean; can_approve: boolean; can_view_all: boolean }>>(),
  ]);

  for (const result of [employees, compensation, profiles, runs, permissions]) {
    if (result.error) return reply({ error: "Could not load payroll. If this is a new setup, the payroll migrations may not be applied yet." }, 503);
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentPay = new Map<string, { effectiveFrom: string; grossKobo: number }>();
  for (const row of compensation.data ?? []) {
    if (currentPay.has(row.employee_id) || row.effective_from > today) continue;
    currentPay.set(row.employee_id, {
      effectiveFrom: row.effective_from,
      grossKobo: row.components.reduce((sum, component) => sum + Number(component.amountKobo), 0),
    });
  }
  const hasAnyPay = new Set((compensation.data ?? []).map((row) => row.employee_id));
  const profileBy = new Map((profiles.data ?? []).map((row) => [row.employee_id, row]));

  const people = (employees.data ?? []).map((employee) => {
    const profile = profileBy.get(employee.id);
    const missing: string[] = [];
    if (!hasAnyPay.has(employee.id)) missing.push("pay");
    if (!(profile?.tax_state || settings.defaultTaxState)) missing.push("tax state");
    if (!(profile?.bank_name && profile?.account_number)) missing.push("bank account");
    if (settings.settings.pensionEnabled && !(profile?.pfa_name && profile?.rsa_pin)) missing.push("pension details");
    if (!profile?.tin) missing.push("TIN");
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      role: employee.role,
      platformRole: employee.platform_role,
      joinDate: employee.join_date,
      exitDate: profile?.exit_date ?? null,
      onPayroll: hasAnyPay.has(employee.id),
      currentPay: currentPay.get(employee.id) ?? null,
      missing,
    };
  });

  let currentRules: { id: string; label: string; verification: string } | null = null;
  try {
    const set = ruleSetFor(today);
    currentRules = { id: set.id, label: set.label, verification: set.verification };
  } catch {
    currentRules = null;
  }

  return reply({
    viewer: { employeeId: actor.employeeId, ...can },
    settings: { ...settings.settings, defaultTaxState: settings.defaultTaxState, payDay: settings.payDay, stored: settings.stored },
    currentRules,
    people,
    runs: runs.data ?? [],
    permissions: (permissions.data ?? []).map((row) => ({
      employeeId: row.employee_id,
      canPrepare: row.can_prepare,
      canApprove: row.can_approve,
      canViewAll: row.can_view_all,
    })),
    approverCount: (permissions.data ?? []).filter((row) => row.can_approve).length,
  });
}
