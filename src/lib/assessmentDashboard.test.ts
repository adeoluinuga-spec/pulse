import test from "node:test";
import assert from "node:assert/strict";

import { buildMyAssessmentStatus } from "./assessmentDashboard.ts";

const liveCycle = {
  id: "cycle-1",
  name: "Leadership 360",
  status: "collecting",
  startsOn: "2026-09-09",
  closesOn: "2026-09-18",
};

test("shows a live participant cycle when the employee is an assessment subject", () => {
  const status = buildMyAssessmentStatus({
    cycle: liveCycle,
    subjects: [{ id: "subject-1", name: "Kehinde White", email: "kwhite@example.com" }],
    reviewerAssignments: [],
    now: new Date("2026-09-10T10:00:00Z"),
  });

  assert.equal(status.cycleIsCollecting, true);
  assert.equal(status.headline, "Your 360 assessment is live");
  assert.equal(status.participantCount, 1);
});

test("shows pending reviewer work separately from being assessed", () => {
  const status = buildMyAssessmentStatus({
    cycle: liveCycle,
    subjects: [],
    reviewerAssignments: [
      {
        id: "reviewer-1",
        subjectName: "Iyanu Maza",
        reviewerGroup: "colleague",
        status: "not_started",
        inviteStatus: "sent",
        tokenExpiresAt: "2026-09-18T23:59:59Z",
      },
    ],
    now: new Date("2026-09-10T10:00:00Z"),
  });

  assert.equal(status.headline, "Feedback is requested from you");
  assert.equal(status.pendingReviews, 1);
  assert.equal(status.tone, "warning");
});

test("a cycle closed early reads as closed even though its close date is still ahead", () => {
  const status = buildMyAssessmentStatus({
    cycle: { ...liveCycle, status: "closed" },
    subjects: [{ id: "subject-1", name: "Kehinde White", email: "kwhite@example.com" }],
    reviewerAssignments: [],
    now: new Date("2026-09-10T10:00:00Z"),
  });

  assert.equal(status.cycleIsCollecting, false);
  assert.equal(status.cycleLabel, "Closed");
  assert.equal(status.headline, "The 360 assessment window has closed");
  assert.equal(status.tone, "neutral");
});

test("does not call a closed assessment live", () => {
  const status = buildMyAssessmentStatus({
    cycle: liveCycle,
    subjects: [{ id: "subject-1", name: "Kehinde White", email: "kwhite@example.com" }],
    reviewerAssignments: [],
    now: new Date("2026-09-19T00:00:00Z"),
  });

  assert.equal(status.cycleIsCollecting, false);
  assert.equal(status.cycleLabel, "Closed");
});
