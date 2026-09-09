/**
 * Choosing raters from the published organisation chart.
 *
 * Two ideas run through this file.
 *
 * The first is that a rater group is either attributable by design or anonymous
 * by promise. Self and line manager are the former: the subject knows exactly
 * who those two people are, which is why the scorer already exempts them from
 * suppression. Colleague, direct report and customer are the latter, and their
 * confidentiality rests on there being enough of them that no single answer can
 * be picked out.
 *
 * The second is that a small organisation is not a broken one. Requiring three
 * *same-tier* colleagues makes 360 impossible below about forty staff, so
 * colleagues are ranked rather than filtered: the nearest peers first, widening
 * outwards until the quota is met. What can never be filled is reported as a
 * shortfall rather than padded — in particular a direct report is somebody who
 * actually reports to the subject, and filling that group with strangers would
 * keep the label while destroying the upward-feedback signal it exists for.
 */

export type OrgTier = "director" | "senior_manager" | "manager" | "team_lead" | "none";

/** Ordered most senior first, so distance between tiers is a subtraction. */
export const ORG_TIERS: OrgTier[] = ["director", "senior_manager", "manager", "team_lead", "none"];

/**
 * How an organisation tier is recorded on a participant.
 *
 * assessment_subjects.level predates the org chart, so 'none' is stored as
 * 'individual_contributor' — a label somebody reading their own report can make
 * sense of, where "none" reads like missing data.
 */
export const TIER_TO_SUBJECT_LEVEL: Record<OrgTier, string> = {
  director: "director",
  senior_manager: "senior_manager",
  manager: "manager",
  team_lead: "team_lead",
  none: "individual_contributor",
};

export const TIER_LABEL: Record<OrgTier, string> = {
  director: "Directors",
  senior_manager: "Senior managers",
  manager: "Managers",
  team_lead: "Team leads",
  none: "Individual contributors",
};

export function isOrgTier(value: unknown): value is OrgTier {
  return typeof value === "string" && (ORG_TIERS as string[]).includes(value);
}

export type RosterMember = {
  id: string;
  name: string;
  email: string | null;
  tier: OrgTier;
  department: string | null;
  team: string | null;
  lineManagerId: string | null;
};

export type AutoRaterGroup = "self" | "line_manager" | "colleague" | "direct_report";

export type PlannedRater = {
  employeeId: string;
  name: string;
  email: string;
  group: AutoRaterGroup;
  /** Why this person was picked, shown in the preview so the plan can be argued with. */
  rationale: string;
};

export type RaterShortfall = {
  group: AutoRaterGroup;
  wanted: number;
  found: number;
  /** Written for an HR administrator, and says what it means for the report. */
  message: string;
};

export type RaterQuota = {
  colleague: number;
  direct_report: number;
};

export const DEFAULT_RATER_QUOTA: RaterQuota = { colleague: 3, direct_report: 3 };

export type AutoRaterPlan = {
  subjectEmployeeId: string;
  raters: PlannedRater[];
  shortfalls: RaterShortfall[];
  /**
   * Groups that will not be shown on their own under the cycle's rules. In merge
   * mode they pool into a combined bucket; in suppress mode they vanish.
   */
  thinGroups: AutoRaterGroup[];
};

/**
 * A stable pseudo-random ordering, seeded by the subject's id.
 *
 * Deliberately not Math.random. A plan that changes every time it is generated
 * cannot be previewed, cannot be reproduced when somebody asks why a particular
 * colleague was chosen, and quietly issues a second set of invitations to a
 * different group of people if the button is pressed twice.
 */
