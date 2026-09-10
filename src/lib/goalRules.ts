/**
 * Creating and maintaining goals.
 *
 * Goals carry 35% of every appraisal score, and until now there was no way to
 * create one: no API, and a `/goals` page that rendered fictional objectives
 * from a demo company. Evidence could be attached to an appraisal cycle but
 * never authored, so the weighting rested on rows nobody could produce.
 *
 * The rules here are deliberately small. What matters is that a goal carries
 * the four things the appraisal engine needs — an owner, a weight, a progress
 * figure and a period — and that none of them can be half-filled.
 */

export type GoalType = "org" | "dept" | "team" | "individual";
export type GoalStatus = "on_track" | "at_risk" | "behind" | "completed";

export const GOAL_TYPES: GoalType[] = ["org", "dept", "team", "individual"];
export const GOAL_STATUSES: GoalStatus[] = ["on_track", "at_risk", "behind", "completed"];

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  org: "Organisation",
  dept: "Department",
  team: "Team",
  individual: "Individual",
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  completed: "Completed",
};

export type GoalInput = {
  title?: unknown;
  description?: unknown;
  goalType?: unknown;
  ownerId?: unknown;
  weight?: unknown;
  percentComplete?: unknown;
  startDate?: unknown;
  dueDate?: unknown;
  status?: unknown;
  targetMetric?: unknown;
  department?: unknown;
  team?: unknown;
  cycle?: unknown;
};

export type ValidGoal = {
  title: string;
  description: string | null;
  goalType: GoalType;
  ownerId: string;
  weight: number;
  percentComplete: number;
  startDate: string;
  dueDate: string;
  status: GoalStatus;
  targetMetric: string | null;
  department: string | null;
  team: string | null;
  cycle: string | null;
};

export type Validation = { ok: true; goal: ValidGoal } | { ok: false; errors: string[] };

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown, max: number): string | null {
  const trimmed = text(value);
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Where a goal should sit given how much of its window has passed.
 *
 * A hand-maintained status goes stale the moment somebody stops updating it,
 * and a stale "on track" is worse than no status at all — it is the one an
 * appraisal conversation will quote back. So progress is compared against
 * elapsed time and the answer is derived, with the author free to override it
 * when they know something the dates do not.
 */
export function deriveGoalStatus(input: {
  percentComplete: number;
  startDate: string;
  dueDate: string;
  asOf?: string;
}): GoalStatus {
  if (input.percentComplete >= 100) return "completed";

  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const start = Date.parse(input.startDate);
  const end = Date.parse(input.dueDate);
  const now = Date.parse(asOf);

  if (![start, end, now].every(Number.isFinite) || end <= start) return "on_track";
  if (now <= start) return "on_track";

  // Past the due date, anything unfinished is behind — no amount of elapsed-time
  // arithmetic makes an overdue goal merely "at risk".
  if (now >= end) return "behind";

  const expected = ((now - start) / (end - start)) * 100;
  const shortfall = expected - input.percentComplete;

  if (shortfall <= 10) return "on_track";
  if (shortfall <= 25) return "at_risk";
  return "behind";
}

/**
 * Validates one goal, collecting every problem rather than the first.
 *
 * A form that reports one error at a time turns a five-field mistake into five
 * round trips.
 */
export function validateGoal(input: GoalInput, options: { asOf?: string } = {}): Validation {
  const errors: string[] = [];

  const title = text(input.title);
  if (title.length < 3) errors.push("Give the goal a title of at least 3 characters.");
  if (title.length > 200) errors.push("Keep the title under 200 characters.");

  const goalType = text(input.goalType) as GoalType;
  if (!GOAL_TYPES.includes(goalType)) {
    errors.push(`Choose a goal type: ${GOAL_TYPES.map((t) => GOAL_TYPE_LABEL[t]).join(", ")}.`);
  }

  const ownerId = text(input.ownerId);
  if (!ownerId) errors.push("Every goal needs an owner — it is what ties it to an appraisal.");

  const weight = Number(input.weight ?? 0);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    errors.push("Weight must be a whole number between 0 and 100.");
  }

  const percentComplete = Number(input.percentComplete ?? 0);
  if (!Number.isInteger(percentComplete) || percentComplete < 0 || percentComplete > 100) {
    errors.push("Progress must be a whole number between 0 and 100.");
  }

  const startDate = input.startDate;
  const dueDate = input.dueDate;
  if (!isIsoDate(startDate)) errors.push("Set a start date (YYYY-MM-DD).");
  if (!isIsoDate(dueDate)) errors.push("Set a due date (YYYY-MM-DD).");
  if (isIsoDate(startDate) && isIsoDate(dueDate) && dueDate < startDate) {
    errors.push("The due date cannot fall before the start date.");
  }

  if (errors.length) return { ok: false, errors };

  const suppliedStatus = text(input.status) as GoalStatus;
  const status = GOAL_STATUSES.includes(suppliedStatus)
    ? suppliedStatus
    : deriveGoalStatus({
        percentComplete,
        startDate: startDate as string,
        dueDate: dueDate as string,
        asOf: options.asOf,
      });

  return {
    ok: true,
    goal: {
      title,
      description: optionalText(input.description, 4000),
      goalType,
      ownerId,
      weight,
      percentComplete,
      startDate: startDate as string,
      dueDate: dueDate as string,
      status,
      targetMetric: optionalText(input.targetMetric, 300),
      department: optionalText(input.department, 120),
      team: optionalText(input.team, 120),
      cycle: optionalText(input.cycle, 60),
    },
  };
}

