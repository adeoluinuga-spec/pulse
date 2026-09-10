import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/apiAuth";
import { canReviewAppraisal, validDate, validateManagerReview, validateWeights, visibleAppraisal,
  type AppraisalCycleRow, type AppraisalEmployee, type AppraisalRecord, type ManagerReview } from "@/lib/appraisalEngine";
import { APPRAISAL_COLUMNS, appraisalCsv, loadAppraisalEvidence, readAll } from "@/lib/appraisalService";

const headers = { "Cache-Control":"private, no-store" };
const reply = (body:unknown,status=200) => NextResponse.json(body,{status,headers});
async function context() {
  const user=await getRouteUser();
  if (!user) return { error:reply({error:"Sign in to open performance reviews."},401) };
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:actor,error}=await admin.from("employees").select("id,org_id,platform_role").eq("user_id",user.id).maybeSingle();
  if (error || !actor?.org_id) return {error:reply({error:"Your account is not linked to an organisation."},403)};
  return {admin,user,actor,isHr:["hr_admin","super_admin"].includes(actor.platform_role)};
}
function failure(error:unknown) {
  const e=error as {code?:string;message?:string};
  if (["42P01","42703","42883","PGRST202","PGRST204","PGRST205"].includes(e.code??"") || /workflow_status|appraisal_cycle_id|report_frequency|appraisal_peer_assignments/.test(e.message??"")) {
    return reply({error:"Performance reviews need the latest database setup. Apply schema/10_performance_appraisal.sql in the Supabase SQL Editor.",code:"migration_required"},503);
  }
  return reply({error:["22023","40001","42501"].includes(e.code??"") ? e.message : "The appraisal could not be loaded or saved. Please retry."},e.code==="40001"?409:e.code==="42501"?403:e.code==="22023"?422:500);
}

