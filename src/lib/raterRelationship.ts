/**
 * Cross-checks a declared rater group against the org chart in
 * employees.line_manager_id.
 *
 * Warns; never blocks. Org data is routinely stale — a reorg lands in the HR
 * system weeks after it happens — so a contradiction here is a prompt for a
 * human to look, not grounds to refuse the assignment.
 *
 * This matters most right after 20260904_000001, which swapped the meanings of
 * `direct_report` and introduced `line_manager`: anyone carrying the old mental
 * model will set these two the wrong way round, and the resulting scores land
 * silently in the wrong rater category.
 */

export type RaterGroup = "self" | "line_manager" | "colleague" | "direct_report" | "customer";

export const raterGroups: RaterGroup[] = [
  "self",
  "line_manager",
  "colleague",
  "direct_report",
  "customer",
];

export function isRaterGroup(value: unknown): value is RaterGroup {
  return raterGroups.includes(String(value ?? "").trim().toLowerCase() as RaterGroup);
}

/** One row of the org chart. `lineManagerId` is null for the top of the tree. */
export type OrgChartEntry = {
  employeeId: string;
  lineManagerId?: string | null;
};

export type RaterAssignment = {
  subjectEmployeeId?: string | null;
  raterEmployeeId?: string | null;
  reviewerGroup?: string | null;
  /** Optional, for readable warning text. */
  subjectName?: string | null;
  raterName?: string | null;
};

export type RelationshipWarningCode =
  | "not_line_manager"
  | "not_direct_report"
  | "groups_inverted"
  | "self_mismatch";

export type RelationshipWarning = {
  code: RelationshipWarningCode;
  subjectEmployeeId: string;
  raterEmployeeId: string;
  declaredGroup: RaterGroup;
  /** What the org chart implies, where it implies something specific. */
  impliedGroup?: RaterGroup;
  message: string;
};

function nameOf(id: string, name?: string | null): string {
  return name?.trim() ? name.trim() : id;
}

function managerOf(orgChart: Map<string, string | null>, employeeId: string): string | null {
  return orgChart.get(employeeId) ?? null;
}

export function buildOrgChartIndex(entries: OrgChartEntry[]): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const entry of entries) {
    if (!entry?.employeeId) continue;
    index.set(entry.employeeId, entry.lineManagerId ?? null);
  }
  return index;
}

/**
 * Returns a warning when the declared group contradicts the org chart, or null
 * when it is consistent, unverifiable, or out of scope.
 *
 * Unverifiable cases return null deliberately: external raters have no employee
 * id, and an employee absent from the org chart tells us nothing.
 */
export function checkRaterRelationship(
  assignment: RaterAssignment,
  orgChart: Map<string, string | null>,
): RelationshipWarning | null {
  const subjectId = assignment.subjectEmployeeId?.trim();
  const raterId = assignment.raterEmployeeId?.trim();
  const group = String(assignment.reviewerGroup ?? "").trim().toLowerCase();

  if (!subjectId || !raterId || !isRaterGroup(group)) return null;

  const declaredGroup = group as RaterGroup;
  const subjectLabel = nameOf(subjectId, assignment.subjectName);
  const raterLabel = nameOf(raterId, assignment.raterName);

  if (declaredGroup === "self") {
    if (subjectId !== raterId) {
      return {
        code: "self_mismatch",
        subjectEmployeeId: subjectId,
        raterEmployeeId: raterId,
        declaredGroup,
        message: `${raterLabel} is set as the self-assessment for ${subjectLabel}, but they are different people.`,
      };
    }
    return null;
  }

  // colleague and customer make no claim the org chart can contradict.
  if (declaredGroup !== "line_manager" && declaredGroup !== "direct_report") return null;

  // Unknown to the org chart — nothing to check against.
  if (!orgChart.has(subjectId) || !orgChart.has(raterId)) return null;

  const subjectsManager = managerOf(orgChart, subjectId);
  const ratersManager = managerOf(orgChart, raterId);

  const raterManagesSubject = subjectsManager === raterId;
  const subjectManagesRater = ratersManager === subjectId;

  if (declaredGroup === "line_manager" && !raterManagesSubject) {
    if (subjectManagesRater) {
      return {
        code: "groups_inverted",
        subjectEmployeeId: subjectId,
        raterEmployeeId: raterId,
        declaredGroup,
        impliedGroup: "direct_report",
        message: `${raterLabel} is set as line_manager for ${subjectLabel}, but the org chart has it the other way round — ${raterLabel} reports to ${subjectLabel}. Did you mean direct_report?`,
      };
    }
    return {
      code: "not_line_manager",
      subjectEmployeeId: subjectId,
      raterEmployeeId: raterId,
      declaredGroup,
      message: `${raterLabel} is set as line_manager for ${subjectLabel}, but is not their manager in the org chart.`,
    };
  }

  if (declaredGroup === "direct_report" && !subjectManagesRater) {
    if (raterManagesSubject) {
      return {
        code: "groups_inverted",
        subjectEmployeeId: subjectId,
        raterEmployeeId: raterId,
        declaredGroup,
        impliedGroup: "line_manager",
        message: `${raterLabel} is set as direct_report for ${subjectLabel}, but the org chart has it the other way round — ${raterLabel} manages ${subjectLabel}. Did you mean line_manager?`,
      };
    }
    return {
      code: "not_direct_report",
      subjectEmployeeId: subjectId,
      raterEmployeeId: raterId,
      declaredGroup,
      message: `${raterLabel} is set as direct_report for ${subjectLabel}, but does not report to them in the org chart.`,
    };
  }

  return null;
}

export function checkRaterRelationships(
  assignments: RaterAssignment[],
  orgChart: OrgChartEntry[] | Map<string, string | null>,
): RelationshipWarning[] {
  const index = orgChart instanceof Map ? orgChart : buildOrgChartIndex(orgChart);

  return (assignments ?? []).reduce<RelationshipWarning[]>((warnings, assignment) => {
    const warning = checkRaterRelationship(assignment, index);
    if (warning) warnings.push(warning);
    return warnings;
  }, []);
}
