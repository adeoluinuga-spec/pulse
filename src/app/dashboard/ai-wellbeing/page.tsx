"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/Toast";
import { getWellbeingHistory, submitWellbeingSurvey } from "@/lib/api/wellbeing";
import { getSupabase } from "@/lib/supabase";
import type { Mood, WellbeingEntry } from "@/types";

/**
 * AI coaching and wellbeing check-ins.
 *
 * The coach works only from what Pulse actually holds about you — your goals,
 * KPIs and recent work reports — and only when you ask. It used to open with
 * a canned paragraph about "strong delivery" and a projected score, suggest a
 * collaboration partner from a demo company, and show enrolments and peer
 * sessions that were never saved. None of that is here any more.
 *
 * Wellbeing check-ins are saved, visible to you and to HR, and a difficult
 * week comes with a way to raise it confidentially with HR.
 */

type Tab = "coach" | "wellbeing";
type Workload = "manageable" | "heavy" | "overwhelming";
type Support = "yes" | "somewhat" | "no";

const MOODS: { key: Mood; label: string }[] = [
  { key: "drained", label: "Drained" },
  { key: "okay", label: "Okay" },
  { key: "good", label: "Good" },
  { key: "energised", label: "Energised" },
];
const WORKLOADS: { key: Workload; label: string }[] = [
  { key: "manageable", label: "Manageable" },
  { key: "heavy", label: "Heavy" },
  { key: "overwhelming", label: "Overwhelming" },
];
const SUPPORTS: { key: Support; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "somewhat", label: "Somewhat" },
  { key: "no", label: "Not really" },
];

function levelFor(mood: Mood | null, workload: Workload | null, support: Support | null) {
  if (mood === "drained" || workload === "overwhelming" || support === "no") return "negative";
  if (mood === "okay" || workload === "heavy" || support === "somewhat") return "mixed";
  return "positive";
}

