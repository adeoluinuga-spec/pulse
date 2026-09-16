import { payrollContext, reply } from "@/lib/payrollServer";

/**
 * Your payslips.
 *
 * Takes no employee id — it can only ever list the caller's own — and returns
 * only lines from approved runs. A draft is the payroll team's working copy and
 * its figures may still change, so it is nobody's payslip yet.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor } = auth.ctx;

  const { data, error } = await admin
    .from("payroll_run_lines")
    .select("id, gross_kobo, net_kobo, paye_kobo, payroll_runs!inner(period_year, period_month, status, approved_at)")
    .eq("org_id", orgId)
    .eq("employee_id", actor.employeeId)
    .eq("payroll_runs.status", "approved")
    .returns<Array<{
      id: string;
      gross_kobo: number;
      net_kobo: number;
      paye_kobo: number;
      payroll_runs: { period_year: number; period_month: number; status: string; approved_at: string | null };
    }>>();

  if (error) return reply({ error: "Could not load your payslips." }, 500);

  const payslips = (data ?? [])
    .map((row) => ({
      id: row.id,
      year: row.payroll_runs.period_year,
      month: row.payroll_runs.period_month,
      grossKobo: Number(row.gross_kobo),
      netKobo: Number(row.net_kobo),
      payeKobo: Number(row.paye_kobo),
      approvedAt: row.payroll_runs.approved_at,
    }))
    .sort((a, b) => b.year - a.year || b.month - a.month);

  return reply({ payslips });
}
