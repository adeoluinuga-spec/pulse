import test from "node:test";
import assert from "node:assert/strict";

import {
  nestingNote,
  nodeAttainment,
  rollupCascade,
  suggestedChildKind,
  validateNode,
  validateStrategy,
  type StrategyNode,
} from "./strategyCascade.ts";

const measured = {
  measureType: "number" as const,
  measureDirection: "higher" as const,
  baselineValue: null,
  targetValue: null,
  currentValue: null,
};

function node(overrides: Partial<StrategyNode> & { id: string }): StrategyNode {
  return {
    parentId: null,
    kind: "objective",
    title: overrides.id,
    ownerId: null,
    measureType: "number",
    measureDirection: "higher",
    baselineValue: null,
    targetValue: null,
    currentValue: null,
    weight: 0,
    status: "on_track",
    ...overrides,
  };
}

// ── attainment ───────────────────────────────────────────────────────────────

test("a baseline is honoured: 70 to 75 against a target of 80 is halfway", () => {
  const value = nodeAttainment({ ...measured, baselineValue: 70, targetValue: 80, currentValue: 75 });
  assert.equal(value, 50, "reading current/target would flatter this to 94%");
});

test("without a baseline it falls back to current against target", () => {
  assert.equal(nodeAttainment({ ...measured, targetValue: 80, currentValue: 40 }), 50);
});

test("a lower-is-better measure inverts", () => {
  const value = nodeAttainment({
    ...measured,
    measureDirection: "lower",
    baselineValue: 20,
    targetValue: 10,
    currentValue: 15,
  });
  assert.equal(value, 50);
});

test("attainment is capped at 100 and floored at 0", () => {
  assert.equal(nodeAttainment({ ...measured, baselineValue: 0, targetValue: 10, currentValue: 40 }), 100);
  assert.equal(nodeAttainment({ ...measured, baselineValue: 10, targetValue: 20, currentValue: 5 }), 0);
});

test("a milestone is all or nothing", () => {
  assert.equal(nodeAttainment({ ...measured, measureType: "milestone", targetValue: 1, currentValue: 1 }), 100);
  assert.equal(nodeAttainment({ ...measured, measureType: "milestone", targetValue: 1, currentValue: 0 }), 0);
});

test("an unmeasured node reports null, never zero", () => {
  assert.equal(nodeAttainment(measured), null);
  assert.equal(nodeAttainment({ ...measured, targetValue: 100 }), null, "a target with no current reading is not 0%");
});

// ── rollup ───────────────────────────────────────────────────────────────────

test("a parent's progress comes from its children, not from its own figure", () => {
  const nodes = [
    node({ id: "kra", targetValue: 100, currentValue: 90 }),
    node({ id: "o1", parentId: "kra", targetValue: 100, currentValue: 20, weight: 50 }),
    node({ id: "o2", parentId: "kra", targetValue: 100, currentValue: 40, weight: 50 }),
  ];
  const result = rollupCascade({ nodes, goals: [], kpis: [] });

  assert.equal(result.get("kra")?.progress, 30, "children are the truth about the parent");
  assert.equal(result.get("kra")?.source, "children");
});

test("children are weighted, and equal weights fall back to a plain mean", () => {
  const weighted = rollupCascade({
    nodes: [
      node({ id: "p" }),
      node({ id: "a", parentId: "p", targetValue: 100, currentValue: 100, weight: 75 }),
      node({ id: "b", parentId: "p", targetValue: 100, currentValue: 0, weight: 25 }),
    ],
    goals: [],
    kpis: [],
  });
  assert.equal(weighted.get("p")?.progress, 75);

  const unweighted = rollupCascade({
    nodes: [
      node({ id: "p" }),
      node({ id: "a", parentId: "p", targetValue: 100, currentValue: 100 }),
      node({ id: "b", parentId: "p", targetValue: 100, currentValue: 0 }),
    ],
    goals: [],
    kpis: [],
  });
  assert.equal(unweighted.get("p")?.progress, 50);
});

test("a leaf with no children rolls up from its goals and KPIs", () => {
  const result = rollupCascade({
    nodes: [node({ id: "kr" })],
    goals: [{ strategyNodeId: "kr", weight: 50, percentComplete: 60 }],
    kpis: [
      {
        strategyNodeId: "kr",
        weight: 50,
        measureDirection: "higher",
        baselineValue: null,
        targetValue: 100,
        currentValue: 80,
      },
    ],
  });

  assert.equal(result.get("kr")?.progress, 70);
  assert.equal(result.get("kr")?.source, "goals_and_kpis");
  assert.equal(result.get("kr")?.goalCount, 1);
  assert.equal(result.get("kr")?.kpiCount, 1);
});

