"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Pencil,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { describeFileType, fileSizeLabel } from "@/lib/learningFiles";
import {
  isLiveRoleplay,
  learningCsv,
  liveRoleplayFields,
  type LearningActivity,
  type LearningConfig,
} from "@/lib/learning";
import ActivityBuilder from "./ActivityBuilder";
import LearningInvitations from "./LearningInvitations";
import s from "./learning.module.css";

type Trainee = {
  id: string;
  display_name: string;
  email: string | null;
  token: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
};
type Member = {
  room_id: string;
  activity_id: string;
  trainee_id: string;
  role_name: string;
  seat: number;
};
type Room = { id: string; activity_id: string; name: string; status: string };
type Submission = {
  activity_id: string;
  trainee_id: string;
  status: string;
  payload: Record<string, unknown>;
  updated_at: string;
};
type Message = {
  id: string;
  room_id: string;
  trainee_id: string;
  body: string;
  created_at: string;
};
type MaterialFile = {
  id: string;
  activity_id: string;
  name: string;
  mime: string;
  size_bytes: number;
};
type Cohort = {
  id: string;
  name: string;
  client_name: string;
  status: string;
  learning_trainees?: { count: number }[];
  learning_activities?: { count: number }[];
};
type Detail = {
  cohort: Cohort;
  trainees: Trainee[];
  activities: LearningActivity[];
  submissions: Submission[];
  rooms: Room[];
  members: Member[];
  messages: Message[];
  files: MaterialFile[];
};

async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please retry.");
  return result;
}

