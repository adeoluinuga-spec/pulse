import { relationshipLabel } from "./reviewInstrument.ts";

/**
 * A rater's queue: every assignment one email address owes within one cycle.
 *
 * The unique constraint on assessment_reviewers is
 * (subject_id, reviewer_email, reviewer_group), so one address legitimately
 * appears against many subjects — and, for the same subject, under more than one
 * relationship. Both are normal and both belong in the queue.
 */

export type QueueAssignmentStatus = "not_started" | "in_progress" | "submitted";

/** A row of assessment_reviewers joined to its subject's name. */
export type QueueAssignmentRow = {
  id: string;
  subject_name: string;
  reviewer_group: string;
  status: string;
  token_expires_at?: string | null;
  last_saved_at?: string | null;
  submitted_at?: string | null;
};

export type QueueAssignment = {
  reviewerId: string;
  subjectName: string;
  relationshipType: string;
  relationshipLabel: string;
  status: QueueAssignmentStatus;
  /** Past its own expiry and not yet submitted — cannot be opened. */
  expired: boolean;
  /** True for the assignment whose token addressed this queue. */
  isCurrent: boolean;
  lastSavedAt: string | null;
  submittedAt: string | null;
};

export type ReviewQueue = {
  assignments: QueueAssignment[];
  total: number;
  completed: number;
  remaining: number;
  /** Blocked by expiry rather than by the rater. */
  expired: number;
  /** "3 of 6 complete" */
  progressLabel: string;
  percentComplete: number;
  allComplete: boolean;
  /** The assignment to push the rater at next, or null when nothing is open. */
  nextUp: QueueAssignment | null;
};

/**
 * Escapes a value for use as a PostgREST ILIKE pattern.
 *
 * ILIKE treats `_` and `%` as wildcards, and underscores are common in work
 * email addresses. Unescaped, looking up `first_last@x.com` would also match
 * `firstXlast@x.com` and pull a different rater's assignments into the queue.
 * Case-insensitive matching is still required: the reviewers route stores the
 * address as typed while the nominations route lowercases it, so both
 * spellings exist in the table.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

export function normaliseQueueStatus(status: string | null | undefined): QueueAssignmentStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "submitted" || value === "in_progress") return value;
  return "not_started";
}

function isExpired(row: QueueAssignmentRow, now: number): boolean {
  if (!row.token_expires_at) return false;
  const expiry = new Date(row.token_expires_at).getTime();
  return Number.isFinite(expiry) && expiry < now;
}

/**
 * Sort order is the order we want the rater to work in: whatever they already
 * started, then whatever they have not begun, then anything expired, then the
 * finished ones. Resuming a part-written assessment is cheaper than starting a
 * new one, so it goes first.
 */
const STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  not_started: 1,
  expired: 2,
  submitted: 3,
};

function rankOf(assignment: QueueAssignment): number {
  if (assignment.status === "submitted") return STATUS_RANK.submitted;
  if (assignment.expired) return STATUS_RANK.expired;
  return STATUS_RANK[assignment.status] ?? STATUS_RANK.not_started;
}

export function buildReviewQueue(
  rows: QueueAssignmentRow[],
  currentReviewerId?: string | null,
  now: number = Date.now(),
): ReviewQueue {
  const assignments: QueueAssignment[] = (rows ?? []).map((row) => {
    const status = normaliseQueueStatus(row.status);
    return {
      reviewerId: row.id,
      subjectName: row.subject_name?.trim() || "Unnamed participant",
      relationshipType: row.reviewer_group,
      relationshipLabel: relationshipLabel(row.reviewer_group),
      status,
      // A submitted assessment is done; expiry no longer matters to the rater.
      expired: status !== "submitted" && isExpired(row, now),
      isCurrent: Boolean(currentReviewerId) && row.id === currentReviewerId,
      lastSavedAt: row.last_saved_at ?? null,
      submittedAt: row.submitted_at ?? null,
    };
  });

  assignments.sort((a, b) => {
    const byRank = rankOf(a) - rankOf(b);
    if (byRank !== 0) return byRank;
    const byName = a.subjectName.localeCompare(b.subjectName);
    if (byName !== 0) return byName;
    return a.relationshipLabel.localeCompare(b.relationshipLabel);
  });

  const total = assignments.length;
  const completed = assignments.filter((a) => a.status === "submitted").length;
  const expired = assignments.filter((a) => a.expired).length;
  const nextUp = assignments.find((a) => a.status !== "submitted" && !a.expired) ?? null;

  return {
    assignments,
    total,
    completed,
    remaining: total - completed,
    expired,
    progressLabel: `${completed} of ${total} complete`,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    allComplete: total > 0 && completed === total,
    nextUp,
  };
}

export function queueStatusLabel(assignment: QueueAssignment): string {
  if (assignment.status === "submitted") return "Complete";
  if (assignment.expired) return "Link expired";
  if (assignment.status === "in_progress") return "In progress";
  return "Not started";
}
