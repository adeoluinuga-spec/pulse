/**
 * Creating and maintaining KPIs.
 *
 * KPIs carry 25% of every appraisal score and, like goals, there was no way to
 * make one — no API, and a page that read them from a fixture. The appraisal
 * engine has read `kpis` by `appraisal_cycle_id` since it was written, against
 * rows nothing in the product could author.
 *
 * A KPI differs from a goal in one way that matters here: it has no dates. It
 * is a standing measure read at a frequency, not a piece of work with a start
 * and an end. That is why it cannot be matched to an appraisal period by date
 * and why `frequency` earns its place.
 */

export type Direction = "higher" | "lower";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export type KpiInput = {
  name?: unknown;
  description?: unknown;
  employeeId?: unknown;
  strategyNodeId?: unknown;
  unit?: unknown;
  baselineValue?: unknown;
  targetValue?: unknown;
  currentValue?: unknown;
  weight?: unknown;
  measureDirection?: unknown;
  frequency?: unknown;
  cycle?: unknown;
  isActive?: unknown;
};

export type ValidKpi = {
  name: string;
  description: string | null;
  employeeId: string;
  strategyNodeId: string | null;
  unit: string | null;
  baselineValue: number | null;
  targetValue: number;
  currentValue: number;
  weight: number;
  measureDirection: Direction;
  frequency: Frequency;
  cycle: string | null;
  isActive: boolean;
};

export type KpiValidation = { ok: true; kpi: ValidKpi } | { ok: false; errors: string[] };

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function validateKpi(input: KpiInput): KpiValidation {
  const errors: string[] = [];

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2) errors.push("Give the KPI a name.");
  if (name.length > 200) errors.push("Keep the name under 200 characters.");

  const employeeId = typeof input.employeeId === "string" ? input.employeeId.trim() : "";
  if (!employeeId) errors.push("Every KPI needs an owner — it is what ties it to an appraisal.");

  const target = numberOrNull(input.targetValue);
  if (target === null) errors.push("Set a target. Without one there is nothing to measure against.");
  else if (Number.isNaN(target)) errors.push("The target must be a number.");

  const current = numberOrNull(input.currentValue);
  if (current !== null && Number.isNaN(current)) errors.push("The current value must be a number.");

  const baseline = numberOrNull(input.baselineValue);
  if (baseline !== null && Number.isNaN(baseline)) errors.push("The baseline must be a number.");

  const weight = Number(input.weight ?? 0);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    errors.push("Weight must be a whole number between 0 and 100.");
  }

  const direction = String(input.measureDirection ?? "higher");
  if (direction !== "higher" && direction !== "lower") {
    errors.push("Say whether a higher or a lower reading is better.");
  }

  const frequency = String(input.frequency ?? "monthly") as Frequency;
  if (!FREQUENCIES.includes(frequency)) {
    errors.push(`How often is it read? One of: ${FREQUENCIES.join(", ")}.`);
  }

  // A baseline equal to the target leaves nothing to travel, and the attainment
  // maths would divide by zero. Caught here rather than producing Infinity.
  if (baseline !== null && !Number.isNaN(baseline) && target !== null && !Number.isNaN(target) && baseline === target) {
    errors.push("The baseline and the target are the same, so there is no movement to measure.");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    kpi: {
      name,
      description:
        typeof input.description === "string" && input.description.trim() ? input.description.trim().slice(0, 4000) : null,
      employeeId,
      strategyNodeId: typeof input.strategyNodeId === "string" && input.strategyNodeId ? input.strategyNodeId : null,
      unit: typeof input.unit === "string" && input.unit.trim() ? input.unit.trim().slice(0, 40) : null,
      baselineValue: baseline,
      targetValue: target as number,
      currentValue: current ?? 0,
      weight,
      measureDirection: direction as Direction,
      frequency,
      cycle: typeof input.cycle === "string" && input.cycle.trim() ? input.cycle.trim().slice(0, 60) : null,
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    },
  };
}

/**
 * Which way a KPI has moved since its last reading.
 *
 * Stored rather than derived at read time because the previous value is not
 * kept — recording the direction at the moment of the update is the only place
 * the information exists.
 */
export function trendFor(input: { previous: number | null; next: number; direction: Direction }): "up" | "down" | "flat" {
  if (input.previous === null || input.previous === input.next) return "flat";
  const rising = input.next > input.previous;
  const improving = input.direction === "lower" ? !rising : rising;
  return improving ? "up" : "down";
}
