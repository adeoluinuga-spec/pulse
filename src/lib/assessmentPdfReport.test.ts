import assert from "node:assert/strict";
import test from "node:test";

import { scoreSubject, type ScoredResponse } from "./assessmentScoring.ts";
import {
  buildAggregatePdfReport,
  buildIndividualPdfReport,
  groupScoreLabel,
  type CompetencyLabel,
  type ItemLabel,
} from "./assessmentPdfReport.ts";

/**
 * These tests previously ran on createMockSubjectScores, which hard-coded
 * `suppressed: true` on the customer category — so the suppression assertion
 * passed without any suppression being computed. Scores here are produced by
 * the real scoring service from response rows shaped exactly as
 * assessment_responses stores them, so the assertions test behaviour.
 */

const COMPETENCY = "comp-direction";
const ITEMS = ["item-1", "item-2"];

const response = (over: Partial<ScoredResponse> & { reviewerId: string }): ScoredResponse => ({
  raterGroup: "colleague",
  itemId: ITEMS[0],
  competencyId: COMPETENCY,
  itemType: "scale",
  rating: 4,
  notObserved: false,
  comment: null,
  itemBody: "Communicates what matters most.",
  ...over,
});

/** `count` distinct raters in `group`, each rating both items. */
const raters = (group: ScoredResponse["raterGroup"], count: number, rating: number): ScoredResponse[] =>
  Array.from({ length: count }, (_, i) =>
    ITEMS.map((itemId) => response({ reviewerId: `${group}-${i + 1}`, raterGroup: group, itemId, rating })),
  ).flat();

const labels: { competencies: CompetencyLabel[]; items: ItemLabel[] } = {
  competencies: [{ id: COMPETENCY, name: "Sets Direction", description: "Sets direction and translates it into action." }],
  items: ITEMS.map((id, i) => ({ id, competencyId: COMPETENCY, text: `Behaviour ${i + 1}` })),
};

/** Three colleagues clear the threshold; two customers do not. */
function scoresWithOneThinCategory() {
  return scoreSubject("subject-1", [
    ...raters("line_manager", 1, 4),
    ...raters("colleague", 3, 4),
    ...raters("customer", 2, 2),
  ]);
}

test("individual PDF suppresses a rater category that really is below three raters", () => {
  const scores = scoresWithOneThinCategory();

  // The scoring service, not the fixture, decided this.
  const computed = scores.competencies[0].byGroup.find((cell) => cell.raterGroup === "customer");
  assert.equal(computed?.raterCount, 2, "fixture must actually contain two customer raters");
  assert.equal(computed?.suppressed, true);

  const report = buildIndividualPdfReport({
    cycle: { id: "cycle-1", name: "Directors 360" },
    subject: { id: "subject-1", name: "Ada Okafor", role: "Director" },
    scores,
    competencyLabels: labels.competencies,
    itemLabels: labels.items,
  });

  const customerCell = report.competencies[0].byGroup.find((cell) => cell.raterGroup === "customer");
  assert.equal(customerCell?.mean, null, "a suppressed category must never carry a number");
  assert.equal(customerCell?.suppressed, true);
  assert.equal(groupScoreLabel(customerCell!), "Suppressed (n<3)");
});

test("individual PDF reports a category that clears the threshold", () => {
  const scores = scoresWithOneThinCategory();
  const report = buildIndividualPdfReport({
    cycle: { id: "cycle-1", name: "Directors 360" },
    subject: { id: "subject-1", name: "Ada Okafor", role: "Director" },
    scores,
    competencyLabels: labels.competencies,
    itemLabels: labels.items,
  });

  const colleague = report.competencies[0].byGroup.find((cell) => cell.raterGroup === "colleague");
  assert.equal(colleague?.suppressed, false);
  assert.equal(colleague?.mean, 4);
});

test("individual PDF carries the cycle's own competency name, not a placeholder", () => {
  const report = buildIndividualPdfReport({
    cycle: { id: "cycle-1", name: "Directors 360" },
    subject: { id: "subject-1", name: "Ada Okafor", role: "Director" },
    scores: scoresWithOneThinCategory(),
    competencyLabels: labels.competencies,
    itemLabels: labels.items,
  });

  const serialized = JSON.stringify(report);
  assert.ok(serialized.includes("Sets Direction"));
  for (const placeholder of ["strategic_leadership", "people_leadership", "customer_focus"]) {
    assert.ok(!serialized.includes(placeholder), `placeholder ${placeholder} must not appear`);
  }
});

test("aggregate PDF excludes named individuals and ranks no participants", () => {
  const subjects = ["Ada Okafor", "Tunde Bello", "Nneka Musa"].map((name, index) => ({
    subjectId: `subject-${index + 1}`,
    level: index === 0 ? "Director" : "Assistant Director",
    functionName: "Commercial",
    region: "Lagos",
    scores: scoreSubject(`subject-${index + 1}`, [
      ...raters("line_manager", 1, 3 + index * 0.5),
      ...raters("colleague", 3, 3 + index * 0.5),
      ...raters("direct_report", 3, 3 + index * 0.5),
    ]),
    name,
  }));

  const report = buildAggregatePdfReport({
    cycle: { id: "cycle-1", name: "Directors 360" },
    subjects,
    competencyLabels: labels.competencies,
  });

  const serialized = JSON.stringify(report);

  assert.equal(report.cohortSize, 3);
  assert.ok(!serialized.includes("Ada Okafor"));
  assert.ok(!serialized.includes("Tunde Bello"));
  assert.ok(!serialized.includes("Nneka Musa"));
  assert.ok(!serialized.toLowerCase().includes("ranking"));
});
