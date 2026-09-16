import { totalsFor } from "@/lib/payrollGrossToNet";
import { decideRunAction, nextStatus, payrollCapabilities, type RunAction } from "@/lib/payrollWorkflow";
import {
  calculateLines,
  databaseFailure,
  loadRun,
  logEvent,
  payrollContext,
  reply,
  runStateFor,
} from "@/lib/payrollServer";

/**
 * One payroll run: reading it, and moving it through its life.
 *
 * Every action is decided by `decideRunAction` against state read fresh from
 * the database — the run's own event history for maker-checker, a fresh
 * fingerprint of the inputs for "has anything changed since this was
 * calculated" — and then applied with a revision check, so two people acting
 * on the same run at once cannot both succeed.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

const ACTIONS: RunAction[] = ["calculate", "submit", "return", "approve", "void"];

export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canViewAll) return reply({ error: "You do not have access to payroll runs." }, 403);

  const run = await loadRun(admin, orgId, runId);
  if (!run) return reply({ error: "Payroll run not found." }, 404);

  let state;
  try {
    ({ state } = await runStateFor(admin, orgId, run));
  } catch (thrown) {
    return reply({ error: thrown instanceof Error ? thrown.message : "Could not read this run's inputs." }, 500);
  }

  const [lines, adjustments, events, people] = await Promise.all([
    admin.from("payroll_run_lines").select("*").eq("org_id", orgId).eq("run_id", runId).order("employee_name"),
    admin.from("payroll_adjustments").select("*").eq("org_id", orgId).eq("run_id", runId).order("created_at"),
    admin.from("payroll_events").select("action, actor_id, payload, created_at").eq("org_id", orgId).eq("run_id", runId).order("created_at", { ascending: false }),
    admin.from("employees").select("id, name").eq("org_id", orgId).returns<Array<{ id: string; name: string | null }>>(),
  ]);

  const nameOf = new Map((people.data ?? []).map((person) => [person.id, person.name ?? "Someone"]));

  // What this viewer could do right now, with the reason if not — so the page
  // can explain a disabled button instead of offering one that fails.
  const decisions = Object.fromEntries(
    [...ACTIONS, "adjust" as const].map((action) => [action, decideRunAction({ action, actor, run: state, returnReason: "placeholder" })]),
  );

  return reply({
    run: {
      ...run,
      calculatedByName: run.calculated_by ? nameOf.get(run.calculated_by) ?? null : null,
      submittedByName: run.submitted_by ? nameOf.get(run.submitted_by) ?? null : null,
      approvedByName: run.approved_by ? nameOf.get(run.approved_by) ?? null : null,
    },
    state,
    decisions,
    viewer: { employeeId: actor.employeeId, ...payrollCapabilities(actor) },
    lines: lines.data ?? [],
    adjustments: (adjustments.data ?? []).map((row) => ({ ...row, employeeName: nameOf.get(row.employee_id) ?? null })),
    events: (events.data ?? []).map((row) => ({ ...row, actorName: row.actor_id ? nameOf.get(row.actor_id) ?? null : null })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { runId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor } = auth.ctx;

  const body = (await request.json().catch(() => ({}))) as { action?: string; revision?: number; reason?: string };
  const action = body.action as RunAction;
  if (!ACTIONS.includes(action)) return reply({ error: "Unknown action." }, 400);
  if (!Number.isInteger(body.revision)) return reply({ error: "Reload the run before acting on it." }, 400);

  const run = await loadRun(admin, orgId, runId);
  if (!run) return reply({ error: "Payroll run not found." }, 404);
  if (run.revision !== body.revision) {
    return reply({ error: "Somebody else changed this run since you opened it. Reload to see the latest." }, 409);
  }

  let fresh;
  try {
    fresh = await runStateFor(admin, orgId, run);
  } catch (thrown) {
    return reply({ error: thrown instanceof Error ? thrown.message : "Could not read this run's inputs." }, 500);
  }

  const decision = decideRunAction({ action, actor, run: fresh.state, returnReason: body.reason });
  if (!decision.allowed) return reply({ error: decision.reason }, 409);

  if (action === "calculate") {
    const inputs = fresh.inputs;
    if (!inputs) return reply({ error: "This run cannot be calculated." }, 409);

    const lines = calculateLines(inputs, run);
    const totals = totalsFor(lines);

    const { data: revision, error } = await admin.rpc("payroll_store_calculation", {
      p_run: run.id,
      p_expected_revision: run.revision,
      p_actor: actor.employeeId,
      p_lines: lines,
      p_totals: totals,
      p_rule_set_id: inputs.ruleSet.id,
      p_rule_set: inputs.ruleSet,
      p_fingerprint: inputs.fingerprint,
    });
    if (error) return databaseFailure(error);

    await logEvent(admin, {
      orgId,
      runId: run.id,
      actorId: actor.employeeId,
      action: "calculated",
      payload: { headcount: totals.headcount, netKobo: totals.netKobo, blockers: totals.blockerCount, ruleSetId: inputs.ruleSet.id },
    });
    return reply({ calculated: true, revision, totals });
  }

  const now = new Date().toISOString();
  const status = nextStatus(action, run.status);
  const patch: Record<string, unknown> = { status, revision: run.revision + 1 };

  if (action === "submit") Object.assign(patch, { submitted_by: actor.employeeId, submitted_at: now, returned_reason: null });
  if (action === "return") Object.assign(patch, { submitted_by: null, submitted_at: null, returned_reason: (body.reason ?? "").trim().slice(0, 1000) });
  if (action === "approve") Object.assign(patch, { approved_by: actor.employeeId, approved_at: now });

  const { data, error } = await admin
    .from("payroll_runs")
    .update(patch)
    .eq("id", run.id)
    .eq("org_id", orgId)
    .eq("revision", run.revision)
    .select("id, status, revision");

  if (error) return databaseFailure(error);
  if (!data?.length) return reply({ error: "Somebody else changed this run at the same moment. Reload to see the latest." }, 409);

  const eventName = { submit: "submitted", return: "returned", approve: "approved", void: "voided" }[action as "submit" | "return" | "approve" | "void"];
  await logEvent(admin, {
    orgId,
    runId: run.id,
    actorId: actor.employeeId,
    action: eventName,
    payload: action === "return" ? { reason: patch.returned_reason } : {},
  });

  return reply({ status, revision: data[0].revision });
}
