export type AssessmentLevel = "director" | "assistant_director";
export type AssessmentGroup = "direct_report" | "subordinate" | "colleague" | "customer";
export type AssessmentFunction = "network" | "customer_experience" | "commercial" | "technology" | "operations" | "hr" | "finance" | "all";

export type CompetencyDefinition = {
  id: string;
  name: string;
  group: "leadership" | "enterprise" | "functional";
  level?: AssessmentLevel | "all";
  function?: AssessmentFunction;
  description?: string;
  active?: boolean;
};

export type SelfAssessmentConfig = {
  enabled: boolean;
  required?: boolean;
  allowAnonymous?: boolean;
  minimumResponses?: number;
};

export type RaterNomination = {
  reviewerId: string;
  reviewerGroup: AssessmentGroup | string;
};

export type AssessmentFramework = {
  orgId: string;
  name: string;
  levels: Array<AssessmentLevel | "all">;
  businessFunctions: AssessmentFunction[];
  defaultGroups: AssessmentGroup[];
  competencies: CompetencyDefinition[];
  selfAssessmentEnabled: boolean;
  ready: boolean;
};

export type RaterCoverageSummary = {
  total: number;
  submitted: number;
  ready: boolean;
  missingGroups: string[];
};

export function normalizeAssessmentFramework(input: {
  orgId?: string;
  name?: string;
  levels?: Array<string | undefined>;
  businessFunctions?: Array<string | undefined>;
  defaultGroups?: Array<string | undefined>;
  selfAssessmentEnabled?: boolean | string;
  competencies?: Array<Partial<CompetencyDefinition>>;
}): AssessmentFramework {
  const validLevels = ["director", "assistant_director", "all"] as const;
  const validFunctions = ["network", "customer_experience", "commercial", "technology", "operations", "hr", "finance", "all"] as const;
  const validGroups = ["direct_report", "subordinate", "colleague", "customer"] as const;

  const levels = (input.levels ?? ["director", "assistant_director"]).reduce<Array<AssessmentLevel | "all">>((acc, level) => {
    const normalized = String(level ?? "").trim().toLowerCase();
    if (normalized && validLevels.includes(normalized as (typeof validLevels)[number])) {
      acc.push(normalized as AssessmentLevel | "all");
    }
    return acc;
  }, []);

  const businessFunctions = (input.businessFunctions ?? ["all"]).reduce<AssessmentFunction[]>((acc, item) => {
    const normalized = String(item ?? "").trim().toLowerCase();
    if (normalized && validFunctions.includes(normalized as (typeof validFunctions)[number])) {
      acc.push(normalized as AssessmentFunction);
    }
    return acc;
  }, []);

  const defaultGroups = (input.defaultGroups ?? ["direct_report", "subordinate", "colleague", "customer"]).reduce<AssessmentGroup[]>((acc, item) => {
    const normalized = String(item ?? "").trim().toLowerCase();
    if (normalized && validGroups.includes(normalized as (typeof validGroups)[number])) {
      acc.push(normalized as AssessmentGroup);
    }
    return acc;
  }, []);

  const competencies = (input.competencies ?? []).map((competency, index) => ({
    id: competency.id ?? `competency_${index + 1}`,
    name: competency.name ?? "Unnamed competency",
    group: (competency.group ?? "enterprise") as CompetencyDefinition["group"],
    level: (competency.level ?? "all") as CompetencyDefinition["level"],
    function: (competency.function ?? "all") as AssessmentFunction,
    description: competency.description ?? "",
    active: competency.active ?? true,
  }));

  const selfAssessmentEnabled = input.selfAssessmentEnabled === true || String(input.selfAssessmentEnabled ?? "").toLowerCase() === "yes";

  return {
    orgId: input.orgId ?? "unknown-org",
    name: input.name ?? "Assessment framework",
    levels: levels.length ? levels : ["director", "assistant_director"],
    businessFunctions: businessFunctions.length ? businessFunctions : ["all"],
    defaultGroups: defaultGroups.length ? defaultGroups : ["direct_report", "subordinate", "colleague", "customer"],
    competencies,
    selfAssessmentEnabled,
    ready: competencies.length > 0,
  };
}

export function buildAssessmentFramework(input: {
  orgId?: string;
  name?: string;
  levels?: string[];
  businessFunctions?: string[];
  defaultGroups?: string[];
  competencies?: Array<Partial<CompetencyDefinition> & {
    level?: string;
    function?: string;
    group?: "leadership" | "enterprise" | "functional" | string;
  }>;
  selfAssessmentEnabled?: boolean;
}): AssessmentFramework {
  return normalizeAssessmentFramework({
    orgId: input.orgId,
    name: input.name,
    levels: input.levels,
    businessFunctions: input.businessFunctions,
    defaultGroups: input.defaultGroups,
    competencies: input.competencies as Array<Partial<CompetencyDefinition>>,
    selfAssessmentEnabled: input.selfAssessmentEnabled,
  });
}

export function validateSelfAssessmentConfig(config: {
  enabled?: boolean;
  required?: boolean;
  allowAnonymous?: boolean;
  minimumResponses?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.enabled && config.required && config.minimumResponses !== undefined && config.minimumResponses < 1) {
    errors.push("self-assessment minimumResponses must be at least 1.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateRaterNomination(input: {
  employeeId?: string;
  assigneeId?: string;
  nominations?: Array<{ reviewerId?: string; reviewerGroup?: string }>;
  allowedGroups?: string[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.employeeId?.trim()) errors.push("Employee id is required for nomination.");
  if (!input.assigneeId?.trim()) errors.push("Assignee id is required for nomination.");

  const seen = new Set<string>();
  for (const nomination of input.nominations ?? []) {
    const reviewerId = nomination.reviewerId?.trim();
    const reviewerGroup = nomination.reviewerGroup?.trim();

    if (!reviewerId) {
      errors.push("Each nomination must include a reviewerId.");
      continue;
    }

    if (seen.has(reviewerId)) {
      errors.push(`duplicate reviewer nomination detected for reviewerId ${reviewerId}.`);
    }
    seen.add(reviewerId);

    if (!reviewerGroup) {
      errors.push(`Reviewer ${reviewerId} is missing a valid reviewerGroup.`);
      continue;
    }

    if (input.allowedGroups && !input.allowedGroups.includes(reviewerGroup)) {
      errors.push(`Reviewer ${reviewerId} uses unknown_group ${reviewerGroup}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildRaterCoverage(
  raters: Array<{ reviewerGroup?: string; status?: string }>,
  requiredGroups: string[] = ["direct_report", "subordinate", "colleague", "customer"],
): RaterCoverageSummary {
  const total = raters.length;
  const submitted = raters.filter((rater) => rater.status === "submitted").length;
  const missingGroups = requiredGroups.filter(
    (group) => !raters.some((rater) => rater.reviewerGroup === group),
  );

  return {
    total,
    submitted,
    ready: missingGroups.length === 0 && submitted >= total && total > 0,
    missingGroups,
  };
}
