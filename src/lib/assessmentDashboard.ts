export type DashboardCycleStatus = "setup" | "collecting" | "calibration" | "closed";
export type DashboardReviewerStatus = "not_started" | "in_progress" | "submitted";
export type DashboardInviteStatus = "draft" | "sent" | "opened" | "submitted" | "expired";

export type MyAssessmentCycle = {
  id: string;
  name: string;
  status: DashboardCycleStatus | string;
  startsOn: string | null;
  closesOn: string | null;
};

export type MyAssessmentSubject = {
  id: string;
  name: string;
  email: string | null;
};

export type MyAssessmentReviewerAssignment = {
  id: string;
  subjectName: string;
  reviewerGroup: string;
  status: DashboardReviewerStatus | string;
  inviteStatus: DashboardInviteStatus | string;
  tokenExpiresAt: string | null;
};

export type MyAssessmentStatusInput = {
  cycle: MyAssessmentCycle | null;
  subjects: MyAssessmentSubject[];
  reviewerAssignments: MyAssessmentReviewerAssignment[];
  unreadAssessmentNotifications?: number;
  now?: Date;
};

export type MyAssessmentStatus = {
  hasCycle: boolean;
  cycleIsCollecting: boolean;
  cycleLabel: string;
  headline: string;
  body: string;
  tone: "success" | "warning" | "neutral";
  participantCount: number;
  pendingReviews: number;
  submittedReviews: number;
  unreadAssessmentNotifications: number;
};

function isPastDate(value: string | null, now: Date): boolean {
  if (!value) return false;
  const date = new Date(`${value}T23:59:59`);
  return Number.isFinite(date.getTime()) && date.getTime() < now.getTime();
}

function cycleLabel(status?: string | null) {
  if (status === "collecting") return "Collecting feedback";
  if (status === "calibration") return "In review";
  if (status === "closed") return "Closed";
  return "Setup";
}

export function buildMyAssessmentStatus(input: MyAssessmentStatusInput): MyAssessmentStatus {
  const cycle = input.cycle;
  const now = input.now ?? new Date();
  const participantCount = input.subjects.length;
  const submittedReviews = input.reviewerAssignments.filter((assignment) => assignment.status === "submitted").length;
  const pendingReviews = input.reviewerAssignments.filter((assignment) => assignment.status !== "submitted").length;
  const unreadAssessmentNotifications = input.unreadAssessmentNotifications ?? 0;

  if (!cycle) {
    return {
      hasCycle: false,
      cycleIsCollecting: false,
      cycleLabel: "No active 360 cycle",
      headline: "No 360 assessment is active yet",
      body: "When HR launches a 360 assessment for your organisation, it will appear here.",
      tone: "neutral",
      participantCount,
      pendingReviews,
      submittedReviews,
      unreadAssessmentNotifications,
    };
  }

  const expired = isPastDate(cycle.closesOn, now);
  const cycleIsCollecting = cycle.status === "collecting" && !expired;

  if (cycleIsCollecting && participantCount > 0 && pendingReviews > 0) {
    return {
      hasCycle: true,
      cycleIsCollecting,
      cycleLabel: cycleLabel(cycle.status),
      headline: "Your 360 assessment is live",
      body: `You are listed for ${cycle.name}, and you also have ${pendingReviews} feedback assignment${pendingReviews === 1 ? "" : "s"} pending.`,
      tone: "success",
      participantCount,
      pendingReviews,
      submittedReviews,
      unreadAssessmentNotifications,
    };
  }

  if (cycleIsCollecting && participantCount > 0) {
    return {
      hasCycle: true,
      cycleIsCollecting,
      cycleLabel: cycleLabel(cycle.status),
      headline: "Your 360 assessment is live",
      body: `You are listed for ${cycle.name}. You will receive your report after responses are reviewed and released.`,
      tone: "success",
      participantCount,
      pendingReviews,
      submittedReviews,
      unreadAssessmentNotifications,
    };
  }

  if (cycleIsCollecting && pendingReviews > 0) {
    return {
      hasCycle: true,
      cycleIsCollecting,
      cycleLabel: cycleLabel(cycle.status),
      headline: "Feedback is requested from you",
      body: `You have ${pendingReviews} pending feedback assignment${pendingReviews === 1 ? "" : "s"} in ${cycle.name}. Use your secure invitation email to open each review.`,
      tone: "warning",
      participantCount,
      pendingReviews,
      submittedReviews,
      unreadAssessmentNotifications,
    };
  }

  return {
    hasCycle: true,
    cycleIsCollecting,
    cycleLabel: expired ? "Closed" : cycleLabel(cycle.status),
    headline: expired ? "The 360 assessment window has closed" : `${cycle.name} is not collecting yet`,
    body: expired
      ? "HR is reviewing the assessment data. Released reports will appear when available."
      : "HR has configured the cycle, but feedback collection has not opened for you yet.",
    tone: expired ? "neutral" : "warning",
    participantCount,
    pendingReviews,
    submittedReviews,
    unreadAssessmentNotifications,
  };
}
