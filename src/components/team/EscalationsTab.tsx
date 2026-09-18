"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import { useToast } from "@/components/ui/Toast";
import { Avatar, Notice, Panel, SectionTitle } from "./teamUi";
import { api, ApiError, formatDate, label, type Escalation, type EscalationsResponse } from "./teamClient";

/**
 * Raising a concern and seeing it through. Where it goes is decided by the
 * server from the org chart; the form says where before it is sent.
 */

const TYPES = [
  { key: "operational", text: "Operational", routes: "your line manager" },
  { key: "general", text: "General", routes: "your line manager" },
  { key: "people", text: "People", routes: "HR" },
  { key: "wellbeing", text: "Wellbeing", routes: "HR" },
] as const;

const STEPS = ["raised", "acknowledged", "in_progress", "resolved"] as const;

export default function EscalationsTab() {
  const { showToast } = useToast();
  const [data, setData] = useState<EscalationsResponse | null>(null);
  const [error, setError] = useState("");
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<EscalationsResponse>("/api/team/escalations"));
      setError("");
    } catch (thrown) {
      setError((thrown as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) return <section className="px-4"><Notice tone="error">{error}</Notice></section>;
  if (!data) return <section className="px-4"><Notice>Loading escalations…</Notice></section>;

  return (
    <section className="space-y-5 px-4">
      {raising ? (
        <RaiseForm
          onCancel={() => setRaising(false)}
          onRaised={async (routedTo) => {
            setRaising(false);
            showToast(routedTo === "hr" ? "Sent to HR. You'll be notified as it progresses." : "Sent to your line manager. You'll be notified as it progresses.", "success");
            await load();
          }}
        />
      ) : (
        <button onClick={() => setRaising(true)} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white">
          Raise an escalation
        </button>
      )}

      <div className="space-y-2">
        <SectionTitle>{data.viewerIsHr ? "Sent to you or to HR" : "Sent to you"}</SectionTitle>
        {data.toHandle.length ? (
          data.toHandle.map((item) => <EscalationCard key={item.id} item={item} onChanged={load} />)
        ) : (
          <Notice>Nothing has been escalated to you.</Notice>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle>Raised by you</SectionTitle>
        {data.raised.length ? data.raised.map((item) => <EscalationCard key={item.id} item={item} onChanged={load} />) : <Notice>You have not raised anything.</Notice>}
      </div>
    </section>
  );
}

function RaiseForm({ onCancel, onRaised }: { onCancel: () => void; onRaised: (routedTo: "hr" | "manager") => void }) {
  const [form, setForm] = useState({ title: "", description: "", type: "operational", urgency: "medium", anonymous: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const route = TYPES.find((type) => type.key === form.type)?.routes ?? "your line manager";

  const submit = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const result = await api<{ routedTo: "hr" | "manager" }>("/api/team/escalations", { method: "POST", body: JSON.stringify(form) });
      onRaised(result.routedTo);
    } catch (thrown) {
      setErrors(thrown instanceof ApiError && thrown.errors.length ? thrown.errors : [(thrown as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-3">
      <p className="text-sm font-semibold text-ink">Raise an escalation</p>
      <label className="block text-xs font-semibold text-muted">
        Title
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
      </label>
      <fieldset>
        <legend className="text-xs font-semibold text-muted">Kind of concern</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              aria-pressed={form.type === type.key}
              onClick={() => setForm({ ...form, type: type.key, anonymous: type.key === "people" ? form.anonymous : false })}
              className={clsx("rounded-full border px-3 py-2 text-xs font-semibold", form.type === type.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border text-muted")}
            >
              {type.text}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs font-semibold text-muted">
        What is happening
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
      </label>
      <label className="block text-xs font-semibold text-muted">
        Urgency
        <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      {form.type === "people" && (
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} className="mt-1" />
          <span>Raise anonymously. Your name is hidden from managers. HR can still see it, so they can follow up with you.</span>
        </label>
      )}
      <p className="text-xs text-muted">This will go to <strong>{route}</strong>.</p>
      {errors.length > 0 && <Notice tone="error">{errors.join(" ")}</Notice>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Sending…" : "Send"}</button>
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
      </div>
    </Panel>
  );
}

function EscalationCard({ item, onChanged }: { item: Escalation; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const step = STEPS.indexOf(item.status as (typeof STEPS)[number]);

  const move = async (status: string) => {
    setBusy(true);
    try {
      await api("/api/team/escalations", { method: "PATCH", body: JSON.stringify({ id: item.id, status, note }) });
      showToast(`Marked ${label(status).toLowerCase()}.`, "success");
      setResolving(false);
      await onChanged();
    } catch (thrown) {
      showToast((thrown as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const who = item.mine ? null : item.raisedBy ? item.raisedBy.name : "Anonymous";
  const next = step < 1 ? "acknowledged" : step < 2 ? "in_progress" : null;

  return (
    <div className={clsx("rounded-lg border bg-card p-4", item.urgency === "critical" && item.status !== "resolved" ? "border-red" : "border-border")}>
      <div className="flex items-start gap-3">
        {!item.mine && item.raisedBy && <Avatar person={item.raisedBy} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          <p className="text-xs text-muted">
            {[label(item.type), label(item.urgency), formatDate(item.createdAt), who ? `from ${who}` : null, item.mine ? (item.routedToHr ? "sent to HR" : `sent to ${item.assignedTo?.name ?? "your manager"}`) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {item.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{item.description}</p>}
          <div className="mt-3 flex gap-1" aria-label={`Status: ${label(item.status)}`}>
            {STEPS.map((name, index) => <div key={name} className={clsx("h-1.5 flex-1 rounded-full", index <= step ? "bg-pulse" : "bg-border")} />)}
          </div>
          <p className="mt-1 text-[11px] font-semibold text-muted">{label(item.status)}</p>
          {item.resolutionNote && <p className="mt-2 rounded-lg bg-paper p-2 text-xs text-ink">Resolution: {item.resolutionNote}</p>}
        </div>
      </div>
      {item.canProgress && item.status !== "resolved" && (
        <div className="mt-3 space-y-2">
          {resolving && (
            <label className="block text-xs font-semibold text-muted">
              How was it resolved?
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {next && !resolving && (
              <button disabled={busy} onClick={() => move(next)} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {next === "acknowledged" ? "Acknowledge" : "Mark in progress"}
              </button>
            )}
            {resolving ? (
              <>
                <button disabled={busy || !note.trim()} onClick={() => move("resolved")} className="rounded-lg bg-pulse px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Resolve</button>
                <button onClick={() => setResolving(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted">Cancel</button>
              </>
            ) : (
              <button onClick={() => setResolving(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted">Resolve…</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
