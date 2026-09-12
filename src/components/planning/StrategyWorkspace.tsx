"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { KIND_LABEL } from "@/lib/strategyCascade";
import { useToast } from "@/components/ui/Toast";
import Dialog from "@/components/appraisal/AppraisalDialog";
import PlanningNav from "./PlanningNav";
import StrategyForm from "./StrategyForm";
import type { StrategyData, StrategyRow } from "./types";
import s from "@/components/appraisal/appraisal.module.css";
import p from "./planning.module.css";

export default function StrategyWorkspace() {
 const [data,setData]=useState<StrategyData|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState(""),[search,setSearch]=useState(""),[collapsed,setCollapsed]=useState<string[]>([]);
 const [editor,setEditor]=useState<{node:StrategyRow|null;parentId:string}|null>(null),[deleting,setDeleting]=useState<StrategyRow|null>(null),[dirty,setDirty]=useState(false);
 const {showToast}=useToast();
 const load=useCallback(async()=>{const response=await fetch("/api/strategy",{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error??"Could not load strategy.");setData(body);setError("");},[]);
 useEffect(()=>{let active=true;void Promise.resolve().then(load).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[load]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 function close(){if(dirty&&!window.confirm("Discard unsaved strategy changes?"))return;setEditor(null);setDirty(false);setError("");}
 async function mutate(method:string,body?:Record<string,unknown>,id?:string) {
  setBusy(true);setError("");
  try{const response=await fetch("/api/strategy"+(id?"?id="+id:""),{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}),result=await response.json();
   if(!response.ok)throw new Error([result.error,...(result.errors??[])].join(" "));
   setEditor(null);setDeleting(null);setDirty(false);if(result.node)setSelected(result.node.id);
   showToast(result.notes?.length?"Saved. "+result.notes.join(" "):"Strategy updated.","success");
   try{await load();}catch{setError("Saved successfully, but the plan could not refresh. Reload before editing again.");}
  }catch(e){setError(e instanceof Error?e.message:"Could not update strategy.");}finally{setBusy(false);}
 }
 if(loading)return <main className={s.workspace}><PlanningNav/><p className={s.notice} role="status">Loading strategy…</p></main>;
 if(!data)return <main className={s.workspace}><PlanningNav/><h1>Strategy and alignment</h1><p className={s.error} role="alert">{error}</p><button className={s.button} onClick={()=>void Promise.resolve().then(load).catch(e=>setError(e.message))}>Try again</button></main>;
 const active=data.nodes.find(n=>n.id===selected);
 const names=(id:string|null)=>data.people.find(person=>person.id===id)?.name??"Unassigned";
 const ordered:Array<{node:StrategyRow;depth:number}>=[],seen=new Set<string>();
 function visit(parentId:string|null,depth:number){for(const node of data!.nodes.filter(n=>n.parent_id===parentId)){if(seen.has(node.id))continue;seen.add(node.id);ordered.push({node,depth});if(!collapsed.includes(node.id)||search)visit(node.id,depth+1);}}
 visit(null,0);
 const filtered=ordered.filter(({node})=>!search||(node.title+" "+names(node.owner_id)).toLowerCase().includes(search.toLowerCase()));
 const linkedGoals=data.goals.filter(g=>g.strategy_node_id===active?.id),linkedKpis=data.kpis.filter(k=>k.strategy_node_id===active?.id);
 const open=(node:StrategyRow|null,parentId="")=>{setError("");setDirty(false);setEditor({node,parentId});};
 const descendants=new Set(deleting?[deleting.id]:[]);
 for(let i=0;i<data.nodes.length;i++)for(const n of data.nodes)if(n.parent_id&&descendants.has(n.parent_id))descendants.add(n.id);
 return <main className={s.workspace}><PlanningNav/>
  <header className={s.header}><div><p className={s.eyebrow}>Performance planning / Alignment</p><h1>Give every goal a direction.</h1><p className={s.muted}>Connect strategic objectives, key result areas and delivery measures. Use the levels your organisation needs, including your own names.</p></div>{data.canEdit&&<button className={s.primary} onClick={()=>open(null)}><Plus size={14}/>New strategy level</button>}</header>
  {error&&!editor&&!deleting&&<p role="alert" className={s.error}>{error}</p>}
  <section className={s.hero}><div><p className={s.eyebrow}>Strategy → goals → measures → appraisal</p><h2>One plan, visible from top to bottom.</h2><p>Progress rolls up from the work underneath. Unmeasured work is shown explicitly; it is never presented as a zero.</p></div><div className={s.heroMeter}><p>Planning levels</p><strong>{data.nodes.length}</strong><p>{data.goals.filter(g=>g.strategy_node_id).length} goals · {data.kpis.filter(k=>k.strategy_node_id).length} KPIs linked</p></div></section>
  <div className={s.toolbar}><input className={s.input} style={{maxWidth:350}} value={search} aria-label="Search strategy" placeholder="Find an objective or owner" onChange={e=>setSearch(e.target.value)}/><button className={s.button} disabled={busy} onClick={()=>void Promise.resolve().then(load).catch(e=>setError(e.message))}><RefreshCw size={13}/>Reload plan</button></div>
  {!data.nodes.length?<section className={s.empty}><GitBranch size={32}/><h2>Start with the outcomes that matter.</h2><p className={s.muted}>{data.canEdit?"Add a strategic objective, then build the levels and measures underneath it.":"HR has not published a strategy plan yet."}</p>{data.canEdit&&<button className={s.primary} onClick={()=>open(null)}>Create first strategy level</button>}</section>:
  <div className={s.reviewGrid}><section className={p.tree} aria-label="Strategy hierarchy">
   {!filtered.length&&<p className={s.notice}>No matching strategy levels.</p>}
   {filtered.map(({node,depth})=><div className={p.indent} key={node.id} style={{"--indent":Math.min(depth,6)*14+"px"} as CSSProperties}><button className={p.node} aria-pressed={selected===node.id} onClick={()=>setSelected(node.id)}><GitBranch size={16}/><span className={p.grow}><small>{node.kind==="custom"?node.custom_kind_label:KIND_LABEL[node.kind]}</small><strong>{node.title}</strong><small>{names(node.owner_id)} · {node.status.replaceAll("_"," ")}{node.parent_id?" · under "+data.nodes.find(n=>n.id===node.parent_id)?.title:""}</small></span><span className={p.percent}>{node.rollup?.progress==null?"—":node.rollup.progress+"%"}</span></button>
    {data.nodes.some(n=>n.parent_id===node.id)&&<button className={s.small} aria-label={(collapsed.includes(node.id)?"Expand ":"Collapse ")+node.title} onClick={()=>setCollapsed(collapsed.includes(node.id)?collapsed.filter(id=>id!==node.id):[...collapsed,node.id])}>{collapsed.includes(node.id)?"Expand":"Collapse"}</button>}
   </div>)}
  </section><aside className={s.stack}>{active?<section className={s.panel}><p className={s.eyebrow}>{active.kind==="custom"?active.custom_kind_label:KIND_LABEL[active.kind]}</p><h2>{active.title}</h2><p className={s.muted}>{active.description||"No description yet."}</p><div className={s.score}>{active.rollup?.progress==null?"Not measured":active.rollup.progress+"%"}</div><p className={s.muted}>Source: {active.rollup?.source.replaceAll("_"," ")??"unmeasured"} · weight {active.weight}<br/>{names(active.owner_id)} · {active.period_label||"No period label"}<br/>{active.start_date||"Start not set"} → {active.due_date||"Due date not set"}</p>
   {active.measure&&<p className={s.notice}>{active.measure}<br/>Actual {active.current_value??"—"} / target {active.target_value??"—"} {active.unit}</p>}
   {data.canEdit&&<div className={s.sectionNav}><button className={s.small} onClick={()=>open(active)}>Edit level</button><button className={s.small} onClick={()=>open(null,active.id)}>Add child level</button><button className={s.danger} onClick={()=>{setError("");setDeleting(active);}}>Delete level</button></div>}
   <h3 className="mt-6">Delivery actions</h3>{active.strategies.length?active.strategies.map((a,i)=><div className={p.item} key={i}><strong>{a.statement}</strong><p>{a.expectedOutcome}</p><p>{names(a.responsibleId)} · {a.dueDate||"No due date"}<br/>{a.resources}</p></div>):<p className={s.muted}>No delivery actions recorded.</p>}
   <h3 className="mt-6">Connected goals</h3>{linkedGoals.map(g=><div className={p.item} key={g.id}><strong>{g.title}</strong><p>{names(g.owner_id)} · {g.percent_complete??0}%</p>{data.canEdit&&!g.appraisal_cycle_id&&<button disabled={busy} className={s.small} onClick={()=>void mutate("PATCH",{action:"link_goal",goalId:g.id,nodeId:null})}>Unlink goal</button>}</div>)}
   {!linkedGoals.length&&<p className={s.muted}>No goals linked.</p>}
   {data.canEdit&&<label className={s.field}>Link an existing goal<select aria-label="Link an existing goal" value="" disabled={busy} onChange={e=>{if(e.target.value)void mutate("PATCH",{action:"link_goal",goalId:e.target.value,nodeId:active.id});}}><option value="">Choose an unscored goal</option>{data.goals.filter(g=>!g.appraisal_cycle_id&&g.strategy_node_id!==active.id).map(g=><option key={g.id} value={g.id}>{g.title} · {names(g.owner_id)}</option>)}</select></label>}
   <h3 className="mt-6">Connected KPIs</h3>{linkedKpis.map(k=><div className={p.item} key={k.id}><strong>{k.name}</strong><p>{k.current_value??"—"} / {k.target_value??"—"}</p></div>)}
   <div className={s.sectionNav}><Link className={s.button} href={"/kpis?strategyNodeId="+active.id}>Manage KPIs</Link><Link className={s.button} href="/goals">Manage goals</Link></div>
  </section>:<section className={s.panel}><GitBranch size={24}/><h2 className="mt-3">Explore a planning level</h2><p className={s.muted}>Select a level to see its owner, progress source, delivery actions and connected evidence.</p></section>}</aside></div>}
  <Dialog open={Boolean(editor)} title={editor?.node?"Edit strategy level":"New strategy level"} busy={busy} error={error} onClose={close}>{editor&&<StrategyForm key={(editor.node?.id??"new")+"-"+editor.parentId} data={data} node={editor.node} parentId={editor.parentId} busy={busy} onDirty={()=>setDirty(true)} onSave={body=>mutate(editor.node?"PATCH":"POST",body)}/>}</Dialog>
  <Dialog open={Boolean(deleting)} title="Delete this part of the plan?" busy={busy} error={error} onClose={()=>setDeleting(null)}><p className={s.notice}>This deletes “{deleting?.title}” and {Math.max(0,descendants.size-1)} child levels. Linked goals and KPIs remain, but their links to these levels are removed.</p><button className={s.danger} disabled={busy} onClick={()=>void mutate("DELETE",undefined,deleting!.id)}>Confirm delete strategy</button></Dialog>
 </main>;
}
