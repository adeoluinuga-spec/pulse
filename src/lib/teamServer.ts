/**
 * Server plumbing for the team workspace routes.
 *
 * Every route reads with the service-role client, so the organisation check
 * and the org-chart rules in `teamWorkspace` are the whole of the access
 * control — the tables behind chat and escalations are closed to browsers.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import type { RosterMember } from "@/lib/teamWorkspace";

export type Admin = SupabaseClient;

export type TeamPerson = RosterMember & {
  role: string | null;
  team: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  initials: string | null;
};

export type TeamContext = { admin: Admin; orgId: string; viewer: TeamPerson; roster: TeamPerson[]; byId: Map<string, TeamPerson> };

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE });
}

const PERSON_COLUMNS = "id, name, role, department, team, line_manager_id, people_responsibility, platform_role, avatar_url, avatar_color, initials";

/** Every row a query matches, a page at a time, failing loudly rather than returning part of the answer. */
export async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** Who is asking, and the organisation chart everything is decided against. */
export async function teamContext(): Promise<{ ok: true; ctx: TeamContext } | { ok: false; response: NextResponse }> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: reply({ error: "Sign in first." }, 401) };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: me, error } = await admin
    .from("employees")
    .select(`${PERSON_COLUMNS}, org_id`)
    .eq("user_id", user.id)
    .maybeSingle<TeamPerson & { org_id: string | null }>();
  if (error) return { ok: false, response: reply({ error: "Could not confirm who you are. Please retry." }, 503) };
  if (!me?.org_id) return { ok: false, response: reply({ error: "Your account is not linked to an organisation." }, 403) };

  let roster: TeamPerson[];
  try {
    roster = await readAll<TeamPerson>((from, to) =>
      admin.from("employees").select(PERSON_COLUMNS).eq("org_id", me.org_id as string).order("id").range(from, to),
    );
  } catch {
    return { ok: false, response: reply({ error: "Could not read your organisation. Please retry." }, 503) };
  }

  const viewer = roster.find((person) => person.id === me.id) ?? me;
  return { ok: true, ctx: { admin, orgId: me.org_id, viewer, roster, byId: new Map(roster.map((person) => [person.id, person])) } };
}

/** What a person looks like to another person on the page — no pay, no contact details. */
export function publicPerson(person: TeamPerson | undefined) {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    department: person.department,
    team: person.team,
    avatarUrl: person.avatar_url,
    avatarColor: person.avatar_color,
    initials: person.initials ?? person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  };
}

/** An in-app notification. Best effort: a failed notification must not undo the action it describes. */
export async function notify(admin: Admin, employeeIds: Array<string | null | undefined>, note: { title: string; body: string; type: string; actionUrl: string }) {
  const rows = [...new Set(employeeIds.filter((id): id is string => Boolean(id)))].map((employeeId) => ({
    employee_id: employeeId,
    title: note.title,
    body: note.body,
    type: note.type,
    action_url: note.actionUrl,
  }));
  if (!rows.length) return;
  const { error } = await admin.from("notifications").insert(rows);
  if (error) console.error("team notification failed:", error.message);
}
