import { validateProfile } from "@/lib/payrollInputs";
import { databaseFailure, employeeInOrg, logEvent, payrollContext, reply, handled } from "@/lib/payrollServer";

/**
 * One person's payroll record: their pay history and their payroll profile —
 * bank account, tax state, TIN, pension and NHF details.
 *
 * Reading needs view-all access; changing needs prepare access. The employee id
 * in the URL is always checked against the caller's organisation first,
 * because these routes run as service-role and nothing else would stop a
 * payroll officer at one client reading a salary at another.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ employeeId: string }> };

async function getHandler(_request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, can } = auth.ctx;

  if (!can.canViewAll) return reply({ error: "You do not have access to other people's pay." }, 403);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const [compensation, profile] = await Promise.all([
    admin
      .from("employee_compensation")
      .select("id, effective_from, components, grade, reason, created_at")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false }),
    admin.from("employee_payroll_profiles").select("*").eq("org_id", orgId).eq("employee_id", employeeId).maybeSingle(),
  ]);

  if (compensation.error || profile.error) return reply({ error: "Could not load this person's payroll record." }, 500);

  return reply({ person, compensation: compensation.data ?? [], profile: profile.data ?? null });
}

async function putHandler(request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can change payroll details." }, 403);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const validation = validateProfile((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!validation.ok) return reply({ error: "These payroll details are not valid.", errors: validation.errors }, 422);

  const { error } = await admin
    .from("employee_payroll_profiles")
    .upsert(
      { org_id: orgId, employee_id: employeeId, ...validation.row, updated_by: actor.employeeId, updated_at: new Date().toISOString() },
      { onConflict: "employee_id" },
    );
  if (error) return databaseFailure(error);

  // Bank details are the classic payroll-fraud target: redirect one salary to a
  // new account. Every change is logged with who made it, without the numbers.
  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "profile_changed",
    payload: {
      employeeId,
      name: person.name,
      bankAccountSet: Boolean(validation.row.account_number),
      taxState: validation.row.tax_state,
    },
  });

  return reply({ saved: true });
}

export const GET = handled(getHandler);
export const PUT = handled(putHandler);