export type Actor = {
  employeeId: string;
  role: string | null;
  /** Employees whose line_manager_id is this actor. */
  directReportIds: string[];
};

function isHr(role: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

/**
 * Who may create a goal for whom.
 *
 * People set their own objectives, managers set them for their reports, and HR
 * for anybody. Organisation and department goals are HR's, because a goal at
 * that level is a commitment on behalf of people who did not agree to it.
 */
export function canCreateGoal(actor: Actor, goal: { ownerId: string; goalType: GoalType }): boolean {
  if (goal.goalType === "org" || goal.goalType === "dept") return isHr(actor.role);
  if (isHr(actor.role)) return true;
  if (goal.ownerId === actor.employeeId) return true;
  return actor.directReportIds.includes(goal.ownerId);
}

/**
 * Who may change a goal once it exists.
 *
 * Mirrors creation, with one addition: a goal already committed to an appraisal
 * cycle is frozen. Its progress figure has been scored, and editing it after
 * the fact would move a number somebody has already been appraised on.
 */
export function canEditGoal(
  actor: Actor,
  goal: { ownerId: string | null; goalType: GoalType; appraisalCycleId: string | null },
): { allowed: boolean; reason?: string } {
  if (goal.appraisalCycleId) {
    return {
      allowed: false,
      reason:
        "This goal is attached to an appraisal cycle, so its progress has been scored. Detach it from the cycle first if it genuinely needs to change.",
    };
  }

  if (!goal.ownerId) return { allowed: isHr(actor.role) };

  if (goal.goalType === "org" || goal.goalType === "dept") {
    return isHr(actor.role)
      ? { allowed: true }
      : { allowed: false, reason: "Organisation and department goals are maintained by HR." };
  }

  if (isHr(actor.role) || goal.ownerId === actor.employeeId || actor.directReportIds.includes(goal.ownerId)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "You can only change your own goals or those of the people who report to you." };
}

/**
 * How much of an owner's weight is already spoken for.
 *
 * Reported rather than enforced. The appraisal engine renormalises whatever
 * weights it finds, so a total other than 100 is not wrong — but an author
 * setting weights should be able to see where they stand.
 */
export function weightSummary(goals: Array<{ ownerId: string | null; weight: number }>, ownerId: string): {
  total: number;
  remaining: number;
} {
  const total = goals.filter((goal) => goal.ownerId === ownerId).reduce((sum, goal) => sum + (goal.weight || 0), 0);
  return { total, remaining: Math.max(0, 100 - total) };
}
