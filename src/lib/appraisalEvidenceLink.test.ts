import test from "node:test";
import assert from "node:assert/strict";

import {
  coverageAfterPlan,
  matchesCycleLabel,
  overlapsCycle,
  planEvidenceLinks,
  type EvidenceCycle,
  type LinkableGoal,
  type LinkableKpi,
} from "./appraisalEvidenceLink.ts";

const cycle: EvidenceCycle = {
  id: "cycle-q2",
  name: "Q2 2026",
  startDate: "2026-04-01",
  endDate: "2026-06-30",
};

function goal(overrides: Partial<LinkableGoal> = {}): LinkableGoal {
  return {
    id: "g1",
    title: "Grow enterprise pipeline",
    ownerId: "emp-1",
    status: "on_track",
    startDate: "2026-04-01",
    dueDate: "2026-06-30",
    cycleLabel: "Q2 2026",
    appraisalCycleId: null,
    ...overrides,
  };
}

function kpi(overrides: Partial<LinkableKpi> = {}): LinkableKpi {
  return { id: "k1", name: "Win rate", employeeId: "emp-1", cycleLabel: "Q2 2026", appraisalCycleId: null, ...overrides };
}

const plan = (goals: LinkableGoal[], kpis: LinkableKpi[], participantIds = ["emp-1"]) =>
  planEvidenceLinks({ cycle, goals, kpis, participantIds });

test("a goal inside the window is attached", () => {
  const result = plan([goal()], []);
  assert.equal(result.goals.link.length, 1);
  assert.match(result.goals.link[0].reason, /dates fall inside/);
});

test("a goal that merely overlaps the window is attached, not required to fit inside it", () => {
  const result = plan([goal({ startDate: "2026-03-01", dueDate: "2026-05-15" })], []);
  assert.equal(result.goals.link.length, 1, "a March-to-May goal belongs in an April-to-June cycle");
});

test("a goal entirely outside the window is skipped with a reason", () => {
  const result = plan([goal({ startDate: "2026-01-01", dueDate: "2026-03-31" })], []);
  assert.equal(result.goals.link.length, 0);
  assert.match(result.goals.skip[0].reason, /outside the cycle window/);
});

test("evidence committed to another cycle is never moved", () => {
  const result = plan([goal({ appraisalCycleId: "cycle-q1" })], [kpi({ appraisalCycleId: "cycle-q1" })]);
  assert.equal(result.goals.link.length, 0);
  assert.equal(result.kpis.link.length, 0);
  assert.match(result.goals.skip[0].reason, /Detach it there first/);
  assert.match(result.kpis.skip[0].reason, /not moved automatically/);
});

test("evidence already on this cycle is reported as done, not as an error", () => {
  const result = plan([goal({ appraisalCycleId: cycle.id })], []);
  assert.match(result.goals.skip[0].reason, /Already attached to this cycle/);
});

test("evidence owned by somebody not enrolled is left alone", () => {
  const result = plan([goal({ ownerId: "emp-99" })], [kpi({ employeeId: "emp-99" })]);
  assert.match(result.goals.skip[0].reason, /not enrolled/);
  assert.match(result.kpis.skip[0].reason, /not enrolled/);
});

test("ownerless evidence cannot count towards anybody", () => {
  const result = plan([goal({ ownerId: null })], [kpi({ employeeId: null })]);
  assert.match(result.goals.skip[0].reason, /no owner/);
  assert.match(result.kpis.skip[0].reason, /no owner/);
});

test("a withdrawn goal is an absence, not a zero", () => {
  for (const status of ["cancelled", "abandoned", "draft", "archived"]) {
    const result = plan([goal({ status })], []);
    assert.equal(result.goals.link.length, 0, `${status} must not be attached`);
    assert.match(result.goals.skip[0].reason, /not scoreable work/);
  }
});

test("live goal statuses are all scoreable", () => {
  for (const status of ["on_track", "at_risk", "behind", "completed"]) {
    assert.equal(plan([goal({ status })], []).goals.link.length, 1, `${status} should attach`);
  }
});

test("an undated goal falls back to its period label", () => {
  const result = plan([goal({ startDate: null, dueDate: null })], []);
  assert.equal(result.goals.link.length, 1);
  assert.match(result.goals.link[0].reason, /Undated, but labelled/);
});

test("a dated goal is judged on its dates even when the label disagrees", () => {
  const result = plan([goal({ startDate: "2026-01-01", dueDate: "2026-02-01", cycleLabel: "Q2 2026" })], []);
  assert.equal(result.goals.link.length, 0, "the label must not override real dates");
});

test("KPIs match on their label, because they carry no dates", () => {
  const result = plan([], [kpi()]);
  assert.equal(result.kpis.link.length, 1);
  assert.match(result.kpis.link[0].reason, /Labelled "Q2 2026"/);
});

test("a KPI with a different or missing label is left for a human", () => {
  assert.match(plan([], [kpi({ cycleLabel: "Q1 2026" })]).kpis.skip[0].reason, /does not name this cycle/);
  assert.match(plan([], [kpi({ cycleLabel: null })]).kpis.skip[0].reason, /no period label/);
});

test("label matching ignores case and surrounding space", () => {
  assert.equal(matchesCycleLabel("  q2 2026 ", cycle), true);
  assert.equal(matchesCycleLabel("", cycle), false);
  assert.equal(matchesCycleLabel(null, cycle), false);
});

test("a cycle with no dates cannot match anything by date", () => {
  assert.equal(overlapsCycle({ startDate: "2026-05-01", dueDate: "2026-05-02" }, { ...cycle, startDate: null }), false);
});

test("coverage counts people left without evidence, not items linked", () => {
  const coverage = coverageAfterPlan({
    participantIds: ["emp-1", "emp-2"],
    goals: [goal({ id: "g1", ownerId: "emp-1" })],
    kpis: [kpi({ id: "k1", employeeId: "emp-1" })],
    linkedGoalIds: new Set(["g1"]),
    linkedKpiIds: new Set(["k1"]),
    cycleId: cycle.id,
  });

  assert.deepEqual(coverage.find((c) => c.employeeId === "emp-1"), { employeeId: "emp-1", goals: 1, kpis: 1 });
  assert.deepEqual(coverage.find((c) => c.employeeId === "emp-2"), { employeeId: "emp-2", goals: 0, kpis: 0 });
});
