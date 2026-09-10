/**
 * The planning cascade: strategic objective → key result area → objective →
 * key result, with goals and KPIs hanging off the bottom.
 *
 * Two things this file is careful about.
 *
 * The first is that the cascade must not become a cage. Pulse serves whoever
 * onboards, and an organisation that plans in three levels, or six, or calls a
 * key result area something else entirely, is not planning wrongly. So the
 * conventional order is a *suggestion* that the UI can lead with, never a rule
 * that refuses a save. The only structural things actually forbidden are loops
 * and unbounded depth, and those are refused in the database where they cannot
 * be argued with.
 *
 * The second is that progress has to roll up honestly. A strategic objective
 * showing 80% because somebody typed 80 into it is worthless. Progress is
 * computed from whatever sits underneath — child nodes, then attached goals and
 * KPIs — and a node with nothing underneath and no measure of its own reports
 * null rather than zero, because "not measured" and "no progress" are different
 * facts and only one of them is somebody's fault.
 */

export type NodeKind = "strategic_objective" | "kra" | "objective" | "key_result" | "custom";

export const NODE_KINDS: NodeKind[] = ["strategic_objective", "kra", "objective", "key_result", "custom"];

export const KIND_LABEL: Record<NodeKind, string> = {
  strategic_objective: "Strategic objective",
  kra: "Key result area",
  objective: "Objective",
  key_result: "Key result",
  custom: "Custom level",
};

/** What most organisations put underneath each level, used to pre-select a form. */
const CONVENTIONAL_CHILD: Record<NodeKind, NodeKind | null> = {
  strategic_objective: "kra",
  kra: "objective",
  objective: "key_result",
  key_result: null,
  custom: null,
};

export function suggestedChildKind(parentKind: NodeKind | null): NodeKind {
  if (!parentKind) return "strategic_objective";
  return CONVENTIONAL_CHILD[parentKind] ?? "key_result";
}

/**
 * Whether this nesting is the usual one.
 *
 * Returns a note, never a refusal. An objective placed directly under a
 * strategic objective — skipping key result areas — is a legitimate way to plan
 * and a very common one in smaller organisations.
 */
export function nestingNote(parentKind: NodeKind | null, childKind: NodeKind): string | null {
  if (!parentKind) {
    return childKind === "strategic_objective"
      ? null
      : `Usually a ${KIND_LABEL[childKind].toLowerCase()} sits under something. This one will stand on its own, which is fine if that is how you plan.`;
  }
  if (CONVENTIONAL_CHILD[parentKind] === childKind) return null;
  return `A ${KIND_LABEL[childKind].toLowerCase()} under a ${KIND_LABEL[parentKind].toLowerCase()} is not the usual arrangement, but it is allowed.`;
}

export type MeasureType = "number" | "percentage" | "currency" | "ratio" | "milestone" | "boolean";
export type Direction = "higher" | "lower";

export const MEASURE_TYPES: MeasureType[] = ["number", "percentage", "currency", "ratio", "milestone", "boolean"];

export type Strategy = {
  statement: string;
  expectedOutcome: string;
  responsibleId: string | null;
  resources: string | null;
  startDate: string | null;
  dueDate: string | null;
};

export type StrategyNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  ownerId: string | null;
  measureType: MeasureType;
  measureDirection: Direction;
  baselineValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  weight: number;
  status: string;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * How far a measured node has travelled, as a percentage.
 *
 * A baseline matters. Moving customer retention from 70% to 75% against a
 * target of 80% is halfway, not 94% — reading `current / target` would flatter
 * every metric that starts well above zero, which is most of them.
 */
export function nodeAttainment(node: {
  measureType: MeasureType;
  measureDirection: Direction;
  baselineValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
}): number | null {
  const { baselineValue: baseline, targetValue: target, currentValue: current } = node;
  if (!isNumber(target) || !isNumber(current)) return null;

  if (node.measureType === "milestone" || node.measureType === "boolean") {
    return node.measureDirection === "lower" ? (current <= target ? 100 : 0) : current >= target ? 100 : 0;
  }

  if (isNumber(baseline) && baseline !== target) {
    return round(clamp(((current - baseline) / (target - baseline)) * 100));
  }

  if (node.measureDirection === "lower") {
    if (current <= 0) return target <= 0 ? 100 : 100;
    return round(clamp((target / current) * 100));
  }

  if (target <= 0) return null;
  return round(clamp((current / target) * 100));
}

function weightedMean(entries: Array<{ value: number; weight: number }>): number | null {
  if (!entries.length) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (totalWeight > 0) {
    return round(entries.reduce((sum, e) => sum + e.value * Math.max(0, e.weight), 0) / totalWeight);
  }
  // All weights zero means nobody expressed a preference, so treat them equally
  // rather than returning nothing.
  return round(entries.reduce((sum, e) => sum + e.value, 0) / entries.length);
}

export type RollupInput = {
  nodes: StrategyNode[];
  goals: Array<{ strategyNodeId: string | null; weight: number | null; percentComplete: number | null }>;
  kpis: Array<{
    strategyNodeId: string | null;
    weight: number | null;
    measureDirection: Direction;
    baselineValue: number | null;
    targetValue: number | null;
    currentValue: number | null;
  }>;
};

