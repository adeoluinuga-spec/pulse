import { validateCompensation } from "@/lib/payrollInputs";
import { databaseFailure, employeeInOrg, logEvent, payrollContext, reply, handled } from "@/lib/payrollServer";

/**
 * Adding and withdrawing compensation records.
 *
 * There is no edit. A pay rise is a new record from the date it takes effect,
 * so any past month can still be recalculated from what was true then. A record
 * can be withdrawn only while no approved run has relied on it — the database
 * refuses otherwise, and that refusal is passed straight back.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ employeeId: string }> };

async function postHandler(request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can set pay." }, 403);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const validation = validateCompensation(await request.json().catch(() => ({})));
  if (!validation.ok) return reply({ error: "This pay record is not complete.", errors: validation.errors }, 422);

  const { data, error } = await admin
    .from("employee_compensation")
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      effective_from: validation.record.effectiveFrom,
      components: validation.record.components,
      grade: validation.record.grade,
      reason: validation.record.reason,
      created_by: actor.employeeId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "This person already has a pay record starting on that date. Choose another date, or withdraw that record first." }, 409);
    }
    return databaseFailure(error);
  }

  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "compensation_added",
    payload: { employeeId, name: person.name, effectiveFrom: validation.record.effectiveFrom, reason: validation.record.reason },
  });

  return reply({ id: data.id }, 201);
}

async function deleteHandler(request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can change pay." }, 403);

  const recordId = new URL(request.url).searchParams.get("id");
  if (!recordId) return reply({ error: "Say which pay record to withdraw." }, 400);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const { data, error } = await admin
    .from("employee_compensation")
    .delete()
    .eq("id", recordId)
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .select("id, effective_from");

  if (error) return databaseFailure(error);
  if (!data?.length) return reply({ error: "That pay record was not found." }, 404);

  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "compensation_withdrawn",
    payload: { employeeId, name: person.name, effectiveFrom: data[0].effective_from },
  });

  return reply({ withdrawn: true });
}

export const POST = handled(postHandler);
export const DELETE = handled(deleteHandler);
