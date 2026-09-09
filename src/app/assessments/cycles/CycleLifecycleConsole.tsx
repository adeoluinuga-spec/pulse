"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Copy, Loader2, RefreshCw } from "lucide-react";

/**
 * What HR does with a cycle once it is no longer being built.
 *
 * Closing a cycle used to be a one-way door with no door on the other side: the
 * transition table ended at `closed`, the launch route refused it, and the only
 * way back was editing the database. Two things fix that, and they are different
 * fixes for different situations — reopen a cycle closed by mistake before
 * anybody answered, clone a cycle that has real data in it and must stay as it is.
 *
 * Both live here rather than in the 360 console, which is already seven tabs.
 */

type Collected = {
  responseCount: number;
  submittedReviewers: number;
  releasedReports: number;
};

type Cycle = {
  id: string;
  name: string;
  status: string;
  starts_on: string | null;
  closes_on: string | null;
  collected: Collected;
  allowedTransitions: string[];
  reopenBlockedReason: string | null;
};

type Busy = { id: string; action: "reopen" | "clone" } | null;

const STATUS_TONE: Record<string, string> = {
  setup: "bg-slate-100 text-slate-700",
  collecting: "bg-emerald-50 text-emerald-700",
  calibration: "bg-blue-50 text-blue-700",
  closed: "bg-amber-50 text-amber-800",
};

const STATUS_LABEL: Record<string, string> = {
  setup: "Setup",
  collecting: "Collecting",
  calibration: "In review",
  closed: "Closed",
};

function todayPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function CycleLifecycleConsole() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [cloneFor, setCloneFor] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneStarts, setCloneStarts] = useState(todayPlus(0));
  const [cloneCloses, setCloneCloses] = useState(todayPlus(21));
  const [carryForward, setCarryForward] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/assessments/cycles", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load assessment cycles");
      setCycles(body.cycles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assessment cycles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reopen = useCallback(
    async (cycle: Cycle) => {
      setBusy({ id: cycle.id, action: "reopen" });
      setNotice("");
      setRowError((s) => ({ ...s, [cycle.id]: "" }));
      try {
        const res = await fetch("/api/assessments/cycles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId: cycle.id, status: "setup" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Reopen failed (${res.status})`);
        setNotice(
          `"${cycle.name}" is back in setup with its close date cleared. Set a new close date on the 360 console, then launch it.`,
        );
        await load();
      } catch (err) {
        setRowError((s) => ({ ...s, [cycle.id]: err instanceof Error ? err.message : "Reopen failed" }));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const clone = useCallback(
    async (cycle: Cycle) => {
      setBusy({ id: cycle.id, action: "clone" });
      setNotice("");
      setRowError((s) => ({ ...s, [cycle.id]: "" }));
      try {
        const res = await fetch("/api/assessments/cycles/clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priorCycleId: cycle.id,
            name: cloneName.trim() || `${cycle.name} (copy)`,
            startsOn: cloneStarts || null,
            closesOn: cloneCloses || null,
            populationMode: carryForward ? "carry_forward" : "replace",
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Clone failed (${res.status})`);
        const copied = body.copied ?? {};
        setNotice(
          `Created "${body.cycle?.name ?? cloneName}" in setup — carried over ${copied.competencies ?? 0} competencies, ${copied.items ?? 0} items and ${copied.subjects ?? 0} participants. Raters are not copied; add them, then launch.`,
        );
        setCloneFor(null);
        setCloneName("");
        await load();
      } catch (err) {
        setRowError((s) => ({ ...s, [cycle.id]: err instanceof Error ? err.message : "Clone failed" }));
      } finally {
        setBusy(null);
      }
    },
    [cloneName, cloneStarts, cloneCloses, carryForward, load],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto w-full max-w-4xl">
        <Link href="/assessments" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to the 360 console
        </Link>

        <h1 className="mt-4 text-2xl font-black leading-tight">Cycle lifecycle</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Reopen a cycle that was closed before anyone answered, or clone any cycle into a fresh one.
          Cloning copies the competencies, the statements and the participant list — never the raters,
          the responses or the reports.
        </p>

        {notice ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {cycles.map((cycle) => {
              const rowBusy = busy?.id === cycle.id;
              const canReopen = cycle.status === "closed" && !cycle.reopenBlockedReason;

              return (
                <li key={cycle.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black leading-6">{cycle.name}</p>
                      <p className="mt-0.5 text-xs font-bold text-muted">
                        {cycle.starts_on ?? "no start date"} → {cycle.closes_on ?? "no close date"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {cycle.collected.responseCount} responses · {cycle.collected.submittedReviewers} raters
                        submitted · {cycle.collected.releasedReports} reports released
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_TONE[cycle.status] ?? STATUS_TONE.setup}`}
                    >
                      {STATUS_LABEL[cycle.status] ?? cycle.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {cycle.status === "closed" ? (
                      <button
                        type="button"
                        onClick={() => void reopen(cycle)}
                        disabled={!canReopen || rowBusy}
                        title={cycle.reopenBlockedReason ?? undefined}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {rowBusy && busy?.action === "reopen" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Reopen for setup
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setCloneFor(cloneFor === cycle.id ? null : cycle.id);
                        setCloneName(`${cycle.name} (copy)`);
                      }}
                      disabled={rowBusy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-black disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" /> Clone into a new cycle
                    </button>
                  </div>

                  {cycle.reopenBlockedReason ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                      {cycle.reopenBlockedReason}
                    </p>
                  ) : null}

                  {rowError[cycle.id] ? (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                      {rowError[cycle.id]}
                    </p>
                  ) : null}

                  {cloneFor === cycle.id ? (
                    <div className="mt-3 rounded-lg border border-border bg-background p-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-xs sm:col-span-3">
                          <span className="mb-1 block font-bold text-muted">New cycle name</span>
                          <input
                            value={cloneName}
                            onChange={(e) => setCloneName(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-bold text-muted">Starts on</span>
                          <input
                            type="date"
                            value={cloneStarts}
                            onChange={(e) => setCloneStarts(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-bold text-muted">Closes on</span>
                          <input
                            type="date"
                            value={cloneCloses}
                            onChange={(e) => setCloneCloses(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-2 self-end text-xs font-bold">
                          <input
                            type="checkbox"
                            checked={carryForward}
                            onChange={(e) => setCarryForward(e.target.checked)}
                            className="h-4 w-4"
                          />
                          Carry the participants over
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => void clone(cycle)}
                        disabled={rowBusy}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-40"
                      >
                        {rowBusy && busy?.action === "clone" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        Create the new cycle
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !cycles.length && !error ? (
          <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted">
            No assessment cycles yet.
          </p>
        ) : null}

        <p className="mt-7 text-xs leading-5 text-muted">
          Reopening and cloning both require HR admin or super admin. A closed cycle can only be reopened
          while it holds no responses, no submitted raters and no released reports — once any of those
          exist, cloning is the only safe way forward.
        </p>
      </section>
    </main>
  );
}
