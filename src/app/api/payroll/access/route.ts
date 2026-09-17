import { payrollContext, reply } from "@/lib/payrollServer";

/**
 * Whether the signed-in person can open Payroll at all.
 *
 * Navigation asks this rather than guessing from platform role, because
 * payroll access can be granted by name to somebody with no admin role.
 * It says yes or no and nothing more.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await payrollContext();
  if (!auth.ok) return reply({ canAccessPayroll: false });
  return reply({ canAccessPayroll: auth.ctx.can.canAccessPayroll || auth.ctx.can.canViewAll });
}
