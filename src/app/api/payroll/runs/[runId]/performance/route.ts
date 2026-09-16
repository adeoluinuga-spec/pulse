import { periodBounds } from "@/lib/payrollGrossToNet";
import { compensationForPeriod } from "@/lib/payrollInputs";
import { planPerformanceBonuses, validateBands, DEFAULT_BONUS_BANDS } from "@/lib/payrollPerformance";
import { decideRunAction } from "@/lib/payrollWorkflow";
import { databaseFailure, loadRun, logEvent, payrollContext, reply, runStateFor, type Admin } from "@/lib/payrollServer";

/**
 * Importing performance bonuses from a released appraisal cycle into a draft run.
 *
 * GET lists the appraisal cycles to choose from. POST previews by default and
 * only writes when asked to, so the person importing sees every bonus and every
 * person left out — with the reason — before any money is added to a run.
 *
 * Requires the same right as adding an adjustment by hand, and counts as one:
 * whoever imports bonuses becomes a contributor and cannot approve the run.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

async function guard(runId: string) {
  const auth = await payrollContext();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const { admin, orgId, actor } = auth.ctx;

  const run = await loadRun(admin, orgId, runId);
  if (!run) return { ok: false as const, response: reply({ error: "Payroll run not found." }, 404) };

  const { state } = await runStateFor(admin, orgId, run);
  const decision = decideRunAction({ action: "adjust", actor, run: state });
  if (!decision.allowed) return { ok: false as const, response: reply({ error: decision.reason }, 409) };

  return { ok: true as const, admin, orgId, actor, run };
}

export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  const checked = await guard(runId);
  if (!checked.ok) return checked.response;
  const { admin, orgId } = checked;

  const { data, error } = await admin
    .from("appraisal_cycles")
    .select("id, name, status")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .returns<Array<{ id: string; name: string; status: string }>>();

  if (error) return reply({ error: "Could not load appraisal cycles." }, 500);
  return reply({ cycles: data ?? [], defaultBands: DEFAULT_BONUS_BANDS });
}

/** Monthly basic in force for the run's period, for each person with pay records. */
async function basicForPeriod(admin: Admin, orgId: string, year: number, month: number) {
  const [employees, compensation, profiles] = await Promise.all([
    admin.from("employees").select("id, join_date").eq("org_id", orgId).returns<Array<{ id: string; join_date: string | null }>>(),
    admin
      .from("employee_compensation")
      .select("employee_id, effective_from, components")
      .eq("org_id", orgId)
      .returns<Array<{ employee_id: string; effective_from: string; components: Array<{ code: string; label: string; amountKobo: number; taxable: boolean; pensionable: boolean; isBasic: boolean }> }>>(),
    admin.from("employee_payroll_profiles").select("employee_id, exit_date").eq("org_id", orgId).returns<Array<{ employee_id: string; exit_date: string | null }>>(),
  ]);

  const exitBy = new Map((profiles.data ?? []).map((row) => [row.employee_id, row.exit_date]));
  const recordsBy = new Map<string, Array<{ effectiveFrom: string; components: (typeof compensation.data & object)[number]["components"] }>>();
  for (const row of compensation.data ?? []) {
    const list = recordsBy.get(row.employee_id) ?? [];
    list.push({ effectiveFrom: row.effective_from, components: row.components });
    recordsBy.set(row.employee_id, list);
  }

  const basic = new Map<string, number>();
  for (const employee of employees.data ?? []) {
    const records = recordsBy.get(employee.id);
    if (!records?.length) continue;
    const { components } = compensationForPeriod({
      records,
      period: { year, month },
      joinDate: employee.join_date,
      exitDate: exitBy.get(employee.id) ?? null,
    });
    if (!components.length) continue;
    basic.set(employee.id, components.filter((c) => c.isBasic).reduce((sum, c) => sum + Number(c.amountKobo), 0));
  }
  return basic;
}

export async function POST(request: Request, { params }: Params) {
  const { runId } = await params;
  const checked = await guard(runId);
  if (!checked.ok) return checked.response;
  const { admin, orgId, actor, run } = checked;

  const body = (await request.json().catch(() => ({}))) as { appraisalCycleId?: string; bands?: unknown; dryRun?: boolean };
  if (!body.appraisalCycleId) return reply({ error: "Choose an appraisal cycle." }, 400);

  const bands = validateBands(body.bands ?? DEFAULT_BONUS_BANDS);
  if (!bands.ok) return reply({ error: "These score bands are not valid.", errors: bands.errors }, 422);

  const { data: cycle } = await admin
    .from("appraisal_cycles")
    .select("id, name")
    .eq("id", body.appraisalCycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string }>();
  if (!cycle) return reply({ error: "That appraisal cycle is not in your organisation." }, 404);

  const [appraisals, people, existing, basicByEmployee] = await Promise.all([
    admin
      .from("appraisals")
      .select("id, employee_id, workflow_status, total_score")
      .eq("org_id", orgId)
      .eq("cycle_id", cycle.id)
      .returns<Array<{ id: string; employee_id: string; workflow_status: string; total_score: number | string | null }>>(),
    admin.from("employees").select("id, name").eq("org_id", orgId).returns<Array<{ id: string; name: string | null }>>(),
    admin
      .from("payroll_adjustments")
      .select("source")
      .eq("org_id", orgId)
      .eq("run_id", run.id)
      .returns<Array<{ source: { type?: string; appraisalId?: string } | null }>>(),
    basicForPeriod(admin, orgId, run.period_year, run.period_month),
  ]);

  if (appraisals.error || people.error || existing.error) return reply({ error: "Could not read the appraisals." }, 500);

  const nameOf = new Map((people.data ?? []).map((row) => [row.id, row.name ?? "Unnamed"]));
  const alreadyImported = new Set(
    (existing.data ?? []).map((row) => (row.source?.type === "appraisal" ? row.source.appraisalId : null)).filter((id): id is string => Boolean(id)),
  );

  const plan = planPerformanceBonuses({
    appraisals: (appraisals.data ?? []).map((row) => ({
      appraisalId: row.id,
      employeeId: row.employee_id,
      name: nameOf.get(row.employee_id) ?? "Unnamed",
      workflowStatus: row.workflow_status,
      totalScore: row.total_score === null ? null : Number(row.total_score),
    })),
    bands: bands.bands,
    cycleName: cycle.name,
    basicByEmployee,
    alreadyImported,
  });

  if (body.dryRun !== false) return reply({ dryRun: true, cycle, plan });
  if (!plan.add.length) return reply({ imported: 0, plan });

  const { error } = await admin.from("payroll_adjustments").insert(
    plan.add.map((bonus) => ({
      run_id: run.id,
      org_id: orgId,
      employee_id: bonus.employeeId,
      label: bonus.label,
      kind: "earning",
      amount_kobo: bonus.amountKobo,
      taxable: true,
      pensionable: false,
      note: `Score ${bonus.score}; ${bonus.percentOfBasicBps / 100}% of monthly basic.`,
      source: { type: "appraisal", appraisalCycleId: cycle.id, appraisalId: bonus.appraisalId },
      created_by: actor.employeeId,
    })),
  );
  if (error) return databaseFailure(error);

  await logEvent(admin, {
    orgId,
    runId: run.id,
    actorId: actor.employeeId,
    action: "performance_bonuses_imported",
    payload: { appraisalCycleId: cycle.id, count: plan.add.length, totalKobo: plan.totalKobo, skipped: plan.skip.length },
  });

  return reply({ imported: plan.add.length, plan }, 201);
}
