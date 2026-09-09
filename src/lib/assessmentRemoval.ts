/**
 * Taking a participant or a rater back out of a cycle.
 *
 * The decision turns entirely on whether anybody has written anything yet, and
 * that distinction matters more than it looks. Deleting a row nobody has touched
 * is housekeeping. Deleting one that carries feedback destroys what real people
 * wrote about a real person, and — because thin rater groups are suppressed at
 * three — quietly changes what everyone else's report is allowed to show.
 *
 * So there are two verbs, and which one applies is never the operator's guess.
 */

export type RemovalAction = "delete" | "withdraw" | "revoke" | "blocked";

export type RemovalDecision = {
  action: RemovalAction;
  /** Shown to the operator unedited, so it has to say what will happen and why. */
  explanation: string;
};

export type ParticipantRemovalEvidence = {
  /** Responses recorded about this participant, across every rater. */
  responseCount: number;
  /** Raters assigned to this participant who have submitted. */
  submittedReviewers: number;
  /** Reports for this participant that have been released to them. */
  releasedReports: number;
  /** Whether they are already withdrawn. */
  alreadyWithdrawn?: boolean;
};

/**
 * What removing this participant should do.
 *
 * A released report is the one true block. Withdrawing after release would
 * retract a document the participant has already read, and Pulse has no way to
 * un-send it — so the honest answer is that this cannot be undone here.
 */
export function resolveParticipantRemoval(evidence: ParticipantRemovalEvidence): RemovalDecision {
  if (evidence.alreadyWithdrawn) {
    return {
      action: "blocked",
      explanation: "This participant is already withdrawn from the cycle.",
    };
  }

  if (evidence.releasedReports > 0) {
    return {
      action: "blocked",
      explanation:
        "A report for this participant has already been released to them. They cannot be removed from the cycle, because the report they hold cannot be recalled. Close the cycle instead if it should not continue.",
    };
  }

  const collected = evidence.responseCount > 0 || evidence.submittedReviewers > 0;
  if (!collected) {
    return {
      action: "delete",
      explanation:
        "Nobody has given feedback about this participant yet, so they will be removed from the cycle completely, along with their rater assignments.",
    };
  }

  return {
    action: "withdraw",
    explanation:
      "Feedback about this participant has already been given, so it will not be deleted. They will be withdrawn instead: excluded from scoring, reports, exports and completion, with the responses kept as they were.",
  };
}

export type RaterRemovalEvidence = {
  /** The rater's own assignment status. */
  status: string;
  /** Responses this rater has recorded, including drafts. */
  responseCount: number;
};

/**
 * What removing this rater should do.
 *
 * A rater who has answered is never deleted. Their responses are part of what
 * the participant's report is computed from, and dropping them would shift the
 * rater-group counts that decide which cells are suppressed — so a report could
 * change, or start showing a group that was correctly hidden a moment earlier.
 * Their link is revoked instead: they cannot answer again, and what they already
 * said still counts.
 */
export function resolveRaterRemoval(evidence: RaterRemovalEvidence): RemovalDecision {
  const hasAnswered = evidence.status === "submitted" || evidence.responseCount > 0;

  if (!hasAnswered) {
    return {
      action: "delete",
      explanation:
        "This rater has not answered anything, so their assignment and their invitation link will be removed entirely.",
    };
  }

  return {
    action: "revoke",
    explanation:
      "This rater has already given feedback. Their answers stay in the assessment and still count towards the report, because removing them would change which rater groups are large enough to be shown. Their link will be revoked so they cannot answer again.",
  };
}

/**
 * Whether a participant may be put back into the cycle.
 *
 * Reinstating is only ever the reversal of a withdrawal, which is why it is not
 * simply "set the column to null" at the call site — a participant deleted
 * outright has nothing to come back to.
 */
export function canReinstateParticipant(input: { withdrawnAt: string | null }): boolean {
  return Boolean(input.withdrawnAt);
}
