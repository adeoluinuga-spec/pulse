"use client";
import { useState } from "react";
import { APPRAISAL_WEIGHTS, COMPONENT_LABELS, type AppraisalWeights } from "@/lib/appraisalEngine";
import type { AppraisalWorkspaceData, Command } from "./types";
import styles from "./appraisal.module.css";
export function CreateCycle({command,busy}:{command:Command;busy:boolean}) {
  const [name,setName]=useState("");const [start,setStart]=useState("");const [end,setEnd]=useState("");const [due,setDue]=useState("");
  const [frequency,setFrequency]=useState("weekly");const [weights,setWeights]=useState<AppraisalWeights>({...APPRAISAL_WEIGHTS});
  const total=Object.values(weights).reduce((sum,w)=>sum+w,0);
  return <form onSubmit={e=>{e.preventDefault();void command("create_cycle",{name,start_date:start,end_date:end,review_due_date:due,report_frequency:frequency,weights});}}>
    <p className={styles.muted}>Define the performance period and agree the evidence weights before inviting reviews. Start with Pulse’s existing 35 / 20 / 25 / 10 / 10 model.</p>
    <label className={styles.field}>Cycle name<input required minLength={3} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="2026 annual performance review" /></label>
    <div className={styles.grid2}><label className={styles.field}>Period starts<input type="date" required value={start} onChange={e=>setStart(e.target.value)} /></label><label className={styles.field}>Period ends<input type="date" required min={start} value={end} onChange={e=>setEnd(e.target.value)} /></label></div>
    <div className={styles.grid2}><label className={styles.field}>Review due date<input type="date" required min={end} value={due} onChange={e=>setDue(e.target.value)} /></label><label className={styles.field}>Report cadence<select aria-label="Report cadence" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="none">Not scored (set report weight to 0)</option></select></label></div>
    <div className={styles.grid2}>{(Object.keys(weights) as Array<keyof AppraisalWeights>).map(key=><label className={styles.field} key={key}>{COMPONENT_LABELS[key]} (%)<input type="number" required min={0} max={100} step={1} value={weights[key]} onChange={e=>setWeights({...weights,[key]:Number(e.target.value)})} /></label>)}</div>
    <div className={total===100?styles.notice:styles.error}>Total weight: {total}%. Set a component to 0 only when it is intentionally excluded. Peer feedback requires three distinct responses when weighted. Weights are fixed when this cycle is created.</div>
    <button className={styles.primary} disabled={busy||total!==100}>Create draft cycle</button>
  </form>;
}
export function EnrolEmployees({data,command,busy}:{data:AppraisalWorkspaceData;command:Command;busy:boolean}) {
  const candidates=data.people.filter(p=>!data.records.some(r=>r.employee_id===p.id));
  const [selected,setSelected]=useState<string[]>([]);const [reviewers,setReviewers]=useState<Record<string,string>>({});
  return <div><p className={styles.muted}>Reporting lines provide the default reviewer. Choose another reviewer for top-level staff or an agreed delegation. Nobody can review themselves.</p>
    <button className={`${styles.small} mt-3`} onClick={()=>setSelected(selected.length===candidates.length?[]:candidates.map(p=>p.id))}>Select / clear all</button>
    <div className={styles.tableWrap} style={{maxHeight:400,marginTop:12}}><table className={styles.table}><thead><tr><th>Include</th><th>Employee</th><th>Reviewer</th></tr></thead><tbody>{candidates.map(p=><tr key={p.id}><td><input type="checkbox" aria-label={`Include ${p.name}`} checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))} /></td><td><strong>{p.name}</strong><small>{p.department}</small></td><td><select className={styles.input} aria-label={`Reviewer for ${p.name}`} value={reviewers[p.id]??p.line_manager_id??""} onChange={e=>setReviewers({...reviewers,[p.id]:e.target.value})}><option value="">Choose reviewer</option>{data.people.filter(other=>other.id!==p.id).map(other=><option key={other.id} value={other.id}>{other.name}</option>)}</select></td></tr>)}</tbody></table></div>
    {!candidates.length&&<p className={styles.notice}>All staff are already enrolled.</p>}
    <div className={styles.actions}><button className={styles.primary} disabled={busy||!selected.length||selected.some(id=>!(reviewers[id]??data.people.find(p=>p.id===id)?.line_manager_id))} onClick={()=>command("enrol",{employees:selected.map(id=>({employeeId:id,reviewerId:reviewers[id]??data.people.find(p=>p.id===id)?.line_manager_id}))})}>Enrol {selected.length} staff</button></div>
  </div>;
}
