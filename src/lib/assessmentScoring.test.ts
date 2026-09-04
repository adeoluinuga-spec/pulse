import test from "node:test";
import assert from "node:assert/strict";

import {
  MINIMUM_RESPONSES_PER_GROUP,
  SELF_OTHERS_GAP_THRESHOLD,
  aggregateCohort,
  computeSelfOthersGaps,
  decideRelease,
  hasSufficientData,
  scoreByGroup,
  scoreSubject,
  type ScoredResponse,
} from "./assessmentScoring.ts";

/** One scored response; override what the test cares about. */
const r = (over: Partial<ScoredResponse> = {}): ScoredResponse => ({
  reviewerId: "rater-1",
  raterGroup: "colleague",
  itemId: "item-1",
  competencyId: "comp-1",
  itemType: "scale",
  rating: 4,
  notObserved: false,
  comment: null,
  ...over,
});

/** `count` distinct raters in `group`, each rating one item `rating`. */
const raters = (group: string, count: number, rating = 4, competencyId = "comp-1"): ScoredResponse[] =>
  Array.from({ length: count }, (_, i) =>
    r({
      reviewerId: `${group}-${i + 1}`,
      raterGroup: group as ScoredResponse["raterGroup"],
      competencyId,
      rating,
    }),
  );

const groupFor = (responses: ScoredResponse[], group: string, competencyId = "comp-1") =>
  scoreByGroup(responses).find((g) => g.raterGroup === group && g.competencyId === competencyId);

// ════════════════════════════════════════════════════════════════════════════
// SUPPRESSION — confidentiality-critical, so these come first.
// The unit is DISTINCT RATERS, not item responses: three colleagues answering
// four items each is three responses for this purpose, not twelve. What
// re-identifies someone is being one of a small number of people, not having
// answered a lot of questions.
// ════════════════════════════════════════════════════════════════════════════

test("the suppression threshold is three", () => {
  assert.equal(MINIMUM_RESPONSES_PER_GROUP, 3);
});

test("suppresses a rater category with exactly 2 responses", () => {
  const group = groupFor(raters("colleague", 2), "colleague");

  assert.ok(group);
  assert.equal(group.raterCount, 2);
  assert.equal(group.suppressed, true);
  assert.equal(group.mean, null, "a suppressed cell must report null, never a number");
});

test("reports a rater category with exactly 3 responses", () => {
  const group = groupFor(raters("colleague", 3), "colleague");

  assert.ok(group);
  assert.equal(group.raterCount, 3);
  assert.equal(group.suppressed, false);
  assert.equal(group.mean, 4);
});

test("suppresses at 1 and 0, reports at 4", () => {
  assert.equal(groupFor(raters("colleague", 1), "colleague")?.suppressed, true);
  assert.equal(groupFor(raters("colleague", 4), "colleague")?.suppressed, false);
  assert.equal(groupFor(raters("colleague", 0), "colleague"), undefined);
});

test("exempts self and line_manager, which are single-rater by definition", () => {
  const selfGroup = groupFor(raters("self", 1, 5), "self");
  const managerGroup = groupFor(raters("line_manager", 1, 3), "line_manager");

  assert.equal(selfGroup?.suppressed, false);
  assert.equal(selfGroup?.mean, 5);
  assert.equal(selfGroup?.exempt, true);
  assert.equal(managerGroup?.suppressed, false);
  assert.equal(managerGroup?.mean, 3);
  assert.equal(managerGroup?.exempt, true);
});

test("does not exempt colleague, direct_report or customer", () => {
  for (const group of ["colleague", "direct_report", "customer"]) {
    const cell = groupFor(raters(group, 2), group);
    assert.equal(cell?.exempt, false, `${group} must not be exempt`);
    assert.equal(cell?.suppressed, true, `${group} with 2 raters must be suppressed`);
  }
});

// Unable-to-observe reduces n, which can push a category below the threshold.
test("a category drops below the threshold when raters mark the competency unobserved", () => {
  const responses = [
    ...raters("colleague", 2, 4),
    r({ reviewerId: "colleague-3", rating: null, notObserved: true }),
    r({ reviewerId: "colleague-4", rating: null, notObserved: true }),
  ];

  const group = groupFor(responses, "colleague");
  assert.equal(group?.raterCount, 2, "not-observed raters do not count toward n");
  assert.equal(group?.notObservedCount, 2);
  assert.equal(group?.suppressed, true);
  assert.equal(group?.mean, null);
});

