// Isolated UI smoke test; requires local dev auth bypass and optional Playwright tools.
// PULSE_TEST_TOOLS points to a directory containing playwright; PULSE_TEST_BROWSER to Chrome.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { buildAppraisalSnapshot, APPRAISAL_WEIGHTS } from "../../src/lib/appraisalEngine.ts";
const require=createRequire(resolve(process.env.PULSE_TEST_TOOLS??".","package.json"));
const {chromium}=require("playwright");
const browser=await chromium.launch({executablePath:process.env.PULSE_TEST_BROWSER,headless:true});
const root=process.env.PULSE_TEST_URL??"http://127.0.0.1:3100";
const cycle={id:"cycle",name:"2026 mid-year review",start_date:"2026-01-01",end_date:"2026-06-30",review_due_date:"2026-07-31",status:"review",report_frequency:"weekly",weights:APPRAISAL_WEIGHTS,revision:0};
const people=[{id:"hr",name:"Ada People",role:"People director",department:"People"},{id:"manager",name:"Tunde Cole",role:"Team lead",department:"Advisory"},{id:"employee",name:"Ife Okoro",role:"Consultant",department:"Advisory",line_manager_id:"manager"}];
let viewer={id:"hr",isHr:true};
let row={id:"review",cycle_id:cycle.id,employee_id:"employee",reviewer_id:"manager",workflow_status:"manager_review",revision:0,self_assessment:{achievements:"Delivered the customer reporting project.",challenges:"Required coordination across departments.",support:"Advanced analytics coaching."},manager_assessment:null,evidence_snapshot:null,development_plan:[],calibration:null,employee_response:null,total_score:null};
const snapshot=buildAppraisalSnapshot({cycle,goals:[{id:"goal",title:"Deliver customer reporting",percent_complete:80,weight:1}],kpis:[{id:"kpi",name:"Customer satisfaction",target_value:90,current_value:85,weight:1,measure_direction:"higher"}],reports:[],peers:[],manager:null,joinDate:null,leave:[],asOf:"2026-07-01T00:00:00Z"});
const context=await browser.newContext({viewport:{width:1440,height:1080}});
let lastCommand;
await context.route("**/*",async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!req.url().startsWith(root))return route.abort();
  if(url.pathname==="/api/appraisals"){
    if(req.method()==="POST"){
      lastCommand=req.postDataJSON();
      if(lastCommand.action==="manager_save"){row.manager_assessment=lastCommand.payload;row.revision++;}
      if(lastCommand.action==="acknowledge"){row.workflow_status="acknowledged";row.employee_response=lastCommand.payload.response;row.acknowledged_at=new Date().toISOString();row.revision++;}
      return route.fulfill({json:{cycleId:cycle.id}});
    }
    return route.fulfill({json:{viewer,cycles:[cycle],cycle,people,records:[row],peerTasks:[],detail:url.searchParams.has("appraisalId")?{row,snapshot,availableGoals:[],availableKpis:[],peers:[],events:[]}:null}});
  }
  return route.continue();
});
const page=await context.newPage(),errors=[];
page.on("pageerror",e=>errors.push(e.message));
try{
 await page.goto(root+"/appraisal");
 await page.getByRole("heading",{name:/Recognise impact/}).waitFor();
 await page.getByRole("button",{name:"New cycle",exact:true}).click();
 await page.getByLabel("Cycle name",{exact:true}).fill("Annual review");
 await page.getByText("Total weight: 100%",{exact:false}).waitFor();
 await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"Open review",exact:true}).click();
 await page.getByRole("heading",{name:"Evidence behind the review",exact:true}).waitFor();
 await page.getByText("Customer satisfaction",{exact:true}).waitFor();
 await page.screenshot({path:resolve(process.env.TEMP??".","pulse-appraisal-desktop.png"),fullPage:true});
 viewer={id:"manager",isHr:false};
 await page.reload();
 await page.getByRole("button",{name:"Open review",exact:true}).click();
 await page.getByLabel("Delivery quality",{exact:true}).selectOption("4");
 await page.getByLabel("Evidence and review conversation",{exact:true}).fill("Delivered agreed work with clear evidence and collaboration.");
 await page.getByRole("button",{name:"Save manager draft",exact:true}).click();
 await page.getByText("Appraisal changes saved.",{exact:true}).first().waitFor();
 assert.equal(lastCommand.action,"manager_save");
 assert.equal(row.manager_assessment.ratings[0],4);
 row={...row,workflow_status:"released",evidence_snapshot:{...snapshot,total:80,ready:true,coverage:100},total_score:80,calibration:{rating:4,rationale:"Strong delivery demonstrated by the agreed performance evidence."},released_at:"2026-07-10T12:00:00Z",development_plan:[{title:"Complete analytics coaching",dueDate:"2026-09-30",owner:"employee",status:"planned"}]};
 viewer={id:"employee",isHr:false};
 await page.reload();
 await page.getByRole("button",{name:"Open review",exact:true}).click();
 await page.getByRole("button",{name:"Development",exact:true}).click();
 await page.getByLabel("Employee response (optional)",{exact:true}).fill("Received. I would like to discuss the delivery context.");
 await page.getByRole("button",{name:"Acknowledge receipt",exact:true}).click();
 await page.locator('span[data-stage="acknowledged"]').first().waitFor();
 assert.equal(lastCommand.action,"acknowledge");
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:resolve(process.env.TEMP??".","pulse-appraisal-mobile.png"),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"mobile page must not overflow");
 assert.deepEqual(errors,[]);
 console.log("PASS: HR cycle modal and evidence, manager draft, employee acknowledgement, mobile layout; external traffic blocked.");
}finally{await browser.close();}
