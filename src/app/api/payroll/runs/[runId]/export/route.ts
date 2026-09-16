import { NextResponse } from "next/server";

import {
  bankSchedule,
  nhfSchedule,
  payeSchedule,
  pensionSchedule,
  type ExportLine,
  type ExportProfile,
} from "@/lib/payrollExports";
import { loadRun, logEvent, payrollContext, PRIVATE, reply } from "@/lib/payrollServer";

/**
 * The files an approved run hands to finance.
 *
 * Only an approved run exports. A bank file from a draft is the file somebody
 * uploads by mistake and pays figures nobody signed off — so the route refuses
 * rather than relying on everyone remembering which download was which.
 *
 * Every download is logged: a salary file leaving the system is exactly the
 * event an auditor asks about.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

const TYPES = ["bank", "paye", "pension", "nhf"] as const;
type ExportType = (typeof TYPES)[number];

export async function GET(request: Request, { params }: Params) {
  const { runId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canViewAll) return reply({ error: "You do not have access to payroll files." }, 403);

  const type = new URL(request.url).searchParams.get("type") as ExportType;
  if (!TYPES.includes(type)) return reply({ error: "Choose bank, paye, pension or nhf." }, 400);

  const run = await loadRun(admin, orgId, runId);
  if (!run) return reply({ error: "Payroll run not found." }, 404);
  if (run.status !== "approved") {
    return reply({ error: "Payment and remittance files are only available once a run is approved." }, 409);
  }

  const [linesResult, profilesResult] = await Promise.all([
    admin
      .from("payroll_run_lines")
      .select("employee_id, employee_name, gross_kobo, basic_kobo, paye_kobo, pension_employee_kobo, pension_employer_kobo, nhf_kobo, net_kobo, tax_state")
      .eq("org_id", orgId)
      .eq("run_id", run.id)
      .returns<Array<{
        employee_id: string;
        employee_name: string;
        gross_kobo: number;
        basic_kobo: number;
        paye_kobo: number;
        pension_employee_kobo: number;
        pension_employer_kobo: number;
        nhf_kobo: number;
        net_kobo: number;
        tax_state: string | null;
      }>>(),
    admin
      .from("employee_payroll_profiles")
      .select("employee_id, tin, bank_name, bank_code, account_number, account_name, pfa_name, rsa_pin, nhf_number")
      .eq("org_id", orgId)
      .returns<Array<ExportProfile & { employee_id: string }>>(),
  ]);

  if (linesResult.error || profilesResult.error) return reply({ error: "Could not build this file." }, 500);

  // Figures come from the approved lines as stored, never from a recalculation:
  // the file must match what was approved, even if pay records changed since.
  const lines: ExportLine[] = (linesResult.data ?? []).map((row) => ({
    employeeId: row.employee_id,
    name: row.employee_name,
    included: true,
    grossKobo: Number(row.gross_kobo),
    basicKobo: Number(row.basic_kobo),
    payeKobo: Number(row.paye_kobo),
    pensionEmployeeKobo: Number(row.pension_employee_kobo),
    pensionEmployerKobo: Number(row.pension_employer_kobo),
    nhfKobo: Number(row.nhf_kobo),
    netKobo: Number(row.net_kobo),
    taxState: row.tax_state,
  }));

  // Bank details are read as they are now, because that is where money must go.
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.employee_id, row]));
  const period = { year: run.period_year, month: run.period_month };

  const built =
    type === "bank"
      ? bankSchedule({ lines, profiles, ...period })
      : type === "paye"
        ? payeSchedule({ lines, profiles, ...period })
        : type === "pension"
          ? pensionSchedule({ lines, profiles, ...period })
          : nhfSchedule({ lines, profiles, ...period });

  await logEvent(admin, {
    orgId,
    runId: run.id,
    actorId: actor.employeeId,
    action: "exported",
    payload: { type, omitted: built.omitted.length },
  });

  const month = String(run.period_month).padStart(2, "0");
  return new NextResponse(built.csv, {
    headers: {
      ...PRIVATE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pulse-${type}-${run.period_year}-${month}.csv"`,
      // Surfaced so the page can warn about anyone left off the file.
      "X-Pulse-Omitted": String(built.omitted.length),
    },
  });
}
