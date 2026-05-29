import { getSupabase } from "@/lib/supabase";
import { employees } from "@/data/mockData";
import type { AppraisalComponent } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppraisalRecord {
  id: string;
  employeeId: string;
  cycleId: string;
  goalAchievementScore: number;
  reportConsistencyScore: number;
  kpiPerformanceScore: number;
  managerAssessmentScore: number;
  peerFeedbackScore: number;
  totalScore: number;
  selfAssessment: Record<string, unknown> | null;
  managerAssessment: Record<string, unknown> | null;
  aiRecommendation: string | null;
  aiConfidence: number | null;
  aiEvidence: string[];
  managerAgreed: boolean | null;
  hrConfirmed: boolean | null;
  status: string;
}

export interface AppraisalCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapAppraisal(row: Record<string, unknown>): AppraisalRecord {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    cycleId: row.cycle_id as string,
    goalAchievementScore: (row.goal_achievement_score as number) ?? 0,
    reportConsistencyScore: (row.report_consistency_score as number) ?? 0,
    kpiPerformanceScore: (row.kpi_performance_score as number) ?? 0,
    managerAssessmentScore: (row.manager_assessment_score as number) ?? 0,
    peerFeedbackScore: (row.peer_feedback_score as number) ?? 0,
    totalScore: (row.total_score as number) ?? 0,
    selfAssessment:
      (row.self_assessment as Record<string, unknown>) ?? null,
    managerAssessment:
      (row.manager_assessment as Record<string, unknown>) ?? null,
    aiRecommendation: (row.ai_recommendation as string) ?? null,
    aiConfidence: (row.ai_confidence as number) ?? null,
    aiEvidence: (row.ai_evidence as string[]) ?? [],
    managerAgreed: (row.manager_agreed as boolean) ?? null,
    hrConfirmed: (row.hr_confirmed as boolean) ?? null,
    status: (row.status as string) ?? "in_progress",
  };
}

function appraisalToComponents(appraisal: AppraisalRecord): AppraisalComponent[] {
  return [
    {
      id: `${appraisal.id}-goal`,
      name: "Goal Achievement",
      weight: 35,
      score: appraisal.goalAchievementScore,
      status: "completed",
    },
    {
      id: `${appraisal.id}-report`,
      name: "Report Consistency",
      weight: 20,
      score: appraisal.reportConsistencyScore,
      status: "completed",
    },
    {
      id: `${appraisal.id}-kpi`,
      name: "KPI Performance",
      weight: 25,
      score: appraisal.kpiPerformanceScore,
      status: "completed",
    },
    {
      id: `${appraisal.id}-manager`,
      name: "Manager Assessment",
      weight: 10,
      score: appraisal.managerAssessmentScore,
      status: appraisal.managerAgreed !== null ? "completed" : "pending",
    },
    {
      id: `${appraisal.id}-peer`,
      name: "Peer Feedback",
      weight: 10,
      score: appraisal.peerFeedbackScore,
      status: "completed",
    },
  ];
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthEmployeeId(): Promise<{ id: string; orgId: string } | null> {
  const supabase = getSupabase();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("user_id", authUser.id)
    .single();

  if (!data) return null;
  const emp = data as { id: string; org_id: string };
  return { id: emp.id, orgId: emp.org_id };
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getActiveCycle(): Promise<AppraisalCycle | null> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return null;

    const { data, error } = await getSupabase()
      .from("appraisal_cycles")
      .select("*")
      .eq("org_id", emp.orgId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      name: row.name as string,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      status: row.status as string,
    };
  } catch {
    return null;
  }
}

export async function getMyAppraisal(
  cycleId: string,
): Promise<AppraisalRecord | null> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return null;

    const { data, error } = await getSupabase()
      .from("appraisals")
      .select("*")
      .eq("employee_id", emp.id)
      .eq("cycle_id", cycleId)
      .single();

    if (error || !data) return null;
    return mapAppraisal(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getAppraisalComponents(
  cycleId: string,
): Promise<AppraisalComponent[]> {
  try {
    const appraisal = await getMyAppraisal(cycleId);
    if (!appraisal) return [];
    return appraisalToComponents(appraisal);
  } catch {
    return [];
  }
}

export async function submitSelfAssessment(
  cycleId: string,
  answers: Record<string, unknown>,
): Promise<boolean> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return false;

    const { error } = await getSupabase()
      .from("appraisals")
      .update({
        self_assessment: answers,
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", emp.id)
      .eq("cycle_id", cycleId);

    return !error;
  } catch {
    return false;
  }
}

export async function getTeamAppraisals(
  cycleId: string,
): Promise<AppraisalRecord[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    const { data: directReports } = await getSupabase()
      .from("employees")
      .select("id")
      .eq("line_manager_id", emp.id);

    if (!directReports?.length) return [];
    const reportIds = (directReports as { id: string }[]).map((r) => r.id);

    const { data, error } = await getSupabase()
      .from("appraisals")
      .select("*")
      .in("employee_id", reportIds)
      .eq("cycle_id", cycleId);

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapAppraisal);
  } catch {
    return [];
  }
}

export async function submitManagerAssessment(
  employeeId: string,
  cycleId: string,
  assessment: {
    score: number;
    notes: string;
    agreed: boolean;
    overrideReason?: string;
  },
): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from("appraisals")
      .update({
        manager_assessment: { score: assessment.score, notes: assessment.notes },
        manager_assessment_score: assessment.score,
        manager_agreed: assessment.agreed,
        manager_override_reason: assessment.overrideReason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", employeeId)
      .eq("cycle_id", cycleId);

    return !error;
  } catch {
    return false;
  }
}

export async function getAppraisalHistory(): Promise<AppraisalRecord[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    const { data, error } = await getSupabase()
      .from("appraisals")
      .select("*")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false });

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapAppraisal);
  } catch {
    return [];
  }
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────

export function getMockAppraisalForUser(
  employeeId: string,
): AppraisalComponent[] {
  return employees.find((e) => e.id === employeeId)?.appraisalComponents ?? [];
}
