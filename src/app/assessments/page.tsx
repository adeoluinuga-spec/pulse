"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  Users,
} from "lucide-react";
import {
  assessmentReadiness,
  completionByGroup,
  completionForAssessee,
  levelLabel,
  reviewerGroups,
  weightedScore,
  type Assessee,
  type AssesseeResult,
  type AssessmentCycle,
  type AssessmentLevel,
  type Reviewer,
  type ReviewerGroup,
  type ReviewerStatus,
} from "@/lib/assessments360";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/Toast";
import { getSupabase } from "@/lib/supabase";
import { canManageAssessmentWorkspace, canViewAssessmentWorkspace } from "@/lib/tenant";
import {
  buildAssessmentFramework,
  buildRaterCoverage,
  validateRaterNomination,
  validateSelfAssessmentConfig,
  type AssessmentFunction,
  type CompetencyDefinition,
} from "@/lib/assessmentFramework";
import {
  buildReviewerWorkflowSummary,
  createSecureReviewerInvite,
  normalizeAssessmentScope,
  reviewerAssignmentIsValid,
  supportsReviewChannel,
} from "@/lib/assessmentReviewers";
import { parseAssessmentParticipantCsv } from "@/lib/assessmentParticipants";
import { buildNominationSummary, buildSelfAssessmentSummary } from "@/lib/assessmentParticipation";
import { buildAssessmentReportSummary } from "@/lib/assessmentReporting";
import { canReleaseAssessmentReport, releaseReadinessSummary } from "@/lib/assessmentRelease";
import { buildReviewSubmissionSummary, validateReviewPayload } from "@/lib/reviewSubmission";

type TabKey = "command" | "participants" | "questions" | "self" | "nominations" | "review" | "reports";
type LevelFilter = AssessmentLevel | "all";
type NominationStatus = "pending" | "approved" | "rejected";
type InviteStatus = "draft" | "sent" | "opened" | "submitted" | "expired";

type ApiCycle = {
  id: string;
  name: string;
  status?: string;
  starts_on?: string | null;
  closes_on?: string | null;
  reviewer_weights?: Partial<Record<ReviewerGroup, number>>;
  levels?: AssessmentLevel[];
  client_context?: string | null;
};

type ApiSubject = {
  id: string;
  name: string;
  email?: string | null;
  level?: AssessmentLevel;
  function_name?: string | null;
  region?: string | null;
  portfolio?: string | null;
};

type ApiReviewer = {
  id: string;
  subject_id: string;
  reviewer_name: string;
  reviewer_group: ReviewerGroup;
  organisation?: string | null;
  reviewer_email: string;
  status?: ReviewerStatus;
  invite_status?: InviteStatus;
  invite_channel?: "email" | "sms" | "whatsapp" | "portal";
  assessment_scope?: "individual" | "team" | "customer_experience" | "functional";
  token_expires_at?: string | null;
  submitted_at?: string | null;
};

type ApiNomination = {
  id: string;
  subject_id: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_group: ReviewerGroup;
  status?: NominationStatus;
};

type ApiReport = {
  subject_id: string;
  group_scores?: Partial<Record<ReviewerGroup, number>>;
  competency_scores?: Array<{ competencyId?: string; competency_id?: string; score?: number; benchmark?: number }>;
  strengths?: string[];
  development_areas?: string[];
  risk_notes?: string[];
};

type OrgEmployeeOption = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  department?: string | null;
  team?: string | null;
  cadre?: string | null;
  lineManagerId?: string | null;
};

const scopeOptions = [
  { value: "individual", label: "Individual performance", description: "One leader assessed across the agreed reviewer groups." },
  { value: "team", label: "Team health", description: "Signals about how the leader's team experiences direction, trust, and execution." },
  { value: "functional", label: "Functional capability", description: "Leadership impact within a department, region, or business function." },
  { value: "customer_experience", label: "Customer experience", description: "External stakeholder feedback on service, partnership, and delivery." },
] as const;

function employeeStakeholderLabel(employee?: OrgEmployeeOption | null) {
  if (!employee) return "";
  return employee.department || employee.team || employee.role || "Internal employee";
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "command", label: "Command", icon: BarChart3 },
  { key: "participants", label: "Participants", icon: Users },
  { key: "questions", label: "Framework", icon: ClipboardList },
  { key: "self", label: "Self assessment", icon: Star },
  { key: "nominations", label: "Nominations", icon: ShieldCheck },
  { key: "review", label: "Review form", icon: MessageSquareText },
  { key: "reports", label: "Reports", icon: FileText },
];

const statusMeta: Record<ReviewerStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  in_progress: { label: "In progress", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  submitted: { label: "Submitted", className: "bg-green-soft text-green ring-green/20" },
};

const inviteStatusMeta: Record<InviteStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-ink/5 text-muted ring-ink/10" },
  sent: { label: "Sent", className: "bg-pulse-soft text-pulse ring-pulse/20" },
  opened: { label: "Opened", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  submitted: { label: "Submitted", className: "bg-green-soft text-green ring-green/20" },
  expired: { label: "Expired", className: "bg-red-50 text-red-700 ring-red-200" },
};

const groupTone: Record<ReviewerGroup, string> = {
  self: "border-l-ink/30",
  line_manager: "border-l-pulse",
  direct_report: "border-l-green",
  colleague: "border-l-blue-500",
  customer: "border-l-violet-500",
};

const defaultReviewerWeights: Record<ReviewerGroup, number> = {
  self: 0,
  line_manager: 30,
  direct_report: 25,
  colleague: 25,
  customer: 20,
};
const emptyCycle: AssessmentCycle = {
  id: "",
  name: "No active 360 cycle",
  clientName: "Current organisation",
  status: "setup",
  startDate: "",
  closeDate: "",
  levels: ["director", "assistant_director"],
  reviewerWeights: defaultReviewerWeights,
};
const emptyAssessee: Assessee = {
  id: "",
  name: "No leader selected",
  initials: "NA",
  level: "assistant_director",
  functionName: "Not set",
  region: "Not set",
  portfolio: "Create or load a live assessment cycle, then import participants.",
  tenureYears: 0,
};
const emptyResult: AssesseeResult = {
  assesseeId: "",
  groupScores: {
    self: 0,
    line_manager: 0,
    direct_report: 0,
    colleague: 0,
    customer: 0,
  },
  competencyScores: [],
  strongestSignals: [],
  developmentSignals: [],
  riskNotes: [],
};

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function reviewerGroupLabel(group: ReviewerGroup) {
  return reviewerGroups.find((item) => item.key === group)?.label ?? group;
}

function scoreTone(score: number) {
  if (score >= 85) return "bg-green text-white";
  if (score >= 75) return "bg-pulse text-white";
  if (score >= 65) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "NP";
}

function mapApiCycle(cycle: ApiCycle) {
  return {
    id: cycle.id,
    name: cycle.name,
    clientName: cycle.client_context || "Current organisation",
    status: (cycle.status ?? "setup") as AssessmentCycle["status"],
    startDate: cycle.starts_on ?? "",
    closeDate: cycle.closes_on ?? "",
    levels: cycle.levels?.length ? cycle.levels : emptyCycle.levels,
    reviewerWeights: {
      ...defaultReviewerWeights,
      ...(cycle.reviewer_weights ?? {}),
    },
  };
}

function mapApiSubject(subject: ApiSubject) {
  return {
    id: subject.id,
    name: subject.name,
    initials: initialsFor(subject.name),
    email: subject.email ?? undefined,
    level: subject.level ?? "assistant_director",
    functionName: subject.function_name || "Not specified",
    region: subject.region || "Not specified",
    portfolio: subject.portfolio || "Review participant",
    tenureYears: 1,
  };
}

function mapApiReviewer(reviewer: ApiReviewer): Reviewer {
  return {
    id: reviewer.id,
    assesseeId: reviewer.subject_id,
    name: reviewer.reviewer_name,
    group: reviewer.reviewer_group,
    organisation: reviewer.organisation ?? undefined,
    email: reviewer.reviewer_email,
    status: reviewer.status ?? "not_started",
    submittedAt: reviewer.submitted_at ?? undefined,
    inviteStatus: reviewer.invite_status ?? "draft",
    inviteChannel: reviewer.invite_channel ?? (reviewer.reviewer_group === "customer" ? "whatsapp" : "email"),
    assessmentScope: reviewer.assessment_scope ?? (reviewer.reviewer_group === "customer" ? "customer_experience" : "individual"),
    tokenExpiresAt: reviewer.token_expires_at ?? undefined,
  };
}

function mapApiNomination(nomination: ApiNomination): RaterNominationItem {
  return {
    id: nomination.id,
    assigneeId: nomination.subject_id,
    reviewerId: nomination.reviewer_email,
    name: nomination.reviewer_name,
    email: nomination.reviewer_email,
    group: nomination.reviewer_group,
    status: nomination.status ?? "pending",
  };
}

function mapApiReport(report: ApiReport) {
  return {
    assesseeId: report.subject_id,
    groupScores: {
      line_manager: report.group_scores?.line_manager ?? 0,
      direct_report: report.group_scores?.direct_report ?? 0,
      colleague: report.group_scores?.colleague ?? 0,
      customer: report.group_scores?.customer ?? 0,
    },
    competencyScores: (report.competency_scores ?? []).map((entry) => ({
      competencyId: entry.competencyId ?? entry.competency_id ?? "unknown",
      score: entry.score ?? 0,
      benchmark: entry.benchmark ?? 80,
    })),
    strongestSignals: report.strengths ?? [],
    developmentSignals: report.development_areas ?? [],
    riskNotes: report.risk_notes ?? [],
  };
}

const assessmentFunctions: AssessmentFunction[] = ["all", "network", "customer_experience", "commercial", "technology", "operations", "hr", "finance"];
const competencyGroups: CompetencyDefinition["group"][] = ["leadership", "enterprise", "functional"];

type RaterNominationItem = {
  id: string;
  assigneeId: string;
  reviewerId: string;
  name: string;
  email: string;
  group: ReviewerGroup;
  status: NominationStatus;
};

