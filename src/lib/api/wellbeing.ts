import { getSupabase } from "@/lib/supabase";
import type { WellbeingEntry, Mood } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapWellbeing(row: Record<string, unknown>): WellbeingEntry {
  return {
    date: (row.week_of as string) ?? (row.submitted_at as string)?.slice(0, 10) ?? "",
    mood: (row.overall_mood as Mood) ?? "good",
    note: (row.free_text as string) ?? undefined,
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthEmployee(): Promise<{
  id: string;
  orgId: string;
} | null> {
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

export async function getWellbeingHistory(limit = 13): Promise<WellbeingEntry[]> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    const { data, error } = await getSupabase()
      .from("wellbeing_surveys")
      .select("*")
      .eq("employee_id", emp.id)
      .order("week_of", { ascending: false })
      .limit(limit);

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapWellbeing).reverse();
  } catch {
    return [];
  }
}

export async function submitWellbeingSurvey(survey: {
  overallMood: Mood;
  workload: string;
  supportLevel: string;
  freeText?: string;
}): Promise<boolean> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return false;

    const weekOf = new Date();
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1); // Monday

    const { error } = await getSupabase().from("wellbeing_surveys").insert({
      employee_id: emp.id,
      overall_mood: survey.overallMood,
      workload: survey.workload,
      support_level: survey.supportLevel,
      free_text: survey.freeText ?? null,
      week_of: weekOf.toISOString().slice(0, 10),
    });

    return !error;
  } catch {
    return false;
  }
}

export async function getWellbeingFlags(
  orgId: string,
): Promise<
  Array<{
    employeeId: string;
    employeeName: string;
    mood: Mood;
    escalationLevel: number;
    weekOf: string;
  }>
> {
  try {
    // Get latest wellbeing entry per employee for entries flagged as escalation
    const { data, error } = await getSupabase()
      .from("wellbeing_surveys")
      .select(
        "employee_id, overall_mood, escalation_level, week_of, employees!inner(name, org_id)",
      )
      .eq("employees.org_id", orgId)
      .gt("escalation_level", 0)
      .order("week_of", { ascending: false });

    if (error || !data?.length) return [];

    return (data as Record<string, unknown>[]).map((row) => {
      const emp = row.employees as { name: string };
      return {
        employeeId: row.employee_id as string,
        employeeName: emp?.name ?? "Unknown",
        mood: (row.overall_mood as Mood) ?? "okay",
        escalationLevel: (row.escalation_level as number) ?? 0,
        weekOf: (row.week_of as string) ?? "",
      };
    });
  } catch {
    return [];
  }
}

export async function getOrgMoodSummary(orgId: string): Promise<{
  energised: number;
  good: number;
  okay: number;
  drained: number;
  total: number;
}> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14); // Last 2 weeks

    const { data, error } = await getSupabase()
      .from("wellbeing_surveys")
      .select(
        "overall_mood, employees!inner(org_id)",
      )
      .eq("employees.org_id", orgId)
      .gte("submitted_at", cutoff.toISOString());

    if (error || !data?.length)
      return { energised: 0, good: 0, okay: 0, drained: 0, total: 0 };

    const counts = { energised: 0, good: 0, okay: 0, drained: 0 };
    for (const row of data as { overall_mood: string }[]) {
      const mood = row.overall_mood as keyof typeof counts;
      if (mood in counts) counts[mood]++;
    }

    return { ...counts, total: data.length };
  } catch {
    return { energised: 0, good: 0, okay: 0, drained: 0, total: 0 };
  }
}
