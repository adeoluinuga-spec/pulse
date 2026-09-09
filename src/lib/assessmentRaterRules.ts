/**
 * Validating a change to a cycle's rater rules.
 *
 * The rules decide a promise: the invitation email tells a rater their
 * individual response stays confidential, and the minimum-per-group setting is
 * what makes that true. Somebody deciding how frankly to write relies on it.
 *
 * So the rules are editable while a cycle is being set up and frozen the moment
 * the first invitation is sent. Loosening them afterwards would retroactively
 * break a promise that has already been acted on, and there is no way to ask the
 * people who answered whether they would still have said the same thing.
 */

export type SuppressionMode = "merge" | "suppress";

export type RaterRules = {
  minimumPerGroup: number;
  suppressionMode: SuppressionMode;
  quota: { colleague: number; direct_report: number };
};

/**
 * Two is the floor, not one.
 *
 * At a minimum of one the group is the person: their score is their answer, and
 * there is no anonymity left to promise. Five is the ceiling simply because
 * beyond it no organisation Pulse serves could fill a category.
 */
export const MIN_ALLOWED_MINIMUM = 2;
export const MAX_ALLOWED_MINIMUM = 5;
export const MAX_QUOTA = 10;

export type RulesOutcome =
  | { ok: true; rules: RaterRules }
  | { ok: false; reason: string };

function clampQuota(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_QUOTA) return null;
  return number;
}

export function raterRulesUpdate(input: {
  current: RaterRules;
  requested: {
    minimumPerGroup?: unknown;
    suppressionMode?: unknown;
    quota?: { colleague?: unknown; direct_report?: unknown };
  };
  lockedAt: string | null;
}): RulesOutcome {
  if (input.lockedAt) {
    return {
      ok: false,
      reason:
        "Rater rules were locked when the first invitation was sent. The confidentiality promise in that email depends on them, and people have already answered on the strength of it. Clone this cycle to run it under different rules.",
    };
  }

  const minimum =
    input.requested.minimumPerGroup === undefined
      ? input.current.minimumPerGroup
      : Number(input.requested.minimumPerGroup);

  if (!Number.isInteger(minimum) || minimum < MIN_ALLOWED_MINIMUM || minimum > MAX_ALLOWED_MINIMUM) {
    return {
      ok: false,
      reason: `The minimum raters per group must be between ${MIN_ALLOWED_MINIMUM} and ${MAX_ALLOWED_MINIMUM}. At one, the group is the individual and no confidentiality can be promised.`,
    };
  }

  const rawMode = input.requested.suppressionMode ?? input.current.suppressionMode;
  if (rawMode !== "merge" && rawMode !== "suppress") {
    return { ok: false, reason: "Scoring mode must be either merge or suppress." };
  }

  const colleague = clampQuota(input.requested.quota?.colleague, input.current.quota.colleague);
  const directReport = clampQuota(input.requested.quota?.direct_report, input.current.quota.direct_report);

  if (colleague === null || directReport === null) {
    return { ok: false, reason: `Each rater quota must be a whole number between 1 and ${MAX_QUOTA}.` };
  }

  return {
    ok: true,
    rules: {
      minimumPerGroup: minimum,
      suppressionMode: rawMode,
      quota: { colleague, direct_report: directReport },
    },
  };
}

/**
 * Whether sending this invitation should freeze the rules.
 *
 * The lock is stamped on the first successful send and never moved again, so
 * the recorded time is when the promise was first made rather than when it was
 * most recently repeated.
 */
export function shouldLockRules(lockedAt: string | null): boolean {
  return !lockedAt;
}
