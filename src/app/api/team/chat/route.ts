import { publicPerson, reply, teamContext } from "@/lib/teamServer";
import { canUseChannel, directChannel, groupChannelsFor, parseChannel, validateMessage } from "@/lib/teamWorkspace";

/**
 * Team chat.
 *
 * Three kinds of channel, all decided from the published org chart on every
 * request: a manager's team (the manager and their direct reports), a
 * department, and direct messages between two people in the same organisation.
 * Nothing about membership is stored — move somebody on the org chart and
 * their channels move with them.
 *
 * GET with no channel lists the channels you can use and your direct-message
 * threads. GET ?channel=… returns the latest messages, or only newer ones with
 * ?after=<ISO time>, which is how the page polls. POST sends.
 */

export const dynamic = "force-dynamic";

const HISTORY = 200;

type MessageRow = { id: string; channel: string; sender_id: string; body: string; created_at: string };

export async function GET(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster, byId } = auth.ctx;

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");

  if (!channel) {
    // Your direct threads are the dm channels with your id in them.
    // The latest thousand direct messages are plenty to find every recent thread.
    const { data: recentRows, error: recentError } = await admin
      .from("team_messages")
      .select("id, channel, sender_id, body, created_at")
      .eq("org_id", orgId)
      .like("channel", `dm:%${viewer.id}%`)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (recentError) return reply({ error: "Could not read your messages. Please retry." }, 503);
    const recent = (recentRows ?? []) as MessageRow[];

    const threads = new Map<string, MessageRow>();
    for (const row of recent) if (!threads.has(row.channel) && canUseChannel(viewer.id, row.channel, roster)) threads.set(row.channel, row);

    return reply({
      viewerId: viewer.id,
      channels: groupChannelsFor(viewer, roster),
      direct: [...threads.values()].map((row) => {
        const parsed = parseChannel(row.channel);
        const otherId = parsed?.kind === "direct" ? parsed.people.find((id) => id !== viewer.id) : undefined;
        return { id: row.channel, with: publicPerson(otherId ? byId.get(otherId) : undefined), last: { body: row.body.slice(0, 120), at: row.created_at, mine: row.sender_id === viewer.id } };
      }),
      people: roster.filter((person) => person.id !== viewer.id).map((person) => ({ ...publicPerson(person), channel: directChannel(viewer.id, person.id) })),
    });
  }

  if (!canUseChannel(viewer.id, channel, roster)) return reply({ error: "You are not in that conversation." }, 403);

  const after = url.searchParams.get("after");
  let query = admin.from("team_messages").select("id, channel, sender_id, body, created_at").eq("org_id", orgId).eq("channel", channel);
  if (after && !Number.isNaN(Date.parse(after))) query = query.gt("created_at", after);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(HISTORY);
  if (error) return reply({ error: "Could not read this conversation. Please retry." }, 503);

  return reply({
    channel,
    messages: (data ?? []).reverse().map((row) => ({
      id: row.id,
      body: row.body,
      at: row.created_at,
      mine: row.sender_id === viewer.id,
      sender: publicPerson(byId.get(row.sender_id)) ?? { id: row.sender_id, name: "Former colleague", initials: "?" },
    })),
  });
}

export async function POST(request: Request) {
  const auth = await teamContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, viewer, roster } = auth.ctx;

  const body = (await request.json().catch(() => ({}))) as { channel?: unknown; body?: unknown };
  const channel = typeof body.channel === "string" ? body.channel : "";
  if (!canUseChannel(viewer.id, channel, roster)) return reply({ error: "You are not in that conversation." }, 403);

  const message = validateMessage(body.body);
  if (!message.ok) return reply({ error: message.error }, 422);

  const { data, error } = await admin
    .from("team_messages")
    .insert({ org_id: orgId, channel, sender_id: viewer.id, body: message.text })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error) return reply({ error: "Could not send. Please retry." }, 500);

  return reply({ id: data.id, at: data.created_at }, 201);
}
