import { toKobo } from "@/lib/payrollMoney";
import { decideRunAction } from "@/lib/payrollWorkflow";
import { databaseFailure, employeeInOrg, loadRun, logEvent, payrollContext, reply, runStateFor } from "@/lib/payrollServer";

/**
 * One-off earnings and deductions inside a draft run: a bonus, arrears, a loan
 * repayment.
 *
 * Adding or removing one makes the adder a contributor to the run, so they can
 * no longer approve it. That is the point — an adjustment is exactly where a
 * payroll fraud would be hidden.
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

  const person = await employeeInOrg(admin, orgId, body.employeeId as string);
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

  await logEvent(admin, {
    orgId,
    runId: run.id,
    actorId: actor.employeeId,
    action: "adjustment_added",
    payload: { employeeId: person.id, name: person.name, label, kind: body.kind, amountKobo: toKobo(amount) },
  });

  return reply({ id: data.id }, 201);
}

export async function DELETE(request: Request, { params }: Params) {
  const { runId } = await params;
  const checked = await guard(runId);
  if (!checked.ok) return checked.response;
  const { admin, orgId, actor, run } = checked;

  const adjustmentId = new URL(request.url).searchParams.get("id");
  if (!adjustmentId) return reply({ error: "Say which adjustment to remove." }, 400);

  const { data, error } = await admin
    .from("payroll_adjustments")
    .delete()
    .eq("id", adjustmentId)
    .eq("org_id", orgId)
    .eq("run_id", run.id)
    .select("id, label, employee_id, amount_kobo");

  if (error) return databaseFailure(error);
  if (!data?.length) return reply({ error: "That adjustment was not found." }, 404);

  await logEvent(admin, {
    orgId,
    runId: run.id,
    actorId: actor.employeeId,
    action: "adjustment_removed",
    payload: { employeeId: data[0].employee_id, label: data[0].label, amountKobo: data[0].amount_kobo },
  });

  return reply({ removed: true });
}