export default function AiWellbeingPage() {
  const [tab, setTab] = useState<Tab>("coach");
  return (
    <div className="dashboard-page space-y-5">
      <section className="px-4">
        <div role="tablist" aria-label="AI and wellbeing" className="flex rounded-lg border border-border bg-card p-1">
          {([["coach", "Performance coach"], ["wellbeing", "Wellbeing check-in"]] as const).map(([key, text]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={clsx("flex-1 rounded-md px-2 py-2 text-xs font-semibold md:text-sm", tab === key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {text}
            </button>
          ))}
        </div>
      </section>
      {tab === "coach" ? <Coach /> : <Wellbeing />}
    </div>
  );
}

type Evidence = {
  goals: Array<{ title: string; percentComplete: number | null; status: string | null; dueDate: string | null; weight: number | null }>;
  kpis: Array<{ name: string; target: number | null; actual: number | null; direction: string | null }>;
  reports: Array<{ type: string | null; submittedAt: string | null; status: string | null }>;
};

function Coach() {
  const { user } = useUser();
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState("");
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [goals, kpis, reports] = await Promise.all([
          fetch(`/api/goals?ownerId=${encodeURIComponent(user.id)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("goals")))),
          fetch("/api/kpis", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("kpis")))),
          getSupabase().from("reports").select("report_type, submitted_at, status").eq("employee_id", user.id).order("submitted_at", { ascending: false }).limit(12),
        ]);
        if (cancelled) return;
        type GoalRow = { title: string; percent_complete: number | null; status: string | null; due_date: string | null; weight: number | null };
        type KpiRow = { name: string; employee_id: string | null; target_value: number | null; current_value: number | null; measure_direction: string | null };
        setEvidence({
          goals: ((goals.goals ?? []) as GoalRow[]).map((goal) => ({ title: goal.title, percentComplete: goal.percent_complete, status: goal.status, dueDate: goal.due_date, weight: goal.weight })),
          kpis: ((kpis.kpis ?? []) as KpiRow[])
            .filter((kpi) => kpi.employee_id === user.id)
            .map((kpi) => ({ name: kpi.name, target: kpi.target_value, actual: kpi.current_value, direction: kpi.measure_direction })),
          reports: ((reports.data ?? []) as Array<{ report_type: string | null; submitted_at: string | null; status: string | null }>).map((report) => ({ type: report.report_type, submittedAt: report.submitted_at, status: report.status })),
        });
      } catch {
        if (!cancelled) setError("Could not load your goals, KPIs and reports. Please retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const ask = async () => {
    if (!evidence) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ai/coaching-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: { name: user.name, role: user.role, cadre: user.cadre }, cadre: user.cadre, ...evidence }),
      });
      const body = await response.json();
      setInsight(body.insight ?? "The coach is not available right now.");
    } catch {
      setInsight("The coach is not available right now.");
    } finally {
      setLoading(false);
    }
  };

  if (error) return <section className="px-4"><p role="alert" className="rounded-lg border border-red/30 bg-red-soft p-4 text-sm text-red">{error}</p></section>;
  if (!evidence) return <section className="px-4"><p className="rounded-lg border border-border bg-paper p-4 text-sm text-muted">Loading your work…</p></section>;

  const empty = !evidence.goals.length && !evidence.kpis.length && !evidence.reports.length;

  return (
    <section className="space-y-4 px-4">
      <div className="grid grid-cols-3 gap-3">
        <Count label="Goals" value={evidence.goals.length} href="/goals" />
        <Count label="KPIs" value={evidence.kpis.length} href="/kpis" />
        <Count label="Reports" value={evidence.reports.length} href="/dashboard/reports" />
      </div>
      {empty ? (
        <p className="rounded-lg border border-border bg-paper p-4 text-sm text-muted">
          The coach works from your goals, KPIs and work reports, and you have none yet. Set a goal or write a report, then come back.
        </p>
      ) : (
        <div className="rounded-lg bg-ink p-5 text-white">
          <p className="text-sm text-white/70">The coach reads the goals, KPIs and reports counted above — nothing else — and gives you priorities for the rest of the cycle.</p>
          <button onClick={ask} disabled={loading} className="mt-4 rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? "Thinking…" : insight ? "Ask again" : "Get coaching"}
          </button>
          {insight && <div className="mt-4 whitespace-pre-wrap rounded-lg bg-white/5 p-4 text-sm leading-relaxed text-white/85">{insight}</div>}
        </div>
      )}
    </section>
  );
}

function Count({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card p-3">
      <p className="text-2xl font-semibold leading-none text-ink" style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
    </Link>
  );
}

function Wellbeing() {
  const { showToast } = useToast();
  const [history, setHistory] = useState<WellbeingEntry[] | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<{ message: string; actions?: string[]; level: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWellbeingHistory().then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!mood || !workload || !support) return;
    setSaving(true);
    const level = levelFor(mood, workload, support);
    const saved = await submitWellbeingSurvey({ overallMood: mood, workload, supportLevel: support, freeText: note.trim() || undefined });
    if (!saved) {
      setSaving(false);
      showToast("Your check-in could not be saved. Please retry.", "error");
      return;
    }
    try {
      const reply = await fetch("/api/ai/wellbeing-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: { mood, workload, support, note }, escalationLevel: level }),
      }).then((r) => r.json());
      setResponse({ ...reply, level });
    } catch {
      setResponse({ message: "Thanks for checking in. Your answers are saved.", level });
    }
    setHistory(await getWellbeingHistory());
    setSaving(false);
  };

  return (
    <section className="space-y-4 px-4">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted">A short weekly check-in. Your answers are saved and visible to you and HR — not to your manager.</p>
        <Choice legend="How are you feeling this week?" options={MOODS} value={mood} onChange={setMood} />
        <Choice legend="How is your workload?" options={WORKLOADS} value={workload} onChange={setWorkload} />
        <Choice legend="Do you feel supported?" options={SUPPORTS} value={support} onChange={setSupport} />
        <label className="block text-xs font-semibold text-muted">
          Anything else (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
        </label>
        <button onClick={submit} disabled={saving || !mood || !workload || !support} className="rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save check-in"}
        </button>
      </div>

      {response && (
        <div className="rounded-lg bg-ink p-5 text-white">
          <p className="text-sm leading-relaxed text-white/85">{response.message}</p>
          {response.actions && response.actions.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/75">{response.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          )}
          {response.level === "negative" && (
            <Link href="/dashboard/team?tab=escalations" className="mt-4 inline-block rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white">
              Raise it confidentially with HR
            </Link>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold text-ink">Your check-ins</p>
        {history === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : history.length ? (
          <ul className="mt-2 divide-y divide-border">
            {[...history].reverse().map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="flex justify-between py-2 text-sm">
                <span className="text-muted">{new Date(entry.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="font-semibold capitalize text-ink">{entry.mood}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No check-ins yet.</p>
        )}
      </div>
    </section>
  );
}

function Choice<T extends string>({ legend, options, value, onChange }: { legend: string; options: { key: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-muted">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
            className={clsx("rounded-full border px-3 py-2 text-xs font-semibold", value === option.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border text-muted")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
