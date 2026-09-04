import test from "node:test";
import assert from "node:assert/strict";

import {
  MINIMUM_RESPONSES_PER_GROUP,
  computeSelfOthersGaps,
  hasSufficientData,
  scoreByGroup,
  scoreSubject,
} from "./assessmentScoring.ts";

// Stage 1 ships the interface only. These assert the stubs are still stubs, so
// that nothing downstream quietly ships against an unimplemented service.

test("the scoring service is not implemented yet and says so", () => {
  assert.throws(() => scoreSubject("subject-1", []), /interface only/);
  assert.throws(() => scoreByGroup([]), /interface only/);
  assert.throws(() => computeSelfOthersGaps([]), /interface only/);
  assert.throws(() => hasSufficientData([]), /interface only/);
});

test("the suppression threshold is three", () => {
  assert.equal(MINIMUM_RESPONSES_PER_GROUP, 3);
});

// ── The contract the implementation must satisfy ───────────────────────────
// Pending until the service is built. Each one states a rule from
// assessmentScoring.ts in executable form; fill in the body when implementing.

test("excludes not-observed responses from the denominator", { todo: true }, () => {});

test("averages within a rater group before weighting across groups", { todo: true }, () => {});

test("suppresses a (competency, raterGroup) cell with fewer than three scored responses", { todo: true }, () => {});

test("reports a suppressed cell as mean null, never as zero", { todo: true }, () => {});

test("scores the self group but gives it zero weight in the overall", { todo: true }, () => {});

test("derives blind spots and hidden strengths from the self-versus-others gap", { todo: true }, () => {});

test("flags a subject with too few total responses as insufficientData", { todo: true }, () => {});

test("collects verbatims from text items and from comments on scale items", { todo: true }, () => {});