export function LearningIndex({ create = false }: { create?: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [starter, setStarter] = useState(true);
  useEffect(() => {
    api<{ cohorts: Cohort[] }>("/api/learning/cohorts")
      .then((r) => {
        setCohorts(r.cohorts);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/learning/cohorts", {
        name,
        clientName: client,
        starter,
      });
      showToast("Learning programme created.", "success");
      router.push(`/cohorts/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={s.workspace}>
      <header className={s.header}>
        <div className={s.spread}>
          <div>
            <p className={s.muted}>Talent development</p>
            <h1>{create ? "New learning programme" : "Learning area"}</h1>
          </div>
          {!create ? (
            <Link className={s.primary} href="/cohorts/new">
              <Plus size={16} />
              New programme
            </Link>
          ) : (
            <Link className={s.button} href="/cohorts">
              <ArrowLeft size={16} />
              Programmes
            </Link>
          )}
        </div>
      </header>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      {create ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ maxWidth: 640 }}
        >
          <label className={s.field}>
            Programme name
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Manager Development Programme"
            />
          </label>
          <label className={s.field}>
            Client name
            <input
              required
              maxLength={200}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Bracken Media Solutions"
            />
          </label>
          <label className={s.choice}>
            <input
              type="checkbox"
              checked={starter}
              onChange={(e) => setStarter(e.target.checked)}
            />
            Include the manager development starter activities
          </label>
          <button className={s.primary} disabled={busy}>
            <Plus size={16} />
            {busy ? "Creating..." : "Create programme"}
          </button>
        </form>
      ) : (
        <div className={s.list}>
          {cohorts.map((c) => (
            <Link className={s.item} href={`/cohorts/${c.id}`} key={c.id}>
              <div className={s.spread}>
                <strong>{c.name}</strong>
                <span
                  className={`${s.badge} ${c.status === "archived" ? s.pending : ""}`}
                >
                  {c.status}
                </span>
              </div>
              <p className={s.muted}>
                {c.client_name} · {c.learning_trainees?.[0]?.count ?? 0}{" "}
                trainees · {c.learning_activities?.[0]?.count ?? 0} activities
              </p>
            </Link>
          ))}
          {!cohorts.length && !error ? (
            <p className={s.empty}>
              {loaded ? "No learning programmes yet." : "Loading programmes..."}
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default function LearningWorkspace({ id }: { id: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("Trainees");
  const [paste, setPaste] = useState("");
  const [editing, setEditing] = useState<LearningActivity | "new" | null>(null);
  const [selected, setSelected] = useState("");
  const [roomActivity, setRoomActivity] = useState<LearningActivity | null>(
    null,
  );
  const endpoint = `/api/learning/cohorts/${id}`;
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(endpoint));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [endpoint]);
  useEffect(() => {
    // Loaded after mount, in a callback, so the fetch never sets state during
    // the effect itself.
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);
  async function act(body: unknown, message: string) {
    setBusy(true);
    setError("");
    try {
      await api(endpoint, body);
      await load();
      showToast(message, "success");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied.", "success");
    } catch {
      showToast(
        "Clipboard unavailable. Please use a browser with clipboard access.",
        "error",
      );
    }
  }
  const link = (t: Trainee) =>
    t.token ? `${window.location.origin}/t/${t.token}` : "";
  if (!data)
    return (
      <main className={s.workspace}>
        <h1>Learning programme</h1>
        <p className={error ? s.error : s.empty}>{error || "Loading..."}</p>
        <button className={s.button} onClick={() => void load()}>
          <RefreshCw size={16} />
          Retry
        </button>
      </main>
    );
  const activities = [...data.activities].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const activity = activities.find((a) => a.id === selected) ?? activities[0];
  // A written role-play is done when its turns are used up. A live one is acted
  // out away from Pulse, so the only thing Pulse can see is whether the person
  // has written their feedback — same as a form.
  const completed = (traineeId: string) =>
    activities.filter(
      (a) =>
        a.released &&
        (a.type === "roleplay" && !isLiveRoleplay(a)
          ? data.members.some(
              (m) =>
                m.trainee_id === traineeId &&
                m.activity_id === a.id &&
                data.rooms.some(
                  (r) => r.id === m.room_id && r.status === "completed",
                ),
            )
          : data.submissions.some(
              (v) =>
                v.trainee_id === traineeId &&
                v.activity_id === a.id &&
                v.status === "submitted",
            )),
    ).length;
  const rows: unknown[][] =
    activity?.type === "roleplay"
      ? [
          ["Group", "Trainee", "Role", "Message", "Sent at"],
          ...data.messages
            .filter((m) =>
              data.rooms.some(
                (r) => r.id === m.room_id && r.activity_id === activity.id,
              ),
            )
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((m) => [
              data.rooms.find((r) => r.id === m.room_id)?.name,
              data.trainees.find((t) => t.id === m.trainee_id)?.display_name,
              data.members.find(
                (v) => v.trainee_id === m.trainee_id && v.room_id === m.room_id,
              )?.role_name,
              m.body,
              m.created_at,
            ]),
        ]
      : [
          ["Trainee", "Status", "Updated", "Answers"],
          ...data.trainees.map((t) => {
            const v = data.submissions.find(
              (v) => v.trainee_id === t.id && v.activity_id === activity?.id,
            );
            return [
              t.display_name,
              v?.status ?? "Not submitted",
              v?.updated_at ?? "",
              v?.payload ?? "",
            ];
          }),
        ];
  function download() {
    const blob = new Blob([learningCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learning-responses.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function move(index: number, direction: number) {
    const other = activities[index + direction];
    if (!other) return;
    setBusy(true);
    try {
      const ordered = [...activities];
      [ordered[index], ordered[index + direction]] = [
        ordered[index + direction],
        ordered[index],
      ];
      await api(endpoint, {
        action: "reorder",
        activityIds: ordered.map((a) => a.id),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={s.workspace}>
      <Link href="/cohorts" className={s.button}>
        <ArrowLeft size={16} />
        Programmes
      </Link>
      <header className={s.header}>
        <p className={s.muted}>{data.cohort.client_name}</p>
        <div className={s.spread}>
          <h1>{data.cohort.name}</h1>
          <label className={s.field}>
            Programme status
            <select
              disabled={busy}
              value={data.cohort.status}
              onChange={(e) =>
                void act(
                  { action: "status", status: e.target.value },
                  "Programme status updated.",
                )
              }
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <p className={s.muted}>
          {data.trainees.length} trainees ·{" "}
          {activities.filter((a) => a.released).length} released activities
        </p>
      </header>
      <nav className={s.tabs} aria-label="Programme views">
        {["Trainees", "Activities", "Responses"].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            className={tab === t ? s.primary : s.button}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <button
          title="Refresh programme"
          aria-label="Refresh programme"
          className={s.icon}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </nav>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      {tab === "Trainees" ? (
        <>
          <details>
            <summary className={s.button}>
              <Plus size={16} />
              Add trainees
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  { action: "trainees", text: paste },
                  "Trainees added.",
                ).then((ok) => {
                  if (ok) setPaste("");
                });
              }}
            >
              <label className={s.field}>
                One trainee per line: Name, email
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Ada Okafor, ada@example.com"
                  required
                />
              </label>
              <button className={s.primary} disabled={busy}>
                <Users size={16} />
                Add trainees
              </button>
            </form>
          </details>
          <div className={s.spread}>
            <h2>Trainees</h2>
            <button
              className={s.button}
              disabled={!data.trainees.some((t) => t.token)}
              onClick={() =>
                void copy(
                  data.trainees
                    .filter((t) => t.token)
                    .map((t) => `${t.display_name} - ${link(t)}`)
                    .join("\n"),
                )
              }
            >
              <Copy size={16} />
              Copy all links
            </button>
          </div>
          <LearningInvitations cohortId={id} active={data.cohort.status === "active"} trainees={data.trainees} />
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Progress</th>
                  <th>Last opened</th>
                  <th>Personal link</th>
                </tr>
              </thead>
              <tbody>
                {data.trainees.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.display_name}</strong>
                      <p className={s.muted}>{t.email ?? "No email"}</p>
                    </td>
                    <td>
                      {completed(t.id)} /{" "}
                      {activities.filter((a) => a.released).length}
                    </td>
                    <td>
                      {t.last_seen_at
                        ? new Date(t.last_seen_at).toLocaleString()
                        : "Not opened"}
                    </td>
                    <td>
                      <div className={s.row}>
                        {t.token ? (
                          <>
                            <button
                              className={s.icon}
                              title={`Copy link for ${t.display_name}`}
                              aria-label={`Copy link for ${t.display_name}`}
                              onClick={() => void copy(link(t))}
                            >
                              <Copy size={16} />
                            </button>
                            <details>
                              <summary>Manage link</summary>
                              <p className={s.muted}>
                                Expires{" "}
                                {new Date(t.expires_at).toLocaleDateString()}
                              </p>
                              <button
                                className={s.button}
                                disabled={busy}
                                onClick={() =>
                                  void act(
                                    { action: "revoke", traineeId: t.id },
                                    "Personal link revoked.",
                                  )
                                }
                              >
                                Revoke link
                              </button>
                            </details>
                          </>
                        ) : (
                          <button
                            className={s.button}
                            disabled={busy}
                            onClick={() =>
                              void act(
                                { action: "rotate", traineeId: t.id },
                                "A new personal link is ready.",
                              )
                            }
                          >
                            <RefreshCw size={16} />
                            Issue new link
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.trainees.length ? (
            <p className={s.empty}>No trainees yet.</p>
          ) : null}
        </>
      ) : null}
      {tab === "Activities" ? (
        <>
          <div className={s.spread}>
            <h2>Activities</h2>
            <button
              className={s.primary}
              disabled={busy}
              onClick={() => setEditing("new")}
            >
              <Plus size={16} />
              Add activity
            </button>
          </div>
          {editing ? (
            <ActivityBuilder
              key={typeof editing === "string" ? "new" : editing.id}
              activity={editing === "new" ? undefined : editing}
              busy={busy}
              close={() => setEditing(null)}
              save={async (value) => {
                if (
                  await act({ action: "activity", ...value }, "Activity saved.")
                )
                  setEditing(null);
              }}
            />
          ) : null}
          <div className={s.list}>
            {activities.map((a, i) => (
              <article className={s.item} key={a.id}>
                <div className={s.spread}>
                  <div>
                    <strong>{a.title}</strong>
                    <p className={s.muted}>
                      {a.type === "roleplay"
                        ? "Role-play"
                        : a.type === "form"
                          ? "Form"
                          : "Material"}{" "}
                      · {a.summary}
                    </p>
                  </div>
                  <div className={s.row}>
                    <label className={s.choice}>
                      <input
                        type="checkbox"
                        checked={a.released}
                        disabled={busy}
                        onChange={(e) =>
                          void act(
                            {
                              action: "release",
                              activityId: a.id,
                              released: e.target.checked,
                            },
                            e.target.checked
                              ? "Activity released."
                              : "Activity hidden.",
                          )
                        }
                      />
                      Released
                    </label>
                    <button
                      className={s.icon}
                      title="Edit activity"
                      aria-label={`Edit ${a.title}`}
                      onClick={() => setEditing(a)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className={s.icon}
                      title="Move up"
                      aria-label={`Move ${a.title} up`}
                      disabled={busy || !i}
                      onClick={() => void move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className={s.icon}
                      title="Move down"
                      aria-label={`Move ${a.title} down`}
                      disabled={busy || i === activities.length - 1}
                      onClick={() => void move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className={s.icon}
                      title="Delete unused activity"
                      aria-label={`Delete ${a.title}`}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          { action: "delete", activityId: a.id },
                          "Activity deleted.",
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <ActivityFiles
                  activity={a}
                  files={(data.files ?? []).filter(
                    (file) => file.activity_id === a.id,
                  )}
                  endpoint={`${endpoint}/files`}
                  reload={load}
                />
                {a.type === "roleplay" ? (
                  <button
                    className={s.button}
                    onClick={() =>
                      setRoomActivity(roomActivity?.id === a.id ? null : a)
                    }
                  >
                    <Users size={16} />
                    Assign role-play groups
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {roomActivity ? (
            <RoomEditor
              key={roomActivity.id}
              activity={roomActivity}
              data={data}
              busy={busy}
              act={act}
            />
          ) : null}
        </>
      ) : null}
      {tab === "Responses" ? (
        <>
          <div className={s.spread}>
            <label className={s.field}>
              Activity
              <select
                aria-label="Activity"
                value={activity?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <div className={s.row}>
              <button
                className={s.button}
                disabled={!activity}
                onClick={() => void copy(learningCsv(rows))}
              >
                <Copy size={16} />
                Copy all
              </button>
              <button
                className={s.button}
                disabled={!activity}
                onClick={download}
              >
                <Download size={16} />
                CSV export
              </button>
            </div>
          </div>
          {activity?.type === "roleplay" ? (
            <>
              {data.rooms
                .filter((r) => r.activity_id === activity.id)
                .map((room) => (
                  <section className={s.group} key={room.id}>
                    <div className={s.spread}>
                      <h2>{room.name}</h2>
                      <span className={s.badge}>{room.status}</span>
                    </div>
                    <p className={s.muted}>
                      {data.members
                        .filter((m) => m.room_id === room.id)
                        .map(
                          (m) =>
                            `${data.trainees.find((t) => t.id === m.trainee_id)?.display_name} (${m.role_name})`,
                        )
                        .join(" · ")}
                    </p>
                    {isLiveRoleplay(activity) ? (
                      <LiveComparison
                        activity={activity}
                        members={data.members.filter(
                          (m) => m.room_id === room.id,
                        )}
                        trainees={data.trainees}
                        submissions={data.submissions}
                      />
                    ) : null}
                    {data.messages
                      .filter((m) => m.room_id === room.id)
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .map((m) => (
                        <article className={s.message} key={m.id}>
                          <strong>
                            {
                              data.trainees.find((t) => t.id === m.trainee_id)
                                ?.display_name
                            }
                          </strong>
                          <p>{m.body}</p>
                          <small>
                            {new Date(m.created_at).toLocaleString()}
                          </small>
                        </article>
                      ))}
                    {room.status === "active" ? (
                      <button
                        className={s.button}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            { action: "close_room", roomId: room.id },
                            "Role-play completed.",
                          )
                        }
                      >
                        Finish this role-play
                      </button>
                    ) : null}
                  </section>
                ))}
              <p className={s.muted}>
                Awaiting assignment:{" "}
                {data.trainees
                  .filter(
                    (t) =>
                      !data.members.some(
                        (m) =>
                          m.trainee_id === t.id &&
                          m.activity_id === activity.id,
                      ),
                  )
                  .map((t) => t.display_name)
                  .join(", ") || "None"}
              </p>
            </>
          ) : activity ? (
            <div className={s.list}>
              {data.trainees.map((t) => {
                const response = data.submissions.find(
                  (v) => v.activity_id === activity.id && v.trainee_id === t.id,
                );
                return (
                  <article className={s.item} key={t.id}>
                    <div className={s.spread}>
                      <strong>{t.display_name}</strong>
                      <span
                        className={`${s.badge} ${response?.status !== "submitted" ? s.pending : ""}`}
                      >
                        {response?.status ?? "Not submitted"}
                      </span>
                    </div>
                    {response ? (
                      <>
                        <p className={s.muted}>
                          {new Date(response.updated_at).toLocaleString()}
                        </p>
                        <Answers
                          activity={activity}
                          payload={response.payload}
                        />
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className={s.empty}>No activities yet.</p>
          )}
        </>
      ) : null}
    </main>
  );
}

function RoomEditor({
  activity,
  data,
  busy,
  act,
}: {
  activity: LearningActivity;
  data: Detail;
  busy: boolean;
  act: (value: unknown, message: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [seats, setSeats] = useState<Record<string, string>>({});
  const available = data.trainees.filter(
    (t) =>
      !data.members.some(
        (m) => m.activity_id === activity.id && m.trainee_id === t.id,
      ),
  );
  const roles = [...(activity.config.roles ?? []), "Observer (optional)"];
  return (
    <form
      className={s.group}
      onSubmit={(e) => {
        e.preventDefault();
        const members = roles.flatMap((_, i) =>
          seats[i]
            ? [{ traineeId: seats[i], seat: i === roles.length - 1 ? -1 : i }]
            : [],
        );
        void act(
          { action: "room", activityId: activity.id, name, members },
          "Role-play group created.",
        ).then((ok) => {
          if (ok) {
            setName("");
            setSeats({});
          }
        });
      }}
    >
      <h2>Assign roles: {activity.title}</h2>
      <label className={s.field}>
        Group name
        <input
          required
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="Practice group 1"
        />
      </label>
      <div className={s.grid}>
        {roles.map((role, i) => (
          <label className={s.field} key={i}>
            {role}
            <select
              required={i < roles.length - 1}
              value={seats[i] ?? ""}
              onChange={(e) => setSeats({ ...seats, [i]: e.target.value })}
            >
              <option value="">Choose trainee</option>
              {available.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  disabled={Object.entries(seats).some(
                    ([key, value]) => Number(key) !== i && value === t.id,
                  )}
                >
                  {t.display_name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button className={s.primary} disabled={busy}>
        <Users size={16} />
        Create group
      </button>
    </form>
  );
}
function Answers({
  activity,
  payload,
}: {
  activity: LearningActivity;
  payload: Record<string, unknown>;
}) {
  const render = (config: LearningConfig, source: Record<string, unknown>) =>
    config.fields?.map((f) => (
      <div key={f.key}>
        <strong>{f.label}</strong>
        <p style={{ whiteSpace: "pre-wrap", marginBottom: 14 }}>
          {String(source[f.key] ?? "No answer")}
        </p>
      </div>
    ));
  return (
    <div>
      {Array.isArray(payload.rows) ? (
        <>
          {payload.rows.map((row, i) => (
            <section key={i} className={s.group}>
              <h3>Goal {i + 1}</h3>
              {render(activity.config, row)}
            </section>
          ))}
          {render({ fields: activity.config.singleFields }, payload)}
        </>
      ) : (
        render(
          {
            fields: [
              ...(activity.config.fields ?? []),
              ...(activity.config.singleFields ?? []),
            ],
          },
          payload,
        )
      )}
    </div>
  );
}

/**
 * The three accounts of one live role-play, side by side.
 *
 * Each person answered on their own, without seeing anybody else's answers, so
 * the differences between them are real. A participant who felt heard next to
 * one who felt interrupted next to an observer who counted the interruptions is
 * the whole point of running the exercise.
 */
function LiveComparison({
  activity,
  members,
  trainees,
  submissions,
}: {
  activity: LearningActivity;
  members: Member[];
  trainees: Trainee[];
  submissions: Submission[];
}) {
  const seated = [...members].sort((a, b) => a.seat - b.seat);
  const answered = seated.filter((m) =>
    submissions.some(
      (v) =>
        v.trainee_id === m.trainee_id &&
        v.activity_id === activity.id &&
        v.status === "submitted",
    ),
  );
  return (
    <>
      <p className={s.muted}>
        {answered.length} of {seated.length} have written their feedback. Each
        person answered without seeing the others.
      </p>
      <div className={s.compare}>
        {seated.map((member) => {
          const trainee = trainees.find((t) => t.id === member.trainee_id);
          const submission = submissions.find(
            (v) =>
              v.trainee_id === member.trainee_id &&
              v.activity_id === activity.id,
          );
          const fields = liveRoleplayFields(activity.config, member.seat);
          return (
            <article className={s.compareCard} key={member.trainee_id}>
              <h4>{trainee?.display_name ?? "Trainee"}</h4>
              <p className={s.muted}>{member.role_name}</p>
              {!submission ? (
                <p className={s.muted}>Nothing written yet.</p>
              ) : (
                <>
                  {submission.status === "draft" ? (
                    <p className={s.muted}>Draft, not submitted.</p>
                  ) : null}
                  <dl>
                    {fields.map((field) => (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>
                          {submission.payload[field.key] === undefined ||
                          submission.payload[field.key] === ""
                            ? "—"
                            : String(submission.payload[field.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

/**
 * Material attached to one activity: a deck, a handout, a worksheet.
 *
 * Uploading goes through the server rather than straight to storage, so a file
 * is checked before it exists. Opening one asks for a link that lasts five
 * minutes — the facilitator never holds a lasting address, and neither does
 * anybody they forward it to by accident.
 */
function ActivityFiles({
  activity,
  files,
  endpoint,
  reload,
}: {
  activity: LearningActivity;
  files: MaterialFile[];
  endpoint: string;
  reload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("activityId", activity.id);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The upload did not finish.");
      showToast(`${file.name} attached.`, "success");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fileId: string, action: "open" | "delete") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please retry.");
      if (action === "delete") {
        showToast("File removed.", "success");
        await reload();
      } else {
        window.open(result.url, "_blank", "noopener");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {files.length ? (
        <ul className={s.plain}>
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className={s.linkButton}
                disabled={busy}
                onClick={() => void act(file.id, "open")}
              >
                {file.name}
              </button>{" "}
              <span className={s.muted}>
                {describeFileType(file.mime).label} · {fileSizeLabel(file.size_bytes)}
              </span>{" "}
              <button
                type="button"
                className={s.icon}
                aria-label={`Remove ${file.name}`}
                disabled={busy}
                onClick={() => void act(file.id, "delete")}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className={s.choice}>
        <Paperclip size={15} />
        {busy ? "Working..." : "Attach a file"}
        <input
          type="file"
          hidden
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
