import test from "node:test";
import assert from "node:assert/strict";
import { APPRAISAL_WEIGHTS, buildAppraisalSnapshot, canReviewAppraisal, kpiAttainment, reportingCoverage, validateManagerReview, validateWeights, visibleAppraisal,
  type AppraisalCycleRow, type AppraisalRecord, type KpiEvidence } from "./appraisalEngine.ts";
const cycle:AppraisalCycleRow={id:"cycle",name:"September",start_date:"2026-09-01",end_date:"2026-09-30",status:"review",weights:{...APPRAISAL_WEIGHTS},review_due_date:"2026-10-15",report_frequency:"weekly",revision:0};
const manager={ratings:[4,4,4,4,4],notes:"Specific evidence for the entire review period.",development:[{title:"Complete negotiation training",dueDate:"2026-12-01",owner:"employee" as const,status:"planned" as const}]};
const base={cycle,goals:[{id:"g",title:"Delivery",percent_complete:80,weight:1,cycle:null,appraisal_cycle_id:"cycle"}],
  kpis:[{id:"k",name:"Revenue",target_value:100,current_value:90,weight:1,unit:"%",measure_direction:"higher" as const,cycle:null,appraisal_cycle_id:"cycle"}],
  reports:[],leave:[],peers:[1,2,3].map(n=>({reviewer_id:String(n),rating:4,submitted_at:"2026-09-20T12:00:00Z"})),
  joinDate:null,manager,asOf:"2026-10-01T00:00:00Z"};
test("uses the existing five weights and includes manager and peer scores",()=>{
 const result=buildAppraisalSnapshot(base);
 assert.equal(result.total,66.5);assert.equal(result.coverage,100);assert.equal(result.ready,true);
 assert.equal(result.components.find(c=>c.key==="report_consistency")?.score,0);
});
test("missing evidence blocks final score instead of becoming a zero or silently changing weights",()=>{
 const result=buildAppraisalSnapshot({...base,kpis:[]});
 assert.equal(result.total,null);assert.equal(result.coverage,75);assert.equal(result.ready,false);assert.notEqual(result.provisional,null);
});
test("peer privacy threshold counts distinct people, not duplicate feedback rows",()=>{
 const result=buildAppraisalSnapshot({...base,peers:[base.peers[0],base.peers[0],base.peers[1]]});
 assert.equal(result.components.find(c=>c.key==="peer_feedback")?.score,null);assert.equal(result.peerCount,0);
});
test("KPI direction, zero targets and caps are explicit",()=>{
 const k=base.kpis[0];
 assert.equal(kpiAttainment({...k,current_value:150}),100);
 assert.equal(kpiAttainment({...k,target_value:0}),null);
 assert.equal(kpiAttainment({...k,target_value:10,current_value:20,measure_direction:"lower"}),50);
 assert.equal(kpiAttainment({...k,target_value:0,current_value:0,measure_direction:"lower"}),100);
 assert.equal(kpiAttainment({...k,current_value:-1}),null);
 assert.equal(kpiAttainment({...k,current_value:null} as KpiEvidence),null);
});
test("report coverage uses completed periods, deduplicates and excuses approved leave",()=>{
 const reports=[1,2].map(n=>({id:String(n),report_type:"weekly",period_start:null,period_end:"2026-09-06",submitted_at:"2026-09-06T12:00:00Z",status:"submitted"}));
 assert.deepEqual(reportingCoverage(cycle,reports,null,[],"2026-09-09T00:00:00Z"),{expected:1,submitted:1,excused:0});
 assert.deepEqual(reportingCoverage(cycle,reports,null,[{start_date:"2026-09-01",end_date:"2026-09-04"}],"2026-09-09T00:00:00Z"),{expected:0,submitted:0,excused:1});
 assert.deepEqual(reportingCoverage(cycle,reports,"2026-09-10",[],"2026-09-09T00:00:00Z"),{expected:0,submitted:0,excused:0});
});
test("zero-weight components can be intentionally excluded",()=>{
 const result=buildAppraisalSnapshot({...base,peers:[],cycle:{...cycle,weights:{...APPRAISAL_WEIGHTS,peer_feedback:0,goal_achievement:45}}});
 assert.equal(result.ready,true);assert.equal(result.total,66.5);
});
test("invalid existing metric data cannot disappear into a partial average",()=>{
 assert.equal(buildAppraisalSnapshot({...base,kpis:[...base.kpis,{...base.kpis[0],id:"bad",target_value:0}]}).ready,false);
});
test("weights and manager sign-off are validated",()=>{
 assert.equal(validateWeights(APPRAISAL_WEIGHTS),true);
 assert.equal(validateWeights({...APPRAISAL_WEIGHTS,manager_assessment:20}),false);
 assert.equal(validateManagerReview(manager),true);
 assert.equal(validateManagerReview({...manager,ratings:[6,4,4,4,4]}),false);
 assert.equal(validateManagerReview({...manager,development:[]}),false);
});
test("employee cannot see unreleased manager notes even when they are HR",()=>{
 const row={employee_id:"self",reviewer_id:"manager",workflow_status:"calibration",manager_assessment:manager,evidence_snapshot:buildAppraisalSnapshot(base),total_score:66.5,calibration:{rating:4,rationale:"private"},development_plan:manager.development} as AppraisalRecord;
 const visible=visibleAppraisal(row,"self");
 assert.equal(visible.manager_assessment,null);assert.equal(visible.total_score,null);assert.deepEqual(visible.development_plan,[]);
 assert.equal(visibleAppraisal({...row,workflow_status:"released"},"self").total_score,66.5);
 assert.equal(canReviewAppraisal("self",row),false);assert.equal(canReviewAppraisal("manager",row),true);
});
