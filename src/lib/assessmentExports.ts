import * as XLSX from "xlsx";

export type CompletionExportRow = {
  subjectId: string;
  subjectName: string | null;
  level: string | null;
  functionName: string | null;
  region: string | null;
  assigned: number;
  submitted: number;
  inProgress: number;
  notStarted: number;
  completionPercent: number;
  reportStatus: string;
  releasedAt: string | null;
};

export type CompetencyExportRow = {
  subjectId: string;
  subjectName?: string | null;
  competencyId: string;
  competencyName: string;
  mean: number | null;
  selfMean: number | null;
  gap: number | null;
  blindSpot: boolean;
  hiddenStrength: boolean;
};

export type ItemScoreExportRow = {
  subjectId: string;
  subjectName?: string | null;
  competencyId: string | null;
  itemId: string;
  itemText: string | null;
  mean: number | null;
  raterCount: number;
  suppressed: boolean;
  selfRating: number | null;
};

export type AggregateExportRow = {
  dimension: string;
  value: string;
  subjectCount: number;
  mean: number | null;
  suppressed: boolean;
};

export type AssessmentExportDataset = {
  completion: CompletionExportRow[];
  competencies: CompetencyExportRow[];
  items: ItemScoreExportRow[];
  aggregate: AggregateExportRow[];
};

const forbiddenExportKeys = [
  "reviewer_id",
  "reviewer_name",
  "reviewer_email",
  "rater_name",
  "rater_email",
  "comment",
  "verbatim",
  "verbatims",
];

export function assertExportContainsNoRawVerbatims(dataset: AssessmentExportDataset): void {
  const serialized = JSON.stringify(dataset).toLowerCase();
  const leakedKey = forbiddenExportKeys.find((key) => serialized.includes(`"${key}"`));
  if (leakedKey) {
    throw new Error(`Export dataset includes forbidden field: ${leakedKey}`);
  }
}

export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], headers: Array<keyof T>): string {
  return [
    headers.map(String).join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")),
  ].join("\n");
}

export function buildAssessmentExportCsv(dataset: AssessmentExportDataset): string {
  assertExportContainsNoRawVerbatims(dataset);
  return [
    "# completion",
    rowsToCsv(dataset.completion, [
      "subjectId",
      "subjectName",
      "level",
      "functionName",
      "region",
      "assigned",
      "submitted",
      "inProgress",
      "notStarted",
      "completionPercent",
      "reportStatus",
      "releasedAt",
    ]),
    "",
    "# competencies",
    rowsToCsv(dataset.competencies, [
      "subjectId",
      "subjectName",
      "competencyId",
      "competencyName",
      "mean",
      "selfMean",
      "gap",
      "blindSpot",
      "hiddenStrength",
    ]),
    "",
    "# item_scores",
    rowsToCsv(dataset.items, [
      "subjectId",
      "subjectName",
      "competencyId",
      "itemId",
      "itemText",
      "mean",
      "raterCount",
      "suppressed",
      "selfRating",
    ]),
    "",
    "# aggregate",
    rowsToCsv(dataset.aggregate, ["dimension", "value", "subjectCount", "mean", "suppressed"]),
  ].join("\n");
}

export function buildAssessmentExportXlsx(dataset: AssessmentExportDataset): Buffer {
  assertExportContainsNoRawVerbatims(dataset);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.completion), "Completion");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.competencies), "Competency Scores");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.items), "Item Scores");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.aggregate), "Aggregate");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildAggregateRows(
  completion: CompletionExportRow[],
  competencies: CompetencyExportRow[],
  minimumSubjects = 3,
): AggregateExportRow[] {
  const rows: AggregateExportRow[] = [];
  const subjects = new Map(completion.map((row) => [row.subjectId, row]));

  for (const dimension of ["level", "functionName", "region"] as const) {
    const buckets = new Map<string, string[]>();
    for (const row of completion) {
      const value = String(row[dimension] ?? "").trim();
      if (!value) continue;
      const bucket = buckets.get(value);
      if (bucket) bucket.push(row.subjectId);
      else buckets.set(value, [row.subjectId]);
    }

    for (const [value, subjectIds] of buckets) {
      const scores = competencies
        .filter((row) => subjectIds.includes(row.subjectId) && row.mean !== null)
        .map((row) => Number(row.mean));
      rows.push({
        dimension,
        value,
        subjectCount: subjectIds.length,
        mean: subjectIds.length < minimumSubjects ? null : average(scores),
        suppressed: subjectIds.length < minimumSubjects,
      });
    }
  }

  const competencyNames = new Map(competencies.map((row) => [row.competencyId, row.competencyName]));
  for (const [competencyId, competencyName] of competencyNames) {
    const scoredSubjects = new Set(
      competencies.filter((row) => row.competencyId === competencyId && row.mean !== null).map((row) => row.subjectId),
    );
    rows.push({
      dimension: "competency",
      value: competencyName,
      subjectCount: scoredSubjects.size,
      mean: scoredSubjects.size < minimumSubjects
        ? null
        : average(competencies.filter((row) => row.competencyId === competencyId && row.mean !== null).map((row) => Number(row.mean))),
      suppressed: scoredSubjects.size < minimumSubjects,
    });
  }

  return rows.filter((row) => subjects.size || row.dimension === "competency");
}

function average(values: number[]): number | null {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}
