import { notify, publicPerson, readAll, reply, teamContext } from "@/lib/teamServer";
import { canAssignTask, canUpdateTask, reportingTree } from "@/lib/teamWorkspace";

/**
 * Tasks: your own, and the ones you have set for people in your reporting line.
 *
 * You can give a task to yourself or to anyone below you on the org chart —
 * never sideways to a peer or upwards to your manager. The assignee and the
 * person who set it can both tick it off.
 */

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  assignee_id: string | null;
  created_by: string | null;
  title: string;
  due_date: string | null;
  is_complete: boolean | null;
  source: string | null;
  linked_goal_id: string | null;
  completed_at: string | null;
  created_at: string;
};

const COLUMNS = "id, assignee_id, created_by, title, due_date, is_complete, source, linked_goal_id, completed_at, created_at";

export async function GET() {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster, byId } = auth.ctx;

  let rows: TaskRow[];
  let goals: Array<{ id: string; title: string }>;
  try {
    [rows, goals] = await Promise.all([
      readAll<TaskRow>((from, to) =>
        admin
          .from("tasks")
          .select(COLUMNS)
          .eq("org_id", orgId)
          .or(`assignee_id.eq.${viewer.id},created_by.eq.${viewer.id}`)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      readAll<{ id: string; title: string }>((from, to) =>
        admin.from("goals").select("id, title").eq("org_id", orgId).eq("owner_id", viewer.id).order("id").range(from, to),
      ),
    ]);
  } catch {
    return reply({ error: "Could not read your tasks. Please retry." }, 503);
  }

  const goalTitle = new Map(goals.map((goal) => [goal.id, goal.title]));
  const assignable = [viewer.id, ...reportingTree(viewer.id, roster)];

  return reply({
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      complete: Boolean(row.is_complete),
      completedAt: row.completed_at,
      source: row.source,
      linkedGoal: row.linked_goal_id ? { id: row.linked_goal_id, title: goalTitle.get(row.linked_goal_id) ?? null } : null,
      assignee: publicPerson(row.assignee_id ? byId.get(row.assignee_id) : undefined),
      setBy: publicPerson(row.created_by ? byId.get(row.created_by) : undefined),
      mine: row.assignee_id === viewer.id,
    })),
    goals,
    // Yourself, and everybody below you on the org chart.
    assignable: assignable
      .filter((id) => canAssignTask(viewer, id, roster))
      .map((id) => publicPerson(byId.get(id)))
      .filter(Boolean),
  });
}

export async function POST(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster } = auth.ctx;

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; dueDate?: unknown; assigneeId?: unknown; goalId?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 200) return reply({ error: "Give the task a name between 2 and 200 characters." }, 422);

  const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return reply({ error: "That due date is not a date." }, 422);

  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : viewer.id;
  if (!canAssignTask(viewer, assigneeId, roster)) {
    return reply({ error: "You can only give tasks to yourself or to people in your reporting line." }, 403);
  }

  let goalId: string | null = null;
  if (typeof body.goalId === "string" && body.goalId) {
    const { data: goal, error } = await admin.from("goals").select("id, owner_id").eq("id", body.goalId).eq("org_id", orgId).maybeSingle<{ id: string; owner_id: string | null }>();
    if (error) return reply({ error: "Could not check that goal. Please retry." }, 503);
    if (!goal || (goal.owner_id !== assigneeId && goal.owner_id !== viewer.id)) {
      return reply({ error: "Link the task to one of your own goals or the assignee's." }, 422);
    }
    goalId = goal.id;
  }

  const { data, error } = await admin
    .from("tasks")
    .insert({
      org_id: orgId,
      assignee_id: assigneeId,
      created_by: viewer.id,
      title,
      due_date: dueDate,
      source: goalId ? "goal" : assigneeId === viewer.id ? "manual" : "assigned",
      linked_goal_id: goalId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return reply({ error: "Could not save the task. Please retry." }, 500);

  if (assigneeId !== viewer.id) {
    await notify(admin, [assigneeId], {
      title: "New task",
      body: `${viewer.name} gave you a task: ${title}`,
      type: "info",
      actionUrl: "/dashboard/team?tab=tasks",
    });
  }

  return reply({ id: data.id }, 201);
}

export async function PATCH(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer } = auth.ctx;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; complete?: unknown };
  if (typeof body.id !== "string" || typeof body.complete !== "boolean") return reply({ error: "Say which task, and whether it is done." }, 400);

  const { data: task, error: readError } = await admin
    .from("tasks")
    .select("id, assignee_id, created_by")
    .eq("id", body.id)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; assignee_id: string | null; created_by: string | null }>();
  if (readError) return reply({ error: "Could not read that task. Please retry." }, 503);
  if (!task) return reply({ error: "That task was not found." }, 404);
  if (!canUpdateTask(viewer.id, task)) return reply({ error: "Only the person doing a task, or who set it, can update it." }, 403);

  const { error } = await admin
    .from("tasks")
    .update({ is_complete: body.complete, completed_at: body.complete ? new Date().toISOString() : null })
    .eq("id", task.id)
    .eq("org_id", orgId);
  if (error) return reply({ error: "Could not update the task. Please retry." }, 500);

  return reply({ id: task.id, complete: body.complete });
}
