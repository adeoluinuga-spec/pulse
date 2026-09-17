import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { periodLabel } from "@/lib/payrollExports";
import { PayslipDocument, type PayslipData } from "@/lib/payrollPayslipDocument";
import { canReadPayslip, type RunStatus } from "@/lib/payrollWorkflow";
import { logEvent, payrollContext, PRIVATE, reply, handled } from "@/lib/payrollServer";

/**
 * One payslip, as data or as a PDF.
 *
 * The line id is never trusted: the line is loaded scoped to the caller's
 * organisation, and `canReadPayslip` then decides — the employee it belongs
 * to once its run is approved, or somebody with payroll view-all access. Any
 * other request gets the same 404 as a line that does not exist, so ids cannot
 * be probed to learn whose pay they are.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ lineId: string }> };

type LineRow = {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name: string;
  days_paid: number;
  days_in_period: number;
  earnings: Array<{ label: string; amountKobo: number }>;
  deductions: Array<{ label: string; amountKobo: number }>;
  employer: Array<{ label: string; amountKobo: number }>;
  gross_kobo: number;
  net_kobo: number;
  tax_state: string | null;
  tax_working: unknown;
  payroll_runs: { period_year: number; period_month: number; status: RunStatus; approved_at: string | null; rule_set_id: string | null };
};

async function getHandler(request: Request, { params }: Params) {
  const { lineId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor } = auth.ctx;

  const { data: line } = await admin
    .from("payroll_run_lines")
    .select("id, run_id, employee_id, employee_name, days_paid, days_in_period, earnings, deductions, employer, gross_kobo, net_kobo, tax_state, tax_working, payroll_runs!inner(period_year, period_month, status, approved_at, rule_set_id)")
    .eq("id", lineId)
    .eq("org_id", orgId)
    .maybeSingle<LineRow>();

  const notFound = reply({ error: "Payslip not found." }, 404);
  if (!line) return notFound;
  if (!canReadPayslip({ actor, lineEmployeeId: line.employee_id, runStatus: line.payroll_runs.status })) return notFound;

  const [{ data: employee }, { data: organisation }] = await Promise.all([
    admin.from("employees").select("email, department").eq("id", line.employee_id).eq("org_id", orgId).maybeSingle<{ email: string | null; department: string | null }>(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
  ]);

  const deductions = line.deductions.map((d) => ({ label: d.label, amountKobo: Number(d.amountKobo) }));
  const payslip: PayslipData = {
    organisationName: organisation?.name ?? "Your organisation",
    employeeName: line.employee_name,
    employeeEmail: employee?.email ?? null,
    department: employee?.department ?? null,
    periodLabel: periodLabel(line.payroll_runs.period_year, line.payroll_runs.period_month),
    approvedAt: line.payroll_runs.approved_at,
    daysPaid: line.days_paid,
    daysInPeriod: line.days_in_period,
    taxState: line.tax_state,
    ruleSetId: line.payroll_runs.rule_set_id,
    earnings: line.earnings.map((e) => ({ label: e.label, amountKobo: Number(e.amountKobo) })),
    deductions,
    employer: line.employer.map((e) => ({ label: e.label, amountKobo: Number(e.amountKobo) })),
    grossKobo: Number(line.gross_kobo),
    totalDeductionsKobo: deductions.reduce((sum, d) => sum + d.amountKobo, 0),
    netKobo: Number(line.net_kobo),
  };

  // Somebody else reading a payslip is logged; your own is not, or the log fills
  // with noise and hides the reads that matter.
  if (line.employee_id !== actor.employeeId) {
    await logEvent(admin, { orgId, runId: line.run_id, actorId: actor.employeeId, action: "payslip_viewed", payload: { employeeId: line.employee_id } });
  }

  if (new URL(request.url).searchParams.get("format") === "pdf") {
    const buffer = await renderToBuffer(
      React.createElement(PayslipDocument, { payslip }) as Parameters<typeof renderToBuffer>[0],
    );
    const month = String(line.payroll_runs.period_month).padStart(2, "0");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...PRIVATE,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${line.payroll_runs.period_year}-${month}.pdf"`,
      },
    });
  }

  return reply({ payslip, taxWorking: line.tax_working, status: line.payroll_runs.status });
}

export const GET = handled(getHandler);
