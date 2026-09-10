/**
 * Attaching goals and KPIs to an appraisal cycle.
 *
 * The appraisal engine scores goal achievement at 35% and KPI performance at
 * 25%, and reads both by `appraisal_cycle_id`. Nothing ever set that column, so
 * 60% of every score had no evidence and each appraisal blocked — correctly, but
 * with no way for an administrator to fix it.
 *
 * The two are matched differently because they carry different information.
 * A goal has real start and due dates, so it can be matched to the cycle window
 * it actually falls in. A KPI has no dates at all — only a free-text `cycle`
 * label — so the label is the only signal available, and where it does not match
 * the evidence has to be chosen by hand rather than guessed at.
 *
 * Nothing here is destructive. Evidence already attached to a different cycle is
 * never moved: last quarter's numbers must not silently migrate into this
 * quarter's appraisal.
 */

export type EvidenceCycle = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

export type LinkableGoal = {
  id: string;
  title: string;
  ownerId: string | null;
  status: string | null;
  startDate: string | null;
  dueDate: string | null;
  cycleLabel: string | null;
  appraisalCycleId: string | null;
};

export type LinkableKpi = {
  id: string;
  name: string;
  employeeId: string | null;
  cycleLabel: string | null;
  appraisalCycleId: string | null;
};

export type EvidenceDecision = {
  id: string;
  label: string;
  /** Why this item was matched, or why it was left alone. Shown verbatim. */
  reason: string;
};

export type EvidencePlan = {
  goals: { link: EvidenceDecision[]; skip: EvidenceDecision[] };
  kpis: { link: EvidenceDecision[]; skip: EvidenceDecision[] };
};

/**
 * Statuses that describe work which was never really done.
 *
 * An abandoned goal is not a zero — it is an absence. Scoring it as 0% would
 * punish somebody for a target that was withdrawn, usually by their own manager.
 */
const EXCLUDED_GOAL_STATUSES = new Set(["cancelled", "canceled", "abandoned", "draft", "archived"]);

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Whether a dated item falls inside the cycle window at all.
 *
 * Overlap rather than containment: a goal running March to June belongs in an
 * April-to-June appraisal, even though it started before the window opened.
 * That is how objectives actually work, and requiring containment would exclude
 * most of the long-running ones.
 */
export function overlapsCycle(
  item: { startDate: string | null; dueDate: string | null },
  cycle: EvidenceCycle,
): boolean {
  if (!cycle.startDate || !cycle.endDate) return false;

  const start = item.startDate ?? item.dueDate;
  const end = item.dueDate ?? item.startDate;
  if (!start || !end) return false;

  return start <= cycle.endDate && end >= cycle.startDate;
}

/** A legacy free-text period label naming this cycle. */
export function matchesCycleLabel(label: string | null, cycle: EvidenceCycle): boolean {
  const value = normalise(label);
  return value.length > 0 && value === normalise(cycle.name);
}

export type PlanInput = {
  cycle: EvidenceCycle;
  goals: LinkableGoal[];
  kpis: LinkableKpi[];
  /** Employees enrolled in this cycle. Evidence for anybody else is not theirs to score. */
  participantIds: string[];
};

/**
 * Decides what should attach to the cycle, and says why for everything that does not.
 *
 * The skip list is the useful half. An administrator staring at a blocked
 * appraisal needs to know whether the evidence is missing, owned by somebody not
 * enrolled, or already committed to another quarter — those need three different
 * responses, and "0 linked" answers none of them.
 */
