import {
  checkRaterRelationships,
  isRaterGroup,
  type OrgChartEntry,
  type RaterGroup,
  type RelationshipWarning,
} from "./raterRelationship.ts";

export type BulkReviewerCsvRow = {
  subject_email?: string;
  rater_name?: string;
  rater_email?: string;
  relationship_type?: string;
  organisation?: string;
};

export type AssessmentSubjectLookup = {
  id: string;
  email: string;
  name: string;
  employeeId?: string | null;
};

export type AssessmentEmployeeLookup = {
  id: string;
  email: string;
  name: string;
  lineManagerId?: string | null;
};

export type ExistingReviewerAssignment = {
  subjectId: string;
  reviewerEmail: string;
  reviewerGroup: string;
};

export type BulkReviewerAssignment = {
  subjectId: string;
  subjectEmail: string;
  subjectName: string;
  subjectEmployeeId?: string | null;
  reviewerEmployeeId?: string | null;
  reviewerName: string;
  reviewerEmail: string;
  reviewerGroup: RaterGroup;
  organisation?: string | null;
};

export type BulkReviewerReportRow = {
  rowNumber: number;
  subjectEmail: string;
  raterName: string;
  raterEmail: string;
  relationshipType: string;
  organisation: string;
  status: "valid" | "error";
  errors: string[];
  warnings: string[];
  assignment?: BulkReviewerAssignment;
};

export type RaterLoadWarning = {
  reviewerEmail: string;
  assignmentCount: number;
  cap: number;
  message: string;
};

export const bulkReviewerHeaders = [
  "subject_email",
  "rater_name",
  "rater_email",
  "relationship_type",
  "organisation",
] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseBulkReviewerCsv(csvText: string): BulkReviewerCsvRow[] {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0 || !lines[0].trim()) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])) as BulkReviewerCsvRow;
  });
}

function cleanEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function assignmentKey(subjectId: string, reviewerEmail: string, reviewerGroup: string): string {
  return `${subjectId}::${reviewerEmail.toLowerCase()}::${reviewerGroup}`;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateBulkReviewerRows(input: {
  rows: BulkReviewerCsvRow[];
  subjects: AssessmentSubjectLookup[];
  employees: AssessmentEmployeeLookup[];
  existingAssignments?: ExistingReviewerAssignment[];
  cap?: number;
}): { rows: BulkReviewerReportRow[]; validAssignments: BulkReviewerAssignment[]; loadWarnings: RaterLoadWarning[]; canImport: boolean } {
  const cap = input.cap ?? 6;
  const subjectsByEmail = new Map(input.subjects.map((subject) => [cleanEmail(subject.email), subject]));
  const employeesByEmail = new Map(input.employees.map((employee) => [cleanEmail(employee.email), employee]));
  const orgChart: OrgChartEntry[] = input.employees.map((employee) => ({
    employeeId: employee.id,
    lineManagerId: employee.lineManagerId ?? null,
  }));
  const existingKeys = new Set(
    (input.existingAssignments ?? []).map((assignment) =>
      assignmentKey(assignment.subjectId, assignment.reviewerEmail, assignment.reviewerGroup),
    ),
  );
  const uploadedKeys = new Set<string>();
  const validAssignments: BulkReviewerAssignment[] = [];

  const reportRows = input.rows.map((row, index) => {
    const subjectEmail = cleanEmail(row.subject_email);
    const raterName = cleanText(row.rater_name);
    const raterEmail = cleanEmail(row.rater_email);
    const relationshipType = cleanText(row.relationship_type).toLowerCase();
    const organisation = cleanText(row.organisation);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!subjectEmail) errors.push("subject_email is required.");
    if (subjectEmail && !looksLikeEmail(subjectEmail)) errors.push("subject_email must be a valid email.");
    if (!raterName) errors.push("rater_name is required.");
    if (!raterEmail) errors.push("rater_email is required.");
    if (raterEmail && !looksLikeEmail(raterEmail)) errors.push("rater_email must be a valid email.");
    if (!relationshipType) errors.push("relationship_type is required.");
    if (relationshipType && !isRaterGroup(relationshipType)) errors.push("relationship_type must be one of self, line_manager, colleague, direct_report, customer.");

    const subject = subjectsByEmail.get(subjectEmail);
    if (subjectEmail && !subject) errors.push("subject_email does not belong to this cycle.");

    const raterEmployee = employeesByEmail.get(raterEmail);
    const reviewerGroup = isRaterGroup(relationshipType) ? relationshipType : null;

    if (subject && reviewerGroup) {
      const key = assignmentKey(subject.id, raterEmail, reviewerGroup);
      if (existingKeys.has(key)) errors.push("This assignment already exists in the cycle.");
      if (uploadedKeys.has(key)) errors.push("This assignment is duplicated in the upload.");
      uploadedKeys.add(key);

      const [relationshipWarning] = checkRaterRelationships(
        [{
          subjectEmployeeId: subject.employeeId,
          raterEmployeeId: raterEmployee?.id,
          reviewerGroup,
          subjectName: subject.name,
          raterName,
        }],
        orgChart,
      );

      if (relationshipWarning) warnings.push(relationshipWarning.message);
    }

    const assignment = subject && reviewerGroup && !errors.length
      ? {
          subjectId: subject.id,
          subjectEmail,
          subjectName: subject.name,
          subjectEmployeeId: subject.employeeId,
          reviewerEmployeeId: raterEmployee?.id ?? null,
          reviewerName: raterName,
          reviewerEmail: raterEmail,
          reviewerGroup,
          organisation: organisation || null,
        }
      : undefined;

    if (assignment) validAssignments.push(assignment);

    const status: BulkReviewerReportRow["status"] = errors.length ? "error" : "valid";

    return {
      rowNumber: index + 2,
      subjectEmail,
      raterName,
      raterEmail,
      relationshipType,
      organisation,
      status,
      errors,
      warnings,
      assignment,
    };
  });

  const loadCounts = new Map<string, number>();
  for (const assignment of input.existingAssignments ?? []) {
    loadCounts.set(cleanEmail(assignment.reviewerEmail), (loadCounts.get(cleanEmail(assignment.reviewerEmail)) ?? 0) + 1);
  }
  for (const assignment of validAssignments) {
    loadCounts.set(assignment.reviewerEmail, (loadCounts.get(assignment.reviewerEmail) ?? 0) + 1);
  }

  const loadWarnings = [...loadCounts.entries()]
    .filter(([, assignmentCount]) => assignmentCount > cap)
    .map(([reviewerEmail, assignmentCount]) => ({
      reviewerEmail,
      assignmentCount,
      cap,
      message: `${reviewerEmail} has ${assignmentCount} assignments, above the recommended cap of ${cap}.`,
    }));

  return {
    rows: reportRows,
    validAssignments,
    loadWarnings,
    canImport: reportRows.every((row) => row.status === "valid"),
  };
}

function escapeCsvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function buildBulkReviewerErrorReportCsv(rows: BulkReviewerReportRow[]): string {
  const headers = [
    "row_number",
    "status",
    "subject_email",
    "rater_name",
    "rater_email",
    "relationship_type",
    "organisation",
    "errors",
    "warnings",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.rowNumber,
        row.status,
        row.subjectEmail,
        row.raterName,
        row.raterEmail,
        row.relationshipType,
        row.organisation,
        row.errors,
        row.warnings,
      ].map(escapeCsvCell).join(","),
    ),
  ].join("\n");
}

export function summarizeRaterLoad(
  assignments: Array<{ reviewerEmail: string }>,
  cap = 6,
): { reviewerEmail: string; assignmentCount: number; overCap: boolean }[] {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    const email = cleanEmail(assignment.reviewerEmail);
    if (!email) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reviewerEmail, assignmentCount]) => ({
      reviewerEmail,
      assignmentCount,
      overCap: assignmentCount > cap,
    }))
    .sort((a, b) => b.assignmentCount - a.assignmentCount || a.reviewerEmail.localeCompare(b.reviewerEmail));
}
