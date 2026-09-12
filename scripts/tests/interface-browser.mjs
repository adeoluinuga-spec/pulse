// Read-only browser sweep. Local dev server with auth bypass; external browser traffic blocked.
// Set PULSE_TEST_TOOLS to optional Playwright installation and PULSE_TEST_BROWSER to Chrome.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require=createRequire(resolve(process.env.PULSE_TEST_TOOLS??".","package.json"));
const {chromium}=require("playwright");
const root=process.env.PULSE_TEST_URL??"http://127.0.0.1:3100";
const output=resolve(process.env.PULSE_TEST_OUTPUT??process.env.TEMP??".","pulse-ui-evidence");
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PULSE_TEST_BROWSER,headless:true});
const routes=["/auth/login","/auth/reset","/welcome","/onboarding","/admin","/dashboard","/dashboard/employee","/dashboard/manager","/dashboard/executive","/dashboard/hr","/dashboard/hr?mode=setup","/dashboard/profile","/dashboard/performance","/dashboard/reports","/dashboard/team","/dashboard/ai-wellbeing","/dashboard/360","/dashboard/organisation","/goals","/reports/submit","/appraisal","/assessments","/assessments/instrument","/assessments/cycles","/assessments/participants","/assessments/nominations","/assessments/reviewers/bulk","/assessments/reports","/assessments/reports/pdf","/review/contact","/settings"];
const results=[];
const env=await readFile(".env.local","utf8");
const supabaseUrl=env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)[1].trim().replace(/["']/g,"");
const host=new URL(supabaseUrl).hostname;
const authUser={id:"11111111-1111-4111-8111-111111111111",email:"ada@example.test",aud:"authenticated",role:"authenticated",user_metadata:{},app_metadata:{provider:"email"},created_at:"2026-01-01T00:00:00Z"};
const expires=Math.floor(Date.now()/1000)+3600;
const token=[{alg:"HS256",typ:"JWT"},{sub:authUser.id,exp:expires,aud:"authenticated",role:"authenticated"}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".synthetic";
const session={access_token:token,refresh_token:"synthetic-only",token_type:"bearer",expires_in:3600,expires_at:expires,user:authUser};
const employee={id:"22222222-2222-4222-8222-222222222222",user_id:authUser.id,org_id:"33333333-3333-4333-8333-333333333333",name:"Ada Davidson",initials:"AD",email:authUser.email,role:"People director",department:"People",team:"Operations",platform_role:"hr_admin",people_responsibility:"manager",cadre:"senior",avatar_color:"#245de8",performance_score:82,consistency_index:90,peer_rating:4.2,week_streak:8,badge:"Good Standing",join_date:"2025-01-01",employment_type:"full_time",band_current:"L5"};
const staff=[employee,{...employee,id:"44444444-4444-4444-8444-444444444444",user_id:null,name:"Tunde Cole",initials:"TC",email:"tunde@example.test",role:"Consultant",platform_role:"standard",line_manager_id:employee.id,department:"Advisory",team:"Delivery"}];
const organisation={id:employee.org_id,name:"Stuart Davidson - synthetic preview",appraisal_cadence:"quarterly",current_cycle:"2026 Annual Review",cycle_start_date:"2026-01-01",cycle_end_date:"2026-12-31"};
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:"reduce"});
  await context.addCookies([{name:"sb-"+host.split(".")[0]+"-auth-token",value:"base64-"+Buffer.from(JSON.stringify(session)).toString("base64url"),url:root,httpOnly:false,sameSite:"Lax"}]);
  await context.route("**/*",route=>{
   const req=route.request();
   if(new URL(req.url()).hostname===host){
    if(req.method()!=="GET")return route.abort();
    const url=new URL(req.url());
    if(url.pathname==="/auth/v1/user")return route.fulfill({json:authUser});
    const table=url.pathname.split("/").pop();
    let rows=table==="employees"?staff:table==="organisations"?[organisation]:[];
    if(table==="employees"&&(url.searchParams.has("user_id")||url.searchParams.get("id")==="eq."+employee.id))rows=[employee];
    const single=req.headers().accept?.includes("vnd.pgrst.object");
    return route.fulfill({json:single?(rows[0]??null):rows,headers:{"content-range":"0-"+Math.max(0,rows.length-1)+"/"+rows.length}});
   }
   if(!req.url().startsWith(root))return route.abort();
   if(!["GET","HEAD"].includes(req.method())&&!req.url().includes("/__nextjs"))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();
  for(const route of routes){
   const errors=[];const errorHandler=e=>errors.push(e.message);page.on("pageerror",errorHandler);
   try{
    await page.goto(root+route,{waitUntil:"domcontentloaded",timeout:60000});
    await page.waitForTimeout(1000);
    const metrics=await page.evaluate(()=>({
     title:document.querySelector("h1")?.textContent?.trim()??"",
     bg:getComputedStyle(document.body).backgroundColor,
     overflow:document.documentElement.scrollWidth>innerWidth,
     body:document.body.innerText.slice(0,150),
     clipped:[...document.querySelectorAll("main,section,form")].filter(e=>e.getBoundingClientRect().width>innerWidth&&getComputedStyle(e).position!=="fixed").length
    }));
    results.push({route,width,...metrics,errors});
    if(["/auth/login","/dashboard/employee","/dashboard/performance","/goals","/assessments/instrument","/reports/submit","/settings"].includes(route)){
     await page.screenshot({path:resolve(output,route.replaceAll("/","-")+width+".png")});
    }
    console.log(width+" "+route+" "+(errors.length?"ERROR "+errors.join("; "):"ok")+" "+metrics.title);
   }catch(e){results.push({route,width,error:e.message});console.log(width+" "+route+" FAILED "+e.message);}
   page.off("pageerror",errorHandler);
  }
  // Existing dropdown and keyboard focus remain operable after the restyle.
  await page.goto(root+"/settings");
  const profile=page.getByRole("button",{name:"Profile menu",exact:true});
  await profile.waitFor();await profile.click();await page.getByRole("link",{name:"My Profile",exact:true}).waitFor();
  await page.getByRole("link",{name:"Settings",exact:true}).click();
  await page.getByRole("heading",{name:"Workspace appearance"}).waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true);
  await context.close();
 }
 await writeFile(resolve(output,"results.json"),JSON.stringify(results,null,2));
 assert.equal(results.filter(r=>r.error||r.errors?.length||r.overflow).length,0,"Every visited screen renders without client exceptions or document overflow");
 console.log("PASS: "+results.length+" desktop/mobile route visits, profile navigation and keyboard focus. Read-only browser traffic.");
}finally{await browser.close();}
