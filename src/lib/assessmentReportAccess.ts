export type AssessmentReportRole =
  | "participant"
  | "line_manager"
  | "hr_admin"
  | "executive_view"
  | "super_admin"
  | "none";

export type ReportState = "draft" | "in_review" | "released";

export function reportStateOf(input: { reportStatus?: string | null; releasedAt?: string | null }): ReportState {
  if (input.releasedAt || input.reportStatus === "released") return "released";
  if (input.reportStatus === "in_review") return "in_review";
  return "draft";
}

export function isValidReportState(value: unknown): value is ReportState {
  return value === "draft" || value === "in_review" || value === "released";
}

export function canReadIndividualReport(input: {
  role?: string | null;
  reportState: ReportState;
  ownsSubject?: boolean;
  managesSubject?: boolean;
  lineManagerAccessEnabled?: boolean;
}): boolean {
  if (input.role === "super_admin") return true;
  if (input.reportState !== "released") return false;
  if (input.ownsSubject) return true;
  if (input.managesSubject && input.lineManagerAccessEnabled) return true;
  return false;
}

export function canReadAggregateReport(role?: string | null): boolean {
  return role === "hr_admin" || role === "executive_view" || role === "super_admin";
}

export function canReadCompletionTracking(role?: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

export function canManageReportState(role?: string | null): boolean {
  return role === "super_admin";
}

export function canReadNamedVerbatims(role?: string | null): boolean {
  return role === "super_admin";
}

export function nextReportState(current: ReportState, requested: ReportState): ReportState | null {
  if (requested === current) return current;
  if (current === "draft" && requested === "in_review") return "in_review";
  if (current === "in_review" && requested === "released") return "released";
  return null;
}
