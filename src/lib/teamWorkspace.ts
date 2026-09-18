/**
 * The team workspace: who is on whose team, who may talk in which channel,
 * where an escalation goes and who may see who raised it, and who may give
 * whom a task.
 *
 * Everything here reads the published organisation chart — `line_manager_id`
 * and `people_responsibility` on each employee — and nothing else. The page
 * this serves used to draw its people from a demo company, so a real director
 * saw invented departments and a real manager saw somebody else's staff. The
 * rule now is simple: if the org chart does not say it, the workspace does not
 * show it.
 */

export type RosterMember = {
  id: string;
  name: string;
  line_manager_id: string | null;
  department: string | null;
  people_responsibility: string | null;
  platform_role: string | null;
};

const BROAD_SCOPE = new Set(["senior_manager", "director"]);

export function isHr(member: Pick<RosterMember, "platform_role">): boolean {
  return member.platform_role === "hr_admin" || member.platform_role === "super_admin";
}

/** Everyone who reports to `rootId`, directly or through others. Loops in bad data cannot hang it. */
export function reportingTree(rootId: string, roster: RosterMember[]): string[] {
  const reportsOf = new Map<string, string[]>();
  for (const member of roster) {
    if (!member.line_manager_id) continue;
    const list = reportsOf.get(member.line_manager_id) ?? [];
    list.push(member.id);
    reportsOf.set(member.line_manager_id, list);
  }
  const seen = new Set<string>([rootId]);
  const out: string[] = [];
  const queue = [...(reportsOf.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(reportsOf.get(id) ?? []));
  }
  return out;
}

export function directReports(managerId: string, roster: RosterMember[]): string[] {
  return roster.filter((member) => member.line_manager_id === managerId && member.id !== managerId).map((member) => member.id);
}

/**
 * The people a viewer looks after on the My Team tab.
 *
 * Team leads and managers see their direct reports. Senior managers and
 * directors see their whole reporting line, because the managers under them are
 * part of what they answer for. Nobody sees a team the org chart does not give
 * them — an empty list is the honest answer for someone with no reports.
 */
export function teamScope(viewer: RosterMember, roster: RosterMember[]): { ids: string[]; wholeLine: boolean } {
  const wholeLine = BROAD_SCOPE.has(viewer.people_responsibility ?? "");
  return { ids: wholeLine ? reportingTree(viewer.id, roster) : directReports(viewer.id, roster), wholeLine };
}

/** Whether `targetId` is somewhere below `viewerId` in the reporting line. */
export function isInReportingLine(viewerId: string, targetId: string, roster: RosterMember[]): boolean {
  return reportingTree(viewerId, roster).includes(targetId);
}

// ── tasks ────────────────────────────────────────────────────────────────────

/** You can give yourself a task, or give one to anybody in your reporting line. */
export function canAssignTask(viewer: RosterMember, assigneeId: string, roster: RosterMember[]): boolean {
  return assigneeId === viewer.id || isInReportingLine(viewer.id, assigneeId, roster);
}

/** The person doing a task and the person who set it can both tick it off. */
export function canUpdateTask(viewerId: string, task: { assignee_id: string | null; created_by: string | null }): boolean {
  return task.assignee_id === viewerId || task.created_by === viewerId;
}

// ── chat ─────────────────────────────────────────────────────────────────────

export type Channel = { id: string; kind: "team" | "department" | "direct"; label: string };

/** A direct-message channel id is the same whichever of the two people opens it. */
export function directChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

export function parseChannel(id: string):
  | { kind: "team"; managerId: string }
  | { kind: "department"; department: string }
  | { kind: "direct"; people: [string, string] }
  | null {
  if (id.startsWith("team:")) {
    const managerId = id.slice(5);
    return managerId ? { kind: "team", managerId } : null;
  }
  if (id.startsWith("department:")) {
    const department = id.slice(11);
    return department ? { kind: "department", department } : null;
  }
  if (id.startsWith("dm:")) {
    const people = id.slice(3).split(":");
    if (people.length !== 2 || !people[0] || !people[1] || people[0] === people[1]) return null;
    if (directChannel(people[0], people[1]) !== id) return null;
    return { kind: "direct", people: [people[0], people[1]] };
  }
  return null;
}

/**
 * Who belongs to a channel.
 *
 * A team channel is a manager and the people who report directly to them, so
 * most people belong to two: the one they lead, and the one they sit in. A
 * department channel is everyone with that department. A direct channel is its
 * two people, provided both are in the organisation.
 */
export function channelMembers(channelId: string, roster: RosterMember[]): string[] {
  const parsed = parseChannel(channelId);
  if (!parsed) return [];
  const ids = new Set(roster.map((member) => member.id));
  if (parsed.kind === "team") {
    if (!ids.has(parsed.managerId)) return [];
    const reports = directReports(parsed.managerId, roster);
    return reports.length ? [parsed.managerId, ...reports] : [];
  }
  if (parsed.kind === "department") {
    return roster.filter((member) => member.department === parsed.department).map((member) => member.id);
  }
  return parsed.people.every((id) => ids.has(id)) ? [...parsed.people] : [];
}

