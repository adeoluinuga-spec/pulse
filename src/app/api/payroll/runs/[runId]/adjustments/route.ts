import { toKobo } from "@/lib/payrollMoney";
import { decideRunAction } from "@/lib/payrollWorkflow";
import { controlFailure, databaseFailure, employeeInOrg, loadRun, logEvent, payrollContext, reply, runStateFor } from "@/lib/payrollServer";

/**
 * One-off earnings and deductions inside a draft run: a bonus, arrears, a loan
 * repayment.
 *
 * Adding or removing one makes the adder a contributor to the run, so they can
 * no longer approve it. That is the point — an adjustment is exactly where a
 * payroll fraud would be hidden. The database knows an adjustment's author from
 * the row itself, and records a removal in the same transaction as the delete,
 * so neither can happen without leaving the person's involvement on record.
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

export async function POST(request: Request, { params }: Params) {
  const { runId } = await params;
  const checked = await guard(runId);
  if (!checked.ok) return checked.response;
  const { admin, orgId, actor, run } = checked;

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string;
    label?: string;
    kind?: string;
    amount?: unknown;
    taxable?: boolean;
    pensionable?: boolean;
    note?: string;
  };

  const errors: string[] = [];
  const label = (body.label ?? "").trim();
  if (label.length < 2 || label.length > 120) errors.push("Give the adjustment a name between 2 and 120 characters.");
  if (body.kind !== "earning" && body.kind !== "deduction") errors.push("Say whether this is an earning or a deduction.");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("The amount must be more than zero.");
  if (!body.employeeId) errors.push("Choose who this adjustment is for.");
  if (errors.length) return reply({ error: "This adjustment is not complete.", errors }, 422);

  let person;
  try {
    person = await employeeInOrg(admin, orgId, body.employeeId as string);
  } catch (thrown) {
    return controlFailure(thrown);
  }
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const isEarning = body.kind === "earning";
  const { data, error } = await admin
    .from("payroll_adjustments")
    .insert({
      run_id: run.id,
      org_id: orgId,
      employee_id: person.id,
      label,
      kind: body.kind,
      amount_kobo: toKobo(amount),
      // Deductions in v1 are always taken after tax, so these flags only mean
      // something on an earning.
      taxable: isEarning ? body.taxable !== false : false,
      pensionable: isEarning ? body.pensionable === true : false,
      note: (body.note ?? "").trim().slice(0, 500) || null,
      created_by: actor.employeeId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return databaseFailure(error);

  // The adjustment's created_by already makes its author a contributor, so a
  // failure here cannot let them approve. It is still reported, because the
  // history would otherwise be missing a line.
  try {
    await logEvent(admin, {
      orgId,
      runId: run.id,
      actorId: actor.employeeId,
      action: "adjustment_added",
      payload: { employeeId: person.id, name: person.name, label, kind: body.kind, amountKobo: toKobo(amount) },
    });
  } catch {
    return reply({ id: data.id, error: "The adjustment was added, but its history entry could not be recorded. Tell whoever looks after Pulse." }, 500);
  }

  return reply({ id: data.id }, 201);
}

export async function DELETE(request: Request, { params }: Params) {
  const { runId } = await params;
  const checked = await guard(runId);
  if (!checked.ok) return checked.response;
  const { admin, actor, run } = checked;

  const adjustmentId = new URL(request.url).searchParams.get("id");
  if (!adjustmentId) return reply({ error: "Say which adjustment to remove." }, 400);

  const { error } = await admin.rpc("payroll_remove_adjustment", {
    p_run: run.id,
    p_adjustment: adjustmentId,
    p_actor: actor.employeeId,
  });
  if (error) return databaseFailure(error);

  return reply({ removed: true });
}
