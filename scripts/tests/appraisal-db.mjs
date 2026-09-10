// Isolated Postgres verification. Never connects to a client database.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { APPRAISAL_WEIGHTS, buildAppraisalSnapshot } from "../../src/lib/appraisalEngine.ts";
const require=createRequire(resolve(process.env.PULSE_TEST_TOOLS??".","package.json"));
const {PGlite}=require("@electric-sql/pglite");
const db=new PGlite();
const id=(prefix,n)=>prefix+"0000000-0000-4000-8000-"+String(n).padStart(12,"0");
const org=id("1",1),foreignOrg=id("1",2);
const users=Array.from({length:7},(_,i)=>id("2",i+1)),staff=Array.from({length:7},(_,i)=>id("3",i+1));
try {
 await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;");
 await db.exec(await readFile("supabase/schema/01_tables.sql","utf8"));
 await db.exec("create function calculate_appraisal_score(uuid,uuid) returns numeric language sql as $$select 0::numeric$$;");
 await db.exec(await readFile("supabase/migrations/20260910_000001_performance_appraisal_workflow.sql","utf8"));
 await db.exec("grant all on all tables in schema public to service_role;grant select on employees,appraisal_cycles to authenticated;");
 await db.query("insert into organisations(id,name,slug) values($1,'Test Advisory','test'),($2,'Other tenant','other')",[org,foreignOrg]);
 for(let i=0;i<users.length;i++){
  await db.query("insert into auth.users values($1)",[users[i]]);
  await db.query("insert into employees(id,user_id,org_id,name,email,platform_role,department) values($1,$2,$3,$4,$5,$6,'Advisory')",[staff[i],users[i],i===6?foreignOrg:org,"Person "+i,"p"+i+"@example.test",i<2||i===6?"hr_admin":"standard"]);
 }
 await db.exec("set role service_role");
 let cycleId,appraisalId;
 const cycle=()=>db.query("select * from appraisal_cycles where id=$1",[cycleId]).then(r=>r.rows[0]);
 const review=()=>db.query("select * from appraisals where id=$1",[appraisalId]).then(r=>r.rows[0]);
 async function command(user,action,payload={},snapshot=null,overrideRevision=null){
  const revision=overrideRevision??(appraisalId?(await review()).revision:cycleId?(await cycle()).revision:0);
  return db.query("select appraisal_command($1,$2,$3,$4,$5,$6,$7) as result",[user,action,cycleId??null,appraisalId??null,revision,JSON.stringify(payload),snapshot?JSON.stringify(snapshot):null]);
 }
 const config={name:"2025 annual test",start_date:"2025-01-01",end_date:"2025-12-31",review_due_date:"2026-01-31",report_frequency:"weekly",weights:APPRAISAL_WEIGHTS};
 await assert.rejects(command(users[2],"create_cycle",config),/HR access/);
 cycleId=(await command(users[0],"create_cycle",config)).rows[0].result.cycleId;
 await assert.rejects(command(users[6],"enrol",{employees:[{employeeId:staff[2],reviewerId:staff[1]}]}),/Cycle not found/);
 await assert.rejects(command(users[0],"enrol",{employees:[{employeeId:staff[2],reviewerId:staff[2]}]}),/different reviewer/);
 await command(users[0],"enrol",{employees:[{employeeId:staff[2],reviewerId:staff[1]}]});
 await command(users[0],"activate");
 appraisalId=(await db.query("select id from appraisals where cycle_id=$1",[cycleId])).rows[0].id;
 await assert.rejects(command(users[1],"manager_save",{ratings:[4,4,4,4,4],notes:"draft",development:[]}),/after their self review/);
 await command(users[0],"add_goal",{title:"Deliver strategy",weight:1,progress:80});
 await command(users[0],"add_kpi",{title:"Retain customers",weight:1,target:100,actual:90,unit:"%",direction:"higher"});
 await assert.rejects(command(users[0],"link_goal",{id:staff[6]}),/not available/);
 const self={achievements:"Delivered measurable outcomes against the agreed plan.",challenges:"A dependency delayed one deliverable.",support:"More stakeholder access and training."};
 await assert.rejects(command(users[0],"self_submit",self),/Self review is not open/);
 await command(users[2],"self_save",self);
 const stale=(await review()).revision;
 await command(users[2],"self_submit",self);
 await assert.rejects(command(users[2],"self_save",self,null,stale),/Reload/);
 await command(users[1],"assign_peers",{reviewerIds:staff.slice(3,6)});
 await assert.rejects(command(users[6],"peer_submit",{rating:5,comment:"Spoof"}),/Cycle not found/);
 for(let i=3;i<6;i++)await command(users[i],"peer_submit",{rating:4,comment:"Specific contribution to the shared work."});
 await assert.rejects(command(users[3],"peer_submit",{rating:5,comment:"Duplicate"}),/No open peer assignment/);
 // Cycle command expects the cycle revision, not the appraisal revision.
 await command(users[0],"start_review",{},null,(await cycle()).revision);
 const manager={ratings:[4,4,4,4,4],notes:"Results and behaviours were reviewed against specific examples.",development:[{title:"Complete negotiation training",dueDate:"2026-12-01",owner:"employee",status:"planned"}]};
 const goals=(await db.query("select * from goals where appraisal_cycle_id=$1",[cycleId])).rows;
 const kpis=(await db.query("select * from kpis where appraisal_cycle_id=$1",[cycleId])).rows.map(k=>({...k,current_value:Number(k.current_value),target_value:Number(k.target_value)}));
 const peers=(await db.query("select reviewer_id,rating,submitted_at from peer_feedback where cycle_id=$1",[cycleId])).rows.map(p=>({...p,submitted_at:new Date(p.submitted_at).toISOString()}));
 const cyc=await cycle();
 const snapshot=buildAppraisalSnapshot({cycle:{...cyc,start_date:"2025-01-01",end_date:"2025-12-31"},goals,kpis,reports:[],peers,manager,leave:[],joinDate:null,asOf:new Date().toISOString()});
 assert.equal(snapshot.ready,true);
 await assert.rejects(command(users[2],"manager_submit",manager,snapshot),/Only the assigned reviewer/);
 await command(users[1],"manager_submit",manager,snapshot);
 assert.equal((await review()).workflow_status,"calibration");
 assert.equal(Number((await review()).total_score),66.5);
 await assert.rejects(command(users[1],"release",{rating:4,rationale:"I want to approve the review I wrote."}),/independent HR/);
 await assert.rejects(command(users[0],"add_goal",{title:"Late evidence",weight:1,progress:100}),/before sign-off/);
 // Rework retains the previous snapshot in the audit trail.
 await command(users[0],"return_to_manager",{reason:"Please provide more context for the delivery assessment."});
 assert.equal((await review()).evidence_snapshot,null);
 const audit=await db.query("select payload from appraisal_events where action='return_to_manager'");
 assert.equal(audit.rows[0].payload.previousSnapshot.total,66.5);
 await command(users[1],"manager_submit",manager,snapshot);
 await command(users[0],"release",{rating:4,rationale:"The review is consistent with the evidence and expectations."});
 await assert.rejects(command(users[0],"acknowledge",{response:"Pretend employee acknowledgement"}),/Only the employee/);
 await command(users[2],"acknowledge",{response:"Received. I would like to discuss the final rating."});
 const frozen=(await review()).evidence_snapshot;
 await command(users[2],"development",{index:0,status:"complete"});
 assert.deepEqual((await review()).evidence_snapshot,frozen);
 await command(users[0],"close_cycle",{},null,(await cycle()).revision);
 assert.equal((await cycle()).status,"closed");
 await db.exec("reset role;set role authenticated");
 await assert.rejects(db.query("select * from appraisals"),/permission denied/);
 await assert.rejects(db.query("select * from peer_feedback"),/permission denied/);
 await assert.rejects(command(users[0],"release",{}),/permission denied/);
 console.log("PASS: actual migration; cycle creation/enrolment; cross-tenant and self-review guards; full employee/peer/manager/HR lifecycle; stale revisions; independent calibration; rework audit; frozen scores; acknowledgement; development; browser table/RPC restrictions.");
} catch(error) {console.error(error.message);process.exitCode=1;} finally {await db.close();}
