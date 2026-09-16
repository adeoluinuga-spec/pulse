import { NIGERIAN_STATES } from "@/lib/payrollInputs";
import { databaseFailure, logEvent, payrollContext, reply } from "@/lib/payrollServer";

/**
 * Organisation-wide payroll settings.
 *
 * Changing whether pension or ITF applies changes every future run's figures,
 * so only an organisation administrator may do it, and each change is logged.
 * Runs already approved keep the settings they were calculated with.
 */

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
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

  if (errors.length) return reply({ error: "These settings are not valid.", errors }, 422);

  const patch: Record<string, unknown> = { org_id: orgId, updated_by: actor.employeeId, updated_at: new Date().toISOString() };
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

  const { error } = await admin.from("payroll_settings").upsert(patch, { onConflict: "org_id" });
  if (error) return databaseFailure(error);

  await logEvent(admin, { orgId, runId: null, actorId: actor.employeeId, action: "settings_changed", payload: patch });
  return reply({ saved: true });
}
