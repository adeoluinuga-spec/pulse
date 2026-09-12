"use client";
import { useState } from "react";
import { KIND_LABEL, NODE_KINDS, MEASURE_TYPES, suggestedChildKind, validateNode, type Strategy } from "@/lib/strategyCascade";
import type { StrategyData, StrategyRow } from "./types";
import s from "@/components/appraisal/appraisal.module.css";

export default function StrategyForm({data,node,parentId,busy,onSave,onDirty}:{data:StrategyData;node:StrategyRow|null;parentId:string;busy:boolean;onSave:(body:Record<string,unknown>)=>Promise<void>;onDirty:()=>void}) {
 const [draft,setDraft]=useState(()=>({
  title:node?.title??"",kind:node?.kind??suggestedChildKind(data.nodes.find(n=>n.id===parentId)?.kind??null),customKindLabel:node?.custom_kind_label??"",
  parentId:node?.parent_id??parentId,ownerId:node?.owner_id??"",description:node?.description??"",measure:node?.measure??"",measureType:node?.measure_type??"number",
  measureDirection:node?.measure_direction??"higher",baselineValue:node?.baseline_value?.toString()??"",targetValue:node?.target_value?.toString()??"",currentValue:node?.current_value?.toString()??"",
  unit:node?.unit??"",weight:node?.weight??25,startDate:node?.start_date??"",dueDate:node?.due_date??"",periodLabel:node?.period_label??"",status:node?.status??"on_track",
  strategies:node?.strategies??[] as Strategy[],
 }));
 const [errors,setErrors]=useState<string[]>([]);
 const descendants=new Set(node?[node.id]:[]);
 for(let i=0;i<data.nodes.length;i++)for(const n of data.nodes)if(n.parent_id&&descendants.has(n.parent_id))descendants.add(n.id);
 const changeStrategy=(index:number,key:keyof Strategy,value:string)=>setDraft({...draft,strategies:draft.strategies.map((a,i)=>i===index?{...a,[key]:value}:a)});
 return <form onChangeCapture={onDirty} onSubmit={e=>{e.preventDefault();const validation=validateNode(draft,{parentKind:data.nodes.find(n=>n.id===draft.parentId)?.kind??null});if(!validation.ok){setErrors(validation.errors);return;}setErrors([]);void onSave({...validation.node,status:draft.status,id:node?.id});}}>
  {!!errors.length&&<div role="alert" className={s.error}>{errors.join(" ")}</div>}
  <fieldset disabled={busy}><label className={s.field}>Title<input required minLength={3} maxLength={300} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
  <div className={s.grid2}><label className={s.field}>Level<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as typeof draft.kind})}>{NODE_KINDS.map(kind=><option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></label>
  <label className={s.field}>Parent level<select value={draft.parentId} onChange={e=>setDraft({...draft,parentId:e.target.value})}><option value="">Top level</option>{data.nodes.filter(n=>!descendants.has(n.id)).map(n=><option value={n.id} key={n.id}>{n.title}</option>)}</select></label>
  {draft.kind==="custom"&&<label className={s.field}>Custom level name<input required maxLength={60} value={draft.customKindLabel} onChange={e=>setDraft({...draft,customKindLabel:e.target.value})}/></label>}
  <label className={s.field}>Accountable owner<select value={draft.ownerId} onChange={e=>setDraft({...draft,ownerId:e.target.value})}><option value="">Not assigned</option>{data.people.map(person=><option key={person.id} value={person.id}>{person.name??person.email}</option>)}</select></label>
  <label className={s.field}>Relative weight<input type="number" required min={0} max={100} value={draft.weight} onChange={e=>setDraft({...draft,weight:Number(e.target.value)})}/></label>
  <label className={s.field}>Period label<input maxLength={60} value={draft.periodLabel} onChange={e=>setDraft({...draft,periodLabel:e.target.value})}/></label>
  <label className={s.field}>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{["draft","on_track","at_risk","behind","completed"].map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
  {(["startDate","dueDate"] as const).map(key=><label className={s.field} key={key}>{key==="startDate"?"Starts":"Due date"}<input type="date" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}</div>
  <label className={s.field}>Description<textarea maxLength={8000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
  <details className={s.notice} open={Boolean(node && (node.measure || node.target_value !== null))}><summary>Direct measure (optional)</summary><p className={s.muted}>Children take precedence in the roll-up. A direct measure is used when this level has no child levels or attached evidence.</p>
   <label className={s.field}>Success measure<input maxLength={300} value={draft.measure} onChange={e=>setDraft({...draft,measure:e.target.value})}/></label>
   <div className={s.grid2}><label className={s.field}>Measure type<select value={draft.measureType} onChange={e=>setDraft({...draft,measureType:e.target.value as typeof draft.measureType})}>{MEASURE_TYPES.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <label className={s.field}>Direction<select value={draft.measureDirection} onChange={e=>setDraft({...draft,measureDirection:e.target.value as typeof draft.measureDirection})}><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></label>
   {([["baselineValue","Baseline"],["targetValue","Target"],["currentValue","Current reading"]] as const).map(([key,label])=><label className={s.field} key={key}>{label}<input type="number" step="any" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
   <label className={s.field}>Unit<input maxLength={40} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}/></label></div>
  </details>
  <h3 className="mt-5 font-semibold">How this will be achieved</h3><p className={s.muted}>Add delivery actions, expected outcomes, responsible people and resources.</p>
  {draft.strategies.map((a,i)=><div className={s.notice} key={i}><label className={s.field}>Action {i+1}<input required value={a.statement} onChange={e=>changeStrategy(i,"statement",e.target.value)}/></label>
   <label className={s.field}>Expected outcome<textarea required value={a.expectedOutcome} onChange={e=>changeStrategy(i,"expectedOutcome",e.target.value)}/></label>
   <div className={s.grid2}><label className={s.field}>Responsible person<select value={a.responsibleId??""} onChange={e=>changeStrategy(i,"responsibleId",e.target.value)}><option value="">Not assigned</option>{data.people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
   <label className={s.field}>Resources<input value={a.resources??""} onChange={e=>changeStrategy(i,"resources",e.target.value)}/></label>
   {(["startDate","dueDate"] as const).map(key=><label className={s.field} key={key}>{key==="startDate"?"Action starts":"Action due"}<input type="date" value={a[key]??""} onChange={e=>changeStrategy(i,key,e.target.value)}/></label>)}</div>
   <button type="button" className={s.small} onClick={()=>{onDirty();setDraft({...draft,strategies:draft.strategies.filter((_,j)=>i!==j)});}}>Remove action {i+1}</button>
  </div>)}
  <button type="button" className={s.button} disabled={draft.strategies.length>=50} onClick={()=>{onDirty();setDraft({...draft,strategies:[...draft.strategies,{statement:"",expectedOutcome:"",responsibleId:null,resources:null,startDate:null,dueDate:null}]});}}>Add delivery action</button>
  <div className={s.actions}><button className={s.primary}>Save strategy level</button></div></fieldset>
 </form>;
}
