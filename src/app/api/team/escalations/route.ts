import { notify, publicPerson, readAll, reply, teamContext } from "@/lib/teamServer";
import {
  canProgressEscalation,
  canSeeEscalation,
  canSeeRaiser,
  isHr,
  routeEscalation,
  validateEscalation,
  validateEscalationUpdate,
  type EscalationRow,
} from "@/lib/teamWorkspace";

/**
 * Escalations: a concern raised by anyone, routed by the org chart.
 *
 * Operational and general concerns go to the raiser's line manager. People
 * concerns — which may be about that manager — and wellbeing concerns go to HR.
 * A people concern can be raised anonymously: the manager never sees who
 * raised it, HR does, because a concern nobody can follow up cannot be
 * resolved. The assignee (or HR) moves it from raised to acknowledged to in
 * progress to resolved, and the raiser is told at every step.
 */

export const dynamic = "force-dynamic";

type Row = EscalationRow & {
  title: string;
  description: string | null;
  urgency: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
};

const COLUMNS = "id, raised_by, assigned_to, title, description, escalation_type, urgency, is_anonymous, status, resolution_note, created_at, updated_at, resolved_at";

export async function GET() {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, byId } = auth.ctx;

  let rows: Row[];
  try {
    rows = await readAll<Row>((from, to) => {
      let query = admin.from("escalations").select(COLUMNS).eq("org_id", orgId);
      if (!isHr(viewer)) query = query.or(`raised_by.eq.${viewer.id},assigned_to.eq.${viewer.id}`);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    });
  } catch {
    return reply({ error: "Could not read escalations. Please retry." }, 503);
  }

  const view = rows
    .filter((row) => canSeeEscalation(viewer, row))
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.escalation_type,
      urgency: row.urgency,
      status: row.status ?? "raised",
      anonymous: Boolean(row.is_anonymous),
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      raisedBy: canSeeRaiser(viewer, row) ? publicPerson(row.raised_by ? byId.get(row.raised_by) : undefined) : null,
      assignedTo: row.assigned_to ? publicPerson(byId.get(row.assigned_to)) : null,
      routedToHr: row.assigned_to === null,
      mine: row.raised_by === viewer.id,
      canProgress: canProgressEscalation(viewer, row),
    }));

  return reply({
    raised: view.filter((item) => item.mine),
    toHandle: view.filter((item) => !item.mine),
    viewerIsHr: isHr(viewer),
  });
}

export async function POST(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster } = auth.ctx;

  const checked = validateEscalation((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!checked.ok) return reply({ error: "This escalation is not complete.", errors: checked.errors }, 422);
  const { title, description, type, urgency, anonymous } = checked.value;

  const assignedTo = routeEscalation(type, viewer);
  const { data, error } = await admin
    .from("escalations")
    .insert({
      org_id: orgId,
      raised_by: viewer.id,
      title,
      description,
      escalation_type: type,
      urgency,
      is_anonymous: anonymous,
      status: "raised",
      assigned_to: assignedTo,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return reply({ error: "Could not raise the escalation. Please retry." }, 500);

  const recipients = assignedTo ? [assignedTo] : roster.filter(isHr).map((person) => person.id);
  await notify(admin, recipients.filter((id) => id !== viewer.id), {
    title: urgency === "critical" ? "Critical escalation raised" : "New escalation",
    body: anonymous ? `An anonymous ${type} concern: ${title}` : `${viewer.name} raised a ${type} concern: ${title}`,
    type: "action_required",
    actionUrl: "/dashboard/team?tab=escalations",
  });

  return reply({ id: data.id, routedTo: assignedTo ? "manager" : "hr" }, 201);
}

export async function PATCH(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer } = auth.ctx;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown; note?: unknown };
  if (typeof body.id !== "string") return reply({ error: "Say which escalation." }, 400);

  const { data: row, error: readError } = await admin
    .from("escalations")
    .select(COLUMNS)
    .eq("id", body.id)
    .eq("org_id", orgId)
    .maybeSingle<Row>();
  if (readError) return reply({ error: "Could not read that escalation. Please retry." }, 503);
  if (!row || !canSeeEscalation(viewer, row)) return reply({ error: "That escalation was not found." }, 404);
  if (!canProgressEscalation(viewer, row)) return reply({ error: "Only the person it was sent to, or HR, can update it." }, 403);

  const update = validateEscalationUpdate(row.status, body.status, body.note);
  if (!update.ok) return reply({ error: update.error }, 422);

  const now = new Date().toISOString();
  const { data: saved, error } = await admin
    .from("escalations")
    .update({
      status: update.status,
      updated_at: now,
      ...(update.status === "resolved" ? { resolved_at: now, resolution_note: update.note } : {}),
    })
    .eq("id", row.id)
    .eq("org_id", orgId)
    .eq("status", row.status ?? "raised")
    .select("id");
  if (error) return reply({ error: "Could not update the escalation. Please retry." }, 500);
  if (!saved?.length) return reply({ error: "Somebody else updated this escalation just now. Reload to see it." }, 409);

  const label = { acknowledged: "acknowledged", in_progress: "being worked on", resolved: "resolved" }[update.status as "acknowledged" | "in_progress" | "resolved"];
  await notify(admin, [row.raised_by !== viewer.id ? row.raised_by : null], {
    title: `Your escalation is ${label}`,
    body: update.status === "resolved" && update.note ? `${row.title}: ${update.note}` : row.title,
    type: update.status === "resolved" ? "success" : "info",
    actionUrl: "/dashboard/team?tab=escalations",
  });

  return reply({ id: row.id, status: update.status });
}
