"use client";
import { useState } from "react";
import type { EvidencePlan } from "@/lib/appraisalEvidenceLink";
import type { AppraisalWorkspaceData } from "./types";
import Dialog from "./AppraisalDialog";
import s from "./appraisal.module.css";

type Candidate={id:string;label:string;reason:string;kind:"goal"|"kpi";ownerId:string|null;appraisalId:string|null;blocked:string|null};
export default function EvidenceMatcher({data,disabled,onUpdated}:{data:AppraisalWorkspaceData;disabled:boolean;onUpdated:()=>Promise<void>}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [items,setItems]=useState<Candidate[]>([]),[selected,setSelected]=useState<string[]>([]),[skips,setSkips]=useState<Array<{label:string;reason:string}>>([]),[done,setDone]=useState("");
 const key=(item:Candidate)=>item.kind+":"+item.id;
 async function preview(){
  setOpen(true);setLoading(true);setError("");setDone("");setSelected([]);
  try{
   const results=await Promise.all(["/api/appraisals/evidence?cycleId="+data.cycle!.id,"/api/goals","/api/kpis"].map(async url=>{const response=await fetch(url,{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error??"Evidence could not be loaded.");return body;}));
   const plan=results[0].plan as EvidencePlan;
   const candidates:Candidate[]=[];
   for(const kind of ["goal","kpi"] as const)for(const entry of plan[kind==="goal"?"goals":"kpis"].link){
    const sources=kind==="goal"?results[1].goals:results[2].kpis;
    const source=sources.find((r:{id:string})=>r.id===entry.id);
    const ownerId=(kind==="goal"?source?.owner_id:source?.employee_id)??null;
    const row=data.records.find(r=>r.employee_id===ownerId);
    const blocked=!row?"Employee is not enrolled in your review scope.":ownerId===data.viewer.id?"Another HR administrator must link your own evidence.":!["self_review","manager_review"].includes(row.workflow_status)?"Manager sign-off has frozen this review.":data.cycle?.status==="closed"?"Cycle is closed.":null;
    candidates.push({...entry,kind,ownerId,appraisalId:row?.id??null,blocked});
   }
   setItems(candidates);setSkips([...plan.goals.skip,...plan.kpis.skip]);
  }catch(e){setError(e instanceof Error?e.message:"Could not preview evidence.");setItems([]);setSkips([]);}finally{setLoading(false);}
 }
 async function attach(){
  setBusy(true);setError("");let completed=0;
  const revisions=new Map(data.records.map(r=>[r.id,r.revision]));
  try{
   for(const item of items.filter(i=>selected.includes(key(i))&&!i.blocked)){
    const response=await fetch("/api/appraisals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:item.kind==="goal"?"link_goal":"link_kpi",payload:{id:item.id},cycleId:data.cycle!.id,appraisalId:item.appraisalId,revision:revisions.get(item.appraisalId!)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error??"Evidence could not be linked.");
    revisions.set(item.appraisalId!,result.revision);completed++;
    setSelected(current=>current.filter(id=>id!==key(item)));setItems(current=>current.filter(i=>key(i)!==key(item)));
   }
   setDone(completed+" evidence item"+(completed===1?"":"s")+" attached. Open each employee review to check the resulting coverage.");
  }catch(e){setError(completed+" items were saved before the operation stopped. "+(e instanceof Error?e.message:"Reload and retry.")+" Refresh this preview before continuing.");setSelected([]);}
  finally{try{await onUpdated();}catch{setError("Evidence updates may have saved, but the review list could not refresh. Reload the page before continuing.");}setBusy(false);}
 }
 if(!data.viewer.isHr||!data.cycle)return null;
 return <><button className={s.button} disabled={disabled||data.cycle.status==="closed"} onClick={()=>void preview()}>Match goal & KPI evidence</button>
  <Dialog open={open} title="Match evidence to this cycle" busy={busy||loading} error={error} onClose={()=>setOpen(false)}>
   <p className={s.muted}>Review the matches for {data.cycle.name}. Goal dates and KPI period labels suggest candidates; choose the items you want to attach. Existing reviewer permissions and sign-off locks still apply.</p>
   {loading?<p role="status" className={s.notice}>Preparing matches…</p>:<>
    {done&&<p role="status" className={s.notice}>{done}</p>}
    <div className={s.toolbar}><button className={s.small} disabled={busy} onClick={()=>setSelected(items.filter(i=>!i.blocked).map(key))}>Select eligible matches</button><button className={s.small} disabled={busy} onClick={()=>void preview()}>Refresh preview</button></div>
    {items.length?<div className={s.stack}>{items.map(item=><label className={s.evidenceItem} key={key(item)}><span className={s.row}><input type="checkbox" checked={selected.includes(key(item))} disabled={busy||Boolean(item.blocked)} onChange={e=>setSelected(e.target.checked?[...selected,key(item)]:selected.filter(id=>id!==key(item)))}/><strong>{item.label}</strong><span className={s.badge}>{item.kind}</span></span><p>{data.people.find(person=>person.id===item.ownerId)?.name??"Unassigned"} · {item.reason}</p>{item.blocked&&<p>{item.blocked}</p>}</label>)}</div>:<p className={s.notice}>No new matching evidence. Add goals or KPIs, enrol their owners, or use an individual review to choose other existing evidence.</p>}
    {!!skips.length&&<details className={s.notice}><summary>{skips.length} items not selected by the matching rules</summary>{skips.map((entry,i)=><p className="mt-3" key={i}><strong>{entry.label}</strong><br/>{entry.reason}</p>)}</details>}
    <div className={s.actions}><button className={s.primary} disabled={busy||!selected.length||Boolean(error)} onClick={()=>void attach()}>Attach {selected.length} selected items</button></div>
   </>}
  </Dialog>
 </>;
}
