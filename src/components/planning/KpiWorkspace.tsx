"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Plus, RefreshCw, Target } from "lucide-react";
import { FREQUENCIES, FREQUENCY_LABEL, validateKpi } from "@/lib/kpiRules";
import { useToast } from "@/components/ui/Toast";
import Dialog from "@/components/appraisal/AppraisalDialog";
import PlanningNav from "./PlanningNav";
import type { KpiData, KpiRow, StrategyData } from "./types";
import s from "@/components/appraisal/appraisal.module.css";
import p from "./planning.module.css";
const blank=()=>({name:"",description:"",employeeId:"",strategyNodeId:"",unit:"%",baselineValue:"",targetValue:"100",currentValue:"0",weight:25,measureDirection:"higher",frequency:"monthly",cycle:"",isActive:true});
export default function KpiWorkspace({initialNodeId=""}:{initialNodeId?:string}) {
 const [data,setData]=useState<KpiData|null>(null),[nodes,setNodes]=useState<StrategyData["nodes"]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[strategyError,setStrategyError]=useState("");
 const [scope,setScope]=useState(initialNodeId?"all":"mine"),[search,setSearch]=useState(""),[status,setStatus]=useState("active");
 const [form,setForm]=useState<ReturnType<typeof blank>|null>(null),[editing,setEditing]=useState<KpiRow|null>(null),[deleting,setDeleting]=useState<KpiRow|null>(null),[dirty,setDirty]=useState(false);
 const {showToast}=useToast();
 const load=useCallback(async()=>{
  const response=await fetch("/api/kpis",{cache:"no-store"}),body=await response.json();
  if(!response.ok)throw new Error(body.error??"Could not load KPIs.");
  setData(body);setError("");
 },[]);
 useEffect(()=>{let active=true;void Promise.resolve().then(load).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  void fetch("/api/strategy",{cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);if(active)setNodes(b.nodes);}).catch(()=>{if(active)setStrategyError("Strategy links are unavailable. You can still maintain standalone KPIs.");});
  return()=>{active=false;};},[load]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 const close=()=>{if(dirty&&!window.confirm("Discard unsaved KPI changes?"))return;setForm(null);setDirty(false);setError("");};
 function open(row?:KpiRow) {
  setEditing(row??null);setDirty(false);setError("");
  setForm(row?{name:row.name,description:row.description??"",employeeId:row.employee_id,strategyNodeId:row.strategy_node_id??"",unit:row.unit??"",baselineValue:row.baseline_value?.toString()??"",targetValue:String(row.target_value),currentValue:String(row.current_value),weight:row.weight,measureDirection:row.measure_direction,frequency:row.frequency,cycle:row.cycle??"",isActive:row.is_active}:{...blank(),employeeId:data!.viewer.employeeId,strategyNodeId:nodes.some(n=>n.id===initialNodeId)?initialNodeId:""});
 }
 async function save() {
  if(!form)return;
  const validation=validateKpi(form);if(!validation.ok){setError(validation.errors.join(" "));return;}
  setBusy(true);setError("");
  try {
   const response=await fetch("/api/kpis",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...validation.kpi,id:editing?.id})});
   const body=await response.json();if(!response.ok)throw new Error([body.error,...(body.errors??[])].join(" "));
   setForm(null);setDirty(false);showToast(editing?"KPI updated.":"KPI created.","success");
   try{await load();}catch{setError("Saved successfully, but the list could not refresh. Reload before editing again.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to save KPI.");}finally{setBusy(false);}
 }
 async function remove() {
  if(!deleting)return;setBusy(true);setError("");
  try{const response=await fetch("/api/kpis?id="+deleting.id,{method:"DELETE"}),body=await response.json();if(!response.ok)throw new Error(body.error);setDeleting(null);showToast("KPI deleted.","success");await load();}
  catch(e){setError(e instanceof Error?e.message:"Unable to delete.");}finally{setBusy(false);}
 }
 if(loading)return <main className={s.workspace}><PlanningNav/><p role="status" className={s.notice}>Loading KPIs…</p></main>;
 if(!data)return <main className={s.workspace}><PlanningNav/><h1>Key performance indicators</h1><p role="alert" className={s.error}>{error}</p><button className={s.button} onClick={()=>void Promise.resolve().then(load).catch(e=>setError(e.message))}>Try again</button></main>;
 const isHr=["hr_admin","super_admin"].includes(data.viewer.role??"");
 const owners=data.people.filter(person=>isHr||person.id===data.viewer.employeeId||data.viewer.directReportIds.includes(person.id));
 const rows=data.kpis.filter(k=>(scope==="all"||scope==="mine"&&k.employee_id===data.viewer.employeeId||scope==="team"&&data.viewer.directReportIds.includes(k.employee_id))&&(!status||(status==="active")===k.is_active)&&(!initialNodeId||k.strategy_node_id===initialNodeId)&&(k.name+" "+data.people.find(x=>x.id===k.employee_id)?.name).toLowerCase().includes(search.toLowerCase()));
 return <main className={s.workspace}><PlanningNav/>
  <header className={s.header}><div><p className={s.eyebrow}>Performance planning / Measures</p><h1>Define what good looks like.</h1><p className={s.muted}>Set the target, name the owner and keep actual results current. Link measures to your strategy and use them as evidence in appraisal.</p></div><button className={s.primary} onClick={()=>open()}><Plus size={14}/>New KPI</button></header>
  {error&&!form&&!deleting&&<p role="alert" className={s.error}>{error}</p>}
  {strategyError&&<p className={s.notice}>{strategyError}</p>}
  <section className={s.hero}><div><p className={s.eyebrow}>From target to evidence</p><h2>Keep the measure and the result together.</h2><p>Higher and lower targets are supported. Strategy can measure movement from a baseline; appraisal uses its agreed target-attainment scoring.</p></div><div className={s.heroMeter}><p>KPIs in this view</p><strong>{rows.length}</strong><p>{rows.filter(k=>k.appraisal_cycle_id).length} attached to appraisal</p></div></section>
  {initialNodeId&&<p className={s.notice}>Showing measures linked to {nodes.find(n=>n.id===initialNodeId)?.title??"the selected strategy level"}. <Link href="/kpis" className="text-cobalt underline">Show all KPIs</Link></p>}
  <div className={s.toolbar}><div className={s.tabs}>{[["mine","Mine"],["team","My team"],["all","Organisation"]].map(([value,label])=><button key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{label}</button>)}</div><div className={s.row}><input className={s.input} style={{width:210}} aria-label="Search KPIs" placeholder="Find a KPI or owner" value={search} onChange={e=>setSearch(e.target.value)}/><select className={s.input} style={{width:145}} aria-label="KPI activity" value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="">All</option></select><button aria-label="Reload KPIs" className={s.button} disabled={busy} onClick={()=>void Promise.resolve().then(load).catch(e=>setError(e.message))}><RefreshCw size={14}/></button></div></div>
  {rows.length?<div className={s.tableWrap}><table className={s.table}><thead><tr><th>Measure / owner</th><th>Actual / target</th><th>Frequency / period</th><th>Strategy</th><th>Weight</th><th>Actions</th></tr></thead><tbody>{rows.map(k=><tr key={k.id}><td><strong>{k.name}</strong><small>{data.people.find(person=>person.id===k.employee_id)?.name??"Unassigned"}{!k.is_active?" · Inactive":""}</small></td><td><strong>{k.current_value} / {k.target_value} {k.unit}</strong><small>{k.measure_direction==="lower"?"Lower":"Higher"} is better{k.baseline_value!==null?" · baseline "+k.baseline_value:""}</small></td><td>{FREQUENCY_LABEL[k.frequency as keyof typeof FREQUENCY_LABEL]??k.frequency}<small>{k.cycle||"No period label"}</small></td><td>{nodes.find(n=>n.id===k.strategy_node_id)?.title??(k.strategy_node_id?"Linked strategy":"Standalone")}</td><td>{k.weight}%</td><td>{k.editable.allowed?<div className={s.row}><button className={s.small} disabled={busy} onClick={()=>open(k)}>Edit KPI</button><button className={s.danger} disabled={busy} onClick={()=>{setError("");setDeleting(k);}}>Delete</button></div>:<span className={s.badge} title={k.editable.reason}><Lock size={11} className="inline mr-1"/>{k.appraisal_cycle_id?"Attached to appraisal":"Read only"}</span>}{!k.editable.allowed&&<small>{k.editable.reason}</small>}</td></tr>)}</tbody></table></div>:<section className={s.empty}><Target size={30}/><h2>No KPIs in this view</h2><p className={s.muted}>Create a measure or adjust the filters to see existing work.</p><button className={s.primary} onClick={()=>open()}>Create a KPI</button></section>}
  <Dialog open={form!==null} title={editing?"Edit KPI":"Create a KPI"} onClose={close} busy={busy} error={error}>
   {form&&<form onSubmit={e=>{e.preventDefault();void save();}} onChangeCapture={()=>setDirty(true)}><fieldset disabled={busy}>
    <label className={s.field}>KPI name<input required minLength={2} maxLength={200} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <div className={s.grid2}><label className={s.field}>Owner<select required value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value})}>{owners.map(person=><option key={person.id} value={person.id}>{person.name??person.email}</option>)}</select></label><label className={s.field}>Strategy level<select value={form.strategyNodeId} disabled={Boolean(strategyError)} onChange={e=>setForm({...form,strategyNodeId:e.target.value})}><option value="">Standalone</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label></div>
    <div className={s.grid2}>{([["targetValue","Target"],["currentValue","Current reading"],["baselineValue","Baseline (optional)"]] as const).map(([key,label])=><label className={s.field} key={key}>{label}<input type="number" step="any" required={key!=="baselineValue"} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<label className={s.field}>Unit<input maxLength={40} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label></div>
    <div className={s.grid2}><label className={s.field}>Direction<select value={form.measureDirection} onChange={e=>setForm({...form,measureDirection:e.target.value})}><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></label><label className={s.field}>Reading frequency<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{FREQUENCIES.map(f=><option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</select></label><label className={s.field}>Relative weight<input type="number" min={0} max={100} required value={form.weight} onChange={e=>setForm({...form,weight:Number(e.target.value)})}/></label><label className={s.field}>Period label<input maxLength={60} placeholder="Match the appraisal cycle name" value={form.cycle} onChange={e=>setForm({...form,cycle:e.target.value})}/></label></div>
    <label className={s.field}>Description<textarea maxLength={4000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label className={s.row}><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Active measure</label>
    <p className={s.notice}>Once attached to an appraisal, this measure is protected from editing here. Review its result and target before attaching it.</p>
    <div className={p.formActions}><button className={s.primary}>Save KPI</button></div>
   </fieldset></form>}
  </Dialog>
  <Dialog open={Boolean(deleting)} title="Delete this KPI?" busy={busy} error={error} onClose={()=>setDeleting(null)}><p className={s.muted}>Delete “{deleting?.name}”? This removes the measure from planning. Appraisal-linked measures cannot be deleted here.</p><div className={s.actions}><button className={s.danger} disabled={busy} onClick={()=>void remove()}>Confirm delete</button></div></Dialog>
 </main>;
}
