import test from "node:test";
import assert from "node:assert/strict";

import {
  canCreateGoal,
  canEditGoal,
  deriveGoalStatus,
  validateGoal,
  weightSummary,
  type Actor,
} from "./goalRules.ts";

const base = {
  title: "Grow enterprise pipeline",
  goalType: "individual",
  ownerId: "emp-1",
  weight: 25,
  percentComplete: 40,
  startDate: "2026-04-01",
  dueDate: "2026-06-30",
};

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  employeeId: "emp-1",
  role: "standard",
  directReportIds: [],
  ...overrides,
});

test("a complete goal validates and keeps its supplied values", () => {
  const result = validateGoal(base, { asOf: "2026-05-01" });
  assert.ok(result.ok);
  assert.equal(result.goal.title, "Grow enterprise pipeline");
  assert.equal(result.goal.weight, 25);
  assert.equal(result.goal.description, null);
});

test("every problem is reported at once, not one per attempt", () => {
  const result = validateGoal({ title: "x", goalType: "nonsense", weight: 150, percentComplete: -4 });
  assert.equal(result.ok, false);
  const errors = result.ok ? [] : result.errors;
  assert.ok(errors.length >= 5, `expected several errors, got ${errors.length}`);
  assert.ok(errors.some((e) => /title of at least 3/.test(e)));
  assert.ok(errors.some((e) => /goal type/.test(e)));
  assert.ok(errors.some((e) => /Weight must be/.test(e)));
  assert.ok(errors.some((e) => /Progress must be/.test(e)));
  assert.ok(errors.some((e) => /owner/.test(e)));
});

test("a goal without an owner is refused, because nothing could score it", () => {
  const result = validateGoal({ ...base, ownerId: "" });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /ties it to an appraisal/.test(e)));
});

test("a due date before the start date is refused", () => {
  const result = validateGoal({ ...base, startDate: "2026-06-30", dueDate: "2026-04-01" });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /cannot fall before/.test(e)));
});

test("status is derived from progress against elapsed time when not supplied", () => {
  // Halfway through the window with 45% done is close enough to on track.
  const onTrack = validateGoal({ ...base, percentComplete: 45 }, { asOf: "2026-05-16" });
  assert.ok(onTrack.ok);
  assert.equal(onTrack.goal.status, "on_track");

  const behind = validateGoal({ ...base, percentComplete: 5 }, { asOf: "2026-05-16" });
  assert.ok(behind.ok);
  assert.equal(behind.goal.status, "behind");
});

test("an explicit status overrides the derived one", () => {
  const result = validateGoal({ ...base, percentComplete: 5, status: "on_track" }, { asOf: "2026-05-16" });
  assert.ok(result.ok);
  assert.equal(result.goal.status, "on_track", "the author knows something the dates do not");
});

test("100% is complete regardless of timing", () => {
  assert.equal(
    deriveGoalStatus({ percentComplete: 100, startDate: "2026-04-01", dueDate: "2026-06-30", asOf: "2026-04-02" }),
    "completed",
  );
});

test("past the due date, unfinished is behind rather than at risk", () => {
  assert.equal(
    deriveGoalStatus({ percentComplete: 95, startDate: "2026-04-01", dueDate: "2026-06-30", asOf: "2026-07-01" }),
    "behind",
  );
});

test("a goal that has not started yet is on track, not behind", () => {
  assert.equal(
    deriveGoalStatus({ percentComplete: 0, startDate: "2026-04-01", dueDate: "2026-06-30", asOf: "2026-03-01" }),
    "on_track",
  );
});

test("the at-risk band sits between on track and behind", () => {
  // 50% elapsed: 30% done is a 20-point shortfall.
  assert.equal(
    deriveGoalStatus({ percentComplete: 30, startDate: "2026-04-01", dueDate: "2026-06-30", asOf: "2026-05-16" }),
    "at_risk",
  );
});

test("people set their own goals; managers set their reports'", () => {
  assert.equal(canCreateGoal(actor(), { ownerId: "emp-1", goalType: "individual" }), true);
  assert.equal(canCreateGoal(actor(), { ownerId: "emp-2", goalType: "individual" }), false);
  assert.equal(
    canCreateGoal(actor({ directReportIds: ["emp-2"] }), { ownerId: "emp-2", goalType: "individual" }),
    true,
  );
});

test("organisation and department goals belong to HR", () => {
  assert.equal(canCreateGoal(actor(), { ownerId: "emp-1", goalType: "org" }), false);
  assert.equal(canCreateGoal(actor(), { ownerId: "emp-1", goalType: "dept" }), false);
  assert.equal(canCreateGoal(actor({ role: "hr_admin" }), { ownerId: "emp-9", goalType: "org" }), true);
});

test("a goal attached to an appraisal cycle is frozen, even for HR", () => {
  const decision = canEditGoal(actor({ role: "super_admin" }), {
    ownerId: "emp-1",
    goalType: "individual",
    appraisalCycleId: "cycle-q2",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /already been scored|has been scored/);
  assert.match(decision.reason ?? "", /Detach it from the cycle/);
});

test("an unattached goal follows the same ownership rules as creation", () => {
  const unattached = { ownerId: "emp-2", goalType: "individual" as const, appraisalCycleId: null };
  assert.equal(canEditGoal(actor(), unattached).allowed, false);
  assert.equal(canEditGoal(actor({ directReportIds: ["emp-2"] }), unattached).allowed, true);
  assert.equal(canEditGoal(actor({ role: "hr_admin" }), unattached).allowed, true);
});

test("weight remaining is reported per owner, not enforced", () => {
  const goals = [
    { ownerId: "emp-1", weight: 40 },
    { ownerId: "emp-1", weight: 35 },
    { ownerId: "emp-2", weight: 90 },
  ];
  assert.deepEqual(weightSummary(goals, "emp-1"), { total: 75, remaining: 25 });
  assert.deepEqual(weightSummary(goals, "emp-3"), { total: 0, remaining: 100 });
});

test("an over-allocated owner reports zero remaining rather than a negative", () => {
  assert.deepEqual(weightSummary([{ ownerId: "emp-1", weight: 130 }], "emp-1"), { total: 130, remaining: 0 });
});