export async function GET(request:Request) {
  const ctx=await context(); if(ctx.error)return ctx.error;
  const {admin,actor,isHr}=ctx;
  try {
    const [cycles,people]=await Promise.all([
      readAll<AppraisalCycleRow>((from,to)=>admin.from("appraisal_cycles").select("id,name,start_date,end_date,status,weights,review_due_date,report_frequency,revision").eq("org_id",actor.org_id).order("created_at",{ascending:false}).order("id").range(from,to)),
      readAll<AppraisalEmployee>((from,to)=>admin.from("employees").select("id,name,email,department,role,line_manager_id,join_date").eq("org_id",actor.org_id).order("name").order("id").range(from,to)),
    ]);
    const params=new URL(request.url).searchParams;
    const cycle=cycles.find(c=>c.id===params.get("cycleId")) ?? (!params.get("cycleId")?cycles[0]:null);
    if(params.get("cycleId")&&!cycle)return reply({error:"Cycle not found."},404);
    if(!cycle)return reply({viewer:{id:actor.id,isHr},cycles,people,records:[],peerTasks:[],cycle:null});
    const all=await readAll<AppraisalRecord>((from,to)=>admin.from("appraisals").select(APPRAISAL_COLUMNS).eq("org_id",actor.org_id).eq("cycle_id",cycle.id).order("id").range(from,to));
    const records=all.filter(r=>r.employee_id===actor.id||r.reviewer_id===actor.id||isHr).map(r=>visibleAppraisal(r,actor.id));
    const tasks=await readAll<{id:string;appraisal_id:string;submitted_at:string|null}>((from,to)=>admin.from("appraisal_peer_assignments").select("id,appraisal_id,submitted_at").eq("org_id",actor.org_id).eq("reviewer_id",actor.id).order("id").range(from,to));
    const peerTasks=tasks.flatMap(t=>{const row=all.find(r=>r.id===t.appraisal_id);return row?[{...t,employeeName:people.find(p=>p.id===row.employee_id)?.name,open:!t.submitted_at&&["self_review","manager_review"].includes(row.workflow_status)&&["active","review"].includes(cycle.status)}]:[];});
    if(params.get("export")==="csv") {
      const {error}=await admin.from("appraisal_events").insert({org_id:actor.org_id,cycle_id:cycle.id,actor_id:actor.id,action:"export_released",payload:{count:records.filter(r=>["released","acknowledged"].includes(r.workflow_status)).length}});
      if(error)throw error;
      return new NextResponse(appraisalCsv(records,people,cycle),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=pulse-performance-reviews.csv"}});
    }
    const appraisalId=params.get("appraisalId");
    let detail=null;
    if(appraisalId) {
      const raw=all.find(r=>r.id===appraisalId), row=records.find(r=>r.id===appraisalId);
      if(!raw||!row)return reply({error:"This appraisal is outside your review scope."},403);
      const published=["released","acknowledged"].includes(row.workflow_status);
      const hidePrivate=raw.employee_id===actor.id&&!published;
      const evidence=raw.evidence_snapshot && !hidePrivate ? {snapshot:raw.evidence_snapshot,availableGoals:[],availableKpis:[]}
        : await loadAppraisalEvidence(admin,actor.org_id,cycle,raw,people,hidePrivate?null:raw.manager_assessment,hidePrivate);
      const events=await readAll<{action:string;created_at:string;payload:Record<string,unknown>}>((from,to)=>admin.from("appraisal_events").select("action,created_at,payload").eq("org_id",actor.org_id).eq("appraisal_id",raw.id).order("created_at",{ascending:false}).order("id").range(from,to));
      const peers=hidePrivate?[]:await readAll<{reviewer_id:string;submitted_at:string|null}>((from,to)=>admin.from("appraisal_peer_assignments").select("reviewer_id,submitted_at").eq("org_id",actor.org_id).eq("appraisal_id",raw.id).order("id").range(from,to));
      detail={row,...evidence,peers,events:events.filter(e=>e.action!=="peer_submit"&&(!hidePrivate||["self_save","self_submit","return_to_employee","assign_reviewer"].includes(e.action))).map(e=>({action:e.action,created_at:e.created_at,reason:typeof e.payload.reason==="string"?e.payload.reason:null}))};
    }
    return reply({viewer:{id:actor.id,isHr},cycles,people,records,peerTasks,cycle,detail});
  }catch(error){return failure(error);}
}

const text=(value:unknown,min=0,max=8000)=>typeof value==="string"&&value.trim().length>=min&&value.length<=max;
const number=(value:unknown,min=0,max=100)=>typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max;
const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function POST(request:Request) {
  const ctx=await context();if(ctx.error)return ctx.error;
  try {
    const input=await request.text(); if(input.length>150000)return reply({error:"Review payload is too large."},413);
    let body;try{body=JSON.parse(input);}catch{return reply({error:"Invalid request."},400);}
    const {action,cycleId,appraisalId,revision,payload:p}=body??{};
    if(!p||typeof p!=="object"||Array.isArray(p)||!Number.isSafeInteger(revision)||revision<0)return reply({error:"Invalid review payload or revision."},400);
    let valid=false;
    switch(action) {
      case "create_cycle":valid=text(p.name,3,120)&&validDate(p.start_date)&&validDate(p.end_date)&&validDate(p.review_due_date)&&p.start_date<=p.end_date&&p.review_due_date>=p.end_date&&Date.parse(p.end_date)-Date.parse(p.start_date)<=732*86400000&&validateWeights(p.weights)&&["weekly","monthly","none"].includes(p.report_frequency)&&(p.report_frequency!=="none"||p.weights.report_consistency===0);break;
      case "enrol":valid=Array.isArray(p.employees)&&p.employees.length>0&&p.employees.length<=1000&&p.employees.every((e:{employeeId?:unknown;reviewerId?:unknown})=>uuid(e.employeeId)&&(!e.reviewerId||uuid(e.reviewerId)));break;
      case "activate":case "start_review":case "close_cycle":valid=true;break;
      case "self_save":case "self_submit":valid=text(p.achievements,action==="self_submit"?20:0)&&text(p.challenges,action==="self_submit"?10:0)&&text(p.support,action==="self_submit"?10:0);break;
      case "manager_save":valid=Array.isArray(p.ratings)&&p.ratings.length===5&&p.ratings.every((n:unknown)=>number(n,0,5)&&Number.isInteger(n))&&text(p.notes)&&Array.isArray(p.development)&&p.development.length<=10&&p.development.every((a:Record<string,unknown>)=>a&&text(a.title,0,500)&&text(a.dueDate,0,10)&&(!a.dueDate||validDate(a.dueDate))&&["employee","manager"].includes(String(a.owner))&&["planned","in_progress","complete"].includes(String(a.status)));break;
      case "manager_submit":valid=validateManagerReview(p);break;
      case "release":valid=number(p.rating,1,5)&&Number.isInteger(p.rating)&&text(p.rationale,20);break;
      case "return_to_employee":case "return_to_manager":valid=text(p.reason,10,2000);break;
      case "assign_reviewer":valid=uuid(p.reviewerId);break;
      case "assign_peers":valid=Array.isArray(p.reviewerIds)&&p.reviewerIds.length>0&&p.reviewerIds.length<=30&&p.reviewerIds.every(uuid);break;
      case "peer_submit":valid=number(p.rating,1,5)&&Number.isInteger(p.rating)&&text(p.comment,0,3000);break;
      case "acknowledge":valid=text(p.response,0,4000);break;
      case "development":valid=number(p.index,0,9)&&Number.isInteger(p.index)&&["planned","in_progress","complete"].includes(p.status);break;
      case "add_goal":valid=text(p.title,3,200)&&number(p.weight)&&Number.isInteger(p.weight)&&number(p.progress)&&Number.isInteger(p.progress);break;
      case "add_kpi":valid=text(p.title,3,200)&&number(p.weight)&&Number.isInteger(p.weight)&&number(p.target,0,1e12)&&number(p.actual,0,1e12)&&text(p.unit,0,40)&&["higher","lower"].includes(p.direction)&&(p.direction==="lower"||p.target>0);break;
      case "link_goal":case "link_kpi":valid=uuid(p.id);break;
      case "update_kpi":valid=uuid(p.id)&&number(p.actual,0,1e12)&&text(p.reason,10,2000);break;
    }
    if(!valid||(action!=="create_cycle"&&!uuid(cycleId))||(!["create_cycle","enrol","activate","start_review","close_cycle"].includes(action)&&!uuid(appraisalId)))return reply({error:"Check all required fields, ratings, dates and weights."},422);
    let snapshot=null;
    if(action==="manager_submit") {
      const {data:row,error}=await ctx.admin.from("appraisals").select(APPRAISAL_COLUMNS).eq("id",appraisalId).eq("org_id",ctx.actor.org_id).eq("cycle_id",cycleId).single();
      if(error||!row||!canReviewAppraisal(ctx.actor.id,row as AppraisalRecord))return reply({error:"Only the assigned reviewer can sign off this appraisal."},403);
      const {data:cycle,error:cycleError}=await ctx.admin.from("appraisal_cycles").select("*").eq("id",cycleId).eq("org_id",ctx.actor.org_id).single();
      if(cycleError)throw cycleError;
      const people=await readAll<AppraisalEmployee>((from,to)=>ctx.admin.from("employees").select("id,name,email,department,role,line_manager_id,join_date").eq("org_id",ctx.actor.org_id).order("id").range(from,to));
      snapshot=(await loadAppraisalEvidence(ctx.admin,ctx.actor.org_id,cycle as AppraisalCycleRow,row as AppraisalRecord,people,p as ManagerReview)).snapshot;
      if(!snapshot.ready)return reply({error:"Complete the weighted evidence before manager sign-off.",blockers:snapshot.blockers},422);
    }
    const {data,error}=await ctx.admin.rpc("appraisal_command",{p_user:ctx.user.id,p_action:action,p_cycle:cycleId??null,p_appraisal:appraisalId??null,p_revision:revision,p_payload:p,p_snapshot:snapshot});
    if(error)return failure(error);
    return reply(data);
  }catch(error){return failure(error);}
}
