"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import {
  isLiveRoleplay,
  liveRoleplayFields,
  type LearningActivity,
  type LearningField,
  type LearningPayload,
} from "@/lib/learning";
import LearningMarkdown from "./LearningMarkdown";
import s from "./learning.module.css";

type Submission = {
  activity_id: string;
  payload: LearningPayload;
  status: string;
  updated_at: string;
};
type Room = {
  id: string;
  activity_id: string;
  name: string;
  status: string;
  turn_number: number;
  members: {
    trainee_id: string;
    name: string;
    role_name: string;
    seat: number;
  }[];
  messages: {
    id: string;
    trainee_id: string;
    body: string;
    created_at: string;
  }[];
};
type Dashboard = {
  trainee: { id: string; name: string };
  cohort: { name: string; clientName: string };
  activities: LearningActivity[];
  submissions: Submission[];
  rooms: Room[];
};
async function request<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
}
const date = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function LearningTrainee({
  token,
  activityId,
}: {
  token: string;
  activityId?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const api = `/api/public/learning/${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    try {
      setData(await request<Dashboard>(api));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);
  useEffect(() => {
    // Loaded after mount, in a callback, so the fetch never sets state during
    // the effect itself.
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);
  const activity = data?.activities.find((a) => a.id === activityId);
  useEffect(() => {
    if (activity?.type !== "roleplay") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [activity?.type, load]);
  const saved = data?.submissions.find((a) => a.activity_id === activityId);
  const room = data?.rooms.find((a) => a.activity_id === activityId);
  // A role-play acted out in the room is finished when you have written your
  // own feedback; a written one, when its turns are used up.
  const completed =
    data?.activities.filter((a) =>
      a.type === "roleplay" && !isLiveRoleplay(a)
        ? data.rooms.some(
            (r) => r.activity_id === a.id && r.status === "completed",
          )
        : data.submissions.some(
            (v) => v.activity_id === a.id && v.status === "submitted",
          ),
    ).length ?? 0;
  return (
    <main className={s.public}>
      <div className={s.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" />
        Pulse Learning
      </div>
      {error ? (
        <div role="alert" className={s.error}>
          {error}
          <div>
            <button className={s.button} onClick={() => void load()}>
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {!data && !error ? (
        <p className={s.empty}>Opening your learning area...</p>
      ) : null}
      {data ? (
        <>
          <header className={s.header}>
            <p className={s.muted}>{data.cohort.clientName}</p>
            <h1>
              {activityId
                ? (activity?.title ?? "Activity unavailable")
                : `Hello, ${data.trainee.name}`}
            </h1>
            <p className={s.muted}>{data.cohort.name}</p>
            {activityId ? (
              <Link className={s.button} href={`/t/${token}`}>
                <ArrowLeft size={16} />
                My learning
              </Link>
            ) : (
              <>
                <div className={s.spread}>
                  <span>
                    {completed} of {data.activities.length} complete
                  </span>
                  <span className={s.muted}>Your progress</span>
                </div>
                <progress
                  className={s.progress}
                  max={Math.max(data.activities.length, 1)}
                  value={completed}
                  aria-label="Learning progress"
                />
              </>
            )}
          </header>
          {notice ? (
            <div role="status" className={s.notice}>
              {notice}
            </div>
          ) : null}
          {!activityId ? (
            <div className={s.list}>
              {data.activities.length ? (
                data.activities.map((a) => {
                  const sub = data.submissions.find(
                    (v) => v.activity_id === a.id,
                  );
                  const group = data.rooms.find((r) => r.activity_id === a.id);
                  const done =
                    a.type === "roleplay" && !isLiveRoleplay(a)
                      ? group?.status === "completed"
                      : sub?.status === "submitted";
                  return (
                    <Link
                      key={a.id}
                      href={`/t/${token}/a/${a.id}`}
                      className={s.item}
                    >
                      <div className={s.spread}>
                        <span className={s.row}>
                          {a.type === "roleplay" ? (
                            <MessageSquare size={20} />
                          ) : done ? (
                            <CheckCircle2 size={20} />
                          ) : (
                            <BookOpen size={20} />
                          )}
                          <strong>{a.title}</strong>
                        </span>
                        <span
                          className={`${s.badge} ${!done ? s.pending : ""}`}
                        >
                          {done
                            ? "Done"
                            : sub?.status === "draft"
                              ? "Draft saved"
                              : a.type === "roleplay" && !group
                                ? "Awaiting group"
                                : isLiveRoleplay(a)
                                  ? "Feedback to write"
                                  : "To do"}
                        </span>
                      </div>
                      <p className={s.muted}>{a.summary}</p>
                      {done && sub ? (
                        <p className={s.muted}>{date(sub.updated_at)}</p>
                      ) : null}
                    </Link>
                  );
                })
              ) : (
                <p className={s.empty}>
                  Your facilitator will release activities here shortly.
                </p>
              )}
            </div>
          ) : null}
          {activityId && !activity ? (
            <p className={s.empty}>
              This activity is not available. Please contact your facilitator.
            </p>
          ) : null}
          {activity ? (
            <>
              {activity.type === "content" ? (
                <>
                  <LearningMarkdown>
                    {activity.config.body ?? ""}
                  </LearningMarkdown>
                  <button
                    className={s.primary}
                    disabled={saved?.status === "submitted"}
                    onClick={async () => {
                      try {
                        await request(api, { activityId: activity.id });
                        setNotice("Marked as read.");
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {saved?.status === "submitted" ? "Read" : "Mark as read"}
                  </button>
                </>
              ) : null}
              {activity.type === "form" ? (
                <LearningForm
                  key={activity.id}
                  activity={activity}
                  saved={saved}
                  api={api}
                  onSaved={async (message, draft) => {
                    if (draft) {
                      setNotice(message);
                      await load();
                    } else {
                      showToast(message, "success");
                      router.push(`/t/${token}`);
                    }
                  }}
                />
              ) : null}
              {activity.type === "roleplay" ? (
                <>
                  <LearningMarkdown>
                    {activity.config.scenario ?? ""}
                  </LearningMarkdown>
                  {!room ? (
                    <p className={s.notice}>
                      Your facilitator is arranging your role-play group.
                    </p>
                  ) : isLiveRoleplay(activity) ? (
                    <LiveRoleplay
                      activity={activity}
                      room={room}
                      traineeId={data.trainee.id}
                      saved={saved}
                      api={api}
                      onSaved={async (message, draft) => {
                        if (draft) {
                          setNotice(message);
                          await load();
                        } else {
                          showToast(message, "success");
                          router.push(`/t/${token}`);
                        }
                      }}
                    />
                  ) : (
                    <Roleplay
                      room={room}
                      traineeId={data.trainee.id}
                      rounds={activity.config.rounds ?? 1}
                      api={api}
                      refresh={load}
                    />
                  )}
                </>
              ) : null}
            </>
          ) : null}
          <footer className={`${s.group} ${s.muted}`}>
            Your facilitator can review your progress and saved work, including
            drafts. Role-play messages are shared with your assigned group. Keep
            your personal link private.
          </footer>
        </>
      ) : null}
    </main>
  );
}

/**
 * A role-play that happens away from Pulse.
 *
 * The group acts the scenario out together — in a room or on whatever call they
 * already use — and each person then writes their own account of it. Those
 * accounts are never shown to each other: the point is to compare what one
 * person intended with what the other experienced and what the observer saw,
 * and that only works if nobody is reading the others' answers first.
 */
function LiveRoleplay({
  activity,
  room,
  traineeId,
  saved,
  api,
  onSaved,
}: {
  activity: LearningActivity;
  room: Room;
  traineeId: string;
  saved?: Submission;
  api: string;
  onSaved: (message: string, draft: boolean) => Promise<void>;
}) {
  const me = room.members.find((m) => m.trainee_id === traineeId);
  const others = room.members.filter((m) => m.trainee_id !== traineeId);
  if (!me) {
    return (
      <p className={s.notice}>
        You are not in a group for this role-play yet. Your facilitator can add
        you to one.
      </p>
    );
  }
  const observing = me.seat < 0;
  return (
    <>
      <div className={s.group}>
        <h2>{room.name}</h2>
        <p>
          You are <strong>{me.role_name}</strong>
          {observing ? ", watching the conversation." : "."}
        </p>
        {others.length ? (
          <ul className={s.plain}>
            {others.map((m) => (
              <li key={m.trainee_id}>
                {m.name} — {m.role_name}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={s.muted}>
          {observing
            ? "Watch the conversation — in the room or on a call — without taking part. Note what people actually say and do. When it has finished, answer the questions below on your own."
            : "Have the conversation together — in the room or on a call. Pulse is not the conversation; it is where you record what happened afterwards. When you have finished, answer the questions below on your own."}
        </p>
        <p className={s.muted}>
          Your answers go to your facilitator. The other people in your group do
          not see them.
        </p>
      </div>
      <LearningForm
        key={activity.id}
        activity={{
          ...activity,
          config: {
            fields: liveRoleplayFields(activity.config, me.seat),
            intro: activity.config.intro,
            confirmText: activity.config.confirmText,
          },
        }}
        saved={saved}
        api={api}
        onSaved={onSaved}
      />
    </>
  );
}

function LearningForm({
  activity,
  saved,
  api,
  onSaved,
}: {
  activity: LearningActivity;
  saved?: Submission;
  api: string;
  onSaved: (message: string, draft: boolean) => Promise<void>;
}) {
  const [payload, setPayload] = useState<LearningPayload>(
    saved?.payload ??
      (activity.config.rows
        ? { rows: Array.from({ length: activity.config.rows }, () => ({})) }
        : {}),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(key: string, value: unknown, row?: number) {
    setDirty(true);
    setPayload((current) =>
      row === undefined
        ? { ...current, [key]: value }
        : {
            ...current,
            rows: (current.rows as LearningPayload[]).map((r, i) =>
              i === row ? { ...r, [key]: value } : r,
            ),
          },
    );
  }
  async function save(draft: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await request<{ message: string; email: string }>(api, {
        activityId: activity.id,
        payload,
        draft,
      });
      setDirty(false);
      await onSaved(
        r.message +
          (r.email === "failed"
            ? " Your work is safe, but the email receipt could not be delivered."
            : ""),
        draft,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fields = (list: LearningField[], row?: number) =>
    list.map((f) => (
      <LearningInput
        key={f.key}
        field={f}
        group={row === undefined ? "single" : String(row)}
        value={
          (row === undefined
            ? payload
            : (payload.rows as LearningPayload[])[row])[f.key]
        }
        change={(v) => update(f.key, v, row)}
      />
    ));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <p className={s.muted}>{activity.config.intro}</p>
      <p role="status" className={s.muted}>
        {dirty
          ? "Unsaved changes"
          : saved
            ? `Last saved ${date(saved.updated_at)}`
            : "Not saved yet"}
      </p>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      <fieldset disabled={busy} style={{ border: 0 }}>
        {activity.config.rows
          ? Array.from({ length: activity.config.rows }, (_, row) => (
              <fieldset className={s.group} key={row}>
                <legend>Goal {row + 1}</legend>
                {fields(activity.config.fields ?? [], row)}
              </fieldset>
            ))
          : fields(activity.config.fields ?? [])}
        {fields(activity.config.singleFields ?? [])}
      </fieldset>
      <div className={s.row}>
        <button
          type="button"
          className={s.button}
          disabled={busy}
          onClick={() => void save(true)}
        >
          <Save size={16} />
          Save draft
        </button>
        <button className={s.primary} disabled={busy}>
          <Send size={16} />
          {busy ? "Saving..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
function LearningInput({
  field: f,
  group,
  value,
  change,
}: {
  field: LearningField;
  group: string;
  value: unknown;
  change: (v: unknown) => void;
}) {
  const name = `${group}-${f.key}`;
  if (f.type === "choice" || f.type === "scale")
    return (
      <fieldset className={s.field}>
        <legend>
          {f.label}
          {f.required ? " *" : ""}
        </legend>
        <div className={f.type === "scale" ? s.scale : undefined}>
          {(f.type === "scale" ? [1, 2, 3, 4, 5] : (f.options ?? [])).map(
            (option) => (
              <label
                key={option}
                className={f.type === "choice" ? s.choice : undefined}
              >
                <input
                  type="radio"
                  name={name}
                  checked={value === option}
                  onChange={() => change(option)}
                />
                {option}
              </label>
            ),
          )}
        </div>
        {f.type === "scale" ? (
          <div className={`${s.spread} ${s.muted}`}>
            <span>1: {f.lowLabel ?? "Low"}</span>
            <span>5: {f.highLabel ?? "High"}</span>
          </div>
        ) : null}
      </fieldset>
    );
  return (
    <label className={s.field}>
      {f.label}
      {f.required ? " *" : ""}
      {f.type === "textarea" ? (
        <textarea
          maxLength={6000}
          value={String(value ?? "")}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          maxLength={1000}
          value={String(value ?? "")}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
}
function Roleplay({
  room,
  traineeId,
  rounds,
  api,
  refresh,
}: {
  room: Room;
  traineeId: string;
  rounds: number;
  api: string;
  refresh: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const players = room.members
    .filter((m) => m.seat >= 0)
    .sort((a, b) => a.seat - b.seat);
  const me = room.members.find((m) => m.trainee_id === traineeId);
  const turn = players[room.turn_number % players.length];
  const canSend =
    me?.seat === -1 ||
    (room.status === "active" && turn?.trainee_id === traineeId);
  async function send() {
    setBusy(true);
    setError("");
    try {
      if (!pending.current || pending.current.body !== message)
        pending.current = { body: message, id: crypto.randomUUID() };
      await request(api, {
        action: "speak",
        roomId: room.id,
        message,
        requestId: pending.current.id,
      });
      setMessage("");
      pending.current = null;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.group}>
      <div className={s.spread}>
        <h2>{room.name}</h2>
        <button
          className={s.icon}
          title="Refresh discussion"
          aria-label="Refresh discussion"
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className={s.muted}>
        Your role: <strong>{me?.role_name}</strong>
      </p>
      <p className={s.muted}>
        {room.members.map((m) => `${m.name} (${m.role_name})`).join(" · ")}
      </p>
      <div className={s.notice}>
        {room.status === "completed"
          ? "Role-play complete. Your discussion is saved."
          : `Round ${Math.floor(room.turn_number / players.length) + 1} of ${rounds}. ${turn?.name}'s turn as ${turn?.role_name}.`}
      </div>
      <div className={s.transcript} aria-live="polite">
        {[...room.messages]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => {
            const author = room.members.find(
              (p) => p.trainee_id === m.trainee_id,
            );
            return (
              <article className={s.message} key={m.id}>
                <strong>
                  {author?.name} · {author?.role_name}
                </strong>
                <p>{m.body}</p>
                <small className={s.muted}>{date(m.created_at)}</small>
              </article>
            );
          })}
      </div>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      {room.status === "active" || me?.seat === -1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className={s.field}>
            {me?.seat === -1
              ? "Observer feedback"
              : "Your response in character"}
            <textarea
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy || !canSend}
            />
          </label>
          <button
            className={s.primary}
            disabled={busy || !canSend || !message.trim()}
          >
            <Send size={16} />
            {busy ? "Sending..." : "Send response"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