test("merge mode pools thin categories into a combined others bucket", () => {
  const responses = [...raters("colleague", 2, 4), ...raters("customer", 2, 2)];

  const groups = scoreByGroup(responses, { suppressionMode: "merge" });
  const others = groups.find((g) => g.raterGroup === "others");

  assert.ok(others, "thin categories should be pooled");
  assert.equal(others.raterCount, 4);
  assert.equal(others.suppressed, false);
  assert.equal(others.mean, 3);
  // The thin categories themselves are still not reported individually.
  assert.equal(groups.find((g) => g.raterGroup === "colleague")?.suppressed, true);
});

test("merge mode still suppresses when the pooled bucket is itself too thin", () => {
  const groups = scoreByGroup(raters("colleague", 2), { suppressionMode: "merge" });
  const others = groups.find((g) => g.raterGroup === "others");

  assert.equal(others?.raterCount, 2);
  assert.equal(others?.suppressed, true);
  assert.equal(others?.mean, null);
});

test("default mode is suppress, not merge", () => {
  const groups = scoreByGroup([...raters("colleague", 2), ...raters("customer", 2)]);
  assert.equal(groups.some((g) => g.raterGroup === "others"), false);
});

test("item-level detail is suppressed on the same rule", () => {
  const thin = scoreSubject("s1", raters("colleague", 2)).competencies[0].items[0];
  assert.equal(thin.suppressed, true);
  assert.equal(thin.mean, null);

  const ok = scoreSubject("s1", raters("colleague", 3)).competencies[0].items[0];
  assert.equal(ok.suppressed, false);
  assert.equal(ok.mean, 4);
});

// ════════════════════════════════════════════════════════════════════════════
// UNABLE TO OBSERVE
// ════════════════════════════════════════════════════════════════════════════

test("excludes not-observed from the denominator rather than scoring it zero", () => {
  const responses = [
    ...raters("colleague", 3, 4),
    r({ reviewerId: "colleague-4", rating: null, notObserved: true }),
  ];

  const group = groupFor(responses, "colleague");
  // Mean of three 4s. Including the fourth as a zero would give 3.
  assert.equal(group?.mean, 4);
  assert.equal(group?.raterCount, 3);
  assert.equal(group?.notObservedCount, 1);
});

test("a wholly unobserved competency scores null, not zero", () => {
  const responses = Array.from({ length: 4 }, (_, i) =>
    r({ reviewerId: `colleague-${i + 1}`, rating: null, notObserved: true }),
  );

  const competency = scoreSubject("s1", responses).competencies[0];
  assert.equal(competency.mean, null);
  assert.equal(competency.notObservedCount, 4);
});

// ════════════════════════════════════════════════════════════════════════════
// AVERAGING — the bug in assessmentReporting.ts:56-59
// ════════════════════════════════════════════════════════════════════════════

test("averages every rater in a category instead of keeping only the last", () => {
  const responses = [
    r({ reviewerId: "c1", rating: 5 }),
    r({ reviewerId: "c2", rating: 4 }),
    r({ reviewerId: "c3", rating: 3 }),
    r({ reviewerId: "c4", rating: 2 }),
  ];

  // The old reduce would have reported 2 — whichever landed last.
  assert.equal(groupFor(responses, "colleague")?.mean, 3.5);
  assert.equal(groupFor(responses, "colleague")?.raterCount, 4);
});

test("means items within a competency per rater, then means across raters", () => {
  const responses = [
    // One rater answering two items must not outweigh raters answering one.
    r({ reviewerId: "c1", itemId: "i1", rating: 5 }),
    r({ reviewerId: "c1", itemId: "i2", rating: 5 }),
    r({ reviewerId: "c2", itemId: "i1", rating: 2 }),
    r({ reviewerId: "c3", itemId: "i1", rating: 3 }),
  ];

  // (5 + 2 + 3) / 3 = 3.33, not (5 + 5 + 2 + 3) / 4 = 3.75.
  assert.equal(groupFor(responses, "colleague")?.mean, 3.33);
});

test("weights categories and renormalises over those actually reported", () => {
  const responses = [
    ...raters("line_manager", 1, 5),
    ...raters("colleague", 3, 3),
    ...raters("direct_report", 3, 1),
  ];

  const scores = scoreSubject("s1", responses, {
    weights: { self: 0, line_manager: 40, colleague: 30, direct_report: 30, customer: 0 },
  });

  // (5*40 + 3*30 + 1*30) / 100 = 3.2
  assert.equal(scores.competencies[0].mean, 3.2);
});

