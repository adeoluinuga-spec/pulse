import { NIGERIAN_STATES } from "@/lib/payrollInputs";
import { validateSalaryStructure } from "@/lib/payrollSalaryStructure";
import { databaseFailure, logEvent, payrollContext, reply, handled } from "@/lib/payrollServer";

/**
 * Organisation-wide payroll settings.
 *
 * Changing whether pension or ITF applies changes every future run's figures,
 * so only an organisation administrator may do it, and each change is logged.
 * Runs already approved keep the settings they were calculated with.
 */

export const dynamic = "force-dynamic";

async function patchHandler(request: Request) {
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canManagePermissions) return reply({ error: "Only an organisation administrator can change payroll settings." }, 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const errors: string[] = [];

  const flag = (key: string) => (typeof body[key] === "boolean" ? (body[key] as boolean) : undefined);
  const defaultTaxState = body.defaultTaxState === undefined ? undefined : (body.defaultTaxState as string | null) || null;
  if (defaultTaxState && !(NIGERIAN_STATES as readonly string[]).includes(defaultTaxState)) {
    errors.push("Default tax state must be one of Nigeria's 36 states or the FCT.");
  }
  const payDay = body.payDay === undefined || body.payDay === null || body.payDay === "" ? null : Number(body.payDay);
  if (payDay !== null && (!Number.isInteger(payDay) || payDay < 1 || payDay > 31)) errors.push("Pay day must be between 1 and 31.");

  const structure = body.salaryStructure === undefined ? null : validateSalaryStructure(body.salaryStructure);
  if (structure && !structure.ok) errors.push(...structure.errors);
  if (errors.length) return reply({ error: "These settings are not valid.", errors }, 422);

  const { data: existing, error: readError } = await admin.from("payroll_settings")
    .select("*")
    .eq("org_id", orgId).maybeSingle<{ salary_structure_version: number }>();
  if (readError) return databaseFailure(readError);

  const patch: Record<string, unknown> = { updated_by: actor.employeeId, updated_at: new Date().toISOString() };
  for (const [key, column] of [
    ["pensionEnabled", "pension_enabled"],
    ["nhfEnabled", "nhf_enabled"],
    ["nsitfEnabled", "nsitf_enabled"],
    ["itfEnabled", "itf_enabled"],
  ] as const) {
    const value = flag(key);
    if (value !== undefined) patch[column] = value;
  }
  if (defaultTaxState !== undefined) patch.default_tax_state = defaultTaxState;
  if (body.payDay !== undefined) patch.pay_day = payDay;

  if (structure?.ok) {
    patch.salary_structure = structure.components;
    patch.salary_structure_version = (existing?.salary_structure_version ?? 0) + 1;
  }
  const { error } = existing
    ? await admin.from("payroll_settings").update(patch).eq("org_id", orgId)
    : await admin.from("payroll_settings").insert({ org_id: orgId, ...patch });
  if (error) return databaseFailure(error);

  await logEvent(admin, { orgId, runId: null, actorId: actor.employeeId, action: "settings_changed", payload: patch });
  return reply({ saved: true });
}

export const PATCH = handled(patchHandler);