export type RollupResult = {
  nodeId: string;
  /** Null when nothing underneath is measured. Not zero — those differ. */
  progress: number | null;
  /** Where the number came from, so a reader can argue with it. */
  source: "children" | "measure" | "goals_and_kpis" | "unmeasured";
  childCount: number;
  goalCount: number;
  kpiCount: number;
};

/**
 * Computes progress for every node, bottom-up.
 *
 * Children win over a node's own measure: if a key result area has four
 * objectives beneath it, the state of those objectives is the truth about the
 * area, and a separately maintained figure on the parent is just a second
 * number to keep in sync and eventually contradict.
 */
export function rollupCascade(input: RollupInput): Map<string, RollupResult> {
  const results = new Map<string, RollupResult>();
  const childrenOf = new Map<string, StrategyNode[]>();

  for (const node of input.nodes) {
    if (!node.parentId) continue;
    const siblings = childrenOf.get(node.parentId) ?? [];
    siblings.push(node);
    childrenOf.set(node.parentId, siblings);
  }

  const goalsBy = new Map<string, RollupInput["goals"]>();
  for (const goal of input.goals) {
    if (!goal.strategyNodeId) continue;
    const list = goalsBy.get(goal.strategyNodeId) ?? [];
    list.push(goal);
    goalsBy.set(goal.strategyNodeId, list);
  }

  const kpisBy = new Map<string, RollupInput["kpis"]>();
  for (const kpi of input.kpis) {
    if (!kpi.strategyNodeId) continue;
    const list = kpisBy.get(kpi.strategyNodeId) ?? [];
    list.push(kpi);
    kpisBy.set(kpi.strategyNodeId, list);
  }

  const visiting = new Set<string>();

  function compute(node: StrategyNode): RollupResult {
    const cached = results.get(node.id);
    if (cached) return cached;

    // The database forbids loops, but a rollup run against data fetched mid-write
    // should degrade rather than hang.
    if (visiting.has(node.id)) {
      return { nodeId: node.id, progress: null, source: "unmeasured", childCount: 0, goalCount: 0, kpiCount: 0 };
    }
    visiting.add(node.id);

    const children = childrenOf.get(node.id) ?? [];
    const goals = goalsBy.get(node.id) ?? [];
    const kpis = kpisBy.get(node.id) ?? [];

    let progress: number | null = null;
    let source: RollupResult["source"] = "unmeasured";

    if (children.length) {
      const values = children
        .map((child) => ({ value: compute(child).progress, weight: child.weight }))
        .filter((entry): entry is { value: number; weight: number } => entry.value !== null);
      progress = weightedMean(values);
      if (progress !== null) source = "children";
    }

    if (progress === null && (goals.length || kpis.length)) {
      const values = [
        ...goals
          .filter((goal) => isNumber(goal.percentComplete))
          .map((goal) => ({ value: clamp(goal.percentComplete as number), weight: goal.weight ?? 0 })),
        ...kpis
          .map((kpi) => ({ value: nodeAttainment({ ...kpi, measureType: "number" }), weight: kpi.weight ?? 0 }))
          .filter((entry): entry is { value: number; weight: number } => entry.value !== null),
      ];
      progress = weightedMean(values);
      if (progress !== null) source = "goals_and_kpis";
    }

    if (progress === null) {
      const own = nodeAttainment(node);
      if (own !== null) {
        progress = own;
        source = "measure";
      }
    }

    visiting.delete(node.id);
    const result: RollupResult = {
      nodeId: node.id,
      progress,
      source,
      childCount: children.length,
      goalCount: goals.length,
      kpiCount: kpis.length,
    };
    results.set(node.id, result);
    return result;
  }

  for (const node of input.nodes) compute(node);
  return results;
}

/**
 * Validates one strategy row.
 *
 * A strategy without an expected outcome is an activity, not a strategy, and
 * the difference is the whole point of writing it down — so the outcome is
 * required and the resources are not.
 */
