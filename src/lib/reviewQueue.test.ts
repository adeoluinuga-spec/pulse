import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewQueue,
  escapeLikePattern,
  normaliseQueueStatus,
  queueStatusLabel,
  type QueueAssignmentRow,
} from "./reviewQueue.ts";

const NOW = Date.parse("2026-09-04T12:00:00Z");
const FUTURE = "2026-09-20T12:00:00Z";
const PAST = "2026-08-20T12:00:00Z";

const row = (over: Partial<QueueAssignmentRow> & { id: string }): QueueAssignmentRow => ({
  subject_name: "Ada Obi",
  reviewer_group: "colleague",
  status: "not_started",
  token_expires_at: FUTURE,
  ...over,
});

test("counts a six-assignment queue and labels progress", () => {
  const queue = buildReviewQueue(
    [
      row({ id: "1", subject_name: "Ada Obi", status: "submitted" }),
      row({ id: "2", subject_name: "Ben Eze", status: "submitted" }),
      row({ id: "3", subject_name: "Cara Njoku", status: "submitted" }),
      row({ id: "4", subject_name: "Dele Ade", status: "in_progress" }),
      row({ id: "5", subject_name: "Emeka Udo", status: "not_started" }),
      row({ id: "6", subject_name: "Funke Bola", status: "not_started" }),
    ],
    null,
    NOW,
  );

  assert.equal(queue.total, 6);
  assert.equal(queue.completed, 3);
  assert.equal(queue.remaining, 3);
  assert.equal(queue.progressLabel, "3 of 6 complete");
  assert.equal(queue.percentComplete, 50);
  assert.equal(queue.allComplete, false);
});

test("orders in-progress first, then not started, then expired, then complete", () => {
  const queue = buildReviewQueue(
    [
      row({ id: "done", subject_name: "Zara", status: "submitted" }),
      row({ id: "fresh", subject_name: "Yemi", status: "not_started" }),
      row({ id: "stale", subject_name: "Xena", status: "not_started", token_expires_at: PAST }),
      row({ id: "resume", subject_name: "Wale", status: "in_progress" }),
    ],
    null,
    NOW,
  );

  assert.deepEqual(
    queue.assignments.map((a) => a.reviewerId),
    ["resume", "fresh", "stale", "done"],
  );
});

test("points nextUp at the first assignment that can actually be opened", () => {
  const queue = buildReviewQueue(
    [
      row({ id: "done", status: "submitted", subject_name: "Ada" }),
      row({ id: "stale", status: "not_started", subject_name: "Ben", token_expires_at: PAST }),
      row({ id: "open", status: "not_started", subject_name: "Cara" }),
    ],
    null,
    NOW,
  );

  assert.equal(queue.nextUp?.reviewerId, "open");
});

test("nextUp is null when everything is done", () => {
  const queue = buildReviewQueue(
    [row({ id: "1", status: "submitted" }), row({ id: "2", status: "submitted" })],
    null,
    NOW,
  );

  assert.equal(queue.nextUp, null);
  assert.equal(queue.allComplete, true);
  assert.equal(queue.progressLabel, "2 of 2 complete");
});

test("a submitted assignment is never treated as expired", () => {
  const queue = buildReviewQueue(
    [row({ id: "1", status: "submitted", token_expires_at: PAST })],
    null,
    NOW,
  );

  assert.equal(queue.assignments[0].expired, false);
  assert.equal(queue.expired, 0);
  assert.equal(queueStatusLabel(queue.assignments[0]), "Complete");
});

test("an unsubmitted assignment past its expiry is flagged and counted", () => {
  const queue = buildReviewQueue(
    [row({ id: "1", status: "in_progress", token_expires_at: PAST })],
    null,
    NOW,
  );

  assert.equal(queue.assignments[0].expired, true);
  assert.equal(queue.expired, 1);
  assert.equal(queue.nextUp, null);
  assert.equal(queueStatusLabel(queue.assignments[0]), "Link expired");
});

test("an assignment with no expiry set never expires", () => {
  const queue = buildReviewQueue(
    [row({ id: "1", status: "not_started", token_expires_at: null })],
    null,
    NOW,
  );

  assert.equal(queue.assignments[0].expired, false);
});

// One email may legitimately rate the same person under two relationships, and
// many people under one — the unique constraint is on the triple.
test("keeps one subject appearing under two relationships as two assignments", () => {
  const queue = buildReviewQueue(
    [
      row({ id: "a", subject_name: "Ada Obi", reviewer_group: "colleague" }),
      row({ id: "b", subject_name: "Ada Obi", reviewer_group: "direct_report" }),
    ],
    null,
    NOW,
  );

  assert.equal(queue.total, 2);
  assert.deepEqual(
    queue.assignments.map((a) => a.relationshipLabel),
    ["Colleague", "Direct report"],
  );
});

test("marks the assignment whose token opened the queue", () => {
  const queue = buildReviewQueue(
    [row({ id: "here", subject_name: "Ada" }), row({ id: "other", subject_name: "Ben" })],
    "here",
    NOW,
  );

  assert.equal(queue.assignments.find((a) => a.reviewerId === "here")?.isCurrent, true);
  assert.equal(queue.assignments.find((a) => a.reviewerId === "other")?.isCurrent, false);
});

test("maps relationship types to the shared labels", () => {
  const queue = buildReviewQueue(
    [
      row({ id: "1", reviewer_group: "line_manager", subject_name: "A" }),
      row({ id: "2", reviewer_group: "direct_report", subject_name: "B" }),
      row({ id: "3", reviewer_group: "customer", subject_name: "C" }),
      row({ id: "4", reviewer_group: "self", subject_name: "D" }),
    ],
    null,
    NOW,
  );

  assert.deepEqual(
    queue.assignments.map((a) => a.relationshipLabel),
    ["Line manager", "Direct report", "Customer", "Self assessment"],
  );
});

test("handles an empty queue without dividing by zero", () => {
  const queue = buildReviewQueue([], null, NOW);

  assert.equal(queue.total, 0);
  assert.equal(queue.percentComplete, 0);
  assert.equal(queue.allComplete, false);
  assert.equal(queue.nextUp, null);
  assert.equal(queue.progressLabel, "0 of 0 complete");
});

// An underscore in an email is an ILIKE wildcard. Without escaping, one rater's
// queue would show another rater's assignments.
test("escapes ILIKE wildcards so one email cannot match another", () => {
  assert.equal(escapeLikePattern("first_last@x.com"), "first\\_last@x.com");
  assert.equal(escapeLikePattern("a%b@x.com"), "a\\%b@x.com");
  assert.equal(escapeLikePattern("back\\slash@x.com"), "back\\\\slash@x.com");
  // Ordinary addresses pass through untouched.
  assert.equal(escapeLikePattern("ada.obi@x.com"), "ada.obi@x.com");
  assert.equal(escapeLikePattern("ada+360@x.com"), "ada+360@x.com");
});

test("falls back to a readable name and a safe status", () => {
  const queue = buildReviewQueue([row({ id: "1", subject_name: "  ", status: "weird" })], null, NOW);

  assert.equal(queue.assignments[0].subjectName, "Unnamed participant");
  assert.equal(queue.assignments[0].status, "not_started");
  assert.equal(normaliseQueueStatus(undefined), "not_started");
  assert.equal(normaliseQueueStatus("SUBMITTED"), "submitted");
});