export function planEvidenceLinks(input: PlanInput): EvidencePlan {
  const participants = new Set(input.participantIds);
  const plan: EvidencePlan = {
    goals: { link: [], skip: [] },
    kpis: { link: [], skip: [] },
  };

  for (const goal of input.goals) {
    const entry = { id: goal.id, label: goal.title };

    if (goal.appraisalCycleId === input.cycle.id) {
      plan.goals.skip.push({ ...entry, reason: "Already attached to this cycle." });
      continue;
    }
    if (goal.appraisalCycleId) {
      plan.goals.skip.push({
        ...entry,
        reason: "Attached to a different appraisal cycle. Detach it there first — it is not moved automatically.",
      });
      continue;
    }
    if (!goal.ownerId || !participants.has(goal.ownerId)) {
      plan.goals.skip.push({
        ...entry,
        reason: goal.ownerId
          ? "Owned by somebody who is not enrolled in this cycle."
          : "Has no owner, so it cannot count towards anybody's appraisal.",
      });
      continue;
    }
    if (EXCLUDED_GOAL_STATUSES.has(normalise(goal.status))) {
      plan.goals.skip.push({
        ...entry,
        reason: `Status is "${goal.status}", so it is not scoreable work. A withdrawn goal is an absence, not a zero.`,
      });
      continue;
    }

    // Dates are authoritative where they exist; the label is the fallback for
    // older rows entered before goals carried a period.
    if (overlapsCycle({ startDate: goal.startDate, dueDate: goal.dueDate }, input.cycle)) {
      plan.goals.link.push({ ...entry, reason: "Its dates fall inside the cycle window." });
    } else if (!goal.startDate && !goal.dueDate && matchesCycleLabel(goal.cycleLabel, input.cycle)) {
      plan.goals.link.push({ ...entry, reason: `Undated, but labelled "${goal.cycleLabel}".` });
    } else {
      plan.goals.skip.push({
        ...entry,
        reason: "Its dates fall outside the cycle window. Attach it by hand if it belongs here.",
      });
    }
  }

  for (const kpi of input.kpis) {
    const entry = { id: kpi.id, label: kpi.name };

    if (kpi.appraisalCycleId === input.cycle.id) {
      plan.kpis.skip.push({ ...entry, reason: "Already attached to this cycle." });
      continue;
    }
    if (kpi.appraisalCycleId) {
      plan.kpis.skip.push({
        ...entry,
        reason: "Attached to a different appraisal cycle. Detach it there first — it is not moved automatically.",
      });
      continue;
    }
    if (!kpi.employeeId || !participants.has(kpi.employeeId)) {
      plan.kpis.skip.push({
        ...entry,
        reason: kpi.employeeId
          ? "Belongs to somebody who is not enrolled in this cycle."
          : "Has no owner, so it cannot count towards anybody's appraisal.",
      });
      continue;
    }

    // KPIs carry no dates, so there is nothing to overlap. The label is all
    // there is, and where it does not match the choice has to be deliberate.
    if (matchesCycleLabel(kpi.cycleLabel, input.cycle)) {
      plan.kpis.link.push({ ...entry, reason: `Labelled "${kpi.cycleLabel}", matching this cycle.` });
    } else {
      plan.kpis.skip.push({
        ...entry,
        reason: kpi.cycleLabel
          ? `Labelled "${kpi.cycleLabel}", which does not name this cycle. KPIs carry no dates, so attach it by hand if it belongs here.`
          : "Has no period label, and KPIs carry no dates to match on. Attach it by hand if it belongs here.",
      });
    }
  }

  return plan;
}

/**
 * What the plan means for the appraisal that follows.
 *
 * A participant with no goals attached still scores null for goal achievement
 * and their appraisal still blocks, so the count that matters is not "how many
 * items linked" but "how many people are still without evidence".
 */
export function coverageAfterPlan(input: {
  participantIds: string[];
  goals: LinkableGoal[];
  kpis: LinkableKpi[];
  linkedGoalIds: Set<string>;
  linkedKpiIds: Set<string>;
  cycleId: string;
}): Array<{ employeeId: string; goals: number; kpis: number }> {
  const counts = new Map<string, { employeeId: string; goals: number; kpis: number }>(
    input.participantIds.map((id) => [id, { employeeId: id, goals: 0, kpis: 0 }]),
  );

  for (const goal of input.goals) {
    const attached = goal.appraisalCycleId === input.cycleId || input.linkedGoalIds.has(goal.id);
    const entry = goal.ownerId ? counts.get(goal.ownerId) : undefined;
    if (attached && entry) entry.goals += 1;
  }

  for (const kpi of input.kpis) {
    const attached = kpi.appraisalCycleId === input.cycleId || input.linkedKpiIds.has(kpi.id);
    const entry = kpi.employeeId ? counts.get(kpi.employeeId) : undefined;
    if (attached && entry) entry.kpis += 1;
  }

  return [...counts.values()];
}
