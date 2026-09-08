import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  assertExportContainsNoRawVerbatims,
  buildAggregateRows,
  buildAssessmentExportCsv,
  buildAssessmentExportXlsx,
  type AssessmentExportDataset,
} from "./assessmentExports.ts";

const dataset: AssessmentExportDataset = {
  completion: [
    { subjectId: "s1", subjectName: "A", level: "director", functionName: "Sales", region: "Lagos", assigned: 4, submitted: 4, inProgress: 0, notStarted: 0, completionPercent: 100, reportStatus: "released", releasedAt: "2026-09-04" },
    { subjectId: "s2", subjectName: "B", level: "director", functionName: "Sales", region: "Lagos", assigned: 4, submitted: 3, inProgress: 1, notStarted: 0, completionPercent: 75, reportStatus: "released", releasedAt: "2026-09-04" },
    { subjectId: "s3", subjectName: "C", level: "director", functionName: "Sales", region: "Lagos", assigned: 4, submitted: 4, inProgress: 0, notStarted: 0, completionPercent: 100, reportStatus: "released", releasedAt: "2026-09-04" },
  ],
  competencies: [
    { subjectId: "s1", subjectName: "A", competencyId: "c1", competencyName: "Strategy", mean: 4, selfMean: 4, gap: 0, blindSpot: false, hiddenStrength: false },
    { subjectId: "s2", subjectName: "B", competencyId: "c1", competencyName: "Strategy", mean: 3, selfMean: 4, gap: 1, blindSpot: true, hiddenStrength: false },
    { subjectId: "s3", subjectName: "C", competencyId: "c1", competencyName: "Strategy", mean: 5, selfMean: 4, gap: -1, blindSpot: false, hiddenStrength: true },
  ],
  items: [
    { subjectId: "s1", subjectName: "A", competencyId: "c1", itemId: "i1", itemText: "Sets direction", mean: 4, raterCount: 3, suppressed: false, selfRating: 4 },
  ],
  aggregate: [],
};

test("exports include completion, competency, item and aggregate sections without raw verbatims", () => {
  const aggregate = buildAggregateRows(dataset.completion, dataset.competencies);
  const csv = buildAssessmentExportCsv({ ...dataset, aggregate });

  assert.match(csv, /# completion/);
  assert.match(csv, /# competencies/);
  assert.match(csv, /# item_scores/);
  assert.match(csv, /# aggregate/);
  assert.doesNotMatch(csv.toLowerCase(), /reviewer_email|reviewer_name|verbatim|comment/);
});

test("xlsx export creates the expected sheets", () => {
  const buffer = buildAssessmentExportXlsx({ ...dataset, aggregate: buildAggregateRows(dataset.completion, dataset.competencies) });
  const workbook = XLSX.read(buffer);

  assert.deepEqual(workbook.SheetNames, ["Completion", "Competency Scores", "Item Scores", "Aggregate"]);
});

test("export guard rejects datasets carrying raw verbatim or rater identity keys", () => {
  assert.throws(
    () => assertExportContainsNoRawVerbatims({ ...dataset, completion: [{ ...dataset.completion[0], reviewer_email: "rater@example.com" } as never] }),
    /forbidden field/,
  );
});