export function validateStrategy(value: unknown, index: number): { ok: true; strategy: Strategy } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const raw = (value ?? {}) as Record<string, unknown>;
  const at = `Strategy ${index + 1}`;

  const statement = typeof raw.statement === "string" ? raw.statement.trim() : "";
  const expectedOutcome = typeof raw.expectedOutcome === "string" ? raw.expectedOutcome.trim() : "";

  if (statement.length < 3) errors.push(`${at}: describe what will be done.`);
  if (statement.length > 1000) errors.push(`${at}: keep the statement under 1000 characters.`);
  if (expectedOutcome.length < 3) {
    errors.push(`${at}: state the expected outcome. A strategy without one is an activity.`);
  }

  const dates = ["startDate", "dueDate"] as const;
  for (const key of dates) {
    const date = raw[key];
    if (date !== null && date !== undefined && date !== "" && !isIsoDate(date)) {
      errors.push(`${at}: ${key === "startDate" ? "start" : "target"} date must be YYYY-MM-DD.`);
    }
  }

  const startDate = isIsoDate(raw.startDate) ? raw.startDate : null;
  const dueDate = isIsoDate(raw.dueDate) ? raw.dueDate : null;
  if (startDate && dueDate && dueDate < startDate) {
    errors.push(`${at}: the target date cannot fall before the start date.`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    strategy: {
      statement,
      expectedOutcome,
      responsibleId: typeof raw.responsibleId === "string" && raw.responsibleId ? raw.responsibleId : null,
      resources: typeof raw.resources === "string" && raw.resources.trim() ? raw.resources.trim().slice(0, 2000) : null,
      startDate,
      dueDate,
    },
  };
}

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export type NodeValidation =
  | {
      ok: true;
      node: {
        kind: NodeKind;
        customKindLabel: string | null;
        title: string;
        description: string | null;
        ownerId: string | null;
        parentId: string | null;
        measure: string | null;
        measureType: MeasureType;
        measureDirection: Direction;
        baselineValue: number | null;
        targetValue: number | null;
        currentValue: number | null;
        unit: string | null;
        strategies: Strategy[];
        startDate: string | null;
        dueDate: string | null;
        weight: number;
        periodLabel: string | null;
      };
      notes: string[];
    }
  | { ok: false; errors: string[] };

/** Validates a whole node, collecting every problem rather than the first. */
export function validateNode(input: Record<string, unknown>, context: { parentKind?: NodeKind | null } = {}): NodeValidation {
  const errors: string[] = [];
  const notes: string[] = [];

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3) errors.push("Give this a title of at least 3 characters.");
  if (title.length > 300) errors.push("Keep the title under 300 characters.");

  const kind = String(input.kind ?? "") as NodeKind;
  if (!NODE_KINDS.includes(kind)) errors.push(`Choose a level: ${NODE_KINDS.map((k) => KIND_LABEL[k]).join(", ")}.`);

  const customKindLabel =
    typeof input.customKindLabel === "string" && input.customKindLabel.trim()
      ? input.customKindLabel.trim().slice(0, 60)
      : null;
  if (kind === "custom" && !customKindLabel) errors.push("A custom level needs a name of your own.");

  const measureType = String(input.measureType ?? "number") as MeasureType;
  if (!MEASURE_TYPES.includes(measureType)) errors.push("Choose how this is measured.");

  const direction = String(input.measureDirection ?? "higher") as Direction;
  if (direction !== "higher" && direction !== "lower") errors.push("Measure direction must be higher or lower.");

  const weight = Number(input.weight ?? 0);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    errors.push("Weight must be a whole number between 0 and 100.");
  }

  const numeric = (key: "baselineValue" | "targetValue" | "currentValue"): number | null => {
    const value = input[key];
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      errors.push(`${key === "baselineValue" ? "Baseline" : key === "targetValue" ? "Target" : "Current"} value must be a number.`);
      return null;
    }
    return parsed;
  };

  const baselineValue = numeric("baselineValue");
  const targetValue = numeric("targetValue");
  const currentValue = numeric("currentValue");

  for (const key of ["startDate", "dueDate"] as const) {
    const value = input[key];
    if (value !== null && value !== undefined && value !== "" && !isIsoDate(value)) {
      errors.push(`${key === "startDate" ? "Start" : "Due"} date must be YYYY-MM-DD.`);
    }
  }
  const startDate = isIsoDate(input.startDate) ? input.startDate : null;
  const dueDate = isIsoDate(input.dueDate) ? input.dueDate : null;
  if (startDate && dueDate && dueDate < startDate) errors.push("The due date cannot fall before the start date.");

  const strategies: Strategy[] = [];
  const rawStrategies = Array.isArray(input.strategies) ? input.strategies : [];
  if (rawStrategies.length > 50) errors.push("Keep it to 50 strategies or fewer on one node.");
  rawStrategies.slice(0, 50).forEach((entry, index) => {
    const result = validateStrategy(entry, index);
    if (result.ok) strategies.push(result.strategy);
    else errors.push(...result.errors);
  });

  if (errors.length) return { ok: false, errors };

  const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
  const note = nestingNote(context.parentKind ?? null, kind);
  if (note) notes.push(note);

  if (kind === "key_result" && targetValue === null) {
    notes.push("This key result has no target, so it cannot contribute a number to the rollup until one is set.");
  }

  return {
    ok: true,
    notes,
    node: {
      kind,
      customKindLabel,
      title,
      description: typeof input.description === "string" && input.description.trim() ? input.description.trim().slice(0, 8000) : null,
      ownerId: typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null,
      parentId,
      measure: typeof input.measure === "string" && input.measure.trim() ? input.measure.trim().slice(0, 300) : null,
      measureType,
      measureDirection: direction,
      baselineValue,
      targetValue,
      currentValue,
      unit: typeof input.unit === "string" && input.unit.trim() ? input.unit.trim().slice(0, 40) : null,
      strategies,
      startDate,
      dueDate,
      weight,
      periodLabel: typeof input.periodLabel === "string" && input.periodLabel.trim() ? input.periodLabel.trim().slice(0, 60) : null,
    },
  };
}
