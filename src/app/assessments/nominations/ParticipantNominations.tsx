"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Send, Users } from "lucide-react";

type Cycle = {
  id: string;
  name: string;
  status: string;
};

type Nomination = {
  id: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_group: "colleague" | "direct_report" | string;
  status: "pending" | "approved" | "rejected";
};

type NominationsPayload = {
  subject?: { id: string; name: string } | null;
  nominations?: Nomination[];
  limits?: Partial<Record<"colleague" | "direct_report", number>>;
};

const groups = [
  { key: "colleague", label: "Colleague" },
  { key: "direct_report", label: "Direct report" },
] as const;

function groupLabel(group: string) {
  return groups.find((item) => item.key === group)?.label ?? group.replace("_", " ");
}

export default function ParticipantNominations() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [subject, setSubject] = useState<NominationsPayload["subject"]>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [limits, setLimits] = useState<NominationsPayload["limits"]>({ colleague: 3, direct_report: 3 });
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerGroup, setReviewerGroup] = useState<"colleague" | "direct_report">("colleague");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCycles() {
      try {
        const response = await fetch("/api/assessments/cycles", { cache: "no-store" });
        const data = await response.json();
        const liveCycles = (data?.cycles ?? []) as Cycle[];
        if (cancelled) return;
        setCycles(liveCycles);
        setCycleId(liveCycles[0]?.id ?? "");
      } catch {
        if (!cancelled) setNotice("Unable to load assessment cycles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCycles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    let cancelled = false;

    async function loadNominations() {
      setLoading(true);
      try {
        const response = await fetch(`/api/assessments/nominations?mine=1&cycleId=${encodeURIComponent(cycleId)}`, { cache: "no-store" });
        const data = (await response.json()) as NominationsPayload;
        if (cancelled) return;
        setSubject(data.subject ?? null);
        setNominations(data.nominations ?? []);
        setLimits(data.limits ?? { colleague: 3, direct_report: 3 });
      } catch {
        if (!cancelled) setNotice("Unable to load your nominations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNominations();

    return () => {
      cancelled = true;
    };
  }, [cycleId]);

  const counts = useMemo(() => {
    return groups.reduce<Record<"colleague" | "direct_report", number>>((acc, group) => {
      acc[group.key] = nominations.filter((nomination) => nomination.reviewer_group === group.key && nomination.status !== "rejected").length;
      return acc;
    }, { colleague: 0, direct_report: 0 });
  }, [nominations]);

  async function submitNomination() {
    if (!cycleId || !subject) {
      setNotice("You are not currently attached to this assessment cycle.");
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const response = await fetch("/api/assessments/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          subjectId: subject.id,
          reviewerName,
          reviewerEmail,
          reviewerGroup,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? data?.errors?.[0] ?? "Unable to save nomination");
      }

      setNominations((current) => [data.nomination, ...current]);
      setReviewerName("");
      setReviewerEmail("");
      setNotice("Nomination saved for HR review.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save nomination.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-muted">360 nominations</p>
            <h1 className="mt-1 text-2xl font-black text-ink">Nominate your raters</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Choose three colleagues and three direct reports who can give fair feedback on your leadership.
            </p>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-pulse-soft text-pulse">
            <Users size={20} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-muted">Assessment cycle</span>
            <select
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
              ))}
            </select>
          </label>
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">For</p>
            <p className="mt-1 truncate text-sm font-black text-ink">{subject?.name ?? "No participant record"}</p>
          </div>
        </div>

        {notice && <p className="mt-4 rounded-lg bg-pulse-soft p-3 text-sm font-bold text-pulse">{notice}</p>}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-black text-ink">Add a rater</h2>
          <div className="mt-4 grid gap-3">
            <label>
              <span className="text-xs font-bold text-muted">Relationship</span>
              <select
                value={reviewerGroup}
                onChange={(event) => setReviewerGroup(event.target.value as "colleague" | "direct_report")}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
              >
                {groups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label} ({counts[group.key]}/{limits?.[group.key] ?? 3})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-bold text-muted">Rater name</span>
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
              />
            </label>
            <label>
              <span className="text-xs font-bold text-muted">Rater work email</span>
              <input
                type="email"
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
              />
            </label>
            <button
              type="button"
              onClick={() => void submitNomination()}
              disabled={saving || loading || !subject || !reviewerName.trim() || !reviewerEmail.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              Submit nomination
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-black text-ink">Your nominations</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {groups.map((group) => (
                <div key={group.key} className="rounded-lg bg-paper p-3">
                  <p className="text-xs font-bold text-muted">{group.label}</p>
                  <p className="mt-1 text-xl font-black text-ink">{counts[group.key]}/{limits?.[group.key] ?? 3}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {nominations.length === 0 ? (
              <div className="p-4 text-sm leading-6 text-muted">
                {loading ? "Loading nominations..." : "No nominations yet."}
              </div>
            ) : (
              nominations.map((nomination) => (
                <div key={nomination.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{nomination.reviewer_name}</p>
                    <p className="mt-1 truncate text-xs text-muted">{nomination.reviewer_email}</p>
                    <p className="mt-1 text-xs font-bold text-muted">{groupLabel(nomination.reviewer_group)}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-paper px-2 py-1 text-xs font-black text-muted">
                    {nomination.status === "approved" && <CheckCircle2 size={14} className="text-green" />}
                    {nomination.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
