// Executes the actual route handlers against an isolated in-memory query adapter.
// Verifies authorization/request contracts; PostgreSQL constraints are tested separately.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
let actorId="user",attachOnWrite=false;
let tables;
function reset(){
 tables={employees:[{id:"me",user_id:"user",org_id:"org",platform_role:"standard"},{id:"peer",org_id:"org"},{id:"foreign",org_id:"other"}],
 strategy_nodes:[{id:"node",org_id:"org",parent_id:null,kind:"strategic_objective",title:"Customer trust",owner_id:"me",measure_type:"number",measure_direction:"higher",strategies:[],status:"on_track",weight:25}],
 kpis:[{id:"kpi",org_id:"org",employee_id:"me",name:"Customer satisfaction",description:"Details",strategy_node_id:"node",unit:"%",baseline_value:10,target_value:90,current_value:75,weight:25,measure_direction:"higher",frequency:"monthly",cycle:"Annual",is_active:true,appraisal_cycle_id:null}],
 goals:[{id:"goal",org_id:"org",owner_id:"me",goal_type:"individual",title:"Improve delivery",weight:25,percent_complete:50,status:"on_track",start_date:"2026-01-01",due_date:"2026-12-31",appraisal_cycle_id:null}]};
 attachOnWrite=false;actorId="user";
}
class Query{
 constructor(table){this.table=table;this.filters=[];this.action="read";}
 select(){return this;}order(){return this;}returns(){return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 is(k,v){this.filters.push(r=>(r[k]??null)===v);return this;}
 in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this;}
 update(v){this.action="update";this.values=v;return this;}
 insert(v){this.action="insert";this.values=v;return this;}
 delete(){this.action="delete";return this;}
 run(single=false){
  const rows=tables[this.table]??=[];
  if(attachOnWrite&&this.action!=="read"&&["goals","kpis"].includes(this.table))rows[0].appraisal_cycle_id="cycle";
  let data=rows.filter(r=>this.filters.every(f=>f(r)));
  if(this.action==="update")data.forEach(r=>Object.assign(r,this.values));
  if(this.action==="insert"){data=[{id:"created",...this.values}];rows.push(...data);}
  if(this.action==="delete")tables[this.table]=rows.filter(r=>!data.includes(r));
  return Promise.resolve({data:single?(data[0]??null):data,error:null});
 }
 maybeSingle(){return this.run(true);}single(){return this.run(true);}
 then(a,b){return this.run().then(a,b);}
}
const admin={from:table=>new Query(table)};
const cache=new Map();
function load(file){
 file=resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const source=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=name=>{
  if(name==="next/server")return {NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{status:init?.status??200})}};
  if(name==="@supabase/supabase-js")return {createClient:()=>admin};
  if(name==="@/lib/apiAuth")return {getRouteUser:async()=>actorId?{id:actorId}:null};
  if(name.startsWith("@/"))return load("src/"+name.slice(2)+".ts");
  throw new Error("Unexpected import "+name);
 };
 new Function("require","module","exports",source)(require,module,module.exports);return module.exports;
}
const kpis=load("src/app/api/kpis/route.ts"),strategy=load("src/app/api/strategy/route.ts"),goals=load("src/app/api/goals/route.ts");
async function request(handler,method,body,query=""){
 const req=new Request("http://local.test/api?"+query,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});req.nextUrl=new URL(req.url);
 return handler(req);
}
reset();
assert.equal((await request(kpis.PATCH,"PATCH",{id:"kpi",employeeId:"peer"})).status,403);
assert.equal(tables.kpis[0].employee_id,"me");
tables.employees[0].platform_role="hr_admin";
assert.equal((await request(kpis.PATCH,"PATCH",{id:"kpi",employeeId:"foreign"})).status,403);
assert.equal((await request(kpis.PATCH,"PATCH",{id:"kpi",strategyNodeId:"foreign-node"})).status,403);
assert.equal((await request(kpis.PATCH,"PATCH",{id:"kpi",strategyNodeId:null,baselineValue:null,description:null,cycle:null})).status,200);
assert.equal(tables.kpis[0].strategy_node_id,null);assert.equal(tables.kpis[0].baseline_value,null);assert.equal(tables.kpis[0].description,null);
attachOnWrite=true;assert.equal((await request(kpis.DELETE,"DELETE",null,"id=kpi")).status,409);
reset();
assert.equal((await request(goals.PATCH,"PATCH",{id:"goal",goalType:"org"})).status,403);
tables.employees[0].platform_role="hr_admin";
assert.equal((await request(goals.PATCH,"PATCH",{id:"goal",ownerId:"foreign"})).status,403);
assert.equal((await request(goals.PATCH,"PATCH",{id:"goal",title:"Better delivery"})).status,200);
attachOnWrite=true;assert.equal((await request(goals.DELETE,"DELETE",null,"id=goal")).status,409);
reset();tables.employees[0].platform_role="hr_admin";
assert.equal((await request(strategy.POST,"POST",{title:"New direction",kind:"strategic_objective",ownerId:"foreign"})).status,422);
assert.equal((await request(strategy.POST,"POST",{title:"New direction",kind:"strategic_objective",status:"draft",ownerId:"me"})).status,201);
assert.equal(tables.strategy_nodes.find(n=>n.id==="created").status,"draft");
assert.equal((await request(strategy.PATCH,"PATCH",{id:"node",ownerId:null,description:null})).status,200);
assert.equal(tables.strategy_nodes[0].owner_id,null);
assert.equal((await request(strategy.PATCH,"PATCH",{action:"link_goal",goalId:"goal",nodeId:"node"})).status,200);
assert.equal(tables.goals[0].strategy_node_id,"node");
assert.equal((await request(strategy.PATCH,"PATCH",{action:"link_goal",goalId:"goal",nodeId:null})).status,200);
assert.equal(tables.goals[0].strategy_node_id,null);
tables.goals[0].appraisal_cycle_id="cycle";
assert.equal((await request(strategy.PATCH,"PATCH",{action:"link_goal",goalId:"goal",nodeId:"node"})).status,409);
tables.employees[0].platform_role="standard";
assert.equal((await request(strategy.PATCH,"PATCH",{action:"link_goal",goalId:"goal",nodeId:"node"})).status,403);
actorId=null;assert.equal((await request(kpis.GET,"GET")).status,401);
console.log("PASS: actual KPI/goal/strategy handlers; reassignment and tenant guards, nullable edits, status persistence, strategy linking, frozen evidence and delete-race outcomes.");
