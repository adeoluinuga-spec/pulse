import { getSupabase } from "@/lib/supabase";
import { employees } from "@/data/mockData";
import type { Task } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapTask(row: Record<string, unknown>): Task {
  const isComplete = row.is_complete as boolean;
  let status: Task["status"] = isComplete ? "complete" : "pending";

  if (!isComplete && row.due_date) {
    const dueDate = new Date(row.due_date as string);
    if (dueDate < new Date()) status = "overdue";
  }

  return {
    id: row.id as string,
    title: row.title as string,
    dueDate: (row.due_date as string) ?? "",
    priority: (row.source === "ai" ? "high" : "medium") as Task["priority"],
    status,
    category: (row.source as string) ?? "General",
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

export async function getMyTasks(): Promise<Task[]> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    const { data, error } = await getSupabase()
      .from("tasks")
      .select("*")
      .eq("assignee_id", emp.id)
      .order("due_date", { ascending: true });

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapTask);
  } catch {
    return [];
  }
}

export async function createTask(taskData: {
  title: string;
  dueDate?: string;
  assigneeId: string;
  linkedGoalId?: string;
  source?: string;
}): Promise<Task | null> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return null;

    const { data, error } = await getSupabase()
      .from("tasks")
      .insert({
        org_id: emp.orgId,
        assignee_id: taskData.assigneeId,
        created_by: emp.id,
        title: taskData.title,
        due_date: taskData.dueDate ?? null,
        is_complete: false,
        source: taskData.source ?? "manual",
        linked_goal_id: taskData.linkedGoalId ?? null,
      })
      .select()
      .single();

    if (error || !data) return null;
    return mapTask(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function completeTask(taskId: string): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from("tasks")
      .update({
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return !error;
  } catch {
    return false;
  }
}

export async function deleteTask(taskId: string): Promise<boolean> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return false;

    const { error } = await getSupabase()
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("created_by", emp.id);

    return !error;
  } catch {
    return false;
  }
}

export async function getTeamTasks(): Promise<
  Array<Task & { employeeName: string }>
> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

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
      .from("tasks")
      .select("*")
      .in("assignee_id", reportIds)
      .order("due_date", { ascending: true });

    if (error || !data?.length) return [];

    return (data as Record<string, unknown>[]).map((row) => ({
      ...mapTask(row),
      employeeName: nameMap[row.assignee_id as string] ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────

export function getMockTasksForUser(employeeId: string): Task[] {
  return employees.find((e) => e.id === employeeId)?.tasks ?? [];
}
