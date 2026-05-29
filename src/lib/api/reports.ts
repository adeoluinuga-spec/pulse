import { getSupabase } from "@/lib/supabase";
import { employees } from "@/data/mockData";
import type { Report, ReportMetric } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapReport(row: Record<string, unknown>): Report {
  const quantData = row.quantitative_data as
    | ReportMetric[]
    | null;

  // Build qualitative from DB fields
  const parts: string[] = [];
  if (row.accomplishments) parts.push(row.accomplishments as string);
  if (row.blockers) parts.push(`Blockers: ${row.blockers as string}`);
  if (row.support_needed) parts.push(`Support needed: ${row.support_needed as string}`);

  const aiDigest = row.ai_digest as
    | { summary?: string; sentiment?: string }
    | null;

  return {
    id: row.id as string,
    type: (row.report_type as Report["type"]) ?? "weekly",
    date:
      ((row.submitted_at as string) ?? (row.period_end as string) ?? "").slice(
        0,
        10,
      ),
    qualitative: parts.join("\n\n"),
    metrics: quantData ?? [],
    mood: (row.mood as Report["mood"]) ?? "good",
    aiSummary: aiDigest?.summary ?? "",
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthEmployee(): Promise<{
  id: string;
  orgId: string;
  email: string;
} | null> {
  const supabase = getSupabase();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, org_id, email")
    .eq("user_id", authUser.id)
    .single();

  if (!data) return null;
  const emp = data as { id: string; org_id: string; email: string };
  return { id: emp.id, orgId: emp.org_id, email: emp.email };
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMyReports(limit = 20): Promise<Report[]> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .eq("employee_id", emp.id)
      .order("submitted_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapReport);
  } catch {
    return [];
  }
}

export async function getReportDetail(reportId: string): Promise<Report | null> {
  try {
    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (error || !data) return null;
    return mapReport(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function submitReport(reportData: {
  orgId: string;
  type: string;
  accomplishments: string;
  blockers: string;
  mood: string;
  goalTracking?: string;
  supportNeeded?: string;
  quantitativeData?: ReportMetric[];
}): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().rpc("submit_report", {
      p_org_id: reportData.orgId,
      p_type: reportData.type,
      p_accomplishments: reportData.accomplishments,
      p_blockers: reportData.blockers,
      p_mood: reportData.mood,
      p_goal_tracking: reportData.goalTracking ?? null,
      p_support_needed: reportData.supportNeeded ?? null,
      p_quantitative_data: reportData.quantitativeData
        ? JSON.stringify(reportData.quantitativeData)
        : null,
    });

    if (error) return null;
    return data as string;
  } catch {
    return null;
  }
}

export async function getTeamReports(limit = 50): Promise<
  Array<Report & { employeeId: string; employeeName: string }>
> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    // Get direct reports
    const { data: directReports } = await getSupabase()
      .from("employees")
      .select("id, name")
      .eq("line_manager_id", emp.id);

    if (!directReports?.length) return [];
    const reportIds = (directReports as { id: string; name: string }[]).map(
      (r) => r.id,
    );
    const nameMap = Object.fromEntries(
      (directReports as { id: string; name: string }[]).map((r) => [
        r.id,
        r.name,
      ]),
    );

    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .in("employee_id", reportIds)
      .order("submitted_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) return [];

    return (data as Record<string, unknown>[]).map((row) => ({
      ...mapReport(row),
      employeeId: row.employee_id as string,
      employeeName: nameMap[row.employee_id as string] ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

export async function updateReportStatus(
  reportId: string,
  status: "reviewed" | "acknowledged",
  comment?: string,
): Promise<boolean> {
  try {
    const updates: Record<string, unknown> = {
      status,
      reviewed_at: new Date().toISOString(),
    };
    if (comment) updates.manager_comment = comment;

    const { error } = await getSupabase()
      .from("reports")
      .update(updates)
      .eq("id", reportId);

    return !error;
  } catch {
    return false;
  }
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────

export function getMockReportsForUser(employeeId: string): Report[] {
  return employees.find((e) => e.id === employeeId)?.reports ?? [];
}
