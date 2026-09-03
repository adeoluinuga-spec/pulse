import test from "node:test";
import assert from "node:assert/strict";

import { validateAssessmentWorkflow } from "./assessmentWorkflowValidation.ts";

const requiredGroups = ["direct_report", "subordinate", "colleague", "customer"];

test("validates a complete 360 workflow from setup to report release", () => {
  const subjects = [{ id: "leader-1", name: "Amina Lawal" }];
  const validation = validateAssessmentWorkflow({
    cycleName: "Directorate 360",
    frameworkReady: true,
    competencyCount: 5,
    subjects,
    nominations: requiredGroups.map((group) => ({ subjectId: "leader-1", reviewerGroup: group, status: "approved" })),
    selfAssessments: [{ subjectId: "leader-1", status: "submitted", completion: 100 }],
    reviewers: requiredGroups.map((group) => ({ subjectId: "leader-1", reviewerGroup: group, status: "submitted" })),
    reports: [{ subjectId: "leader-1", ready: true }],
  });

  assert.equal(validation.ready, true);
  assert.equal(validation.completion, 100);
  assert.deepEqual(validation.blockers, []);
});

test("surfaces edge-case blockers across setup, nominations, self, reviews, and reports", () => {
  const validation = validateAssessmentWorkflow({
    cycleName: "",
    frameworkReady: false,
    competencyCount: 0,
    subjects: [{ id: "leader-1", name: "Amina Lawal" }],
    nominations: [{ subjectId: "leader-1", reviewerGroup: "direct_report", status: "approved" }],
    selfAssessments: [{ subjectId: "leader-1", status: "draft", completion: 40 }],
    reviewers: [{ subjectId: "leader-1", reviewerGroup: "direct_report", status: "submitted" }],
    reports: [{ subjectId: "leader-1", ready: false }],
  });

  assert.equal(validation.ready, false);
  assert.ok(validation.completion < 100);
  assert.ok(validation.blockers.some((blocker) => blocker.includes("cycle name")));
  assert.ok(validation.blockers.some((blocker) => blocker.includes("framework")));
  assert.ok(validation.blockers.some((blocker) => blocker.includes("approved nominations")));
  assert.ok(validation.blockers.some((blocker) => blocker.includes("self-assessment")));
  assert.ok(validation.blockers.some((blocker) => blocker.includes("submitted reviews")));
  assert.ok(validation.blockers.some((blocker) => blocker.includes("report")));
});

test("requires participants before downstream stages can be treated as ready", () => {
  const validation = validateAssessmentWorkflow({
    cycleName: "Directorate 360",
    frameworkReady: true,
    competencyCount: 5,
  });

  assert.equal(validation.ready, false);
  assert.ok(validation.blockers.some((blocker) => blocker.includes("assessment subject")));
  assert.equal(validation.stages.find((stage) => stage.key === "nominations")?.ready, false);
  assert.equal(validation.stages.find((stage) => stage.key === "reports")?.ready, false);
});
