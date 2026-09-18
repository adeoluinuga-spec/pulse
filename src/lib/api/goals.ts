import { getSupabase } from "@/lib/supabase";
import type { Goal } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    name: (row.title as string) ?? "",
    description: (row.description as string) ?? "",
    type: (row.goal_type as Goal["type"]) ?? "individual",
    status: (row.status as Goal["status"]) ?? "on_track",
    percentComplete: (row.percent_complete as number) ?? 0,
    dueDate: (row.due_date as string) ?? "",
    weight: (row.weight as number) ?? 0,
  };
}

// ── API functions ─────────────────────────────────────────────────────────────

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

export async function getMyGoals(cycle?: string): Promise<Goal[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    let query = getSupabase()
      .from("goals")
      .select("*")
      .eq("owner_id", emp.id)
      .order("created_at", { ascending: false });

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapGoal);
  } catch {
    return [];
  }
}

export async function getTeamGoals(cycle?: string): Promise<Goal[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    // Get direct reports
    const { data: reports } = await getSupabase()
      .from("employees")
      .select("id")
      .eq("line_manager_id", emp.id);

    if (!reports?.length) return [];
    const reportIds = (reports as { id: string }[]).map((r) => r.id);

    let query = getSupabase()
      .from("goals")
      .select("*")
      .in("owner_id", reportIds);

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapGoal);
  } catch {
    return [];
  }
}

export async function getDeptGoals(dept: string, cycle?: string): Promise<Goal[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    let query = getSupabase()
      .from("goals")
      .select("*")
      .eq("org_id", emp.orgId)
      .eq("department", dept);

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapGoal);
  } catch {
    return [];
  }
}

export async function getOrgGoals(cycle?: string): Promise<Goal[]> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return [];

    let query = getSupabase()
      .from("goals")
      .select("*")
      .eq("org_id", emp.orgId)
      .eq("goal_type", "org");

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapGoal);
  } catch {
    return [];
  }
}

export async function updateGoalProgress(
  goalId: string,
  percent: number,
  note?: string,
): Promise<boolean> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return false;

    const supabase = getSupabase();

    // Get old value first
    const { data: goal } = await supabase
      .from("goals")
      .select("percent_complete")
      .eq("id", goalId)
      .single();

    const oldPercent = (goal as { percent_complete: number } | null)?.percent_complete ?? 0;

    // Update goal
    const { error: updateError } = await supabase
      .from("goals")
      .update({ percent_complete: percent, updated_at: new Date().toISOString() })
      .eq("id", goalId);

    if (updateError) return false;

    // Record progress history
    await supabase.from("goal_progress").insert({
      goal_id: goalId,
      updated_by: emp.id,
      old_percent: oldPercent,
      new_percent: percent,
      note: note ?? null,
    });

    return true;
  } catch {
    return false;
  }
}

export async function createGoal(data: {
  title: string;
  description?: string;
  goalType: Goal["type"];
  cycle?: string;
  weight?: number;
  dueDate?: string;
  department?: string;
}): Promise<Goal | null> {
  try {
    const emp = await getAuthEmployeeId();
    if (!emp) return null;

    const { data: row, error } = await getSupabase()
      .from("goals")
      .insert({
        org_id: emp.orgId,
        owner_id: emp.id,
        created_by: emp.id,
        title: data.title,
        description: data.description ?? null,
        goal_type: data.goalType,
        cycle: data.cycle ?? null,
        weight: data.weight ?? 0,
        due_date: data.dueDate ?? null,
        department: data.department ?? null,
      })
      .select()
      .single();

    if (error || !row) return null;
    return mapGoal(row as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getGoalDetail(goalId: string): Promise<Goal | null> {
  try {
    const { data, error } = await getSupabase()
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .single();

    if (error || !data) return null;
    return mapGoal(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
