// Synthetic browser journeys for the missing planning UI. No external requests or live writes.
//
// To run it without the shared tools directory: install playwright into this
// checkout (npm i --no-save playwright, with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1),
// start a dev server on the port below, and point PULSE_TEST_BROWSER at a local
// Chrome or Edge binary so no browser download is needed:
//
//   npx next dev -p 3100   (then use localhost, not 127.0.0.1)
//   PULSE_TEST_BROWSER="/c/Program Files/Google/Chrome/Application/chrome.exe" \n//     node --experimental-strip-types scripts/tests/planning-browser.mjs
//
// This run is what catches label/accessibility regressions: a <label> wrapping a
// <select> takes its accessible name from the option text, which no unit test or
// typecheck can see.
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const require=createRequire(resolve(process.env.PULSE_TEST_TOOLS??".","package.json"));
const {chromium}=require("playwright");
const root=process.env.PULSE_TEST_URL??"http://localhost:3100"; // not 127.0.0.1: Next 16 blocks dev resources for origins outside allowedDevOrigins
const output=resolve(process.env.TEMP??".","pulse-planning-evidence");await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PULSE_TEST_BROWSER,headless:true});
const people=[{id:"hr",name:"Ada Davidson",email:"ada@example.test",department:"People"},{id:"staff",name:"Tunde Cole",email:"tunde@example.test",department:"Advisory"},{id:"frozen",name:"Ife Okoro",email:"ife@example.test",department:"Advisory"}];
const viewer={employeeId:"hr",role:"hr_admin",directReportIds:["staff"],canCreateOrgGoals:true};
let nodes=[{id:"root",parent_id:null,kind:"strategic_objective",title:"Earn customer trust",owner_id:"hr",strategies:[],weight:100,status:"on_track",rollup:{progress:60,source:"children"},measure_type:"number",measure_direction:"higher",target_value:null}];
let goals=[{id:"goal",owner_id:"hr",title:"Improve quality",goal_type:"individual",weight:25,percent_complete:40,status:"on_track",start_date:"2026-01-01",due_date:"2026-12-31",cycle:"Annual",appraisal_cycle_id:null,strategy_node_id:null,editable:{allowed:true}},{id:"staff-goal",owner_id:"staff",title:"Client delivery",goal_type:"individual",weight:25,percent_complete:80,status:"on_track",start_date:"2026-01-01",due_date:"2026-12-31",cycle:"Annual",appraisal_cycle_id:null,strategy_node_id:null,editable:{allowed:true}},{id:"frozen-goal",owner_id:"frozen",title:"Signed-off goal",appraisal_cycle_id:null,strategy_node_id:null,editable:{allowed:true}}];
let kpis=[];
const cycle={id:"cycle",name:"Annual",start_date:"2026-01-01",end_date:"2026-12-31",status:"active",revision:0};
const records=people.map(person=>({id:"review-"+person.id,employee_id:person.id,reviewer_id:person.id==="hr"?"staff":"hr",cycle_id:"cycle",revision:0,workflow_status:person.id==="frozen"?"calibration":"self_review",development_plan:[],calibration:null}));
const commands=[];let readOnly=false;
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
await context.route("**/*",async route=>{
 const req=route.request(),url=new URL(req.url());
 if(!req.url().startsWith(root))return route.abort();
 if(url.pathname.startsWith("/api/")){
  let body=req.method()==="GET"?null:req.postDataJSON();
  if(url.pathname==="/api/kpis"){
   if(body){commands.push(body);const row={id:body.id??"kpi",name:body.name,description:body.description,employee_id:body.employeeId,strategy_node_id:body.strategyNodeId,unit:body.unit,baseline_value:body.baselineValue,target_value:body.targetValue,current_value:body.currentValue,weight:body.weight,measure_direction:body.measureDirection,frequency:body.frequency,cycle:body.cycle,is_active:body.isActive,appraisal_cycle_id:null,editable:{allowed:true}};kpis=[row];}
   return route.fulfill({json:req.method()==="GET"?{viewer,people,kpis:kpis.map(k=>({...k,editable:readOnly?{allowed:false,reason:"Attached to appraisal."}:k.editable}))}:{kpi:kpis[0]}});
  }
  if(url.pathname==="/api/goals"){
   if(body){commands.push(body);const row=goals.find(g=>g.id===body.id);if(row){Object.assign(row,{title:body.title??row.title,percent_complete:body.percentComplete??row.percent_complete});}}
   return route.fulfill({json:req.method()==="GET"?{viewer,people,goals,weightByOwner:{hr:{total:25,remaining:75}}}:{goal:goals[0]}});
  }
  if(url.pathname==="/api/strategy"){
   if(body){commands.push(body);
    if(body.action==="link_goal")goals.find(g=>g.id===body.goalId).strategy_node_id=body.nodeId;
    else {const row={id:body.id??"child",title:body.title,kind:body.kind,custom_kind_label:body.customKindLabel,parent_id:body.parentId,owner_id:body.ownerId,strategies:body.strategies,weight:body.weight,status:body.status,measure_type:body.measureType,measure_direction:body.measureDirection,target_value:body.targetValue,rollup:{progress:null,source:"unmeasured"}};nodes=nodes.filter(n=>n.id!==row.id).concat(row);}
   }
   if(req.method()==="DELETE")nodes=nodes.filter(n=>n.id!==url.searchParams.get("id"));
   return route.fulfill({json:req.method()==="GET"?{canEdit:!readOnly,people,nodes,goals,kpis}:{node:body?.action?undefined:nodes.at(-1),notes:[]}});
  }
  if(url.pathname==="/api/appraisals/evidence")return route.fulfill({json:{plan:{goals:{link:goals.filter(g=>!g.appraisal_cycle_id).map(g=>({id:g.id,label:g.title,reason:"Dates overlap the cycle."})),skip:[]},kpis:{link:kpis.filter(k=>!k.appraisal_cycle_id).map(k=>({id:k.id,label:k.name,reason:"Period label matches."})),skip:[]}}}});
  if(url.pathname==="/api/appraisals"){
   if(body){commands.push(body);const row=records.find(r=>r.id===body.appraisalId);assert.equal(body.revision,row.revision);row.revision++;(body.action==="link_goal"?goals:kpis).find(r=>r.id===body.payload.id).appraisal_cycle_id="cycle";return route.fulfill({json:{revision:row.revision}});}
   return route.fulfill({json:{viewer:{id:"hr",isHr:true},cycle,cycles:[cycle],records,people,peerTasks:[],detail:null}});
  }
  return route.fulfill({status:401,json:{error:"Sign in required."}});
 }
 return route.continue();
});
const page=await context.newPage(),errors=[];page.setDefaultNavigationTimeout(60000);page.on("pageerror",e=>errors.push(e.message));
try{
 console.log("Checking KPIs");await page.goto(root+"/kpis",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"New KPI",exact:true}).click();
 await page.getByLabel("KPI name",{exact:true}).fill("Customer satisfaction");
 await page.getByLabel("Owner",{exact:true}).selectOption("staff");
 await page.getByLabel("Strategy level",{exact:true}).selectOption("root");
 await page.getByLabel("Target",{exact:true}).fill("90");
 await page.getByLabel("Current reading",{exact:true}).fill("85");
 await page.getByLabel("Period label",{exact:true}).fill("Annual");
 await page.getByRole("button",{name:"Save KPI",exact:true}).click();
 await page.getByRole("button",{name:"Organisation",exact:true}).click();
 await page.getByRole("button",{name:"Edit KPI",exact:true}).click();
 await page.getByLabel("Current reading",{exact:true}).fill("89");
 await page.getByRole("button",{name:"Save KPI",exact:true}).click();
 await page.getByText("89 / 90 %",{exact:true}).waitFor();
 assert.equal(kpis[0].current_value,89);assert.equal(kpis[0].strategy_node_id,"root");
 await page.screenshot({path:resolve(output,"kpis-desktop.png")});
 console.log("Checking strategy");await page.goto(root+"/strategy",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:/Earn customer trust/}).first().click();
 await page.getByRole("button",{name:"Add child level",exact:true}).click();
 assert.equal(await page.getByLabel("Parent level",{exact:true}).inputValue(),"root");
 await page.getByLabel("Title",{exact:true}).fill("Service excellence");
 await page.getByLabel("Level",{exact:true}).selectOption("custom");
 await page.getByLabel("Custom level name",{exact:true}).fill("Service pillar");
 await page.getByRole("button",{name:"Add delivery action",exact:true}).click();
 await page.getByLabel("Action 1",{exact:true}).fill("Coach client-facing teams");
 await page.getByLabel("Expected outcome",{exact:true}).fill("Resolve client questions faster");
 await page.getByRole("button",{name:"Save strategy level",exact:true}).click();
 await page.getByRole("heading",{name:"Service excellence",exact:true}).waitFor();
 assert.equal(nodes.find(n=>n.id==="child").parent_id,"root");
 await page.getByLabel("Link an existing goal",{exact:true}).selectOption("goal");
 await page.getByRole("button",{name:"Unlink goal",exact:true}).waitFor();assert.equal(goals[0].strategy_node_id,"child");
 await page.getByRole("button",{name:"Edit level",exact:true}).click();
 assert.equal(await page.getByLabel("Parent level",{exact:true}).locator('option[value="child"]').count(),0);
 await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.screenshot({path:resolve(output,"strategy-desktop.png")});
 await page.getByRole("button",{name:"Delete level",exact:true}).click();
 await page.getByText(/Linked goals and KPIs remain/).waitFor();
 await page.getByRole("button",{name:"Close",exact:true}).click();
 console.log("Checking goals");await page.goto(root+"/goals",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"Edit goal",exact:true}).click();
 await page.getByLabel("Title",{exact:true}).fill("Improve delivery quality");
 await page.getByRole("button",{name:"Save goal",exact:true}).click();
 await page.getByText("Improve delivery quality",{exact:true}).waitFor();assert.equal(goals[0].title,"Improve delivery quality");
 await page.getByRole("button",{name:"Delete",exact:true}).click();
 await page.getByRole("dialog",{name:"Delete this goal?"}).waitFor();
 await page.getByRole("button",{name:"Close",exact:true}).click();assert.equal(goals.length,3);
 console.log("Checking evidence matching");await page.goto(root+"/appraisal",{waitUntil:"domcontentloaded"});
 await page.getByRole("button",{name:"Match goal & KPI evidence",exact:true}).click();
 await page.getByText("Another HR administrator must link your own evidence.",{exact:true}).waitFor();
 await page.getByText("Manager sign-off has frozen this review.",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Select eligible matches",exact:true}).click();
 await page.getByRole("button",{name:"Attach 2 selected items",exact:true}).click();
 await page.getByText(/2 evidence items attached/).waitFor();
 assert.equal(records.find(r=>r.employee_id==="staff").revision,2);
 assert.equal(goals.find(g=>g.id==="frozen-goal").appraisal_cycle_id,null);
 await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.setViewportSize({width:390,height:844});console.log("Checking strategy");await page.goto(root+"/strategy",{waitUntil:"domcontentloaded"});
 await page.getByRole("button",{name:/Service excellence/}).first().click();
 await page.screenshot({path:resolve(output,"strategy-mobile.png")});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 readOnly=true;await page.reload();await page.getByRole("heading",{name:"Give every goal a direction.",exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"New strategy level",exact:true}).count(),0);
 console.log("Checking KPIs");await page.goto(root+"/kpis",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"Organisation",exact:true}).click();
 assert.equal(await page.getByRole("button",{name:"Edit KPI",exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log("PASS: KPI create/edit and owner links; custom strategy, actions, goal links and delete review; goal edit; guarded evidence matching with sequential revisions; read-only states and mobile layout.");
}catch(error){console.error("Browser URL:",page.url());console.error((await page.locator("body").innerText({timeout:5000})).slice(0,2500));throw error;}finally{await browser.close();}
