import { compensationForPeriod } from "@/lib/payrollInputs";
import { planPerformanceBonuses, validateBands, DEFAULT_BONUS_BANDS } from "@/lib/payrollPerformance";
import { decideRunAction } from "@/lib/payrollWorkflow";
import { controlFailure, databaseFailure, loadRun, payrollContext, readAll, reply, runStateFor, type Admin } from "@/lib/payrollServer";

/**
 * Importing performance bonuses from a released appraisal cycle into a draft run.
 *
 * GET lists the appraisal cycles to choose from. POST previews by default and
 * only writes when asked to, so the person importing sees every bonus and every
 * person left out — with the reason — before any money is added to a run.
 *
 * Requires the same right as adding an adjustment by hand, and counts as one:
 * whoever imports bonuses becomes a contributor and cannot approve the run.
 *
 * An appraisal pays out once. The preview leaves out appraisals already in any
 * live run of the organisation; the write happens in one database transaction,
 * under an organisation-wide lock, that refuses the whole import if any of
 * them has been paid since — so two people importing at the same moment, into
 * the same run or different ones, cannot both succeed.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

async function guard(runId: string) {
  const auth = await payrollContext();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const { admin, orgId, actor } = auth.ctx;

  try {
    const run = await loadRun(admin, orgId, runId);
    if (!run) return { ok: false as const, response: reply({ error: "Payroll run not found." }, 404) };

    const { state } = await runStateFor(admin, orgId, run);
    const decision = decideRunAction({ action: "adjust", actor, run: state });
    if (!decision.allowed) return { ok: false as const, response: reply({ error: decision.reason }, 409) };

    return { ok: true as const, admin, orgId, actor, run };
  } catch (thrown) {
    return { ok: false as const, response: controlFailure(thrown) };
  }
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

type Component = { code: string; label: string; amountKobo: number; taxable: boolean; pensionable: boolean; isBasic: boolean };

/** Monthly basic in force for the run's period, for each person with pay records. */
async function basicForPeriod(admin: Admin, orgId: string, year: number, month: number) {
  const [employees, compensation, profiles] = await Promise.all([
    readAll<{ id: string; join_date: string | null }>("staff", (from, to) =>
      admin.from("employees").select("id, join_date").eq("org_id", orgId).order("id").range(from, to),
    ),
    readAll<{ employee_id: string; effective_from: string; components: Component[] }>("pay records", (from, to) =>
      admin.from("employee_compensation").select("employee_id, effective_from, components").eq("org_id", orgId).order("id").range(from, to),
    ),
    readAll<{ employee_id: string; exit_date: string | null }>("payroll details", (from, to) =>
      admin.from("employee_payroll_profiles").select("employee_id, exit_date").eq("org_id", orgId).order("employee_id").range(from, to),
    ),
  ]);

  const exitBy = new Map(profiles.map((row) => [row.employee_id, row.exit_date]));
  const recordsBy = new Map<string, Array<{ effectiveFrom: string; components: Component[] }>>();
  for (const row of compensation) {
    const list = recordsBy.get(row.employee_id) ?? [];
    list.push({ effectiveFrom: row.effective_from, components: row.components });
    recordsBy.set(row.employee_id, list);
  }

  const basic = new Map<string, number>();
  for (const employee of employees) {
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

/** Appraisals already paid as a bonus in any run of the organisation that has not been voided. */
async function appraisalsAlreadyPaid(admin: Admin, orgId: string) {
  const [adjustments, runs] = await Promise.all([
    readAll<{ run_id: string; source: { type?: string; appraisalId?: string } | null }>("earlier bonuses", (from, to) =>
      admin.from("payroll_adjustments").select("run_id, source").eq("org_id", orgId).eq("source->>type", "appraisal").order("id").range(from, to),
    ),
    readAll<{ id: string; status: string }>("payroll runs", (from, to) =>
      admin.from("payroll_runs").select("id, status").eq("org_id", orgId).order("id").range(from, to),
    ),
  ]);
  const voided = new Set(runs.filter((run) => run.status === "void").map((run) => run.id));
  return new Set(
    adjustments
      .filter((row) => !voided.has(row.run_id))
      .map((row) => row.source?.appraisalId)
      .filter((id): id is string => Boolean(id)),
  );
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

  const { data: cycle, error: cycleError } = await admin
    .from("appraisal_cycles")
    .select("id, name")
    .eq("id", body.appraisalCycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string }>();
  if (cycleError) return reply({ error: "Could not read that appraisal cycle." }, 503);
  if (!cycle) return reply({ error: "That appraisal cycle is not in your organisation." }, 404);

  let appraisals, people, alreadyImported, basicByEmployee;
  try {
    [appraisals, people, alreadyImported, basicByEmployee] = await Promise.all([
      readAll<{ id: string; employee_id: string; workflow_status: string; total_score: number | string | null }>("the appraisals", (from, to) =>
        admin
          .from("appraisals")
          .select("id, employee_id, workflow_status, total_score")
          .eq("org_id", orgId)
          .eq("cycle_id", cycle.id)
          .order("id")
          .range(from, to),
      ),
      readAll<{ id: string; name: string | null }>("staff names", (from, to) =>
        admin.from("employees").select("id, name").eq("org_id", orgId).order("id").range(from, to),
      ),
      appraisalsAlreadyPaid(admin, orgId),
      basicForPeriod(admin, orgId, run.period_year, run.period_month),
    ]);
  } catch (thrown) {
    return controlFailure(thrown);
  }

  const nameOf = new Map(people.map((row) => [row.id, row.name ?? "Unnamed"]));

  const plan = planPerformanceBonuses({
    appraisals: appraisals.map((row) => ({
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

  const { data: imported, error } = await admin.rpc("payroll_import_bonuses", {
    p_run: run.id,
    p_actor: actor.employeeId,
    p_appraisal_cycle: cycle.id,
    p_rows: plan.add.map((bonus) => ({
      employeeId: bonus.employeeId,
      appraisalId: bonus.appraisalId,
      label: bonus.label,
      amountKobo: bonus.amountKobo,
      note: `Score ${bonus.score}; ${bonus.percentOfBasicBps / 100}% of monthly basic.`,
    })),
  });
  if (error) return databaseFailure(error);

  return reply({ imported: imported ?? plan.add.length, plan }, 201);
}