export function canUseChannel(viewerId: string, channelId: string, roster: RosterMember[]): boolean {
  return channelMembers(channelId, roster).includes(viewerId);
}

/** The group channels a person belongs to, named from their point of view. */
export function groupChannelsFor(viewer: RosterMember, roster: RosterMember[]): Channel[] {
  const nameOf = new Map(roster.map((member) => [member.id, member.name]));
  const channels: Channel[] = [];
  if (directReports(viewer.id, roster).length) {
    channels.push({ id: `team:${viewer.id}`, kind: "team", label: "My team" });
  }
  if (viewer.line_manager_id && nameOf.has(viewer.line_manager_id)) {
    channels.push({ id: `team:${viewer.line_manager_id}`, kind: "team", label: `${nameOf.get(viewer.line_manager_id)}'s team` });
  }
  if (viewer.department) {
    channels.push({ id: `department:${viewer.department}`, kind: "department", label: viewer.department });
  }
  return channels;
}

export const MESSAGE_LIMIT = 4000;

export function validateMessage(body: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > MESSAGE_LIMIT) return { ok: false, error: `Keep a message under ${MESSAGE_LIMIT} characters.` };
  return { ok: true, text };
}

// ── escalations ──────────────────────────────────────────────────────────────

export const ESCALATION_TYPES = ["operational", "people", "wellbeing", "general"] as const;
export const ESCALATION_URGENCIES = ["low", "medium", "high", "critical"] as const;
export const ESCALATION_STATUSES = ["raised", "acknowledged", "in_progress", "resolved"] as const;

export type EscalationType = (typeof ESCALATION_TYPES)[number];
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];

export type EscalationRow = {
  id: string;
  raised_by: string | null;
  assigned_to: string | null;
  escalation_type: string | null;
  is_anonymous: boolean | null;
  status: string | null;
};

export function validateEscalation(input: {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  urgency?: unknown;
  anonymous?: unknown;
}):
  | { ok: true; value: { title: string; description: string | null; type: EscalationType; urgency: string; anonymous: boolean } }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3 || title.length > 160) errors.push("Give the escalation a title between 3 and 160 characters.");
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 4000) : "";
  const type = String(input.type ?? "").toLowerCase() as EscalationType;
  if (!ESCALATION_TYPES.includes(type)) errors.push("Choose what kind of escalation this is.");
  const urgency = String(input.urgency ?? "medium").toLowerCase();
  if (!(ESCALATION_URGENCIES as readonly string[]).includes(urgency)) errors.push("Choose how urgent this is.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    // Only a people concern can be raised anonymously: it is the one where the
    // manager being told may be the problem. Anything else needs a name to act on.
    value: { title, description: description || null, type, urgency, anonymous: type === "people" && input.anonymous === true },
  };
}

/**
 * Who an escalation goes to.
 *
 * Operational and general concerns go to the raiser's line manager, who can
 * act on them. People concerns and wellbeing concerns go to HR: the first
 * because it may be about the manager, the second because it is personal. The
 * returned id is null when the escalation is for HR as a whole rather than one
 * person — which is also the answer for someone with no line manager.
 */
export function routeEscalation(type: EscalationType, raiser: RosterMember): string | null {
  if (type === "people" || type === "wellbeing") return null;
  return raiser.line_manager_id ?? null;
}

/** Whether a viewer may see an escalation at all. */
export function canSeeEscalation(viewer: RosterMember, row: EscalationRow): boolean {
  return isHr(viewer) || row.raised_by === viewer.id || (row.assigned_to !== null && row.assigned_to === viewer.id);
}

/**
 * Whether a viewer may know who raised it.
 *
 * The raiser always knows. HR always knows, because an anonymous concern that
 * nobody can follow up is a concern nobody can resolve. Anyone else sees an
 * anonymous escalation without a name.
 */
export function canSeeRaiser(viewer: RosterMember, row: EscalationRow): boolean {
  return !row.is_anonymous || row.raised_by === viewer.id || isHr(viewer);
}

/** The assignee and HR move an escalation along; the raiser can only watch it. */
export function canProgressEscalation(viewer: RosterMember, row: EscalationRow): boolean {
  return isHr(viewer) || (row.assigned_to !== null && row.assigned_to === viewer.id);
}

export function validateEscalationUpdate(
  current: string | null,
  next: unknown,
  note: unknown,
): { ok: true; status: EscalationStatus; note: string | null } | { ok: false; error: string } {
  const status = String(next ?? "") as EscalationStatus;
  if (!ESCALATION_STATUSES.includes(status) || status === "raised") return { ok: false, error: "Choose acknowledged, in progress or resolved." };
  if (current === "resolved") return { ok: false, error: "This escalation is already resolved." };
  const from = ESCALATION_STATUSES.indexOf((current ?? "raised") as EscalationStatus);
  if (ESCALATION_STATUSES.indexOf(status) <= from) return { ok: false, error: "An escalation only moves forward." };
  const text = typeof note === "string" ? note.trim().slice(0, 2000) : "";
  if (status === "resolved" && !text) return { ok: false, error: "Say how it was resolved, so the person who raised it knows." };
  return { ok: true, status, note: text || null };
}
