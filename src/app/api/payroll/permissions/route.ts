import { databaseFailure, employeeInOrg, logEvent, payrollContext, reply, handled } from "@/lib/payrollServer";

/**
 * Who prepares, who approves, who may see every salary.
 *
 * Only an organisation administrator decides. Approval in particular is granted
 * to a named person on purpose — maker-checker only works if somebody chose
 * the checker — and the per-run rule still stops that person approving any run
 * they worked on themselves.
 */

export const dynamic = "force-dynamic";

async function postHandler(request: Request) {
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canManagePermissions) return reply({ error: "Only an organisation administrator can change who has payroll access." }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string;
    canPrepare?: boolean;
    canApprove?: boolean;
    canViewAll?: boolean;
  };

  if (!body.employeeId) return reply({ error: "Choose a person." }, 400);
  const person = await employeeInOrg(admin, orgId, body.employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const grant = {
    can_prepare: body.canPrepare === true,
    can_approve: body.canApprove === true,
    can_view_all: body.canViewAll === true,
  };

  if (!grant.can_prepare && !grant.can_approve && !grant.can_view_all) {
    const { error } = await admin.from("payroll_permissions").delete().eq("org_id", orgId).eq("employee_id", body.employeeId);
    if (error) return databaseFailure(error);
  } else {
    const { error } = await admin
      .from("payroll_permissions")
      .upsert({ org_id: orgId, employee_id: body.employeeId, granted_by: actor.employeeId, ...grant }, { onConflict: "org_id,employee_id" });
    if (error) return databaseFailure(error);
  }

  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "permissions_changed",
    payload: { employeeId: body.employeeId, name: person.name, ...grant },
  });

  return reply({ saved: true, employeeId: body.employeeId, ...grant });
}

export const POST = handled(postHandler);