test("self is scored but carries no weight in the others-weighted mean", () => {
  const withoutSelf = scoreSubject("s1", [...raters("line_manager", 1, 4), ...raters("colleague", 3, 4)]);
  const withSelf = scoreSubject("s1", [
    ...raters("line_manager", 1, 4),
    ...raters("colleague", 3, 4),
    ...raters("self", 1, 1),
  ]);

  assert.equal(withSelf.competencies[0].mean, withoutSelf.competencies[0].mean);
  assert.equal(withSelf.competencies[0].selfMean, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// SELF VERSUS OTHERS
// ════════════════════════════════════════════════════════════════════════════

test("the blind-spot threshold is documented, not a magic number", () => {
  assert.equal(typeof SELF_OTHERS_GAP_THRESHOLD, "number");
  assert.ok(SELF_OTHERS_GAP_THRESHOLD > 0);
});

test("flags a blind spot when others rate materially below self", () => {
  const gaps = computeSelfOthersGaps([...raters("self", 1, 5), ...raters("colleague", 3, 2)]);

  assert.equal(gaps[0].selfMean, 5);
  assert.equal(gaps[0].othersMean, 2);
  assert.equal(gaps[0].gap, 3);
  assert.equal(gaps[0].blindSpot, true);
  assert.equal(gaps[0].hiddenStrength, false);
});

test("flags a hidden strength when others rate materially above self", () => {
  const gaps = computeSelfOthersGaps([...raters("self", 1, 2), ...raters("colleague", 3, 5)]);

  assert.equal(gaps[0].gap, -3);
  assert.equal(gaps[0].hiddenStrength, true);
  assert.equal(gaps[0].blindSpot, false);
});

test("flags neither when the gap sits inside the threshold", () => {
  const gaps = computeSelfOthersGaps([...raters("self", 1, 4), ...raters("colleague", 3, 4)]);

  assert.equal(gaps[0].gap, 0);
  assert.equal(gaps[0].blindSpot, false);
  assert.equal(gaps[0].hiddenStrength, false);
});

test("reports no gap when either side is missing or suppressed", () => {
  const noSelf = computeSelfOthersGaps(raters("colleague", 3));
  assert.equal(noSelf[0].selfMean, null);
  assert.equal(noSelf[0].gap, null);

  // Others present but too thin to report — the gap must not leak the mean.
  const thinOthers = computeSelfOthersGaps([...raters("self", 1, 5), ...raters("colleague", 2, 2)]);
  assert.equal(thinOthers[0].othersMean, null);
  assert.equal(thinOthers[0].gap, null);
  assert.equal(thinOthers[0].blindSpot, false);
});

// ════════════════════════════════════════════════════════════════════════════
// RELEASE — manager plus at least two other categories clearing the threshold
// ════════════════════════════════════════════════════════════════════════════

test("releases on manager plus two qualifying categories", () => {
  const decision = decideRelease([
    ...raters("line_manager", 1),
    ...raters("colleague", 3),
    ...raters("direct_report", 3),
  ]);

  assert.equal(decision.ready, true);
  assert.equal(decision.hasLineManager, true);
  assert.deepEqual(decision.qualifyingCategories.sort(), ["colleague", "direct_report"]);
});

test("does not release on manager plus only one qualifying category", () => {
  const decision = decideRelease([
    ...raters("line_manager", 1),
    ...raters("colleague", 3),
    ...raters("direct_report", 2),
  ]);

  assert.equal(decision.ready, false);
  assert.ok(decision.reasons.some((reason) => /two/i.test(reason)));
});

test("does not release without a line manager, however many others responded", () => {
  const decision = decideRelease([
    ...raters("colleague", 5),
    ...raters("direct_report", 5),
    ...raters("customer", 5),
  ]);

  assert.equal(decision.ready, false);
  assert.equal(decision.hasLineManager, false);
  assert.ok(decision.reasons.some((reason) => /line manager/i.test(reason)));
});

// One non-responder must not permanently block a subject, which is what the old
// all-groups-and-everyone-submitted rule did across 568 assignments.
test("a single non-responding category no longer blocks release", () => {
  const decision = decideRelease([
    ...raters("line_manager", 1),
    ...raters("colleague", 4),
    ...raters("direct_report", 3),
    // customer never responded at all
  ]);

  assert.equal(decision.ready, true);
});

test("hasSufficientData tracks the release rule", () => {
  assert.equal(hasSufficientData([...raters("line_manager", 1), ...raters("colleague", 3), ...raters("direct_report", 3)]), true);
  assert.equal(hasSufficientData(raters("colleague", 3)), false);
  assert.equal(hasSufficientData([]), false);
});

// ════════════════════════════════════════════════════════════════════════════
// ITEM DETAIL AND VERBATIMS
// ════════════════════════════════════════════════════════════════════════════

test("retains item-level detail beneath each competency", () => {
  const responses = [
    ...raters("colleague", 3, 5).map((x, i) => ({ ...x, itemId: "i1", reviewerId: `c${i}` })),
    ...raters("colleague", 3, 1).map((x, i) => ({ ...x, itemId: "i2", reviewerId: `c${i}` })),
  ];

  const competency = scoreSubject("s1", responses).competencies[0];
  assert.equal(competency.items.length, 2);
  assert.equal(competency.items.find((i) => i.itemId === "i1")?.mean, 5);
  assert.equal(competency.items.find((i) => i.itemId === "i2")?.mean, 1);
  // The competency mean sits between its items.
  assert.equal(competency.mean, 3);
});

test("collects verbatims from text items and from comments on scale items", () => {
  const scores = scoreSubject("s1", [
    ...raters("colleague", 3),
    r({ reviewerId: "c9", itemId: "t1", competencyId: null, itemType: "text", rating: null, comment: "Delegate more." }),
    r({ reviewerId: "c1", comment: "Clear communicator." }),
  ]);

  const bodies = scores.verbatims.map((v) => v.comment);
  assert.ok(bodies.includes("Delegate more."));
  assert.ok(bodies.includes("Clear communicator."));
});

test("text items never contribute to a numeric score", () => {
  const scores = scoreSubject("s1", [
    ...raters("colleague", 3, 4),
    r({ reviewerId: "c9", itemId: "t1", competencyId: null, itemType: "text", rating: null, comment: "Nothing to add." }),
  ]);

  assert.equal(scores.competencies.length, 1);
  assert.equal(scores.competencies[0].mean, 4);
});

// ════════════════════════════════════════════════════════════════════════════
// COHORT AGGREGATION
// ════════════════════════════════════════════════════════════════════════════

test("aggregates a cohort by level, function, region and portfolio", () => {
  const scored = (id: string, rating: number) =>
    scoreSubject(id, [...raters("line_manager", 1, rating), ...raters("colleague", 3, rating), ...raters("direct_report", 3, rating)]);

  const segments = aggregateCohort([
    { subjectId: "a", level: "director", functionName: "Network", region: "Lagos", portfolio: "Core", scores: scored("a", 4) },
    { subjectId: "b", level: "director", functionName: "Network", region: "Lagos", portfolio: "Core", scores: scored("b", 2) },
    { subjectId: "c", level: "director", functionName: "Network", region: "Lagos", portfolio: "Core", scores: scored("c", 3) },
  ]);

  const level = segments.find((s) => s.dimension === "level" && s.value === "director");
  assert.equal(level?.subjectCount, 3);
  assert.equal(level?.mean, 3);
  assert.ok(segments.some((s) => s.dimension === "region" && s.value === "Lagos"));
  assert.ok(segments.some((s) => s.dimension === "portfolio" && s.value === "Core"));
  assert.ok(segments.some((s) => s.dimension === "functionName" && s.value === "Network"));
});

// A segment of one or two people identifies them as surely as a rater category does.
test("suppresses a cohort segment containing fewer than three subjects", () => {
  const scored = (id: string) =>
    scoreSubject(id, [...raters("line_manager", 1, 4), ...raters("colleague", 3, 4), ...raters("direct_report", 3, 4)]);

  const segments = aggregateCohort([
    { subjectId: "a", level: "director", functionName: "Network", region: "Lagos", portfolio: "Core", scores: scored("a") },
    { subjectId: "b", level: "director", functionName: "Network", region: "Abuja", portfolio: "Core", scores: scored("b") },
  ]);

  const abuja = segments.find((s) => s.dimension === "region" && s.value === "Abuja");
  assert.equal(abuja?.subjectCount, 1);
  assert.equal(abuja?.suppressed, true);
  assert.equal(abuja?.mean, null);
});

test("handles an empty response set without dividing by zero", () => {
  const scores = scoreSubject("s1", []);

  assert.equal(scores.overall, null);
  assert.deepEqual(scores.competencies, []);
  assert.equal(scores.insufficientData, true);
  assert.equal(scores.release.ready, false);
  assert.deepEqual(aggregateCohort([]), []);
});
