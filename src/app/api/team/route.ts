import { publicPerson, readAll, reply, teamContext, type Admin } from "@/lib/teamServer";
import { directReports, teamScope } from "@/lib/teamWorkspace";

/**
 * The My Team tab: the people the published org chart says you look after,
 * with what the platform actually knows about their work — their goals, their
 * reports and their tasks.
 *
 * There is deliberately no "performance score" here. The old page showed one
 * for every teammate, invented; the real score only exists once an appraisal
 * is released, and it lives on the appraisal page.
 */

export const dynamic = "force-dynamic";

const CHUNK = 200;

/** Rows for a set of people, in chunks small enough for a query string. */
async function forPeople<T>(ids: string[], fetch: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    rows.push(...(await readAll<T>((from, to) => fetch(chunk, from, to))));
  }
  return rows;
}

async function workFor(admin: Admin, orgId: string, ids: string[]) {
  const [goals, reports, tasks] = await Promise.all([
    forPeople<{ owner_id: string; percent_complete: number | null; status: string | null }>(ids, (chunk, from, to) =>
      admin.from("goals").select("owner_id, percent_complete, status").eq("org_id", orgId).in("owner_id", chunk).order("id").range(from, to),
    ),
    forPeople<{ employee_id: string; submitted_at: string | null; status: string | null; report_type: string | null }>(ids, (chunk, from, to) =>
      admin
        .from("reports")
        .select("employee_id, submitted_at, status, report_type")
        .eq("org_id", orgId)
        .in("employee_id", chunk)
        .order("submitted_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    forPeople<{ assignee_id: string; is_complete: boolean | null; due_date: string | null }>(ids, (chunk, from, to) =>
      admin.from("tasks").select("assignee_id, is_complete, due_date").eq("org_id", orgId).in("assignee_id", chunk).order("id").range(from, to),
    ),
  ]);
  return { goals, reports, tasks };
}

export async function GET() {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster, byId } = auth.ctx;

  const scope = teamScope(viewer, roster);
  if (!scope.ids.length) {
    return reply({ viewer: publicPerson(viewer), wholeLine: scope.wholeLine, members: [], directCount: 0 });
  }

  let work;
  try {
    work = await workFor(admin, orgId, scope.ids);
  } catch {
    return reply({ error: "Could not read your team's work. Please retry." }, 503);
  }

  const today = new Date().toISOString().slice(0, 10);
  const direct = new Set(directReports(viewer.id, roster));

  const members = scope.ids
    .map((id) => byId.get(id))
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
    .map((person) => {
      const goals = work.goals.filter((goal) => goal.owner_id === person.id);
      const reports = work.reports.filter((report) => report.employee_id === person.id);
      const tasks = work.tasks.filter((task) => task.assignee_id === person.id);
      const openTasks = tasks.filter((task) => !task.is_complete);
      return {
        ...publicPerson(person),
        lineManagerId: person.line_manager_id,
        lineManagerName: person.line_manager_id ? byId.get(person.line_manager_id)?.name ?? null : null,
        isDirect: direct.has(person.id),
        peopleResponsibility: person.people_responsibility,
        goals: {
          count: goals.length,
          averageProgress: goals.length ? Math.round(goals.reduce((sum, goal) => sum + (goal.percent_complete ?? 0), 0) / goals.length) : null,
          atRisk: goals.filter((goal) => goal.status === "at_risk" || goal.status === "behind").length,
          completed: goals.filter((goal) => goal.status === "completed" || (goal.percent_complete ?? 0) >= 100).length,
        },
        reports: {
          count: reports.length,
          last: reports[0] ? { submittedAt: reports[0].submitted_at, status: reports[0].status, type: reports[0].report_type } : null,
          awaitingReview: reports.filter((report) => report.status === "submitted").length,
        },
        tasks: {
          open: openTasks.length,
          overdue: openTasks.filter((task) => task.due_date && task.due_date < today).length,
        },
      };
    })
    .sort((a, b) => Number(b.isDirect) - Number(a.isDirect) || (a.name ?? "").localeCompare(b.name ?? ""));

  return reply({ viewer: publicPerson(viewer), wholeLine: scope.wholeLine, members, directCount: direct.size });
}
