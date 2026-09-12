"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ClipboardCheck, Download, Loader2, Plus, RefreshCw, Users } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { RATING_LABELS } from "@/lib/appraisalEngine";
import { stageLabels, type AppraisalWorkspaceData, type Command } from "./types";
import AppraisalDialog from "./AppraisalDialog";
import { CreateCycle, EnrolEmployees } from "./CycleSetup";
import AppraisalReview from "./AppraisalReview";
import EvidenceMatcher from "./EvidenceMatcher";
import PlanningNav from "@/components/planning/PlanningNav";
import styles from "./appraisal.module.css";

export default function AppraisalWorkspace() {
  const [data,setData]=useState<AppraisalWorkspaceData|null>(null),[error,setError]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [scope,setScope]=useState("all"),[search,setSearch]=useState(""),[stage,setStage]=useState("");
  const [dialog,setDialog]=useState<"create"|"enrol"|"activate"|"start_review"|"close_cycle"|"peer"|null>(null);
  const [peerAppraisal,setPeerAppraisal]=useState(""),[peerRating,setPeerRating]=useState(0),[peerComment,setPeerComment]=useState("");
  const requestSequence=useRef(0);
  const {showToast}=useToast();
  const load=useCallback(async(cycleId?:string,appraisalId?:string)=>{
    const sequence=++requestSequence.current;
    const query=new URLSearchParams();if(cycleId)query.set("cycleId",cycleId);if(appraisalId)query.set("appraisalId",appraisalId);
    const response=await fetch(`/api/appraisals?${query}`,{cache:"no-store"});const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Unable to load performance reviews.");
    if(sequence===requestSequence.current){setData(result);setDirty(false);setError("");}
  },[]);
  useEffect(()=>{let active=true;const pending=requestSequence;void load().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;pending.current++;};},[load]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  async function navigate(cycleId?:string,appraisalId?:string) {
    if(dirty&&!window.confirm("Discard unsaved review edits and open another view?"))return;
    setBusy(true);try{await load(cycleId,appraisalId);if(appraisalId)requestAnimationFrame(()=>document.getElementById("appraisal-review")?.scrollIntoView({behavior:"smooth",block:"start"}));}catch(e){setError(e instanceof Error?e.message:"Unable to load.");}finally{setBusy(false);}
  }
  const command:Command=async(action,payload,appraisalId,revision)=>{
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/appraisals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload,cycleId:data?.cycle?.id,appraisalId,revision:revision??data?.cycle?.revision??0})});
      const result=await response.json();if(!response.ok)throw new Error([result.error,...(result.blockers??[])].join(" "));
      setDialog(null);setDirty(false);
      showToast(action==="release"?"Appraisal released to the employee.":action==="manager_submit"?"Manager review signed off and sent for HR calibration.":action==="self_submit"?"Reflection submitted to your reviewer.":"Appraisal changes saved.","success");
      try{await load(result.cycleId??data?.cycle?.id,action==="create_cycle"?undefined:data?.detail?.row.id);}catch{setError("Your change was saved, but the refreshed view could not load. Reload before making another change.");}
      return true;
    }catch(e){setError(e instanceof Error?e.message:"Unable to save.");return false;}finally{setBusy(false);}
  };
  async function exportReviews() {
    if(!data?.cycle)return;
    setBusy(true);try{const response=await fetch(`/api/appraisals?cycleId=${data.cycle.id}&export=csv`);if(!response.ok){const body=await response.json();throw new Error(body.error);}const url=URL.createObjectURL(await response.blob());const a=document.createElement("a");a.href=url;a.download="pulse-performance-reviews.csv";a.click();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:"Export failed.");}finally{setBusy(false);}
  }
  if(loading)return <div className={styles.notice} role="status"><Loader2 size={16} className="inline animate-spin" /> Loading performance reviews…</div>;
  if(!data)return <main className={styles.workspace} data-appraisal-workspace><h1 className="text-2xl font-semibold">Performance reviews</h1><div className={styles.error} role="alert">{error}</div><button className={styles.button} disabled={busy} onClick={()=>navigate()}>Try again</button></main>;
  const {cycle,records,viewer,people}=data;
  const released=records.filter(r=>["released","acknowledged"].includes(r.workflow_status)).length;
  const filtered=records.filter(row=>{
    const person=people.find(p=>p.id===row.employee_id);
    return(scope==="all"||scope==="mine"&&row.employee_id===viewer.id||scope==="team"&&row.reviewer_id===viewer.id)&&(!stage||row.workflow_status===stage)&&`${person?.name} ${person?.department} ${person?.role}`.toLowerCase().includes(search.toLowerCase());
  });
  return <main className={styles.workspace} data-appraisal-workspace>
    <div className={styles.noPrint}><PlanningNav/><header className={styles.header}><div><div className={styles.eyebrow}>Performance & development / Review workspace</div><h1>Recognise impact.<br />Build what comes next.</h1><p className={styles.muted}>One review, grounded in the work: objectives, KPIs, reports and feedback. Clear ownership from employee reflection to the next development commitment.</p></div><div className={styles.row}><button className={styles.button} disabled={busy||!cycle} onClick={exportReviews}><Download size={14} />Export released</button>{viewer.isHr&&<button className={styles.primary} disabled={busy} onClick={()=>setDialog("create")}><Plus size={14} />New cycle</button>}</div></header>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    <div className={styles.toolbar}><EvidenceMatcher data={data} disabled={busy||dirty} onUpdated={()=>load(data.cycle?.id,data.detail?.row.id)}/><label className={`${styles.field} !m-0`} style={{minWidth:240}}>Performance cycle<select aria-label="Performance cycle" disabled={busy} value={cycle?.id??""} onChange={e=>navigate(e.target.value)}>{!cycle&&<option value="">No cycles yet</option>}{data.cycles.map(c=><option value={c.id} key={c.id}>{c.name} · {c.status}</option>)}</select></label><div className={styles.row}><span className={styles.muted}>Employees see their own reviews. Managers see assigned reviews.</span><button className={styles.small} disabled={busy} onClick={()=>navigate(cycle?.id,data.detail?.row.id)}><RefreshCw size={13} />Reload</button></div></div>
    {cycle?<><section className={styles.hero}><div><div className={styles.eyebrow}>{cycle.status} cycle</div><h2>{cycle.name}</h2><p>Performance period: {cycle.start_date||"Not set"} → {cycle.end_date||"Not set"}<br />Review due: {cycle.review_due_date||"Not specified"}</p><div className={styles.sectionNav}>{viewer.isHr&&<>{["draft","active"].includes(cycle.status)&&<button className={styles.button} disabled={busy} onClick={()=>setDialog("enrol")}><Users size={13} />Enrol staff</button>}{cycle.status==="draft"&&<button className={styles.primary} disabled={busy||!records.length} onClick={()=>setDialog("activate")}>Open employee reviews</button>}{cycle.status==="active"&&<button className={styles.button} disabled={busy} onClick={()=>setDialog("start_review")}>Start manager sign-off</button>}{cycle.status==="review"&&<button className={styles.button} disabled={busy||released!==records.length} onClick={()=>setDialog("close_cycle")}>Close cycle</button>}</>}<Link className={styles.button} href="/dashboard/organisation">Reporting structure <ArrowUpRight size={13} /></Link></div></div><div className={styles.heroMeter}><div className={styles.eyebrow}>Review completion</div><strong>{released}<span className="text-base font-normal text-slate-400"> / {records.length}</span></strong><div className={styles.progress}><span style={{width:`${records.length?released/records.length*100:0}%`}} /></div><p>Released within your review scope</p></div></section>
    <section className={styles.metrics}>{[["self_review","Awaiting employee"],["manager_review","With reviewers"],["calibration","In HR calibration"],["released","Released / acknowledged"]].map(([key,label])=><div className={styles.metric} key={key}><strong>{key==="released"?released:records.filter(r=>r.workflow_status===key).length}</strong><span>{label}</span></div>)}</section>
    {data.peerTasks.length>0&&<section className={`${styles.panel} mb-5`}><h2>Your peer feedback assignments</h2><p className={styles.muted}>Comment only on work you have observed. Scores are shown only in a group of at least three distinct peers.</p><div className="mt-3 space-y-3">{data.peerTasks.map(task=><div className={styles.row} style={{justifyContent:"space-between"}} key={task.id}><strong className="text-xs">{task.employeeName}</strong><button className={styles.small} disabled={busy||!task.open} onClick={()=>{setPeerAppraisal(task.appraisal_id);setPeerRating(0);setPeerComment("");setDialog("peer");}}>{task.submitted_at?"Submitted":task.open?"Give feedback":"Not open"}</button></div>)}</div></section>}
    <div className={styles.toolbar}><div className={styles.tabs}>{[["all",viewer.isHr?"Organisation":"My review scope"],["mine","My review"],["team","Assigned to me"]].map(([key,label])=><button key={key} aria-pressed={scope===key} onClick={()=>setScope(key)}>{label}</button>)}</div><div className={styles.row}><input aria-label="Search reviews" className={styles.input} style={{width:210}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a person or department" /><select className={styles.input} style={{width:170}} aria-label="Filter review stage" value={stage} onChange={e=>setStage(e.target.value)}><option value="">All stages</option>{Object.entries(stageLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div></div>
    {filtered.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Employee</th><th>Reviewer</th><th>Stage</th><th>Released outcome</th><th /></tr></thead><tbody>{filtered.map(row=>{const p=people.find(p=>p.id===row.employee_id),manager=people.find(p=>p.id===row.reviewer_id);return <tr key={row.id}><td><strong>{p?.name}</strong><small>{p?.role} · {p?.department}</small></td><td>{manager?.name??"Unassigned"}</td><td><span className={styles.badge} data-stage={row.workflow_status}>{stageLabels[row.workflow_status]}</span></td><td>{row.calibration?RATING_LABELS[row.calibration.rating-1]:"Not released"}</td><td><button className={styles.small} disabled={busy} onClick={()=>navigate(cycle.id,row.id)}>Open review</button></td></tr>;})}</tbody></table></div>:<div className={styles.empty}><ClipboardCheck size={30} /><h2>{records.length?"No matching reviews":"Start with your people"}</h2><p className={styles.muted}>{viewer.isHr?"Enrol staff, confirm their reviewers and open the cycle. Existing reporting lines provide the starting point.":"Your review will appear when HR enrols you or assigns you as a reviewer."}</p>{viewer.isHr&&["draft","active"].includes(cycle.status)&&<button className={styles.primary} onClick={()=>setDialog("enrol")}>Enrol participants</button>}</div>}
    </>:<section className={styles.empty}><ClipboardCheck size={36} /><h2>A proper review starts with clear expectations.</h2><p className={styles.muted}>{viewer.isHr?"Create a cycle, confirm the performance period and evidence weights, then enrol your people. Existing goals, KPIs and work reports will feed their reviews.":"HR has not opened a performance cycle for your organisation yet."}</p>{viewer.isHr&&<button className={styles.primary} onClick={()=>setDialog("create")}>Create your first cycle</button>}</section>}
    </div>
    {data.detail&&<AppraisalReview key={`${data.detail.row.id}-${data.detail.row.revision}`} data={data} detail={data.detail} command={command} busy={busy} error={error} onDirty={()=>setDirty(true)} onClose={()=>navigate(cycle?.id)} />}
    <AppraisalDialog open={dialog!==null} title={dialog==="create"?"Create a performance cycle":dialog==="enrol"?"Enrol staff and confirm reviewers":dialog==="peer"?"Peer feedback":"Update cycle stage"} onClose={()=>setDialog(null)} busy={busy}>
      {error&&<div className={styles.error} role="alert">{error}</div>}
      {dialog==="create"&&<CreateCycle command={command} busy={busy} />}{dialog==="enrol"&&<EnrolEmployees data={data} command={command} busy={busy} />}
      {["activate","start_review","close_cycle"].includes(dialog??"")&&<><p className={styles.muted}>{dialog==="activate"?"This opens employee reflections and peer feedback for the enrolled staff. The agreed cycle weights remain fixed.":dialog==="start_review"?"This enables manager sign-off after the performance period has ended. Employee reflections and peer feedback can still be completed.":"Every appraisal has been released. Closing the cycle stops new scoring work; employees can still acknowledge receipt and follow up on development."}</p><button className={`${styles.primary} mt-5`} disabled={busy} onClick={()=>command(dialog!,{})}>Confirm stage change</button></>}
      {dialog==="peer"&&<form onSubmit={e=>{e.preventDefault();void command("peer_submit",{rating:peerRating,comment:peerComment},peerAppraisal,0);}}><label className={styles.field}>Observed contribution<select aria-label="Peer contribution rating" required value={peerRating} onChange={e=>setPeerRating(Number(e.target.value))}><option value={0}>Choose a rating</option>{RATING_LABELS.map((label,i)=><option key={label} value={i+1}>{i+1} · {label}</option>)}</select></label><label className={styles.field}>Work example (optional)<textarea maxLength={3000} value={peerComment} onChange={e=>setPeerComment(e.target.value)} /></label><p className={styles.muted}>Your response is final once submitted. Individual names and comments are not shown in the appraisal results.</p><button className={`${styles.primary} mt-4`} disabled={busy||!peerRating}>Submit peer feedback</button></form>}
    </AppraisalDialog>
  </main>;
}
