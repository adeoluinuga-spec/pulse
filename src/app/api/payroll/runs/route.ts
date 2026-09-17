import { periodBounds } from "@/lib/payrollGrossToNet";
import { ruleSetFor } from "@/lib/payrollRules";
import { databaseFailure, logEvent, payrollContext, reply, RUN_COLUMNS, type RunRow, handled } from "@/lib/payrollServer";

/**
 * Starting a payroll run for a month.
 *
 * A run starts empty, as a draft. Nothing is calculated until somebody presses
 * Calculate, so opening October early does not freeze October's figures before
 * October's pay changes are in.
 */

export const dynamic = "force-dynamic";

async function postHandler(request: Request) {
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can start a run." }, 403);

  const body = (await request.json().catch(() => ({}))) as { year?: unknown; month?: unknown };
  const year = Number(body.year);
  const month = Number(body.month);

  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return reply({ error: "Choose a month and year." }, 422);
  }

  // Refuse a month Pulse has no tax rules for, before a run exists that could
  // never be calculated.
  try {
    ruleSetFor(periodBounds({ year, month }).end);
  } catch (thrown) {
    return reply({ error: thrown instanceof Error ? thrown.message : "No tax rules cover that month." }, 422);
  }

  const { data, error } = await admin
    .from("payroll_runs")
    .insert({ org_id: orgId, period_year: year, period_month: month, created_by: actor.employeeId })
    .select(RUN_COLUMNS)
    .single<RunRow>();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "There is already a payroll run for that month. Open it, or void it first if it was started by mistake." }, 409);
    }
    return databaseFailure(error);
  }

  await logEvent(admin, { orgId, runId: data.id, actorId: actor.employeeId, action: "created", payload: { year, month } });
  return reply({ run: data }, 201);
}

export const POST = handled(postHandler);