function seededRank(seed: string, value: string): number {
  let hash = 2166136261;
  const input = `${seed}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function tierDistance(a: OrgTier, b: OrgTier): number {
  return Math.abs(ORG_TIERS.indexOf(a) - ORG_TIERS.indexOf(b));
}

/**
 * How good a colleague candidate is, lower being better.
 *
 * Same tier and same department is the truest peer. From there it widens by
 * department, then by tier distance, and only then falls back to anyone with no
 * reporting relationship to the subject. In a large organisation the first band
 * is always full and the rest never runs; in a ten-person one the later bands
 * are what make the category possible at all.
 */
function colleagueRank(subject: RosterMember, candidate: RosterMember): number {
  const sameTier = candidate.tier === subject.tier ? 0 : 1;
  const sameDepartment =
    subject.department && candidate.department && subject.department === candidate.department ? 0 : 1;
  const sameTeam = subject.team && candidate.team && subject.team === candidate.team ? 0 : 1;

  return sameTier * 8 + tierDistance(subject.tier, candidate.tier) * 4 + sameDepartment * 2 + sameTeam;
}

function usable(member: RosterMember): boolean {
  return Boolean(member.email?.trim());
}

/**
 * Everyone who could rate this subject as a colleague.
 *
 * Defined by exclusion rather than by tier: a colleague is somebody who neither
 * manages the subject nor reports to them. That is what the word means, and it
 * is the difference between a quota that can be met in a small organisation and
 * one that cannot.
 */
export function colleagueCandidates(subject: RosterMember, roster: RosterMember[]): RosterMember[] {
  return roster.filter(
    (member) =>
      member.id !== subject.id &&
      member.id !== subject.lineManagerId &&
      member.lineManagerId !== subject.id &&
      usable(member),
  );
}

/** Everyone who reports directly to this subject. */
export function directReportCandidates(subject: RosterMember, roster: RosterMember[]): RosterMember[] {
  return roster.filter((member) => member.lineManagerId === subject.id && usable(member));
}

function take(
  candidates: RosterMember[],
  count: number,
  seed: string,
  rank: (member: RosterMember) => number,
): RosterMember[] {
  return [...candidates]
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      // Ties broken by the seeded order, so the choice among equals is stable
      // for this subject but not the same person for every subject.
      return seededRank(seed, a.id) - seededRank(seed, b.id);
    })
    .slice(0, Math.max(0, count));
}

export type AutoRaterOptions = {
  quota?: Partial<RaterQuota>;
  /** The cycle's confidentiality floor, used to flag groups that will not stand alone. */
  minimumPerGroup?: number;
  /** 'merge' pools thin groups; 'suppress' hides them. Changes only the wording. */
  suppressionMode?: "merge" | "suppress";
  includeSelf?: boolean;
  includeLineManager?: boolean;
};

/**
 * Builds one subject's rater list from the roster.
 *
 * Nothing is padded and nothing is silently dropped: whatever could not be
 * filled comes back in `shortfalls`, phrased so an administrator can decide
 * whether to launch, add somebody manually, or change the cycle's rules.
 */
export function buildAutoRaterPlan(
  subject: RosterMember,
  roster: RosterMember[],
  options: AutoRaterOptions = {},
): AutoRaterPlan {
  const quota: RaterQuota = {
    colleague: options.quota?.colleague ?? DEFAULT_RATER_QUOTA.colleague,
    direct_report: options.quota?.direct_report ?? DEFAULT_RATER_QUOTA.direct_report,
  };
  const minimum = options.minimumPerGroup ?? 3;
  const merging = (options.suppressionMode ?? "merge") === "merge";

  const raters: PlannedRater[] = [];
  const shortfalls: RaterShortfall[] = [];
  const thinGroups: AutoRaterGroup[] = [];

  if (options.includeSelf !== false && usable(subject)) {
    raters.push({
      employeeId: subject.id,
      name: subject.name,
      email: subject.email!.trim(),
      group: "self",
      rationale: "The participant's own self-assessment.",
    });
  }

  const lineManager = subject.lineManagerId
    ? roster.find((member) => member.id === subject.lineManagerId)
    : undefined;

  if (options.includeLineManager !== false) {
    if (lineManager && usable(lineManager)) {
      raters.push({
        employeeId: lineManager.id,
        name: lineManager.name,
        email: lineManager.email!.trim(),
        group: "line_manager",
        rationale: "Their line manager on the published organisation chart.",
      });
    } else {
      shortfalls.push({
        group: "line_manager",
        wanted: 1,
        found: 0,
        message: subject.lineManagerId
          ? "Their line manager has no email address on file, so no manager invitation can be sent."
          : "They sit at the top of the organisation chart, so there is no line manager to invite.",
      });
    }
  }

  const colleagues = take(
    colleagueCandidates(subject, roster),
    quota.colleague,
    subject.id,
    (member) => colleagueRank(subject, member),
  );

  for (const colleague of colleagues) {
    raters.push({
      employeeId: colleague.id,
      name: colleague.name,
      email: colleague.email!.trim(),
      group: "colleague",
      rationale:
        colleague.tier === subject.tier
          ? `Same level${colleague.department && colleague.department === subject.department ? ", same department" : ""}.`
          : `Works alongside them at ${TIER_LABEL[colleague.tier].toLowerCase()} level.`,
    });
  }

  const reports = take(
    directReportCandidates(subject, roster),
    quota.direct_report,
    subject.id,
    () => 0,
  );

  for (const report of reports) {
    raters.push({
      employeeId: report.id,
      name: report.name,
      email: report.email!.trim(),
      group: "direct_report",
      rationale: "Reports directly to them.",
    });
  }

  const groups: Array<{ group: AutoRaterGroup; wanted: number; found: number }> = [
    { group: "colleague", wanted: quota.colleague, found: colleagues.length },
    { group: "direct_report", wanted: quota.direct_report, found: reports.length },
  ];

  for (const { group, wanted, found } of groups) {
    const label = group === "colleague" ? "colleagues" : "direct reports";

    if (found < wanted) {
      shortfalls.push({
        group,
        wanted,
        found,
        message:
          group === "direct_report"
            ? `Only ${found} ${found === 1 ? "person reports" : "people report"} to them, so ${found} of the ${wanted} requested could be assigned. Direct reports are never filled from elsewhere: the group means "people you manage", and strangers in it would change what the number says.`
            : `Only ${found} ${found === 1 ? "colleague is" : "colleagues are"} available in this organisation, so ${found} of the ${wanted} requested could be assigned.`,
      });
    }

    if (found > 0 && found < minimum) {
      thinGroups.push(group);
      shortfalls.push({
        group,
        wanted: minimum,
        found,
        message: merging
          ? `${found} ${label} is below the confidentiality minimum of ${minimum}, so this group will not be shown on its own. It will be combined into a pooled "Others" score, which keeps individual answers unidentifiable.`
          : `${found} ${label} is below the confidentiality minimum of ${minimum}, so this group will be hidden from the report entirely. Switch the cycle to pooled scoring, or add more raters.`,
      });
    }
  }

  return { subjectEmployeeId: subject.id, raters, shortfalls, thinGroups };
}

/**
 * Whether an organisation is large enough for anonymous 360 feedback at all.
 *
 * Said plainly at setup rather than discovered from an empty report. Below the
 * floor, no arrangement of raters can keep a non-exempt group anonymous, and
 * pretending otherwise is worse than saying so.
 */
export function cohortFeasibility(input: {
  rosterSize: number;
  minimumPerGroup: number;
}): { feasible: boolean; message: string } {
  // A subject, their line manager, and enough others to fill one anonymous group.
  const floor = input.minimumPerGroup + 2;

  if (input.rosterSize < floor) {
    return {
      feasible: false,
      message: `This organisation has ${input.rosterSize} people on the chart. Anonymous 360 feedback needs at least ${floor} for a single group to reach the minimum of ${input.minimumPerGroup}. Self and line-manager feedback still works, because both are attributable by design, but no anonymous group can be formed.`,
    };
  }

  return {
    feasible: true,
    message: `${input.rosterSize} people on the chart — enough to form anonymous rater groups of ${input.minimumPerGroup}.`,
  };
}
