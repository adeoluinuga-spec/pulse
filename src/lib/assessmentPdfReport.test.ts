import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAggregatePdfReport,
  buildIndividualPdfReport,
  createMockLabels,
  createMockSubjectScores,
  groupScoreLabel,
} from "./assessmentPdfReport.ts";

test("individual PDF report labels suppressed rater categories rather than rendering zero", () => {
  const labels = createMockLabels();
  const scores = createMockSubjectScores("subject-1");
  const report = buildIndividualPdfReport({
    cycle: { id: "cycle-1", name: "Directors 360" },
    subject: { id: "subject-1", name: "Ada Okafor", role: "Director" },
    scores,
    competencyLabels: labels.competencies,
    itemLabels: labels.items,
  });

  const customerCell = report.competencies[0].byGroup.find((cell) => cell.raterGroup === "customer");

  assert.equal(customerCell?.mean, null);
  assert.equal(customerCell?.suppressed, true);
  assert.equal(groupScoreLabel(customerCell!), "Suppressed (n<3)");
});

test("aggregate PDF report excludes named individuals and ranks no participants", () => {
  const labels = createMockLabels();
  const subjects = ["Ada Okafor", "Tunde Bello", "Nneka Musa"].map((name, index) => ({
    subjectId: `subject-${index + 1}`,
    level: index === 0 ? "Director" : "Assistant Director",
    functionName: "Commercial",
    region: "Lagos",
    scores: createMockSubjectScores(`subject-${index + 1}`, index + 1),
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
