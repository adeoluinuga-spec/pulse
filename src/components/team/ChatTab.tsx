"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";

import { Avatar, Notice, SectionTitle } from "./teamUi";
import { api, formatTime, type ChatIndex, type Message } from "./teamClient";

/**
 * Team, department and direct-message chat. Channels come from the org chart
 * on the server; the open conversation checks for new messages every few
 * seconds while it is on screen.
 */

const POLL_MS = 5000;

export default function ChatTab({ initialChannel }: { initialChannel: string | null }) {
  const [index, setIndex] = useState<ChatIndex | null>(null);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<string | null>(initialChannel);
  const [picking, setPicking] = useState(false);

  const loadIndex = useCallback(async () => {
    try {
      const body = await api<ChatIndex>("/api/team/chat");
      setIndex(body);
      setError("");
      setChannel((current) => current ?? body.channels[0]?.id ?? null);
    } catch (thrown) {
      setError((thrown as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : loadIndex()));
    return () => {
      cancelled = true;
    };
  }, [loadIndex]);

  if (error) return <section className="px-4"><Notice tone="error">{error}</Notice></section>;
  if (!index) return <section className="px-4"><Notice>Loading conversations…</Notice></section>;

  const titleOf = (id: string) =>
    index.channels.find((item) => item.id === id)?.label ??
    index.direct.find((item) => item.id === id)?.with?.name ??
    index.people.find((person) => person.channel === id)?.name ??
    "Conversation";

  return (
    <section className="grid gap-4 px-4 md:grid-cols-[240px_1fr]">
      <nav aria-label="Conversations" className="space-y-4">
        <div className="space-y-1">
          <SectionTitle>Groups</SectionTitle>
          {index.channels.length ? (
            index.channels.map((item) => (
              <ChannelButton key={item.id} active={channel === item.id} onClick={() => setChannel(item.id)}>
                {item.kind === "department" ? `# ${item.label}` : item.label}
              </ChannelButton>
            ))
          ) : (
            <p className="text-xs text-muted">You are not in a team or department on the org chart yet.</p>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SectionTitle>Direct messages</SectionTitle>
            <button onClick={() => setPicking(!picking)} className="text-xs font-semibold text-pulse">{picking ? "Close" : "New"}</button>
          </div>
          {picking && (
            <label className="block text-xs font-semibold text-muted">
              Message a colleague
              <select
                defaultValue=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  setChannel(event.target.value);
                  setPicking(false);
                }}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink"
              >
                <option value="">Choose someone</option>
                {index.people.map((person) => <option key={person.id} value={person.channel}>{person.name}</option>)}
              </select>
            </label>
          )}
          {index.direct.map((thread) => (
            <ChannelButton key={thread.id} active={channel === thread.id} onClick={() => setChannel(thread.id)}>
              <span className="block truncate">{thread.with?.name ?? "Former colleague"}</span>
              <span className="block truncate text-[11px] font-normal opacity-70">{thread.last.mine ? "You: " : ""}{thread.last.body}</span>
            </ChannelButton>
          ))}
          {!index.direct.length && !picking && <p className="text-xs text-muted">No direct messages yet.</p>}
        </div>
      </nav>

      {channel ? (
        <Thread key={channel} channel={channel} title={titleOf(channel)} onSent={loadIndex} />
      ) : (
        <Notice>Choose a conversation.</Notice>
      )}
    </section>
  );
}

function ChannelButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-current={active ? "true" : undefined} className={clsx("w-full rounded-lg px-3 py-2 text-left text-sm font-semibold", active ? "bg-ink text-white" : "text-ink hover:bg-paper")}>
      {children}
    </button>
  );
}

function Thread({ channel, title, onSent }: { channel: string; title: string; onSent: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastAt = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const fetchNew = useCallback(async () => {
    const after = lastAt.current ? `&after=${encodeURIComponent(lastAt.current)}` : "";
    try {
      const body = await api<{ messages: Message[] }>(`/api/team/chat?channel=${encodeURIComponent(channel)}${after}`);
      if (body.messages.length) {
        lastAt.current = body.messages[body.messages.length - 1].at;
        setMessages((current) => {
          const seen = new Set(current.map((message) => message.id));
          return [...current, ...body.messages.filter((message) => !seen.has(message.id))];
        });
      }
      setError("");
    } catch (thrown) {
      setError((thrown as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [channel]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") void fetchNew();
    };
    void Promise.resolve().then(tick);
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchNew]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await api("/api/team/chat", { method: "POST", body: JSON.stringify({ channel, body: text }) });
      setDraft("");
      await fetchNew();
      onSent();
    } catch (thrown) {
      setError((thrown as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[420px] flex-col rounded-lg border border-border bg-paper p-3">
      <p className="mb-3 text-sm font-semibold text-ink">{title}</p>
      <div className="flex-1 space-y-2 overflow-y-auto" aria-live="polite">
        {loaded && !messages.length && !error && <p className="text-sm text-muted">No messages yet. Say hello.</p>}
        {messages.map((message) => (
          <div key={message.id} className={clsx("flex gap-2", message.mine ? "justify-end" : "justify-start")}>
            {!message.mine && <Avatar person={message.sender} size="sm" />}
            <div className={clsx("max-w-[78%] rounded-lg px-3 py-2 text-sm", message.mine ? "bg-pulse text-white" : "bg-card text-ink")}>
              <p className="text-[10px] font-semibold opacity-70">{message.mine ? "You" : message.sender.name} · {formatTime(message.at)}</p>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red">{error}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="team-chat-message">Message</label>
        <input
          id="team-chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={4000}
          placeholder={`Message ${title}`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-base outline-none focus:border-pulse"
        />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="rounded-lg bg-pulse px-3 text-white disabled:opacity-40">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
