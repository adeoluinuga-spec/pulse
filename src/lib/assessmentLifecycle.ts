/**
 * The rules that govern how an assessment cycle moves between states.
 *
 * These lived inline in the cycles route, which made `closed` a dead end: the
 * only way out of it was to edit the database by hand. That is the right default
 * — a closed cycle whose reports have gone out must not silently start accepting
 * answers again — but it is the wrong answer for the common case, which is a
 * cycle closed by mistake before anybody had answered anything.
 *
 * So reopening exists, and it is gated on evidence rather than on a role alone:
 * a cycle may return to `setup` only while nothing has been collected from it.
 */

export type CycleStatus = "setup" | "collecting" | "calibration" | "closed";

export const CYCLE_STATUSES: CycleStatus[] = ["setup", "collecting", "calibration", "closed"];

export function isCycleStatus(value: string): value is CycleStatus {
  return (CYCLE_STATUSES as string[]).includes(value);
}

/**
 * Which statuses each status may move to.
 *
 * `closed → setup` is the reopen path. It appears here because the transition is
 * structurally legal; whether a *particular* closed cycle may take it is decided
 * by `reopenBlockedReason` against what that cycle has collected.
 */
export const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  setup: ["collecting"],
  collecting: ["calibration", "closed"],
  calibration: ["collecting", "closed"],
  closed: ["setup"],
};

export function allowedTransitions(from: string): CycleStatus[] {
  return isCycleStatus(from) ? CYCLE_TRANSITIONS[from] : [];
}

export function isTransitionAllowed(from: string, to: string): boolean {
  return allowedTransitions(from).includes(to as CycleStatus);
}

/** True when this transition is the reopen path and therefore needs the evidence check. */
export function isReopen(from: string, to: string): boolean {
  return from === "closed" && to === "setup";
}

/**
 * What a cycle has collected. Counting all three matters because they fail
 * differently: a response is data a rater expects to stay submitted, a submitted
 * reviewer is a promise that their part is over, and a released report is a
 * document already in a participant's hands whose numbers would change under them.
 */
export type CycleCollectionEvidence = {
  status: string;
  /** Rows in assessment_responses for this cycle. */
  responseCount: number;
  /** Reviewers whose assignment status is 'submitted'. */
  submittedReviewers: number;
  /** Reports whose report_status is 'released'. */
  releasedReports: number;
};

/**
 * Why this cycle may not be reopened, or null when it may be.
 *
 * The message is written to be shown to an HR admin unedited — it says what is
 * in the way and what to do instead, because "Forbidden" would leave them with
 * nowhere to go.
 */
export function reopenBlockedReason(evidence: CycleCollectionEvidence): string | null {
  if (evidence.status !== "closed") {
    return `Only a closed cycle can be reopened. This cycle is ${evidence.status}.`;
  }

  const collected: string[] = [];
  if (evidence.releasedReports > 0) {
    collected.push(
      `${evidence.releasedReports} report${evidence.releasedReports === 1 ? " has" : "s have"} already been released`,
    );
  }
  if (evidence.responseCount > 0) {
    collected.push(`${evidence.responseCount} response${evidence.responseCount === 1 ? " has" : "s have"} been recorded`);
  }
  if (evidence.submittedReviewers > 0) {
    collected.push(
      `${evidence.submittedReviewers} rater${evidence.submittedReviewers === 1 ? " has" : "s have"} submitted`,
    );
  }

  if (!collected.length) return null;

  return `This cycle cannot be reopened because ${collected.join(", and ")}. Clone it into a new cycle instead, so the collected data and any released reports stay as they were.`;
}

/**
 * The update a reopen applies.
 *
 * `closes_on` is cleared rather than kept: closing stamps it to the day of the
 * close, so a reopened cycle that kept it would relaunch already expired and
 * reject the first rater who opened their link.
 */
export function reopenPatch(): { status: CycleStatus; closes_on: null } {
  return { status: "setup", closes_on: null };
}
