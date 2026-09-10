import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAppraisalSnapshot, type AppraisalCycleRow, type AppraisalEmployee, type AppraisalRecord, type GoalEvidence, type KpiEvidence, type ManagerReview, type ReportEvidence } from "./appraisalEngine";

export const APPRAISAL_COLUMNS = "id,employee_id,reviewer_id,cycle_id,workflow_status,revision,self_assessment,manager_assessment,evidence_snapshot,development_plan,calibration,employee_response,self_submitted_at,manager_submitted_at,released_at,acknowledged_at,total_score";
export async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await fetchPage(from, from + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 500) return rows;
    if (rows.length >= 20000) throw new Error("This evidence set exceeds the interactive review limit. Narrow the cycle period.");
  }
}

export async function loadAppraisalEvidence(admin: SupabaseClient, orgId: string, cycle: AppraisalCycleRow, row: AppraisalRecord,
  people: AppraisalEmployee[], manager: ManagerReview | null, hidePeer = false) {
  const employee = people.find(p => p.id === row.employee_id);
  if (!employee) throw new Error("Employee not found in this organisation.");
  const [goals, kpis, reports, leave, peers] = await Promise.all([
    readAll<GoalEvidence>((from,to) => admin.from("goals").select("id,title,percent_complete,weight,cycle,appraisal_cycle_id,updated_at").eq("org_id",orgId).eq("owner_id",row.employee_id).order("id").range(from,to)),
    readAll<KpiEvidence>((from,to) => admin.from("kpis").select("id,name,target_value,current_value,weight,unit,measure_direction,cycle,appraisal_cycle_id").eq("org_id",orgId).eq("employee_id",row.employee_id).order("id").range(from,to)),
    readAll<ReportEvidence>((from,to) => admin.from("reports").select("id,report_type,submitted_at,period_start,period_end,status,accomplishments,blockers,support_needed").eq("org_id",orgId).eq("employee_id",row.employee_id).gte("submitted_at",cycle.start_date).order("id").range(from,to)),
    readAll<{start_date:string;end_date:string}>((from,to) => admin.from("leave_requests").select("start_date,end_date").eq("org_id",orgId).eq("employee_id",row.employee_id).eq("status","approved").lte("start_date",cycle.end_date).gte("end_date",cycle.start_date).order("id").range(from,to)),
    hidePeer ? Promise.resolve([]) : readAll<{reviewer_id:string;rating:number;submitted_at:string}>((from,to) => admin.from("peer_feedback").select("reviewer_id,rating,submitted_at").eq("cycle_id",cycle.id).eq("reviewee_id",row.employee_id).order("id").range(from,to)),
  ]);
  // A legacy cycle-name link is admitted only when that name is unique in the
  // tenant. New records always use the actual cycle FK.
  const { count, error } = await admin.from("appraisal_cycles").select("id",{count:"exact",head:true}).eq("org_id",orgId).eq("name",cycle.name);
  if (error) throw error;
  const linked = (item: {appraisal_cycle_id:string|null;cycle:string|null}) => item.appraisal_cycle_id === cycle.id || (!item.appraisal_cycle_id && item.cycle === cycle.name && count === 1);
  const periodReports = reports.filter(r => {
    const date = r.period_end || r.period_start || r.submitted_at.slice(0,10);
    return date >= cycle.start_date && date <= cycle.end_date;
  });
  const allowedPeers = peers.filter(p => p.reviewer_id !== row.employee_id && p.reviewer_id !== row.reviewer_id && people.some(e => e.id === p.reviewer_id));
  return {
    snapshot: buildAppraisalSnapshot({ cycle, goals:goals.filter(linked),kpis:kpis.filter(linked),reports:periodReports,leave,peers:allowedPeers,
      joinDate:employee.join_date,manager,asOf:new Date().toISOString() }),
    availableGoals: goals.filter(g => !linked(g) && !g.appraisal_cycle_id),
    availableKpis: kpis.filter(k => !linked(k) && !k.appraisal_cycle_id),
  };
}

export function appraisalCsv(rows: AppraisalRecord[], people: AppraisalEmployee[], cycle: AppraisalCycleRow) {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  return [["Cycle","Employee","Department","Stage","Evidence score","HR rating (1–5)","Released at","Acknowledged at"],
    ...rows.filter(r => ["released","acknowledged"].includes(r.workflow_status)).map(row => {
      const person=people.find(p=>p.id===row.employee_id);
      return [cycle.name,person?.name,person?.department,row.workflow_status,row.total_score,row.calibration?.rating,row.released_at,row.acknowledged_at];
    })].map(row=>row.map(escape).join(",")).join("\r\n");
}