test("a node's own measure is used only when nothing sits underneath it", () => {
  const result = rollupCascade({ nodes: [node({ id: "solo", targetValue: 200, currentValue: 50 })], goals: [], kpis: [] });
  assert.equal(result.get("solo")?.progress, 25);
  assert.equal(result.get("solo")?.source, "measure");
});

test("a node with nothing underneath and no measure is unmeasured, not zero", () => {
  const result = rollupCascade({ nodes: [node({ id: "empty" })], goals: [], kpis: [] });
  assert.equal(result.get("empty")?.progress, null);
  assert.equal(result.get("empty")?.source, "unmeasured");
});

test("unmeasured children do not drag a parent towards zero", () => {
  const result = rollupCascade({
    nodes: [
      node({ id: "p" }),
      node({ id: "measured", parentId: "p", targetValue: 100, currentValue: 80 }),
      node({ id: "not-measured", parentId: "p" }),
    ],
    goals: [],
    kpis: [],
  });
  assert.equal(result.get("p")?.progress, 80, "an unmeasured sibling is excluded, not counted as 0");
});

test("progress rolls through three levels", () => {
  const result = rollupCascade({
    nodes: [
      node({ id: "so", kind: "strategic_objective" }),
      node({ id: "kra", kind: "kra", parentId: "so" }),
      node({ id: "kr", kind: "key_result", parentId: "kra", targetValue: 100, currentValue: 40 }),
    ],
    goals: [],
    kpis: [],
  });
  assert.equal(result.get("so")?.progress, 40);
});

// ── shape rules: guidance, not gates ─────────────────────────────────────────

test("the conventional order is suggested", () => {
  assert.equal(suggestedChildKind(null), "strategic_objective");
  assert.equal(suggestedChildKind("strategic_objective"), "kra");
  assert.equal(suggestedChildKind("kra"), "objective");
  assert.equal(suggestedChildKind("objective"), "key_result");
});

test("an unconventional nesting is noted, never refused", () => {
  assert.equal(nestingNote("strategic_objective", "kra"), null);
  const note = nestingNote("strategic_objective", "objective");
  assert.match(note ?? "", /not the usual arrangement, but it is allowed/);
});

// ── validation ───────────────────────────────────────────────────────────────

test("a strategy without an expected outcome is refused as an activity", () => {
  const result = validateStrategy({ statement: "Run a referral campaign" }, 0);
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /an activity/.test(e)));
});

test("a complete strategy keeps its optional fields optional", () => {
  const result = validateStrategy(
    { statement: "Run a referral campaign", expectedOutcome: "40 qualified leads a month" },
    0,
  );
  assert.ok(result.ok);
  assert.equal(result.strategy.resources, null);
  assert.equal(result.strategy.responsibleId, null);
});

test("a node validates with several strategies attached", () => {
  const result = validateNode({
    kind: "objective",
    title: "Win the mid-market",
    weight: 40,
    strategies: [
      { statement: "Hire two AEs", expectedOutcome: "Coverage of the North", responsibleId: "emp-1" },
      { statement: "Launch partner tier", expectedOutcome: "15% of pipeline via partners" },
    ],
  });

  assert.ok(result.ok);
  assert.equal(result.node.strategies.length, 2);
  assert.equal(result.node.strategies[0].responsibleId, "emp-1");
});

test("a custom level must be given a name of its own", () => {
  const unnamed = validateNode({ kind: "custom", title: "Pillar one" });
  assert.equal(unnamed.ok, false);
  assert.ok((unnamed.ok ? [] : unnamed.errors).some((e) => /name of your own/.test(e)));

  const named = validateNode({ kind: "custom", title: "Pillar one", customKindLabel: "Pillar" });
  assert.ok(named.ok);
  assert.equal(named.node.customKindLabel, "Pillar");
});

test("a key result with no target is noted rather than blocked", () => {
  const result = validateNode({ kind: "key_result", title: "Lift retention" });
  assert.ok(result.ok);
  assert.ok(result.notes.some((n) => /cannot contribute a number/.test(n)));
});

test("every problem on a node is reported at once", () => {
  const result = validateNode({ kind: "nope", title: "x", weight: 400, measureType: "vibes" });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).length >= 4);
});
