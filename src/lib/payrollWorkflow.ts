/**
 * Who may do what to a payroll run, and when.
 *
 * The control that matters most is the separation between preparing a run and
 * approving it. Payroll fraud is overwhelmingly one person with both powers:
 * the preparer adds a ghost employee or inflates an adjustment and approves
 * their own work. So an approver may not have touched the run they approve —
 * not calculated it, not submitted it, not added a single adjustment to it —
 * and that is checked against the run's own event history, not against a role
 * name somebody could be given twice.
 *
 * Once approved, a run never changes. A mistake in September is corrected by an
 * adjustment in October, which leaves both months' records true to what was
 * actually paid.
 */

export type RunStatus = "draft" | "submitted" | "approved" | "void";

export type RunAction = "calculate" | "adjust" | "submit" | "return" | "approve" | "void";

export type PayrollGrant = {
  canPrepare: boolean;
  canApprove: boolean;
  canViewAll: boolean;
};

export type PayrollActor = {
  employeeId: string;
  platformRole: string | null;
  grant: PayrollGrant | null;
};

function isOrgAdmin(role: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

/**
 * What an actor may do anywhere in payroll.
 *
 * HR administrators prepare and see everything by default, because somebody
 * has to be able to set payroll up. Approval is never implied by a role: it is
 * granted to a named person, so an organisation has to decide deliberately who
 * the second pair of eyes is.
 */
export function payrollCapabilities(actor: PayrollActor) {
  const admin = isOrgAdmin(actor.platformRole);
  const grant = actor.grant ?? { canPrepare: false, canApprove: false, canViewAll: false };
  const canPrepare = admin || grant.canPrepare;
  const canApprove = grant.canApprove;
  return {
    canPrepare,
    canApprove,
    canViewAll: admin || grant.canViewAll || canPrepare || canApprove,
    canManagePermissions: admin,
    canAccessPayroll: admin || grant.canPrepare || grant.canApprove || grant.canViewAll,
  };
}

const ALLOWED: Record<RunStatus, RunAction[]> = {
  draft: ["calculate", "adjust", "submit", "void"],
  submitted: ["return", "approve"],
  approved: [],
  void: [],
};

export type RunState = {
  status: RunStatus;
  /** Everyone who calculated, adjusted or submitted this run. */
  contributorIds: string[];
  blockerCount: number;
  /** True when the stored calculation matches the inputs as they are now. */
  calculationIsCurrent: boolean;
  hasBeenCalculated: boolean;
};

export type Decision = { allowed: true } | { allowed: false; reason: string };

export function decideRunAction(input: {
  action: RunAction;
  actor: PayrollActor;
  run: RunState;
  returnReason?: string;
}): Decision {
  const { action, actor, run } = input;
  const can = payrollCapabilities(actor);

  if (!ALLOWED[run.status].includes(action)) {
    const why =
      run.status === "approved"
        ? "This run is approved and can no longer change. Correct it with an adjustment in a later run."
        : run.status === "void"
          ? "This run was voided."
          : `A run that is ${run.status} cannot be ${action === "adjust" ? "adjusted" : `${action}d`}.`;
    return { allowed: false, reason: why };
  }

  if (action === "calculate" || action === "adjust" || action === "submit" || action === "void") {
    if (!can.canPrepare) return { allowed: false, reason: "Only somebody who prepares payroll can do that." };
  }

  if (action === "submit") {
    if (!run.hasBeenCalculated) return { allowed: false, reason: "Calculate the run before submitting it." };
    if (!run.calculationIsCurrent) {
      return {
        allowed: false,
        reason: "Pay, profiles or adjustments have changed since this run was calculated. Recalculate before submitting.",
      };
    }
    if (run.blockerCount > 0) {
      return {
        allowed: false,
        reason: `${run.blockerCount} problem${run.blockerCount === 1 ? " needs" : "s need"} fixing before this run can be submitted.`,
      };
    }
  }

  if (action === "return" || action === "approve") {
    if (!can.canApprove) return { allowed: false, reason: "Only a named payroll approver can do that." };
    if (run.contributorIds.includes(actor.employeeId)) {
      return {
        allowed: false,
        reason:
          "You worked on this run, so you cannot also approve or return it. A different approver has to review it — that separation is the main protection against payroll fraud.",
      };
    }
  }

  if (action === "return" && !(input.returnReason ?? "").trim()) {
    return { allowed: false, reason: "Say why the run is being returned, so the preparer knows what to fix." };
  }

  if (action === "approve") {
    if (run.blockerCount > 0) return { allowed: false, reason: "This run still has problems that block approval." };
    if (!run.calculationIsCurrent) {
      return {
        allowed: false,
        reason: "The inputs changed after this run was submitted. Return it so it can be recalculated.",
      };
    }
  }

  return { allowed: true };
}

export function nextStatus(action: RunAction, current: RunStatus): RunStatus {
  if (action === "submit") return "submitted";
  if (action === "return") return "draft";
  if (action === "approve") return "approved";
  if (action === "void") return "void";
  return current;
}

/**
 * A stable fingerprint of everything a run's figures depend on.
 *
 * Keys are sorted at every depth, so the same inputs always produce the same
 * string regardless of the order a database happened to return them in.
 * FNV-1a is enough: this detects change, it does not protect a secret.
 */
export function fingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, canonical((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  };

  const text = JSON.stringify(canonical(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0") + ":" + text.length.toString(16);
}

/** Who may read one payslip. */
export function canReadPayslip(input: {
  actor: PayrollActor;
  lineEmployeeId: string;
  runStatus: RunStatus;
}): boolean {
  const can = payrollCapabilities(input.actor);
  if (can.canViewAll) return true;
  // Your own payslip exists for you only once the run is approved. A draft is
  // the payroll team's working copy, and figures in it may still change.
  return input.lineEmployeeId === input.actor.employeeId && input.runStatus === "approved";
}
