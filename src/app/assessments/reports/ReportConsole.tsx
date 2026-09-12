"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2, Send, Sparkles } from "lucide-react";

/**
 * The consultant's console: generate a report from collected responses, move it
 * through review, and release it.
 *
 * Until this existed the whole back half of the product was curl-only — scores
 * computed correctly and nothing could be handed to a participant, because
 * release is what the participant tier keys off.
 */

type Cycle = { id: string; name: string; status: string };

type CompletionRow = {
  subject_id: string;
  subject_name: string | null;
  level: string | null;
  function_name: string | null;
  region: string | null;
  report_status: "draft" | "in_review" | "released";
  released_at: string | null;
  generated_at: string | null;
};

type RowState = {
  busy: boolean;
  error?: string;
  reasons?: string[];
  note?: string;
};

const STATE_LABEL: Record<string, { label: string; tone: string }> = {
  none: { label: "Not generated", tone: "bg-slate-100 text-slate-600" },
  draft: { label: "Draft", tone: "bg-amber-50 text-amber-700" },
  in_review: { label: "In review", tone: "bg-blue-50 text-blue-700" },
  released: { label: "Released", tone: "bg-emerald-50 text-emerald-700" },
};

export default function ReportConsole() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    fetch("/api/assessments/cycles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: Cycle[] = d.cycles ?? [];
        setCycles(list);
        setCycleId((current) => current || list[0]?.id || "");
      })
      .catch(() => setLoadError("Could not load assessment cycles."))
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/assessments/reports?cycleId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load reports");
      setRows(body.reports ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load reports");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cycleId);
  }, [cycleId, load]);

  const act = useCallback(
    async (subjectId: string, intent: "generate" | "review" | "release") => {
      setRowState((s) => ({ ...s, [subjectId]: { busy: true } }));
      try {
        const res = await fetch("/api/assessments/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cycleId,
            subjectId,
            ...(intent === "review" ? { reportStatus: "in_review" } : {}),
            ...(intent === "release" ? { release: true } : {}),
          }),
        });
        const body = await res.json();

        if (!res.ok) {
          // 422 means too little data to report on at all; 409 means the release
          // rule is not met yet. Both come with reasons worth showing verbatim.
          setRowState((s) => ({
            ...s,
            [subjectId]: {
              busy: false,
              error: body.error ?? `Request failed (${res.status})`,
              reasons: body.reasons ?? body.release?.reasons ?? [],
            },
          }));
          return;
        }

        setRowState((s) => ({
          ...s,
          [subjectId]: {
            busy: false,
            note:
              intent === "release"
                ? "Released — the participant can now open it."
                : intent === "review"
                  ? "Moved to review."
                  : "Report generated from collected responses.",
          },
        }));
        await load(cycleId);
      } catch (err) {
        setRowState((s) => ({
          ...s,
          [subjectId]: { busy: false, error: err instanceof Error ? err.message : "Request failed" },
        }));
      }
    },
    [cycleId, load],
  );

  /** Generates for everyone who has no report yet. Failures are reported per row. */
  const generateAll = useCallback(async () => {
    setBulkBusy(true);
    const pending = rows.filter((r) => !r.generated_at);
    for (const row of pending) {
      await act(row.subject_id, "generate");
    }
    setBulkBusy(false);
  }, [rows, act]);

  const counts = useMemo(() => {
    const state = (r: CompletionRow) => (r.generated_at ? r.report_status : "none");
    return rows.reduce<Record<string, number>>((acc, r) => {
      const k = state(r);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Reports</h1>
            <p className="mt-1 text-sm text-muted">
              Generate a report from collected responses, review it, then release it. Nothing is visible
              to a participant until it is released.
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted">Cycle</span>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {(["none", "draft", "in_review", "released"] as const).map((k) => (
            <span key={k} className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_LABEL[k].tone}`}>
              {STATE_LABEL[k].label}: {counts[k] ?? 0}
            </span>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* The export endpoint streams a file, so a plain link is enough —
                it already scopes itself to whatever the caller's tier permits. */}
            <a
              href={cycleId ? `/api/assessments/exports?cycleId=${encodeURIComponent(cycleId)}&format=csv` : "#"}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-4 text-sm font-semibold ${cycleId ? "" : "pointer-events-none opacity-40"}`}
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
            <a
              href={cycleId ? `/api/assessments/exports?cycleId=${encodeURIComponent(cycleId)}&format=xlsx` : "#"}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-4 text-sm font-semibold ${cycleId ? "" : "pointer-events-none opacity-40"}`}
            >
              <Download className="h-4 w-4" /> Export XLSX
            </a>
            <button
              type="button"
              onClick={generateAll}
              disabled={bulkBusy || loading || !rows.some((r) => !r.generated_at)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate all outstanding
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {rows.map((row) => {
              const state = rowState[row.subject_id] ?? { busy: false };
              const current = row.generated_at ? row.report_status : "none";
              const meta = STATE_LABEL[current] ?? STATE_LABEL.none;

              return (
                <li key={row.subject_id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold leading-6">
                        {row.subject_name ?? "Participant"}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-muted">
                        {[row.level, row.function_name, row.region].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => act(row.subject_id, "generate")}
                      disabled={state.busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {row.generated_at ? "Regenerate" : "Generate"}
                    </button>
                    {row.generated_at ? (
                      <Link
                        href={`/assessments/reports/${row.subject_id}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-semibold"
                      >
                        <Eye className="h-4 w-4" /> Read it
                      </Link>
                    ) : null}
                    {current === "draft" ? (
                      <button
                        type="button"
                        onClick={() => act(row.subject_id, "review")}
                        disabled={state.busy}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-semibold disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" /> Send to review
                      </button>
                    ) : null}
                    {current === "in_review" ? (
                      <button
                        type="button"
                        onClick={() => act(row.subject_id, "release")}
                        disabled={state.busy}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Release
                      </button>
                    ) : null}
                  </div>

                  {state.error ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                        <AlertTriangle className="h-4 w-4" /> {state.error}
                      </p>
                      {state.reasons?.length ? (
                        <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-amber-800">
                          {state.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {state.note ? (
                    <p className="mt-3 text-xs font-semibold text-emerald-700">{state.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !rows.length && !loadError ? (
          <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted">
            No participants in this cycle yet.
          </p>
        ) : null}

        <p className="mt-7 text-xs leading-5 text-muted">
          Generating and releasing require super admin. A report can only be released once it has been
          reviewed, and only when it meets the minimum-response rule — a line manager response plus at
          least two other rater categories with three or more responses each.
        </p>
      </section>
    </main>
  );
}
