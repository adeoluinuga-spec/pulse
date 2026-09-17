import { totalsFor } from "@/lib/payrollGrossToNet";
import { decideRunAction, nextStatus, payrollCapabilities, type RunAction } from "@/lib/payrollWorkflow";
import {
  calculateLines,
  controlFailure,
  databaseFailure,
  linesForStorage,
  loadRun,
  payrollContext,
  readAll,
  reply,
  runStateFor,
  type RunRow,
} from "@/lib/payrollServer";

/**
 * One payroll run: reading it, and moving it through its life.
 *
 * Every action is decided by `decideRunAction` against state read fresh from
 * the database — who has worked on the run for maker-checker, a fresh
 * fingerprint of the inputs for "has anything changed since this was
 * calculated" — and then applied by a database function that re-checks the
 * revision and maker-checker and writes the audit event in the same
 * transaction. Two people acting at once cannot both succeed, and no change
 * can land without its record.
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

  let run: RunRow | null;
  let loaded;
  try {
    run = await loadRun(admin, orgId, runId);
    if (!run) return reply({ error: "Payroll run not found." }, 404);

    const [{ state }, lines, adjustments, events, people] = await Promise.all([
      runStateFor(admin, orgId, run),
      readAll<Record<string, unknown>>("the run's lines", (from, to) =>
        admin.from("payroll_run_lines").select("*").eq("org_id", orgId).eq("run_id", runId).order("employee_name").order("id").range(from, to),
      ),
      readAll<Record<string, unknown> & { employee_id: string }>("the run's adjustments", (from, to) =>
        admin.from("payroll_adjustments").select("*").eq("org_id", orgId).eq("run_id", runId).order("created_at").order("id").range(from, to),
      ),
      readAll<{ action: string; actor_id: string | null; payload: unknown; created_at: string }>("the run's history", (from, to) =>
        admin
          .from("payroll_events")
          .select("action, actor_id, payload, created_at")
          .eq("org_id", orgId)
          .eq("run_id", runId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      readAll<{ id: string; name: string | null }>("staff names", (from, to) =>
        admin.from("employees").select("id, name").eq("org_id", orgId).order("id").range(from, to),
      ),
    ]);
    loaded = { state, lines, adjustments, events, people };
  } catch (thrown) {
    return controlFailure(thrown);
  }

  const { state, lines, adjustments, events, people } = loaded;
  const nameOf = new Map(people.map((person) => [person.id, person.name ?? "Someone"]));

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
    lines,
    adjustments: adjustments.map((row) => ({ ...row, employeeName: nameOf.get(row.employee_id) ?? null })),
    events: events.map((row) => ({ ...row, actorName: row.actor_id ? nameOf.get(row.actor_id) ?? null : null })),
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

  let run: RunRow | null;
  let fresh;
  try {
    run = await loadRun(admin, orgId, runId);
    if (!run) return reply({ error: "Payroll run not found." }, 404);
    if (run.revision !== body.revision) {
      return reply({ error: "Somebody else changed this run since you opened it. Reload to see the latest." }, 409);
    }
    fresh = await runStateFor(admin, orgId, run);
  } catch (thrown) {
    return controlFailure(thrown);
  }

  const decision = decideRunAction({ action, actor, run: fresh.state, returnReason: body.reason });
  if (!decision.allowed) return reply({ error: decision.reason }, 409);

  if (action === "calculate") {
    const inputs = fresh.inputs;
    if (!inputs) return reply({ error: "This run cannot be calculated." }, 409);

    const lines = calculateLines(inputs, run);
    const totals = totalsFor(lines);

    // Lines — each with the payment details it was calculated against — and
    // the "calculated" event are stored in one transaction.
    const { data: revision, error } = await admin.rpc("payroll_store_calculation", {
      p_run: run.id,
      p_expected_revision: run.revision,
      p_actor: actor.employeeId,
      p_lines: linesForStorage(lines, inputs),
      p_totals: totals,
      p_rule_set_id: inputs.ruleSet.id,
      p_rule_set: inputs.ruleSet,
      p_fingerprint: inputs.fingerprint,
    });
    if (error) return databaseFailure(error);
    return reply({ calculated: true, revision, totals });
  }

  // The database repeats the checks that matter — revision, blockers, and
  // "you worked on this run" against its own records — so the rule holds even
  // if this route's reading of the state was wrong.
  const { data: revision, error } = await admin.rpc("payroll_transition", {
    p_run: run.id,
    p_expected_revision: run.revision,
    p_actor: actor.employeeId,
    p_action: action,
    p_reason: action === "return" ? (body.reason ?? "") : null,
  });
  if (error) return databaseFailure(error);

  return reply({ status: nextStatus(action, run.status), revision });
}
