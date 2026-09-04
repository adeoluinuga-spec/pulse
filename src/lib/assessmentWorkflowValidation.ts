export type WorkflowReviewerStatus = "not_started" | "in_progress" | "submitted";
export type WorkflowNominationStatus = "pending" | "approved" | "rejected";
export type WorkflowSelfStatus = "draft" | "submitted" | "approved" | "rejected";

export type AssessmentWorkflowInput = {
  cycleName?: string;
  frameworkReady?: boolean;
  competencyCount?: number;
  subjects?: Array<{ id: string; name?: string }>;
  reviewers?: Array<{ subjectId: string; reviewerGroup: string; status: WorkflowReviewerStatus | string }>;
  nominations?: Array<{ subjectId: string; reviewerGroup: string; status: WorkflowNominationStatus | string }>;
  selfAssessments?: Array<{ subjectId: string; status: WorkflowSelfStatus | string; completion: number }>;
  reports?: Array<{ subjectId: string; ready: boolean }>;
  requiredGroups?: string[];
};

export type AssessmentWorkflowStage = {
  key: "cycle" | "framework" | "participants" | "nominations" | "self" | "reviews" | "reports";
  label: string;
  ready: boolean;
  issues: string[];
};

export type AssessmentWorkflowValidation = {
  ready: boolean;
  completion: number;
  stages: AssessmentWorkflowStage[];
  blockers: string[];
};

function stage(key: AssessmentWorkflowStage["key"], label: string, ready: boolean, issues: string[]): AssessmentWorkflowStage {
  return { key, label, ready, issues };
}

export function validateAssessmentWorkflow(input: AssessmentWorkflowInput): AssessmentWorkflowValidation {
  const requiredGroups = input.requiredGroups ?? ["line_manager", "direct_report", "colleague", "customer"];
  const subjects = input.subjects ?? [];
  const reviewers = input.reviewers ?? [];
  const nominations = input.nominations ?? [];
  const selfAssessments = input.selfAssessments ?? [];
  const reports = input.reports ?? [];

  const cycleIssues = input.cycleName?.trim() ? [] : ["Assessment cycle name is missing."];
  const frameworkIssues = [
    ...(input.frameworkReady ? [] : ["Assessment framework is not ready."]),
    ...((input.competencyCount ?? 0) > 0 ? [] : ["At least one competency is required."]),
  ];
  const participantIssues = subjects.length ? [] : ["At least one assessment subject is required."];

  const nominationIssues = subjects.flatMap((subject) => {
    const approvedGroups = new Set(
      nominations
        .filter((nomination) => nomination.subjectId === subject.id && nomination.status === "approved")
        .map((nomination) => nomination.reviewerGroup),
    );
    const missing = requiredGroups.filter((group) => !approvedGroups.has(group));
    return missing.length ? [`${subject.name ?? subject.id} is missing approved nominations for ${missing.join(", ")}.`] : [];
  });

  const selfIssues = subjects.flatMap((subject) => {
    const self = selfAssessments.find((entry) => entry.subjectId === subject.id);
    if (!self) return [`${subject.name ?? subject.id} has not started self-assessment.`];
    if (self.status !== "submitted" && self.status !== "approved") return [`${subject.name ?? subject.id} self-assessment is not submitted.`];
    if (self.completion < 100) return [`${subject.name ?? subject.id} self-assessment is incomplete.`];
    return [];
  });

  const reviewIssues = subjects.flatMap((subject) => {
    const subjectReviewers = reviewers.filter((reviewer) => reviewer.subjectId === subject.id);
    const submittedGroups = new Set(
      subjectReviewers
        .filter((reviewer) => reviewer.status === "submitted")
        .map((reviewer) => reviewer.reviewerGroup),
    );
    const missing = requiredGroups.filter((group) => !submittedGroups.has(group));
    return missing.length ? [`${subject.name ?? subject.id} is missing submitted reviews for ${missing.join(", ")}.`] : [];
  });

  const reportIssues = subjects.flatMap((subject) => {
    const report = reports.find((entry) => entry.subjectId === subject.id);
    return report?.ready ? [] : [`${subject.name ?? subject.id} report is not ready for release.`];
  });

  const stages = [
    stage("cycle", "Cycle setup", cycleIssues.length === 0, cycleIssues),
    stage("framework", "Framework configuration", frameworkIssues.length === 0, frameworkIssues),
    stage("participants", "Participants", participantIssues.length === 0, participantIssues),
    stage("nominations", "Nomination approval", nominationIssues.length === 0 && subjects.length > 0, nominationIssues),
    stage("self", "Self-assessment", selfIssues.length === 0 && subjects.length > 0, selfIssues),
    stage("reviews", "Reviewer submissions", reviewIssues.length === 0 && subjects.length > 0, reviewIssues),
    stage("reports", "Report release", reportIssues.length === 0 && subjects.length > 0, reportIssues),
  ];

  const readyStages = stages.filter((entry) => entry.ready).length;
  const blockers = stages.flatMap((entry) => entry.issues);

  return {
    ready: blockers.length === 0,
    completion: Math.round((readyStages / stages.length) * 100),
    stages,
    blockers,
  };
}