export default function AssessmentsPage() {
  const { user } = useUser();
  const { showToast } = useToast();
  const canViewAssessments = canViewAssessmentWorkspace(user.platformRole);
  const canManageAssessments = canManageAssessmentWorkspace(user.platformRole);
  const [activeTab, setActiveTab] = useState<TabKey>("command");
  const [activeCycle, setActiveCycle] = useState(emptyCycle);
  const [isHydratingAssessmentData, setIsHydratingAssessmentData] = useState(true);
  const [dataSourceNotice, setDataSourceNotice] = useState("Loading assessment records...");
  const [nowTimestamp] = useState(() => Date.now());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [selectedAssesseeId, setSelectedAssesseeId] = useState("");
  const [reviewerGroup, setReviewerGroup] = useState<ReviewerGroup>("colleague");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [cycleName, setCycleName] = useState("");
  const [cycleClient, setCycleClient] = useState("");
  const [cycleStartsOn, setCycleStartsOn] = useState("");
  const [cycleClosesOn, setCycleClosesOn] = useState("");
  const [cycleNotice, setCycleNotice] = useState("");
  const [assessmentLevelLabels, setAssessmentLevelLabels] = useState<string[]>(["Director", "Assistant Director"]);
  const [assessmentLevelLabelDrafts, setAssessmentLevelLabelDrafts] = useState<string[]>(["Director", "Assistant Director"]);
  const [orgLevelLabelNotice, setOrgLevelLabelNotice] = useState("");
  const [reviewerWeights, setReviewerWeights] = useState(defaultReviewerWeights);
  const [participantCsv, setParticipantCsv] = useState("");
  const [participantNotice, setParticipantNotice] = useState("");
  const [orgEmployeeOptions, setOrgEmployeeOptions] = useState<OrgEmployeeOption[]>([]);
  const [selectedOrgEmployeeId, setSelectedOrgEmployeeId] = useState("");
  const [selectedReviewerEmployeeId, setSelectedReviewerEmployeeId] = useState("");
  const [assessmentSubjects, setAssessmentSubjects] = useState<Assessee[]>([]);
  const [assessmentResults, setAssessmentResults] = useState<AssesseeResult[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerOrg, setReviewerOrg] = useState("");
  const [reviewerGroupForm, setReviewerGroupForm] = useState<ReviewerGroup>("line_manager");
  const [reviewerChannel, setReviewerChannel] = useState("email");
  const [assessmentScope, setAssessmentScope] = useState("individual");
  const [reviewerNotice, setReviewerNotice] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [reviewerAssignments, setReviewerAssignments] = useState<Reviewer[]>([]);
  const [reviewerInvites, setReviewerInvites] = useState<ReturnType<typeof createSecureReviewerInvite>[]>([]);
  const [submissionToken, setSubmissionToken] = useState("");
  const [submissionScores, setSubmissionScores] = useState<Record<string, number>>({});
  const [submissionComments, setSubmissionComments] = useState<Record<string, string>>({});
  const [submissionNotice, setSubmissionNotice] = useState("");
  const [frameworkName, setFrameworkName] = useState("360 Leadership Capability Framework");
  const [frameworkFunction, setFrameworkFunction] = useState<AssessmentFunction>("all");
  const [selfAssessmentEnabled, setSelfAssessmentEnabled] = useState(true);
  const [selfAssessmentRequired, setSelfAssessmentRequired] = useState(true);
  const [selfMinimumResponses, setSelfMinimumResponses] = useState(1);
  const [frameworkNotice, setFrameworkNotice] = useState("");
  const [competencyDraftName, setCompetencyDraftName] = useState("");
  const [competencyDraftDescription, setCompetencyDraftDescription] = useState("");
  const [competencyDraftGroup, setCompetencyDraftGroup] = useState<CompetencyDefinition["group"]>("leadership");
  const [competencyDraftLevel, setCompetencyDraftLevel] = useState<AssessmentLevel | "all">("all");
  const [competencyDraftFunction, setCompetencyDraftFunction] = useState<AssessmentFunction>("all");
  const [configuredCompetencies, setConfiguredCompetencies] = useState<CompetencyDefinition[]>([]);
  const [competencyWeights, setCompetencyWeights] = useState<Record<string, number>>({});
  const [selfRatings, setSelfRatings] = useState<Record<string, number>>({});
  const [selfComments, setSelfComments] = useState<Record<string, string>>({});
  const [selfSubmitted, setSelfSubmitted] = useState(false);
  const [selfNotice, setSelfNotice] = useState("");
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeEmail, setNomineeEmail] = useState("");
  const [nomineeGroup, setNomineeGroup] = useState<ReviewerGroup>("colleague");
  const [nominationNotice, setNominationNotice] = useState("");
  const [raterNominations, setRaterNominations] = useState<RaterNominationItem[]>([]);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  async function handleSendReminders() {
    if (!activeCycle.id) {
      showToast("Create or select an assessment cycle before sending reminders.", "warning");
      return;
    }

    setIsSendingReminders(true);
    try {
      const response = await fetch("/api/assessments/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: activeCycle.id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        reminded?: number;
        failed?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to send assessment reminders");
      }

      const reminded = result.reminded ?? 0;
      const failed = result.failed ?? 0;

      if (reminded === 0 && failed === 0) {
        showToast("No pending reviewer reminders are due for this cycle.", "info");
      } else if (failed > 0) {
        showToast(`${reminded} reminder${reminded === 1 ? "" : "s"} sent. ${failed} failed and should be checked.`, "warning");
      } else {
        showToast(`${reminded} reminder${reminded === 1 ? "" : "s"} sent successfully.`, "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to send assessment reminders", "error");
    } finally {
      setIsSendingReminders(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAssessmentData() {
      setIsHydratingAssessmentData(true);

      try {
        const supabase = getSupabase();
        const { data: authUserData } = await supabase.auth.getUser();
        const authUser = authUserData?.user;
        let orgId: string | null = null;

        if (authUser) {
          const { data: employeeRow } = await supabase
            .from("employees")
            .select("org_id")
            .eq("user_id", authUser.id)
            .maybeSingle();

          orgId = employeeRow?.org_id ?? null;

          if (orgId) {
            const { data: orgRow } = await supabase
              .from("organisations")
              .select("assessment_level_labels")
              .eq("id", orgId)
              .maybeSingle();

            const labels = Array.isArray((orgRow as { assessment_level_labels?: Array<string | null> } | null)?.assessment_level_labels)
              ? ((orgRow as { assessment_level_labels?: Array<string | null> }).assessment_level_labels ?? []).map((item) => String(item ?? "").trim())
              : [];

            const normalized = labels.length ? labels : ["Director", "Assistant Director"];
            setAssessmentLevelLabels(normalized);
            setAssessmentLevelLabelDrafts(normalized);
          }
        }

        const { data: orgEmployees } = orgId
          ? await supabase
              .from("employees")
              .select("id, name, email, role, department, team, cadre, line_manager_id")
              .eq("org_id", orgId)
              .order("name", { ascending: true })
          : { data: [] };

        if (orgId) {
          setOrgEmployeeOptions(
            (orgEmployees ?? []).map((employee) => ({
              id: employee.id,
              name: employee.name ?? "",
              email: employee.email ?? "",
              role: employee.role,
              department: employee.department,
              team: employee.team,
              cadre: employee.cadre,
              lineManagerId: employee.line_manager_id,
            })),
          );
        } else {
          setOrgEmployeeOptions([]);
        }

        const cyclesResponse = await fetch("/api/assessments/cycles", { cache: "no-store" });
        const cyclesPayload = await cyclesResponse.json();

        if (!cyclesResponse.ok) {
          throw new Error(cyclesPayload?.error ?? "Unable to load assessment cycles");
        }

        const cycle = (cyclesPayload?.cycles ?? [])[0] as ApiCycle | undefined;
        if (!cycle) {
          if (!cancelled) {
            setActiveCycle(emptyCycle);
            setAssessmentSubjects([]);
            setAssessmentResults([]);
            setReviewerAssignments([]);
            setReviewerInvites([]);
            setRaterNominations([]);
            setSelectedAssesseeId("");
            setDataSourceNotice("No live 360 assessment cycle found for this organisation yet.");
            setIsHydratingAssessmentData(false);
          }
          return;
        }

        const liveCycle = mapApiCycle(cycle);
        const [subjectsResponse, reviewersResponse, nominationsResponse, reportsResponse] = await Promise.all([
          fetch(`/api/assessments/subjects?cycleId=${encodeURIComponent(liveCycle.id)}`, { cache: "no-store" }),
          fetch(`/api/assessments/reviewers?cycleId=${encodeURIComponent(liveCycle.id)}`, { cache: "no-store" }),
          fetch(`/api/assessments/nominations?cycleId=${encodeURIComponent(liveCycle.id)}`, { cache: "no-store" }),
          fetch(`/api/assessments/reports?cycleId=${encodeURIComponent(liveCycle.id)}`, { cache: "no-store" }),
        ]);

        const [subjectsPayload, reviewersPayload, nominationsPayload, reportsPayload] = await Promise.all([
          subjectsResponse.json(),
          reviewersResponse.json(),
          nominationsResponse.json(),
          reportsResponse.json(),
        ]);

        if (!subjectsResponse.ok) throw new Error(subjectsPayload?.error ?? "Unable to load participants");
        if (!reviewersResponse.ok) throw new Error(reviewersPayload?.error ?? "Unable to load reviewers");
        if (!nominationsResponse.ok) throw new Error(nominationsPayload?.error ?? "Unable to load nominations");
        if (!reportsResponse.ok) throw new Error(reportsPayload?.error ?? "Unable to load reports");

        if (cancelled) return;

        const liveSubjects = (subjectsPayload?.subjects ?? []).map(mapApiSubject);
        const liveReviewers = (reviewersPayload?.reviewers ?? []).map(mapApiReviewer);
        const liveNominations = (nominationsPayload?.nominations ?? []).map(mapApiNomination);
        const liveResults = (reportsPayload?.reports ?? []).map(mapApiReport);

        setActiveCycle(liveCycle);
        setCycleName(liveCycle.name);
        setCycleClient(liveCycle.clientName);
        setCycleStartsOn(liveCycle.startDate);
        setCycleClosesOn(liveCycle.closeDate);
        setReviewerWeights(liveCycle.reviewerWeights);
        if (liveSubjects.length) {
          setAssessmentSubjects(liveSubjects);
          setSelectedAssesseeId(liveSubjects[0].id);
        }
        if (liveReviewers.length) setReviewerAssignments(liveReviewers);
        if (liveNominations.length) setRaterNominations(liveNominations);
        if (liveResults.length) setAssessmentResults(liveResults);
        setDataSourceNotice(`Live Supabase data loaded from ${liveCycle.name}.`);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to hydrate assessment data";
          setDataSourceNotice(`${message}. No fallback records are shown for client tenants.`);
        }
      } finally {
        if (!cancelled) setIsHydratingAssessmentData(false);
      }
    }

    loadAssessmentData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveAssessmentLevelNames() {
    if (!user?.email) {
      setOrgLevelLabelNotice("Sign in again to save organization labels.");
      return;
    }

    try {
      const supabase = getSupabase();
      const { data: authUserData } = await supabase.auth.getUser();
      const authUser = authUserData?.user;
      if (!authUser) {
        setOrgLevelLabelNotice("Unable to find your login session.");
        return;
      }

      const { data: employeeRow } = await supabase
        .from("employees")
        .select("org_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!employeeRow?.org_id) {
        setOrgLevelLabelNotice("This account is not linked to an organisation yet.");
        return;
      }

      const nextLabels = assessmentLevelLabelDrafts.map((label, index) => {
        const value = String(label ?? "").trim();
        if (!value) return index === 0 ? "Level 1" : "Level 2";
        return value;
      });

      const { error } = await supabase
        .from("organisations")
        .update({ assessment_level_labels: nextLabels })
        .eq("id", employeeRow.org_id);

      if (error) throw error;
      setAssessmentLevelLabels(nextLabels);
      setOrgLevelLabelNotice("Assessment level names saved for this organisation.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save assessment labels.";
      setOrgLevelLabelNotice(message);
    }
  }

  const visibleAssessees = useMemo(
    () => assessmentSubjects.filter((assessee) => levelFilter === "all" || assessee.level === levelFilter),
    [assessmentSubjects, levelFilter],
  );
  const selectedAssessee = assessmentSubjects.find((assessee) => assessee.id === selectedAssesseeId) ?? assessmentSubjects[0] ?? emptyAssessee;
  const selectedResult = assessmentResults.find((result) => result.assesseeId === selectedAssessee.id) ?? emptyResult;
  const availableOrgEmployees = useMemo(
    () =>
      orgEmployeeOptions.filter(
        (employee) => !assessmentSubjects.some((subject) => (subject.email ?? "").toLowerCase() === employee.email.toLowerCase()),
      ),
    [orgEmployeeOptions, assessmentSubjects],
  );
  const orgDisplayName = activeCycle.clientName && activeCycle.clientName !== "Current organisation"
    ? activeCycle.clientName
    : "organisation";
  const selectedAssesseeEmployee = orgEmployeeOptions.find(
    (employee) => selectedAssessee.email && employee.email.toLowerCase() === selectedAssessee.email.toLowerCase(),
  );
  const selectedLineManager = selectedAssesseeEmployee?.lineManagerId
    ? orgEmployeeOptions.find((employee) => employee.id === selectedAssesseeEmployee.lineManagerId)
    : undefined;
  const directReportOptions = selectedAssesseeEmployee
    ? orgEmployeeOptions.filter((employee) => employee.lineManagerId === selectedAssesseeEmployee.id)
    : [];
  const colleagueOptions = selectedAssesseeEmployee
    ? orgEmployeeOptions.filter((employee) =>
        employee.id !== selectedAssesseeEmployee.id &&
        employee.id !== selectedLineManager?.id &&
        employee.lineManagerId !== selectedAssesseeEmployee.id &&
        Boolean(
          (selectedAssesseeEmployee.department && employee.department === selectedAssesseeEmployee.department) ||
          (selectedAssesseeEmployee.team && employee.team === selectedAssesseeEmployee.team),
        ),
      )
    : orgEmployeeOptions.filter((employee) => employee.email.toLowerCase() !== (selectedAssessee.email ?? "").toLowerCase());
  const reviewerEmployeeOptions = reviewerGroupForm === "direct_report"
    ? directReportOptions
    : reviewerGroupForm === "colleague"
      ? colleagueOptions
      : reviewerGroupForm === "line_manager" && selectedLineManager
        ? [selectedLineManager]
        : [];
  const selectedReviewerEmployee = reviewerGroupForm === "line_manager"
    ? selectedLineManager
    : reviewerGroupForm === "self"
      ? selectedAssesseeEmployee
      : orgEmployeeOptions.find((employee) => employee.id === selectedReviewerEmployeeId);
  const hasLiveCycle = Boolean(activeCycle.id);
  const hasSelectedAssessee = Boolean(selectedAssessee.id);
  const assessmentQuestionItems = configuredCompetencies
    .filter((competency) => competency.active)
    .map((competency) => ({
      id: `${competency.id}_rating`,
      competencyId: competency.id,
      prompt: `Rate this leader on ${competency.name.toLowerCase()}.`,
    }));
  const competencyNameById = new Map(configuredCompetencies.map((competency) => [competency.id, competency.name]));
  const selectedAssesseeReviewers = reviewerAssignments.filter((reviewer) => reviewer.assesseeId === selectedAssessee.id);
  const selectedScore = weightedScore(selectedResult, reviewerWeights);
  const readiness = assessmentReadiness(assessmentSubjects, reviewerAssignments);
  const completion = average(assessmentSubjects.map((assessee) => completionForAssessee(assessee.id, reviewerAssignments)));
  const portfolioScore = average(assessmentResults.map((result) => weightedScore(result, reviewerWeights)));
  const riskCount = assessmentResults.reduce((sum, result) => sum + result.riskNotes.length, 0);
  const submittedCount = reviewerAssignments.filter((reviewer) => reviewer.status === "submitted").length;
  const reviewerSummary = buildReviewerWorkflowSummary(selectedAssesseeReviewers);
  const releaseSummary = releaseReadinessSummary(selectedAssesseeReviewers);
  const canReleaseSelectedReport = canReleaseAssessmentReport(selectedAssesseeReviewers);
  const normalizedScope = normalizeAssessmentScope(assessmentScope);
  const selectedScopeOption = scopeOptions.find((option) => option.value === normalizedScope) ?? scopeOptions[0];
  const whatsappEnabled = supportsReviewChannel(reviewerChannel);
  const invitationQueue = reviewerAssignments.map((reviewer) => {
    const invite = reviewerInvites.find((entry) =>
      entry.reviewerId === reviewer.id || entry.reviewerEmail.toLowerCase() === reviewer.email.toLowerCase(),
    );
    const inviteStatus = (invite?.status ?? reviewer.inviteStatus ?? "draft") as InviteStatus;
    const channel = invite?.channel ?? reviewer.inviteChannel ?? (reviewer.group === "customer" ? "whatsapp" : "email");
    const scope = invite?.scope ?? reviewer.assessmentScope ?? (reviewer.group === "customer" ? "customer_experience" : "individual");
    const expiresAt = invite?.expiresAt ?? reviewer.tokenExpiresAt;
    const currentTimestamp = nowTimestamp ?? 0;
    const expired = expiresAt && currentTimestamp > 0 ? new Date(expiresAt).getTime() < currentTimestamp : false;

    return {
      reviewer,
      invite,
      status: expired && inviteStatus !== "submitted" ? "expired" as InviteStatus : inviteStatus,
      channel,
      scope,
      expiresAt,
      secureLink: invite?.secureLink,
    };
  });
  const invitationStats = {
    total: invitationQueue.length,
    sent: invitationQueue.filter((entry) => entry.status === "sent" || entry.status === "opened").length,
    submitted: invitationQueue.filter((entry) => entry.status === "submitted" || entry.reviewer.status === "submitted").length,
    expired: invitationQueue.filter((entry) => entry.status === "expired").length,
    needsInvite: invitationQueue.filter((entry) => entry.status === "draft" || entry.status === "expired").length,
  };
  const reviewSubmissionSummary = buildReviewSubmissionSummary(
    assessmentQuestionItems.map((question) => ({
      score: submissionScores[question.competencyId] ?? 4,
      comment: submissionComments[question.competencyId] ?? "Quality evidence provided",
    })),
  );
  const assessmentFramework = buildAssessmentFramework({
    orgId: "local-workspace",
    name: frameworkName,
    levels: activeCycle.levels,
    businessFunctions: [frameworkFunction],
    defaultGroups: reviewerGroups.map((group) => group.key),
    competencies: configuredCompetencies,
    selfAssessmentEnabled,
  });
  const selfAssessmentValidation = validateSelfAssessmentConfig({
    enabled: selfAssessmentEnabled,
    required: selfAssessmentRequired,
    minimumResponses: selfMinimumResponses,
  });
  const raterCoverage = buildRaterCoverage(reviewerAssignments.map((reviewer) => ({ reviewerGroup: reviewer.group, status: reviewer.status })));
  const reviewerWeightTotal = Object.values(reviewerWeights).reduce((sum, weight) => sum + weight, 0);
  const competencyWeightTotal = Object.values(competencyWeights).reduce((sum, weight) => sum + weight, 0);
  const selfResponses = assessmentQuestionItems.map((question) => ({
    competencyId: question.competencyId,
    score: selfRatings[question.competencyId] ?? 4,
    comment: selfComments[question.competencyId] ?? "",
  }));
  const selfAssessmentProgress = buildSelfAssessmentSummary(selfResponses);
  const selfCompletion = selfAssessmentProgress.completion;
  const selfAverage = selfAssessmentProgress.average;
  const selfVsOthersGap = Math.round(selfAverage * 20 - selectedScore);
  const selectedNominations = raterNominations.filter((nomination) => nomination.assigneeId === selectedAssessee.id);
  const approvedNominations = selectedNominations.filter((nomination) => nomination.status === "approved").length;
  const pendingNominations = selectedNominations.filter((nomination) => nomination.status === "pending").length;
  const selectedNominationSummary = buildNominationSummary(
    selectedNominations.map((nomination) => ({ reviewerGroup: nomination.group, status: nomination.status })),
  );
  const nominationValidation = validateRaterNomination({
    employeeId: selectedAssessee.id,
    assigneeId: selectedAssessee.id,
    nominations: selectedNominations.map((nomination) => ({
      reviewerId: nomination.reviewerId,
      reviewerGroup: nomination.group,
    })),
    allowedGroups: reviewerGroups.map((group) => group.key),
  });
  const leaderProgress = assessmentSubjects.map((assessee) => {
    const assigned = reviewerAssignments.filter((reviewer) => reviewer.assesseeId === assessee.id);
    const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
    const progress = completionForAssessee(assessee.id, reviewerAssignments);
    const release = releaseReadinessSummary(assigned);
    const result = assessmentResults.find((entry) => entry.assesseeId === assessee.id);

    return {
      assessee,
      assigned: assigned.length,
      submitted,
      progress,
      blocked: !release.ready,
      missingGroups: release.missingGroups,
      score: result ? weightedScore(result, reviewerWeights) : 0,
    };
  });
  const functionProgress = Object.values(
    leaderProgress.reduce<Record<string, { name: string; leaders: number; submitted: number; assigned: number; progressTotal: number }>>((acc, entry) => {
      const key = entry.assessee.functionName;
      acc[key] ??= { name: key, leaders: 0, submitted: 0, assigned: 0, progressTotal: 0 };
      acc[key].leaders += 1;
      acc[key].submitted += entry.submitted;
      acc[key].assigned += entry.assigned;
      acc[key].progressTotal += entry.progress;
      return acc;
    }, {}),
  ).map((entry) => ({ ...entry, progress: Math.round(entry.progressTotal / entry.leaders) }));
  const regionProgress = Object.values(
    leaderProgress.reduce<Record<string, { name: string; leaders: number; submitted: number; assigned: number; progressTotal: number }>>((acc, entry) => {
      const key = entry.assessee.region;
      acc[key] ??= { name: key, leaders: 0, submitted: 0, assigned: 0, progressTotal: 0 };
      acc[key].leaders += 1;
      acc[key].submitted += entry.submitted;
      acc[key].assigned += entry.assigned;
      acc[key].progressTotal += entry.progress;
      return acc;
    }, {}),
  ).map((entry) => ({ ...entry, progress: Math.round(entry.progressTotal / entry.leaders) }));
  const reviewerGroupProgress = reviewerGroups.map((group) => {
    const assigned = reviewerAssignments.filter((reviewer) => reviewer.group === group.key);
    const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
    const inProgress = assigned.filter((reviewer) => reviewer.status === "in_progress").length;
    const notStarted = assigned.filter((reviewer) => reviewer.status === "not_started").length;

    return {
      ...group,
      assigned: assigned.length,
      submitted,
      inProgress,
      notStarted,
      progress: assigned.length ? Math.round((submitted / assigned.length) * 100) : 0,
    };
  });
  const selectedReportSummary = buildAssessmentReportSummary(
    reviewerGroups.map((group) => ({
      reviewer_group: group.key,
      score: selectedResult.groupScores[group.key],
      status: selectedAssesseeReviewers.some((reviewer) => reviewer.group === group.key && reviewer.status === "submitted") ? "submitted" : "pending",
    })),
    reviewerWeights,
  );
  const cohortReportSummaries = assessmentResults.map((result) => {
    const assessee = assessmentSubjects.find((entry) => entry.id === result.assesseeId);
    const summary = buildAssessmentReportSummary(
      reviewerGroups.map((group) => ({
        reviewer_group: group.key,
        score: result.groupScores[group.key],
      })),
      reviewerWeights,
    );

    return {
      result,
      assessee,
      summary,
    };
  });
  const reportReadyCount = leaderProgress.filter((entry) => !entry.blocked).length;
  const cohortAverageScore = average(cohortReportSummaries.map((entry) => entry.summary.overallScore));
  const strongestCompetency = selectedResult.competencyScores.length
    ? selectedResult.competencyScores.reduce((best, item) => (item.score > best.score ? item : best))
    : undefined;
  const weakestCompetency = selectedResult.competencyScores.length
    ? selectedResult.competencyScores.reduce((lowest, item) => (item.score < lowest.score ? item : lowest))
    : undefined;
  const strongestCompetencyName = strongestCompetency ? competencyNameById.get(strongestCompetency.competencyId) ?? strongestCompetency.competencyId : "No competency";
  const weakestCompetencyName = weakestCompetency ? competencyNameById.get(weakestCompetency.competencyId) ?? weakestCompetency.competencyId : "No competency";

  useEffect(() => {
    if (reviewerGroupForm === "customer") return;

    if (reviewerGroupForm === "self") {
      setReviewerName(selectedAssessee.name === emptyAssessee.name ? "" : selectedAssessee.name);
      setReviewerEmail(selectedAssessee.email ?? "");
      setReviewerOrg(employeeStakeholderLabel(selectedAssesseeEmployee));
      return;
    }

    if ((reviewerGroupForm === "direct_report" || reviewerGroupForm === "colleague") && !selectedReviewerEmployeeId) {
      setReviewerName("");
      setReviewerEmail("");
      setReviewerOrg("");
      return;
    }

    if (selectedReviewerEmployee) {
      setReviewerName(selectedReviewerEmployee.name);
      setReviewerEmail(selectedReviewerEmployee.email);
      setReviewerOrg(employeeStakeholderLabel(selectedReviewerEmployee));
      return;
    }

    setReviewerName("");
    setReviewerEmail("");
    setReviewerOrg("");
  }, [reviewerGroupForm, selectedAssessee.name, selectedAssessee.email, selectedAssesseeEmployee, selectedReviewerEmployee, selectedReviewerEmployeeId]);

  async function handleReviewSubmit() {
    const payload = {
      token: submissionToken,
      responses: assessmentQuestionItems.map((question) => ({
        competencyId: question.competencyId,
        score: submissionScores[question.competencyId] ?? 4,
        comment: submissionComments[question.competencyId] ?? "Evidence provided",
      })),
    };

    if (!validateReviewPayload(payload)) {
      setSubmissionNotice("A valid review submission requires a token and complete responses with comments.");
      window.setTimeout(() => setSubmissionNotice(""), 3200);
      return;
    }

    try {
      const response = await fetch("/api/assessments/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to submit review");
      }

      setNotice(result?.submission?.persisted ? "Review captured and persisted." : "Review accepted by the submission endpoint.");
      setSubmissionNotice(`Review submitted successfully. Average score: ${result?.submission?.summary?.average ?? reviewSubmissionSummary.average}/5`);
      window.setTimeout(() => {
        setNotice("");
        setSubmissionNotice("");
      }, 3200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit review";
      setSubmissionNotice(message);
      window.setTimeout(() => setSubmissionNotice(""), 3200);
    }
  }

  async function handleCreateCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageAssessments) {
      setCycleNotice("Only HR admins and super admins can create or edit assessment cycles.");
      setTimeout(() => setCycleNotice(""), 3500);
      return;
    }

    try {
      const response = await fetch("/api/assessments/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cycleName,
          clientContext: cycleClient,
          startsOn: cycleStartsOn,
          closesOn: cycleClosesOn,
          levels: ["director", "assistant_director"],
          reviewerWeights,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to create assessment cycle");
      }

      if (payload.cycle) {
        const liveCycle = mapApiCycle(payload.cycle);
        setActiveCycle(liveCycle);
        setReviewerWeights(liveCycle.reviewerWeights);
      }
      setCycleNotice(`Assessment cycle created: ${payload.cycle?.name ?? cycleName}`);
      setDataSourceNotice(`Live Supabase cycle active: ${payload.cycle?.name ?? cycleName}.`);
      setTimeout(() => setCycleNotice(""), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create assessment cycle";
      setCycleNotice(message);
      setTimeout(() => setCycleNotice(""), 4000);
    }
  }

  function handleAddCompetency() {
    if (!canManageAssessments) {
      setFrameworkNotice("Only HR admins and super admins can update the assessment framework.");
      setTimeout(() => setFrameworkNotice(""), 3500);
      return;
    }

    if (!competencyDraftName.trim()) {
      setFrameworkNotice("Competency name is required.");
      setTimeout(() => setFrameworkNotice(""), 3500);
      return;
    }

    const id = competencyDraftName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `competency_${Date.now()}`;
    const nextCompetency: CompetencyDefinition = {
      id: `${id}_${Date.now()}`,
      name: competencyDraftName.trim(),
      group: competencyDraftGroup,
      level: competencyDraftLevel,
      function: competencyDraftFunction,
      description: competencyDraftDescription.trim(),
      active: true,
    };

    setConfiguredCompetencies((current) => [nextCompetency, ...current]);
    setCompetencyWeights((current) => ({ ...current, [nextCompetency.id]: 10 }));
    setCompetencyDraftName("");
    setCompetencyDraftDescription("");
    setCompetencyDraftGroup("leadership");
    setCompetencyDraftLevel("all");
    setCompetencyDraftFunction("all");
    setFrameworkNotice("Competency added to the draft framework.");
    setTimeout(() => setFrameworkNotice(""), 3500);
  }

  async function handleSelfSubmit() {
    const payload = {
      token: `self-${selectedAssessee.id}`,
      responses: selfResponses,
    };

    if (!selfAssessmentEnabled) {
      setSelfNotice("Self-assessment is disabled for this framework.");
      setTimeout(() => setSelfNotice(""), 3500);
      return;
    }

    if (!validateReviewPayload(payload)) {
      setSelfNotice("Complete every self-assessment rating with an evidence comment.");
      setTimeout(() => setSelfNotice(""), 3500);
      return;
    }

    if (!hasLiveCycle || !hasSelectedAssessee) {
      setSelfNotice("Create a live assessment cycle and select a participant before submitting self-assessment.");
      setTimeout(() => setSelfNotice(""), 3500);
      return;
    }

    try {
      const response = await fetch("/api/assessments/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: activeCycle.id,
          subjectId: selectedAssessee.id,
          assigneeId: selectedAssessee.id,
          entries: selfResponses,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to submit self-assessment");
      }

      setSelfSubmitted(true);
      setSelfNotice("Self-assessment captured and saved for HR review.");
      setTimeout(() => setSelfNotice(""), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit self-assessment";
      setSelfNotice(message);
      setTimeout(() => setSelfNotice(""), 3500);
    }
  }

  async function handleAddNomination() {
    if (!nomineeName.trim() || !nomineeEmail.trim()) {
      setNominationNotice("Nominee name and email are required.");
      setTimeout(() => setNominationNotice(""), 3500);
      return;
    }

    const nomineeEmailKey = nomineeEmail.trim().toLowerCase();
    const nextNomination: RaterNominationItem = {
      id: `nomination-${selectedAssessee.id}-${nomineeEmailKey}-${nomineeGroup}`,
      assigneeId: selectedAssessee.id,
      reviewerId: nomineeEmailKey,
      name: nomineeName.trim(),
      email: nomineeEmailKey,
      group: nomineeGroup,
      status: "pending",
    };

    const validation = validateRaterNomination({
      employeeId: selectedAssessee.id,
      assigneeId: selectedAssessee.id,
      nominations: [...selectedNominations, nextNomination].map((nomination) => ({
        reviewerId: nomination.reviewerId,
        reviewerGroup: nomination.group,
      })),
      allowedGroups: reviewerGroups.map((group) => group.key),
    });

    if (!validation.valid) {
      setNominationNotice(validation.errors[0] ?? "Nomination could not be added.");
      setTimeout(() => setNominationNotice(""), 3500);
      return;
    }

    if (!hasLiveCycle || !hasSelectedAssessee) {
      setNominationNotice("Create a live assessment cycle and select a participant before adding nominations.");
      setTimeout(() => setNominationNotice(""), 3500);
      return;
    }

    try {
      const response = await fetch("/api/assessments/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: activeCycle.id,
          subjectId: selectedAssessee.id,
          assigneeId: selectedAssessee.id,
          reviewerName: nomineeName,
          reviewerEmail: nomineeEmail,
          reviewerGroup: nomineeGroup,
          status: "pending",
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.errors?.[0] ?? result?.error ?? "Unable to add nomination");
      }

      setRaterNominations((current) => [result.nomination ? mapApiNomination(result.nomination) : nextNomination, ...current]);
      setNomineeName("");
      setNomineeEmail("");
      setNomineeGroup("colleague");
      setNominationNotice("Rater nomination saved for approval.");
      setTimeout(() => setNominationNotice(""), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add nomination";
      setNominationNotice(message);
      setTimeout(() => setNominationNotice(""), 3500);
    }
  }

  function handleNominationDecision(id: string, status: NominationStatus) {
    setRaterNominations((current) =>
      current.map((nomination) => (nomination.id === id ? { ...nomination, status } : nomination)),
    );
  }

  async function handleAddExistingEmployee(employeeId: string) {
    if (!canManageAssessments) {
      setParticipantNotice("Only HR admins and super admins can add assessment participants.");
      setTimeout(() => setParticipantNotice(""), 3500);
      return;
    }

    const employee = orgEmployeeOptions.find((entry) => entry.id === employeeId);
    if (!employee || !employee.name || !employee.email) {
      setParticipantNotice("Select a valid employee from the organisation roster.");
      setTimeout(() => setParticipantNotice(""), 3500);
      return;
    }

    if (!hasLiveCycle) {
      setParticipantNotice("Create a live assessment cycle before selecting participants.");
      setTimeout(() => setParticipantNotice(""), 4000);
      return;
    }

    const duplicate = assessmentSubjects.some((subject) => (subject.email ?? "").toLowerCase() === employee.email.toLowerCase());
    if (duplicate) {
      setParticipantNotice(`${employee.name} is already included in this assessment cycle.`);
      setTimeout(() => setParticipantNotice(""), 3500);
      return;
    }

    try {
      const response = await fetch("/api/assessments/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: activeCycle.id,
          name: employee.name,
          email: employee.email,
          level: (employee.cadre ?? "").toLowerCase().includes("director") ? "director" : "assistant_director",
          functionName: employee.department || employee.team || "Not specified",
          region: "",
          portfolio: employee.role || employee.team || employee.department || "",
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to add employee to the assessment cycle");
      }

      const saved = mapApiSubject(result.subject);
      setAssessmentSubjects((current) => [saved, ...current]);
      setSelectedAssesseeId(saved.id);
      setSelectedOrgEmployeeId("");
      setParticipantNotice(`${saved.name} added to the assessment cycle.`);
      setTimeout(() => setParticipantNotice(""), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add employee";
      setParticipantNotice(message);
      setTimeout(() => setParticipantNotice(""), 4000);
    }
  }

  async function handleImportParticipants() {
    if (!canManageAssessments) {
      setParticipantNotice("Only HR admins and super admins can import assessment participants.");
      setTimeout(() => setParticipantNotice(""), 3500);
      return;
    }

    const parsed = parseAssessmentParticipantCsv(participantCsv);
    if (!parsed.length) {
      setParticipantNotice("No valid participant rows found. Please use a CSV with name and email columns.");
      setTimeout(() => setParticipantNotice(""), 4000);
      return;
    }

    if (!hasLiveCycle) {
      setParticipantNotice("Create a live assessment cycle before importing participants.");
      setTimeout(() => setParticipantNotice(""), 4000);
      return;
    }

    try {
      const saved = await Promise.all(parsed.map(async (row, index) => {
        const response = await fetch("/api/assessments/subjects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId: activeCycle.id,
            name: row.name,
            email: row.email,
            level: row.level === "director" ? "director" : "assistant_director",
            functionName: row.functionName,
            region: row.region,
            portfolio: row.portfolio,
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error ?? `Unable to save participant row ${index + 1}`);
        }

        return mapApiSubject(result.subject);
      }));

      setAssessmentSubjects((current) => [...saved, ...current]);
      setSelectedAssesseeId(saved[0]?.id ?? selectedAssesseeId);
      setParticipantCsv("");
      setParticipantNotice(`${saved.length} participant${saved.length === 1 ? "" : "s"} saved into the assessment cycle.`);
      setTimeout(() => setParticipantNotice(""), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import participants";
      setParticipantNotice(message);
      setTimeout(() => setParticipantNotice(""), 4000);
    }
  }

  async function handleAddReviewer() {
    const effectiveName = reviewerGroupForm === "self"
      ? selectedAssessee.name
      : reviewerGroupForm === "customer"
        ? reviewerName
        : selectedReviewerEmployee?.name ?? "";
    const effectiveEmail = reviewerGroupForm === "self"
      ? selectedAssessee.email ?? ""
      : reviewerGroupForm === "customer"
        ? reviewerEmail
        : selectedReviewerEmployee?.email ?? "";
    const effectiveOrganisation = reviewerGroupForm === "customer"
      ? reviewerOrg
      : reviewerGroupForm === "self"
        ? employeeStakeholderLabel(selectedAssesseeEmployee)
        : employeeStakeholderLabel(selectedReviewerEmployee);
    const candidate = {
      reviewer_name: effectiveName,
      reviewer_email: effectiveEmail,
      reviewer_group: reviewerGroupForm,
    };

    if (!reviewerAssignmentIsValid(candidate)) {
      setReviewerNotice(reviewerGroupForm === "customer"
        ? "Please provide a customer reviewer name, valid email, and reviewer group."
        : "Select a valid employee for this reviewer group.");
      setTimeout(() => setReviewerNotice(""), 4000);
      return;
    }

    const nextReviewer: Reviewer & { id: string; assesseeId: string; name: string; group: ReviewerGroup; email: string; status: ReviewerStatus } = {
      id: `reviewer-${Date.now()}`,
      assesseeId: selectedAssessee.id,
      name: effectiveName.trim(),
      group: reviewerGroupForm,
      organisation: effectiveOrganisation.trim() || undefined,
      email: effectiveEmail.trim(),
      status: "not_started",
    };

    const invite = createSecureReviewerInvite(
      { name: nextReviewer.name, email: nextReviewer.email },
      assessmentScope,
      reviewerChannel,
    );

    if (!hasLiveCycle || !hasSelectedAssessee) {
      setReviewerNotice("Create a live assessment cycle and select a participant before assigning reviewers.");
      setTimeout(() => setReviewerNotice(""), 4000);
      return;
    }

    try {
      const response = await fetch("/api/assessments/reviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: activeCycle.id,
          subjectId: selectedAssessee.id,
          reviewerName: effectiveName,
          reviewerEmail: effectiveEmail,
          reviewerGroup: reviewerGroupForm,
          organisation: effectiveOrganisation,
          inviteChannel: reviewerChannel,
          assessmentScope,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to assign reviewer");
      }

      setReviewerAssignments((current) => [result.reviewer ? mapApiReviewer(result.reviewer) : nextReviewer, ...current]);
      setReviewerInvites((current) => [result.invite ?? invite, ...current]);
      setReviewerName("");
      setReviewerEmail("");
      setReviewerOrg("");
      setSelectedReviewerEmployeeId("");
      setReviewerGroupForm("line_manager");
      setReviewerChannel("email");
      setAssessmentScope("individual");
      setReviewerNotice("Reviewer assigned and invite generated.");
      setInviteNotice(`Secure link ready: ${result.invite?.secureLink ?? invite.secureLink}`);
      setTimeout(() => {
        setReviewerNotice("");
        setInviteNotice("");
      }, 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to assign reviewer";
      setReviewerNotice(message);
      setTimeout(() => setReviewerNotice(""), 4000);
    }
  }

  async function handleIssueInvite(reviewer: Reviewer) {
    if (!hasLiveCycle) {
      setInviteNotice("Create a live assessment cycle before issuing reviewer invites.");
      setTimeout(() => setInviteNotice(""), 5000);
      return;
    }

    try {
      const response = await fetch("/api/assessments/reviewers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId: reviewer.id,
          action: "issue_invite",
          inviteChannel: reviewer.inviteChannel,
          assessmentScope: reviewer.assessmentScope,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to issue reviewer invite");
      }

      if (result.reviewer) {
        setReviewerAssignments((current) =>
          current.map((entry) => entry.id === reviewer.id ? mapApiReviewer(result.reviewer) : entry),
        );
      }

      if (result.invite) {
        setReviewerInvites((current) => [result.invite, ...current.filter((entry) => entry.reviewerId !== reviewer.id)]);
        setInviteNotice(`Invite link issued: ${result.invite.secureLink}`);
      }
      setTimeout(() => setInviteNotice(""), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to issue reviewer invite";
      setInviteNotice(message);
      setTimeout(() => setInviteNotice(""), 5000);
    }
  }

  async function handleCopyInvite(link?: string) {
    if (!link) {
      setInviteNotice("Issue an invite before copying the secure link.");
      setTimeout(() => setInviteNotice(""), 3500);
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setInviteNotice("Invite link copied.");
    } catch {
      setInviteNotice(link);
    }
    setTimeout(() => setInviteNotice(""), 3500);
  }

  if (!canViewAssessments) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 py-10">
        <div className="w-full max-w-md rounded-[28px] border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-soft text-red">
            <ShieldCheck size={28} />
          </div>
          <h1 className="font-syne text-2xl font-black text-ink">Assessment access restricted</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This assessment workspace is limited to HR admins, super admins, and executive viewers.
            Ask the organisation admin to grant access for this account.
          </p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-ink px-4 text-sm font-black text-white"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper pb-28 text-ink">
      <section className="border-b border-ink/8 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-pulse-soft px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-pulse">
                  <ShieldCheck size={14} />
                  360 assessment
                </span>
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
                  {activeCycle.clientName}
                </span>
              </div>
              <h1 className="mt-4 font-syne text-3xl font-black leading-tight sm:text-4xl">
                Leadership 360 assessment command center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Multi-rater assessment for {levelLabel("director", assessmentLevelLabels)} and {levelLabel("assistant_director", assessmentLevelLabels)} across line managers, direct reports, colleagues, and customers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSendReminders}
                disabled={isSendingReminders || !canManageAssessments}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 text-sm font-black shadow-sm transition hover:border-pulse/40 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Mail size={16} />
                {isSendingReminders ? "Sending..." : "Send reminders"}
              </button>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white shadow-sm transition hover:bg-ink/90">
                <Download size={16} />
                Export pack
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Assessees", assessmentSubjects.length.toString(), `${levelLabel("director", assessmentLevelLabels)} and ${levelLabel("assistant_director", assessmentLevelLabels)}`],
              ["Completion", `${completion}%`, `${submittedCount}/${reviewerAssignments.length} reviewers submitted`],
              ["Portfolio score", `${portfolioScore}`, "Weighted by reviewer group"],
              ["Readiness", `${readiness}%`, "Coverage, response rate, report quality"],
              ["Close date", formatDate(activeCycle.closeDate), "Collection window"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-[18px] border border-ink/8 bg-paper px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
                <p className="mt-2 text-2xl font-black">{value}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-[18px] border border-ink/8 bg-paper p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-black transition",
                    selected ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-white hover:text-ink",
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 rounded-[18px] border border-ink/8 bg-paper px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>{dataSourceNotice}</span>
            <span className="inline-flex items-center gap-2 font-black text-ink">
              <span className={clsx("h-2.5 w-2.5 rounded-full", isHydratingAssessmentData ? "bg-amber-500" : hasLiveCycle ? "bg-green" : "bg-amber-500")} />
              {isHydratingAssessmentData ? "Syncing" : hasLiveCycle ? "Live data" : "No live cycle"}
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "director", "assistant_director"] as LevelFilter[]).map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={clsx(
                  "min-h-10 rounded-2xl px-4 text-sm font-black transition",
                  levelFilter === level ? "bg-pulse text-white" : "border border-ink/10 bg-white text-muted hover:text-ink",
                )}
              >
                {level === "all" ? "All levels" : levelLabel(level)}
              </button>
            ))}
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-ink/10 bg-white px-3">
            <SlidersHorizontal size={16} className="text-muted" />
            <select
              value={selectedAssesseeId}
              onChange={(event) => setSelectedAssesseeId(event.target.value)}
              className="min-h-9 bg-transparent text-sm font-black outline-none"
              aria-label="Selected assessee"
            >
              {visibleAssessees.map((assessee) => (
                <option key={assessee.id} value={assessee.id}>
                  {assessee.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === "command" && (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Admin progress</p>
                    <h2 className="mt-2 font-syne text-2xl font-black">Cycle completion dashboard</h2>
                  </div>
                  <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", readiness >= 75 ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                    {readiness}% ready
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {leaderProgress.map((entry) => (
                    <button
                      type="button"
                      key={entry.assessee.id}
                      onClick={() => setSelectedAssesseeId(entry.assessee.id)}
                      className={clsx(
                        "rounded-[18px] border p-4 text-left transition",
                        selectedAssessee.id === entry.assessee.id ? "border-pulse bg-pulse-soft" : "border-ink/8 bg-paper hover:border-pulse/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{entry.assessee.name}</p>
                          <p className="mt-1 truncate text-xs text-muted">{entry.assessee.functionName} / {entry.assessee.region}</p>
                        </div>
                        <span className={clsx("rounded-full px-2 py-1 text-xs font-black", entry.blocked ? "bg-amber-50 text-amber-700" : "bg-green-soft text-green")}>
                          {entry.blocked ? "Blocked" : "Ready"}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-pulse" style={{ width: `${clampPercent(entry.progress)}%` }} />
                        </div>
                        <span className="text-xs font-black text-muted">{entry.progress}%</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs font-bold text-muted">
                        <span>{entry.submitted}/{entry.assigned} submitted</span>
                        <span>Score {entry.score}</span>
                      </div>
                      {entry.missingGroups.length > 0 && (
                        <p className="mt-2 truncate text-xs font-bold text-amber-700">Missing: {entry.missingGroups.join(", ").replaceAll("_", " ")}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer groups</p>
                    <h3 className="mt-2 text-xl font-black">Submission status</h3>
                  </div>
                  <Users className="text-pulse" size={20} />
                </div>
                <div className="mt-5 space-y-4">
                  {reviewerGroupProgress.map((group) => (
                    <div key={group.key} className={clsx("border-l-4 bg-paper p-4", groupTone[group.key])}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{group.label}</p>
                          <p className="mt-1 text-xs text-muted">
                            {group.submitted} submitted / {group.inProgress} in progress / {group.notStarted} not started
                          </p>
                        </div>
                        <span className="text-sm font-black">{group.progress}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${clampPercent(group.progress)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Function view</p>
                <h3 className="mt-2 text-xl font-black">Department progress</h3>
                <div className="mt-5 space-y-3">
                  {functionProgress.map((entry) => (
                    <div key={entry.name} className="rounded-[18px] bg-paper p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{entry.name}</p>
                          <p className="mt-1 text-xs text-muted">{entry.leaders} leader{entry.leaders === 1 ? "" : "s"} / {entry.submitted}/{entry.assigned} submitted</p>
                        </div>
                        <span className="text-sm font-black">{entry.progress}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-green" style={{ width: `${clampPercent(entry.progress)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Regional view</p>
                <h3 className="mt-2 text-xl font-black">Coverage by region</h3>
                <div className="mt-5 space-y-3">
                  {regionProgress.map((entry) => (
                    <div key={entry.name} className="rounded-[18px] bg-paper p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{entry.name}</p>
                          <p className="mt-1 text-xs text-muted">{entry.leaders} leader{entry.leaders === 1 ? "" : "s"} / {entry.submitted}/{entry.assigned} submitted</p>
                        </div>
                        <span className="text-sm font-black">{entry.progress}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-pulse" style={{ width: `${clampPercent(entry.progress)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Selected leader</p>
                    <h2 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {levelLabel(selectedAssessee.level)} - {selectedAssessee.functionName} - {selectedAssessee.region}
                    </p>
                  </div>
                  <div className={clsx("grid h-20 w-20 place-items-center rounded-[20px] text-2xl font-black", scoreTone(selectedScore))}>
                    {selectedScore}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{selectedAssessee.portfolio}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {reviewerGroups.map((group) => (
                    <div key={group.key} className={clsx("border-l-4 bg-paper p-3", groupTone[group.key])}>
                      <p className="text-xs font-bold text-muted">{group.shortLabel}</p>
                      <p className="mt-1 text-xl font-black">{selectedResult.groupScores[group.key]}</p>
                      <p className="text-[11px] text-muted">Weight {reviewerWeights[group.key]}%</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Competency heatmap</p>
                    <h3 className="mt-1 text-lg font-black">Leadership signals</h3>
                  </div>
                  <Target className="text-pulse" size={20} />
                </div>
                <div className="mt-5 space-y-4">
                  {selectedResult.competencyScores.map((item) => {
                    const competencyName = competencyNameById.get(item.competencyId) ?? item.competencyId;
                    const delta = item.score - item.benchmark;
                    return (
                      <div key={item.competencyId}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black">{competencyName}</p>
                          <p className={clsx("text-sm font-black", delta >= 0 ? "text-green" : "text-pulse")}>
                            {item.score} / {delta >= 0 ? "+" : ""}
                            {delta}
                          </p>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/8">
                          <div className="h-full rounded-full bg-pulse" style={{ width: `${item.score}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">Benchmark {item.benchmark}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>

              <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Cycle health</p>
                    <h3 className="mt-1 text-lg font-black">{activeCycle.name}</h3>
                  </div>
                  <div className={clsx("rounded-2xl px-3 py-2 text-sm font-black", releaseSummary.ready ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700") }>
                    {releaseSummary.ready ? "Ready" : "Blocked"}
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {reviewerGroups.map((group) => {
                    const value = completionByGroup(group.key, reviewerAssignments);
                    return (
                      <div key={group.key}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-black">{group.label}</span>
                          <span className="font-black text-muted">{value}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/8">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-2xl bg-paper p-3 text-sm text-muted">
                  <span className="font-black text-ink">
                    {releaseSummary.remaining === 0 ? "All reviewers submitted" : `${releaseSummary.remaining} reviewer${releaseSummary.remaining === 1 ? "" : "s"} outstanding`}
                  </span>
                  {releaseSummary.missingGroups.length > 0 && (
                    <span className="mt-1 block text-amber-700">
                      Missing groups: {releaseSummary.missingGroups.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Cycle setup</p>
                <h3 className="mt-2 text-lg font-black">Create a new assessment cycle</h3>
                {cycleNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{cycleNotice}</div>}
                <form onSubmit={handleCreateCycle} className="mt-4 space-y-3">
                  <label className="block text-sm font-black text-muted">
                    Cycle name
                    <input
                      value={cycleName}
                      onChange={(event) => setCycleName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Leadership 360 Assessment"
                    />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Client / organisation
                    <input
                      value={cycleClient}
                      onChange={(event) => setCycleClient(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Organisation name"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-black text-muted">
                      Start date
                      <input
                        type="date"
                        value={cycleStartsOn}
                        onChange={(event) => setCycleStartsOn(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      />
                    </label>
                    <label className="block text-sm font-black text-muted">
                      Close date
                      <input
                        type="date"
                        value={cycleClosesOn}
                        onChange={(event) => setCycleClosesOn(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white shadow-sm transition hover:bg-ink/90"
                  >
                    <SlidersHorizontal size={16} />
                    Create cycle
                  </button>
                </form>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">AI calibration notes</p>
                <div className="mt-4 space-y-3">
                  {selectedResult.strongestSignals.map((signal) => (
                    <div key={signal} className="flex gap-3 rounded-2xl bg-green-soft p-3 text-sm text-green">
                      <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
                      <span className="font-semibold">{signal}</span>
                    </div>
                  ))}
                  {selectedResult.developmentSignals.map((signal) => (
                    <div key={signal} className="flex gap-3 rounded-2xl bg-pulse-soft p-3 text-sm text-pulse">
                      <Star className="mt-0.5 shrink-0" size={16} />
                      <span className="font-semibold">{signal}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-ink/8 bg-paper p-3 text-sm text-muted">
                  <span className="font-black text-ink">{riskCount} portfolio risk notes</span> need HR calibration before reports are released.
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeTab === "participants" && (
          <div className="space-y-5">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Participants</p>
              <h3 className="mt-2 text-xl font-black">Add leaders to the assessment cycle</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Start by selecting people already in your Pulse organisation. CSV import remains available for external or bulk onboarding.
              </p>
              {participantNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{participantNotice}</div>}

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-ink/8 bg-paper p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex-1 text-sm font-black text-muted">
                      Existing {orgDisplayName} employees
                      <select
                        value={selectedOrgEmployeeId}
                        onChange={(event) => setSelectedOrgEmployeeId(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      >
                        <option value="">Select an employee</option>
                        {availableOrgEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} ({employee.email})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddExistingEmployee(selectedOrgEmployeeId)}
                      disabled={!selectedOrgEmployeeId}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Users size={16} />
                      Add to cycle
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    {availableOrgEmployees.length
                      ? `${availableOrgEmployees.length} employee${availableOrgEmployees.length === 1 ? "" : "s"} available in the dropdown.`
                      : orgEmployeeOptions.length
                        ? "All organisation employees are already in this cycle."
                        : "No existing employees are available yet for this organisation."}
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed border-ink/10 bg-paper p-3">
                  <p className="text-sm font-black text-ink">Or import via CSV</p>
                  <textarea
                    value={participantCsv}
                    onChange={(event) => setParticipantCsv(event.target.value)}
                    className="mt-3 min-h-24 w-full resize-y rounded-2xl border border-ink/8 bg-white p-3 text-sm outline-none transition placeholder:text-muted focus:border-pulse/50"
                    placeholder="name,email,level,function_name,region,portfolio"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleImportParticipants}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white"
                    >
                      <Users size={16} />
                      Import participants
                    </button>
                    <button
                      type="button"
                      onClick={() => setParticipantCsv("name,email,level,function_name,region,portfolio\n")}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 text-sm font-black text-ink"
                    >
                      Add CSV header
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer workflow</p>
                  <h3 className="mt-2 text-xl font-black">Assign reviewers for {selectedAssessee.name}</h3>
                </div>
                <div className="rounded-2xl bg-paper px-3 py-2 text-sm font-black text-muted">
                  {reviewerSummary.coverage}% coverage
                </div>
              </div>

              {reviewerNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{reviewerNotice}</div>}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-black text-muted md:col-span-2">
                  Assessment scope
                  <select
                    value={assessmentScope}
                    onChange={(event) => setAssessmentScope(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                  >
                    {scopeOptions.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted">
                    {selectedScopeOption.description}
                  </span>
                </label>
                <label className="block text-sm font-black text-muted md:col-span-2">
                  Reviewer group
                  <select
                    value={reviewerGroupForm}
                    onChange={(event) => {
                      setReviewerGroupForm(event.target.value as ReviewerGroup);
                      setSelectedReviewerEmployeeId("");
                      if (event.target.value === "customer") {
                        setReviewerName("");
                        setReviewerEmail("");
                        setReviewerOrg("");
                      }
                    }}
                    className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                  >
                    {reviewerGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.label}
                      </option>
                    ))}
                  </select>
                </label>

                {reviewerGroupForm === "self" ? (
                  <div className="rounded-2xl border border-ink/8 bg-paper p-3 text-sm text-muted md:col-span-2">
                    <span className="font-black text-ink">{selectedAssessee.name}</span> will be assigned as their own self-reviewer.
                  </div>
                ) : reviewerGroupForm === "line_manager" ? (
                  <div className="rounded-2xl border border-ink/8 bg-paper p-3 text-sm text-muted md:col-span-2">
                    {selectedLineManager ? (
                      <>
                        <span className="font-black text-ink">{selectedLineManager.name}</span> - {selectedLineManager.email} - {employeeStakeholderLabel(selectedLineManager)}
                      </>
                    ) : (
                      "No line manager is recorded for this participant in the employee table."
                    )}
                  </div>
                ) : reviewerGroupForm === "direct_report" || reviewerGroupForm === "colleague" ? (
                  <label className="block text-sm font-black text-muted md:col-span-2">
                    Select {reviewerGroupForm === "direct_report" ? "a direct report" : "a colleague"}
                    <select
                      value={selectedReviewerEmployeeId}
                      onChange={(event) => setSelectedReviewerEmployeeId(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    >
                      <option value="">Choose from {orgDisplayName} employees</option>
                      {reviewerEmployeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name} ({employee.email})
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted">
                      {reviewerEmployeeOptions.length
                        ? `${reviewerEmployeeOptions.length} matching employee${reviewerEmployeeOptions.length === 1 ? "" : "s"} found.`
                        : "No matching employees found from the current org chart."}
                    </span>
                  </label>
                ) : (
                  <>
                    <label className="block text-sm font-black text-muted">
                      Reviewer name
                      <input
                        value={reviewerName}
                        onChange={(event) => setReviewerName(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                        placeholder="Customer or partner name"
                      />
                    </label>
                    <label className="block text-sm font-black text-muted">
                      Reviewer email
                      <input
                        value={reviewerEmail}
                        onChange={(event) => setReviewerEmail(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                        placeholder="reviewer@company.com"
                      />
                    </label>
                    <label className="block text-sm font-black text-muted md:col-span-2">
                      Organisation / stakeholder
                      <input
                        value={reviewerOrg}
                        onChange={(event) => setReviewerOrg(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                        placeholder="External account, customer organisation, or partner"
                      />
                    </label>
                  </>
                )}
                <label className="block text-sm font-black text-muted md:col-span-2">
                  Review channel
                  <select
                    value={reviewerChannel}
                    onChange={(event) => setReviewerChannel(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="portal">Portal</option>
                  </select>
                  <span className="mt-1 block text-xs text-muted">
                    {whatsappEnabled ? "This delivery channel is enabled for reviewer links." : "This delivery channel is not supported yet."}
                  </span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAddReviewer}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white"
                >
                  <Users size={16} />
                  Add reviewer
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer invitation workflow</p>
                    <h3 className="mt-2 text-xl font-black">Secure links and delivery queue</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      invitationQueue
                        .filter((entry) => entry.status === "draft" || entry.status === "expired")
                        .slice(0, 5)
                        .forEach((entry) => void handleIssueInvite(entry.reviewer));
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-white px-3 text-xs font-black text-ink transition hover:border-pulse/40"
                  >
                    <Send size={14} />
                    Issue pending
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {[
                    ["Total", invitationStats.total],
                    ["Sent/opened", invitationStats.sent],
                    ["Submitted", invitationStats.submitted],
                    ["Needs invite", invitationStats.needsInvite],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-paper p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">{label}</p>
                      <p className="mt-1 text-xl font-black">{value}</p>
                    </div>
                  ))}
                </div>

                {inviteNotice && <div className="mt-3 rounded-2xl bg-pulse-soft p-3 text-sm font-black text-pulse break-all">{inviteNotice}</div>}

                <div className="mt-4 space-y-3">
                  {invitationQueue.map((entry) => {
                    const meta = inviteStatusMeta[entry.status];
                    const canIssue = entry.status !== "submitted" && entry.reviewer.status !== "submitted";
                    return (
                      <div key={entry.reviewer.id} className="rounded-2xl border border-ink/8 bg-paper p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-black">{entry.reviewer.name}</p>
                              <span className={clsx("rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1", meta.className)}>
                                {meta.label}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted">{entry.reviewer.email}</p>
                            <p className="mt-2 text-xs text-muted">
                              {reviewerGroupLabel(entry.reviewer.group)} / {entry.channel} / {entry.scope.replace("_", " ")}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleIssueInvite(entry.reviewer)}
                              disabled={!canIssue}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 bg-white text-ink transition hover:border-pulse/40 disabled:cursor-not-allowed disabled:opacity-40"
                              title={entry.secureLink ? "Reissue invite link" : "Issue invite link"}
                              aria-label={entry.secureLink ? "Reissue invite link" : "Issue invite link"}
                            >
                              <RefreshCw size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyInvite(entry.secureLink)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 bg-white text-ink transition hover:border-pulse/40"
                              title="Copy invite link"
                              aria-label="Copy invite link"
                            >
                              <Copy size={15} />
                            </button>
                            {entry.secureLink && (
                              <a
                                href={entry.secureLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white transition hover:bg-ink/90"
                                title="Open invite link"
                                aria-label="Open invite link"
                              >
                                <ExternalLink size={15} />
                              </a>
                            )}
                          </div>
                        </div>
                        {entry.secureLink ? (
                          <p className="mt-3 break-all rounded-xl bg-white p-2 text-xs text-muted">{entry.secureLink}</p>
                        ) : (
                          <p className="mt-3 rounded-xl bg-white p-2 text-xs font-bold text-muted">No visible link yet. Issue an invite to generate a fresh secure token.</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 size={12} />
                            {entry.expiresAt ? `Expires ${formatDate(entry.expiresAt)}` : "No expiry set"}
                          </span>
                          {invitationStats.expired > 0 && entry.status === "expired" && <span className="font-black text-red-700">Fresh link required</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Live submission progress</p>
                <h3 className="mt-2 text-xl font-black">Submitted reviews</h3>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black">{submittedCount}/{reviewerAssignments.length}</p>
                    <p className="mt-1 text-xs text-muted">Actual submitted reviewer assignments in this cycle</p>
                  </div>
                  <span className="rounded-2xl bg-green-soft px-3 py-2 text-xs font-black text-green">{completion}% complete</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {visibleAssessees.map((assessee) => {
                const result = assessmentResults.find((entry) => entry.assesseeId === assessee.id);
                const assesseeReviewers = reviewerAssignments.filter((reviewer) => reviewer.assesseeId === assessee.id);
                return (
                  <div key={assessee.id} className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-sm font-black text-white">
                          {assessee.initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black">{assessee.name}</h3>
                          <p className="truncate text-sm text-muted">
                            {levelLabel(assessee.level)} - {assessee.functionName}
                          </p>
                        </div>
                      </div>
                      <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", scoreTone(result ? weightedScore(result) : 0))}>
                        {result ? weightedScore(result) : 0}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/8">
                        <div className="h-full rounded-full bg-green" style={{ width: `${completionForAssessee(assessee.id, reviewerAssignments)}%` }} />
                      </div>
                      <span className="text-sm font-black">{completionForAssessee(assessee.id, reviewerAssignments)}%</span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {assesseeReviewers.map((reviewer) => (
                        <div key={reviewer.id} className="rounded-2xl border border-ink/8 bg-paper p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-black">{reviewer.name}</p>
                            <span className={clsx("shrink-0 rounded-full px-2 py-1 text-[10px] font-black ring-1", statusMeta[reviewer.status].className)}>
                              {statusMeta[reviewer.status].label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{reviewerGroupLabel(reviewer.group)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "questions" && (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Organisation framework</p>
                    <h3 className="mt-2 text-xl font-black">{assessmentFramework.name}</h3>
                  </div>
                  <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", assessmentFramework.ready ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                    {assessmentFramework.ready ? "Ready" : "Draft"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3">
                  <label className="block text-sm font-black text-muted">
                    Framework name
                    <input
                      value={frameworkName}
                      onChange={(event) => setFrameworkName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    />
                  </label>
                  <div className="rounded-2xl border border-ink/8 bg-paper p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-muted">Assessment level naming</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-black text-muted">
                        Level 1 label
                        <input
                          value={assessmentLevelLabelDrafts[0] ?? ""}
                          onChange={(event) => setAssessmentLevelLabelDrafts((current) => [event.target.value, current[1] ?? ""]) }
                          className="mt-1 w-full rounded-2xl border border-ink/8 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                          placeholder={levelLabel("director", assessmentLevelLabels)}
                        />
                      </label>
                      <label className="block text-sm font-black text-muted">
                        Level 2 label
                        <input
                          value={assessmentLevelLabelDrafts[1] ?? ""}
                          onChange={(event) => setAssessmentLevelLabelDrafts((current) => [current[0] ?? "", event.target.value]) }
                          className="mt-1 w-full rounded-2xl border border-ink/8 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                          placeholder={levelLabel("assistant_director", assessmentLevelLabels)}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted">Leave blank to fall back to Level 1 / Level 2.</p>
                      <button
                        type="button"
                        onClick={handleSaveAssessmentLevelNames}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-ink px-3 text-xs font-black text-white"
                      >
                        Save labels
                      </button>
                    </div>
                    {orgLevelLabelNotice && <div className="mt-3 rounded-2xl bg-green-soft p-2 text-xs font-black text-green">{orgLevelLabelNotice}</div>}
                  </div>
                  <label className="block text-sm font-black text-muted">
                    Business function
                    <select
                      value={frameworkFunction}
                      onChange={(event) => setFrameworkFunction(event.target.value as AssessmentFunction)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    >
                      {assessmentFunctions.map((item) => (
                        <option key={item} value={item}>
                          {item.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Levels", assessmentFramework.levels.map((level) => levelLabel(level as AssessmentLevel, assessmentLevelLabels)).join(", ")],
                    ["Functions", assessmentFramework.businessFunctions.join(", ").replaceAll("_", " ")],
                    ["Competencies", assessmentFramework.competencies.length.toString()],
                    ["Raters", `${raterCoverage.submitted}/${raterCoverage.total} submitted`],
                    ["Coverage gaps", raterCoverage.missingGroups.length ? raterCoverage.missingGroups.join(", ").replaceAll("_", " ") : "none"],
                    ["Readiness", raterCoverage.ready ? "complete" : "in progress"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-paper p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
                      <p className="mt-2 text-sm font-black capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Self-assessment</p>
                <h3 className="mt-2 text-xl font-black">Participation mode</h3>
                <div className="mt-5 grid gap-3">
                  <label className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3 text-sm font-black">
                    Enabled
                    <input type="checkbox" checked={selfAssessmentEnabled} onChange={(event) => setSelfAssessmentEnabled(event.target.checked)} className="h-5 w-5 accent-pulse" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3 text-sm font-black">
                    Required
                    <input type="checkbox" checked={selfAssessmentRequired} onChange={(event) => setSelfAssessmentRequired(event.target.checked)} className="h-5 w-5 accent-pulse" />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Minimum self responses
                    <input
                      type="number"
                      min="1"
                      value={selfMinimumResponses}
                      onChange={(event) => setSelfMinimumResponses(Number(event.target.value))}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    />
                  </label>
                  <div className={clsx("rounded-2xl p-3 text-sm font-black", selfAssessmentValidation.valid ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                    {selfAssessmentValidation.valid ? "Self-assessment setup is valid." : selfAssessmentValidation.errors.join(" ")}
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer weights</p>
                <h3 className="mt-2 text-xl font-black">Group weighting</h3>
                <div className="mt-5 space-y-4">
                  {reviewerGroups.map((group) => (
                    <label key={group.key} className="block text-sm font-black text-muted">
                      <span className="flex items-center justify-between gap-3">
                        {group.label}
                        <span className="text-ink">{reviewerWeights[group.key]}%</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        value={reviewerWeights[group.key]}
                        onChange={(event) => setReviewerWeights((current) => ({ ...current, [group.key]: Number(event.target.value) }))}
                        className="mt-2 w-full accent-pulse"
                      />
                    </label>
                  ))}
                </div>
                <div className={clsx("mt-4 rounded-2xl p-3 text-sm font-black", reviewerWeightTotal === 100 ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                  Total reviewer weight: {reviewerWeightTotal}%
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Competency builder</p>
                <h3 className="mt-2 text-xl font-black">Create framework competency</h3>
                {frameworkNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{frameworkNotice}</div>}
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-black text-muted md:col-span-2">
                    Name
                    <input
                      value={competencyDraftName}
                      onChange={(event) => setCompetencyDraftName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Stakeholder trust"
                    />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Group
                    <select value={competencyDraftGroup} onChange={(event) => setCompetencyDraftGroup(event.target.value as CompetencyDefinition["group"])} className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50">
                      {competencyGroups.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Level
                    <select value={competencyDraftLevel} onChange={(event) => setCompetencyDraftLevel(event.target.value as AssessmentLevel | "all")} className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50">
                      <option value="all">All</option>
                      <option value="director">{levelLabel("director", assessmentLevelLabels)}</option>
                      <option value="assistant_director">{levelLabel("assistant_director", assessmentLevelLabels)}</option>
                    </select>
                  </label>
                  <label className="block text-sm font-black text-muted md:col-span-2">
                    Function
                    <select value={competencyDraftFunction} onChange={(event) => setCompetencyDraftFunction(event.target.value as AssessmentFunction)} className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50">
                      {assessmentFunctions.map((item) => (
                        <option key={item} value={item}>{item.replace("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-black text-muted md:col-span-2">
                    Description
                    <textarea
                      value={competencyDraftDescription}
                      onChange={(event) => setCompetencyDraftDescription(event.target.value)}
                      className="mt-1 min-h-20 w-full resize-none rounded-2xl border border-ink/8 bg-paper p-3 text-sm text-ink outline-none transition focus:border-pulse/50"
                    />
                  </label>
                </div>
                <button type="button" onClick={handleAddCompetency} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white">
                  <ClipboardList size={16} />
                  Add competency
                </button>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Framework library</p>
                    <h3 className="mt-2 text-xl font-black">Mapped competencies</h3>
                  </div>
                  <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", competencyWeightTotal === 100 ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                    {competencyWeightTotal}%
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  {configuredCompetencies.map((competency) => (
                    <div key={competency.id} className="rounded-[18px] border border-ink/8 bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{competency.name}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{competency.description}</p>
                          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                            {competency.group} / {competency.level?.replace("_", " ")} / {competency.function?.replace("_", " ")}
                          </p>
                        </div>
                        <Building2 className="shrink-0 text-pulse" size={18} />
                      </div>
                      <label className="mt-4 block text-sm font-black text-muted">
                        <span className="flex items-center justify-between gap-3">
                          Competency weight
                          <span className="text-ink">{competencyWeights[competency.id] ?? 0}%</span>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={competencyWeights[competency.id] ?? 0}
                          onChange={(event) => setCompetencyWeights((current) => ({ ...current, [competency.id]: Number(event.target.value) }))}
                          className="mt-2 w-full accent-pulse"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "self" && (
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Self-assessment</p>
                    <h3 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{selectedAssessee.portfolio}</p>
                  </div>
                  <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", selfSubmitted ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                    {selfSubmitted ? "Submitted" : "In progress"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-paper p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Completion</p>
                    <p className="mt-2 text-3xl font-black">{selfCompletion}%</p>
                  </div>
                  <div className="rounded-2xl bg-paper p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Self score</p>
                    <p className="mt-2 text-3xl font-black">{selfAverage}/5</p>
                  </div>
                  <div className={clsx("rounded-2xl p-4", selfVsOthersGap >= 0 ? "bg-pulse-soft text-pulse" : "bg-amber-50 text-amber-700")}>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Gap</p>
                    <p className="mt-2 text-3xl font-black">{selfVsOthersGap >= 0 ? "+" : ""}{selfVsOthersGap}</p>
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/8">
                  <div className="h-full rounded-full bg-pulse" style={{ width: `${selfCompletion}%` }} />
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Comparison signals</p>
                <h3 className="mt-2 text-xl font-black">Self versus 360 view</h3>
                <div className="mt-5 space-y-3">
                  {selectedResult.competencyScores.slice(0, 4).map((item) => {
                    const competencyName = competencyNameById.get(item.competencyId) ?? item.competencyId;
                    const selfScore = (selfRatings[item.competencyId] ?? 4) * 20;
                    const gap = Math.round(selfScore - item.score);
                    return (
                      <div key={item.competencyId} className="rounded-2xl bg-paper p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black">{competencyName}</p>
                          <span className={clsx("rounded-full px-2 py-1 text-xs font-black", gap >= 0 ? "bg-pulse-soft text-pulse" : "bg-amber-50 text-amber-700")}>
                            {gap >= 0 ? "+" : ""}{gap}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-muted">
                          <span>Self {selfScore}</span>
                          <span>Others {item.score}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Leader input</p>
                  <h3 className="mt-2 text-xl font-black">Complete self-assessment</h3>
                </div>
                <button
                  type="button"
                  onClick={handleSelfSubmit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white"
                >
                  <Send size={16} />
                  Submit self view
                </button>
              </div>
              {selfNotice && <div className="mt-4 rounded-2xl bg-pulse-soft p-3 text-sm font-black text-pulse">{selfNotice}</div>}
              <div className="mt-5 space-y-5">
                {assessmentQuestionItems.map((question) => {
                  const competency = configuredCompetencies.find((item) => item.id === question.competencyId);
                  return (
                    <div key={question.id} className="rounded-[18px] border border-ink/8 bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{competency?.name}</p>
                          <p className="mt-1 text-sm leading-6 text-muted">{question.prompt}</p>
                        </div>
                        <span className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-pulse">
                          {selfRatings[question.competencyId]}/5
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={selfRatings[question.competencyId]}
                        onChange={(event) => setSelfRatings((current) => ({ ...current, [question.competencyId]: Number(event.target.value) }))}
                        className="mt-4 w-full accent-pulse"
                        aria-label={`Self rating for ${competency?.name}`}
                      />
                      <textarea
                        value={selfComments[question.competencyId] ?? ""}
                        onChange={(event) => setSelfComments((current) => ({ ...current, [question.competencyId]: event.target.value }))}
                        placeholder="Evidence, example, or reflection"
                        className="mt-3 min-h-20 w-full resize-none rounded-2xl border border-ink/8 bg-white p-3 text-sm outline-none transition placeholder:text-muted focus:border-pulse/50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "nominations" && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Rater nomination</p>
                <h3 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{levelLabel(selectedAssessee.level)} - {selectedAssessee.functionName} - {selectedAssessee.region}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-paper p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Nominated</p>
                    <p className="mt-2 text-3xl font-black">{selectedNominations.length}</p>
                  </div>
                  <div className="rounded-2xl bg-green-soft p-4 text-green">
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Approved</p>
                    <p className="mt-2 text-3xl font-black">{approvedNominations}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 text-amber-700">
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Pending</p>
                    <p className="mt-2 text-3xl font-black">{pendingNominations}</p>
                  </div>
                </div>
                <div className={clsx("mt-5 rounded-2xl p-3 text-sm font-black", nominationValidation.valid && selectedNominationSummary.ready ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                  {nominationValidation.valid && selectedNominationSummary.ready
                    ? "Nomination list passes validation and has approved group coverage."
                    : nominationValidation.errors[0] ?? `Approval gaps: ${selectedNominationSummary.missingGroups.join(", ").replaceAll("_", " ")}`}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Nominate rater</p>
                <h3 className="mt-2 text-xl font-black">Add reviewer candidate</h3>
                {nominationNotice && <div className="mt-3 rounded-2xl bg-pulse-soft p-3 text-sm font-black text-pulse">{nominationNotice}</div>}
                <div className="mt-5 grid gap-3">
                  <label className="block text-sm font-black text-muted">
                    Name
                    <input
                      value={nomineeName}
                      onChange={(event) => setNomineeName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Nominee name"
                    />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Email
                    <input
                      value={nomineeEmail}
                      onChange={(event) => setNomineeEmail(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="nominee@company.com"
                    />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Reviewer group
                    <select
                      value={nomineeGroup}
                      onChange={(event) => setNomineeGroup(event.target.value as ReviewerGroup)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    >
                      {reviewerGroups.map((group) => (
                        <option key={group.key} value={group.key}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" onClick={handleAddNomination} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white">
                  <Users size={16} />
                  Add nomination
                </button>
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Approval queue</p>
                  <h3 className="mt-2 text-xl font-black">Manager / HR review</h3>
                </div>
                <span className="rounded-2xl bg-paper px-3 py-2 text-sm font-black text-muted">
                  {approvedNominations}/{selectedNominations.length} approved
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {selectedNominations.length === 0 && (
                  <div className="rounded-[18px] border border-dashed border-ink/15 bg-paper p-6 text-sm font-semibold text-muted">
                    No nominations for this leader yet.
                  </div>
                )}
                {selectedNominations.map((nomination) => (
                  <div key={nomination.id} className="rounded-[18px] border border-ink/8 bg-paper p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{nomination.name}</p>
                        <p className="truncate text-xs text-muted">{nomination.email}</p>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">{reviewerGroupLabel(nomination.group)}</p>
                      </div>
                      <span
                        className={clsx(
                          "w-fit rounded-full px-3 py-1 text-xs font-black capitalize",
                          nomination.status === "approved" && "bg-green-soft text-green",
                          nomination.status === "pending" && "bg-amber-50 text-amber-700",
                          nomination.status === "rejected" && "bg-red-50 text-red-600",
                        )}
                      >
                        {nomination.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleNominationDecision(nomination.id, "approved")}
                        className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-ink px-3 text-sm font-black text-white"
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNominationDecision(nomination.id, "rejected")}
                        className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-ink/10 bg-white px-3 text-sm font-black text-muted"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "review" && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer context</p>
              <h3 className="mt-2 text-xl font-black">Adaptive 360 form</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                The same competency model can render differently for internal leaders and external customers while keeping scores comparable.
              </p>
              <div className="mt-5 grid gap-2">
                {reviewerGroups.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => setReviewerGroup(group.key)}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      reviewerGroup === group.key ? "border-pulse bg-pulse-soft" : "border-ink/8 bg-paper hover:border-pulse/40",
                    )}
                  >
                    <p className="text-sm font-black">{group.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{group.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Preview response</p>
                  <h3 className="mt-2 text-xl font-black">{reviewerGroupLabel(reviewerGroup)} reviewer</h3>
                </div>
                <button
                  onClick={handleReviewSubmit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white"
                >
                  <Send size={16} />
                  Submit review
                </button>
              </div>
              <div className="mt-4 rounded-[18px] border border-ink/8 bg-paper p-4">
                <label className="block text-sm font-black text-muted">
                  Review token
                  <input
                    value={submissionToken}
                    onChange={(event) => setSubmissionToken(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-ink/8 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                    placeholder="reviewer-token-123"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
                  <span className="text-sm font-black">Aggregate score</span>
                  <span className="rounded-full bg-pulse-soft px-3 py-1 text-sm font-black text-pulse">{reviewSubmissionSummary.average}/5</span>
                </div>
              </div>
              {notice && <div className="mt-4 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{notice}</div>}
              {submissionNotice && <div className="mt-4 rounded-2xl bg-pulse-soft p-3 text-sm font-black text-pulse">{submissionNotice}</div>}
              <div className="mt-5 space-y-5">
                {assessmentQuestionItems.map((question) => {
                  const competency = configuredCompetencies.find((item) => item.id === question.competencyId);
                  return (
                    <div key={question.id} className="rounded-[18px] border border-ink/8 bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{competency?.name}</p>
                          <p className="mt-1 text-sm leading-6 text-muted">{question.prompt}</p>
                        </div>
                        <span className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-pulse">
                          {ratings[question.competencyId]}/5
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={ratings[question.competencyId]}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setRatings((current) => ({ ...current, [question.competencyId]: nextValue }));
                          setSubmissionScores((current) => ({ ...current, [question.competencyId]: nextValue }));
                        }}
                        className="mt-4 w-full accent-pulse"
                        aria-label={`Rating for ${competency?.name}`}
                      />
                      <textarea
                        value={comments[question.competencyId] ?? ""}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setComments((current) => ({ ...current, [question.competencyId]: nextValue }));
                          setSubmissionComments((current) => ({ ...current, [question.competencyId]: nextValue }));
                        }}
                        placeholder="Evidence, example, or coaching note"
                        className="mt-3 min-h-20 w-full resize-none rounded-2xl border border-ink/8 bg-white p-3 text-sm outline-none transition placeholder:text-muted focus:border-pulse/50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-5">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Board-ready report</p>
                  <h2 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{selectedAssessee.portfolio}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-ink/10 px-3 text-sm font-black">
                    <FileText size={16} />
                    PDF
                  </button>
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-ink/10 px-3 text-sm font-black">
                    <Download size={16} />
                    CSV
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-ink p-4 text-white">
                  <p className="text-xs font-bold text-white/50">Overall score</p>
                  <p className="mt-2 text-4xl font-black">{selectedReportSummary.overallScore}</p>
                </div>
                <div className="rounded-2xl bg-paper p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Report status</p>
                  <p className="mt-2 text-2xl font-black">{selectedReportSummary.ready && canReleaseSelectedReport ? "Ready" : "Blocked"}</p>
                </div>
                <div className="rounded-2xl bg-pulse-soft p-4 text-pulse">
                  <p className="text-xs font-bold uppercase tracking-[0.14em]">Customer gap</p>
                  <p className="mt-2 text-2xl font-black">{selectedResult.groupScores.customer - selectedResult.groupScores.line_manager}</p>
                </div>
                <div className="rounded-2xl bg-green-soft p-4 text-green">
                  <p className="text-xs font-bold uppercase tracking-[0.14em]">Completion</p>
                  <p className="mt-2 text-2xl font-black">{completionForAssessee(selectedAssessee.id, reviewerAssignments)}%</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Executive summary</p>
                  <h3 className="mt-2 text-xl font-black">Leadership narrative</h3>
                  <div className="mt-5 grid gap-3">
                    {selectedReportSummary.strengths.map((item) => (
                      <p key={item} className="rounded-2xl bg-green-soft p-3 text-sm font-semibold leading-6 text-green">{item}</p>
                    ))}
                    {selectedReportSummary.developmentAreas.map((item) => (
                      <p key={item} className="rounded-2xl bg-pulse-soft p-3 text-sm font-semibold leading-6 text-pulse">{item}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Scorecard</p>
                  <h3 className="mt-2 text-xl font-black">Competency profile</h3>
                  <div className="mt-5 space-y-4">
                    {selectedResult.competencyScores.map((item) => {
                      const competencyName = competencyNameById.get(item.competencyId) ?? item.competencyId;
                      const variance = item.score - item.benchmark;
                      return (
                        <div key={item.competencyId} className="rounded-[18px] bg-paper p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">{competencyName}</p>
                              <p className="mt-1 text-xs text-muted">Benchmark {item.benchmark} / Weight {competencyWeights[item.competencyId] ?? 0}%</p>
                            </div>
                            <span className={clsx("rounded-full px-3 py-1 text-sm font-black", variance >= 0 ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                              {item.score}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-pulse" style={{ width: `${clampPercent(item.score)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Blind spot analysis</p>
                  <h3 className="mt-2 text-xl font-black">Signal comparison</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-green-soft p-4 text-green">
                      <p className="text-xs font-bold uppercase tracking-[0.14em]">Hidden strength</p>
                      <p className="mt-2 text-lg font-black">{strongestCompetencyName}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4 text-amber-700">
                      <p className="text-xs font-bold uppercase tracking-[0.14em]">Development risk</p>
                      <p className="mt-2 text-lg font-black">{weakestCompetencyName}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedResult.riskNotes.map((note) => (
                      <p key={note} className="rounded-2xl bg-paper p-3 text-sm font-semibold leading-6 text-muted">{note}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer lens</p>
                  <h3 className="mt-2 text-xl font-black">Group scores</h3>
                  <div className="mt-5 space-y-4">
                    {reviewerGroups.map((group) => (
                      <div key={group.key} className={clsx("border-l-4 bg-paper p-4", groupTone[group.key])}>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-black">{group.label}</p>
                            <p className="mt-1 text-xs text-muted">Weight {reviewerWeights[group.key]}%</p>
                          </div>
                          <p className="text-2xl font-black">{selectedReportSummary.groupScores[group.key] ?? selectedResult.groupScores[group.key]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Release controls</p>
                      <h3 className="mt-2 text-xl font-black">Approval checklist</h3>
                    </div>
                    <button
                      disabled={!canReleaseSelectedReport}
                      className={clsx(
                        "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3 text-sm font-black transition",
                        canReleaseSelectedReport ? "bg-ink text-white" : "cursor-not-allowed border border-ink/10 bg-white text-muted",
                      )}
                    >
                      <FileText size={16} />
                      {canReleaseSelectedReport ? "Release" : "Blocked"}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {[
                      { label: "All reviewer groups represented", ok: releaseSummary.missingGroups.length === 0 },
                      { label: "All submissions complete", ok: releaseSummary.remaining === 0 },
                      { label: "HR calibration completed", ok: selectedResult.riskNotes.length === 0 },
                      { label: "Customer comments redacted", ok: true },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-sm font-semibold text-muted">
                        <CheckCircle2 className={item.ok ? "text-green" : "text-muted/50"} size={16} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {selectedReportSummary.notes.map((note) => (
                      <p key={note} className="rounded-2xl bg-paper p-3 text-xs font-semibold leading-5 text-muted">{note}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Cohort reporting</p>
                  <h3 className="mt-2 text-xl font-black">Leadership portfolio view</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right">
                  <div className="rounded-2xl bg-paper px-3 py-2">
                    <p className="text-xs font-bold text-muted">Average</p>
                    <p className="text-lg font-black">{cohortAverageScore}</p>
                  </div>
                  <div className="rounded-2xl bg-green-soft px-3 py-2 text-green">
                    <p className="text-xs font-bold">Ready</p>
                    <p className="text-lg font-black">{reportReadyCount}/{leaderProgress.length}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/8 text-xs font-black uppercase tracking-[0.14em] text-muted">
                      <th className="py-3 pr-3">Leader</th>
                      <th className="py-3 pr-3">Function</th>
                      <th className="py-3 pr-3">Region</th>
                      <th className="py-3 pr-3">Score</th>
                      <th className="py-3 pr-3">Report status</th>
                      <th className="py-3 pr-3">Development focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortReportSummaries.map((entry) => (
                      <tr key={entry.result.assesseeId} className="border-b border-ink/8 last:border-0">
                        <td className="py-4 pr-3 font-black">{entry.assessee?.name ?? "Unknown leader"}</td>
                        <td className="py-4 pr-3 text-muted">{entry.assessee?.functionName ?? "Not set"}</td>
                        <td className="py-4 pr-3 text-muted">{entry.assessee?.region ?? "Not set"}</td>
                        <td className="py-4 pr-3 font-black">{entry.summary.overallScore}</td>
                        <td className="py-4 pr-3">
                          <span className={clsx("rounded-full px-2 py-1 text-xs font-black", entry.summary.ready ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700")}>
                            {entry.summary.ready ? "Ready" : "Incomplete"}
                          </span>
                        </td>
                        <td className="py-4 pr-3 text-muted">{entry.result.developmentSignals[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
