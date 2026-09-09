"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, Eye, Loader2, Lock, TrendingDown, TrendingUp } from "lucide-react";

/**
 * Reading one person's 360 report.
 *
 * The endpoint behind this has existed and been access-controlled across five
 * tiers since the report work landed, and nothing in the product ever called
 * it. A consultant could generate a report and release it to a participant
 * without ever seeing what it said; a participant had nowhere to read the
 * document released to them; and the line-manager tier, though enforced in both
 * the route and the policy, was unreachable by any screen.
 *
 * Nothing here decides who may see what. The route does that and answers 403,
 * which this page reports rather than second-guesses — a client-side rule would
 * be a second, weaker copy of a decision already made in one place.
 */

type GroupCell = {
  raterGroup: string;
  mean: number | null;
  raterCount: number;
  suppressed: boolean;
};

type ItemScore = {
  itemId: string;
  text: string | null;
  mean: number | null;
  raterCount: number;
  suppressed: boolean;
  selfRating: number | null;
};

type Competency = {
  competencyId: string;
  competencyName: string;
  mean: number | null;
  selfMean: number | null;
  gap: number | null;
  blindSpot: boolean;
  hiddenStrength: boolean;
  byGroup: GroupCell[];
  items: ItemScore[];
};

type Report = {
  id: string;
  cycle_id: string;
  subject_id: string;
  weighted_score: number | null;
  group_scores: Record<string, number | null>;
  competency_scores: Competency[];
  strengths: string[];
  development_areas: string[];
  risk_notes: string[];
  released_at: string | null;
  generated_at: string | null;
  report_status: string;
};

const GROUP_LABEL: Record<string, string> = {
  self: "Self",
  line_manager: "Line manager",
  colleague: "Colleagues",
  direct_report: "Direct reports",
  customer: "Customers",
  others: "Others (pooled)",
};

const STATE_TONE: Record<string, string> = {
  draft: "bg-amber-50 text-amber-800",
  in_review: "bg-blue-50 text-blue-700",
  released: "bg-emerald-50 text-emerald-700",
};

const STATE_LABEL: Record<string, string> = {
  draft: "Draft — not visible to the participant",
  in_review: "In review — not visible to the participant",
  released: "Released to the participant",
};

/** A 1–5 score as a proportion of the scale, for the bar widths. */
function pct(value: number | null): number {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, ((value - 1) / 4) * 100));
}

function fmt(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export default function ReportView({ subjectId }: { subjectId: string }) {
  const [cycleId, setCycleId] = useState("");
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/assessments/cycles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = d.cycles ?? [];
        setCycles(list);
        setCycleId((current) => current || list[0]?.id || "");
      })
      .catch(() => setError("Could not load assessment cycles."));
  }, []);

  const load = useCallback(async () => {
    if (!cycleId) return;
    setLoading(true);
    setError("");
    try {
      const [reportRes, listRes] = await Promise.all([
        fetch(
          `/api/assessments/reports?cycleId=${encodeURIComponent(cycleId)}&subjectId=${encodeURIComponent(subjectId)}`,
          { cache: "no-store" },
        ),
        fetch(`/api/assessments/reports?cycleId=${encodeURIComponent(cycleId)}`, { cache: "no-store" }),
      ]);
      const body = await reportRes.json();

      if (listRes.ok) {
        const list = await listRes.json();
        const row = (list.reports ?? []).find((r: { subject_id: string }) => r.subject_id === subjectId);
        if (row?.subject_name) setSubjectName(row.subject_name);
      }

      if (!reportRes.ok) {
        // 403 is the access model working, not a fault. Say which it is.
        throw new Error(
          reportRes.status === 403
            ? "You do not have access to this report. A report is visible to the participant only once it has been released, and to a line manager only when the cycle allows it."
            : reportRes.status === 404
              ? "No report has been generated for this participant yet."
              : body.error ?? "Could not load this report",
        );
      }

      setReport(body.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [cycleId, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto w-full max-w-4xl">
        <Link
          href="/assessments/reports"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black leading-tight">{subjectName || "360 report"}</h1>
            {report ? (
              <p className="mt-1 text-sm text-muted">
                Generated{" "}
                {report.generated_at
                  ? new Date(report.generated_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
                {report.released_at
                  ? ` · released ${new Date(report.released_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                  : ""}
              </p>
            ) : null}
          </div>
          {cycles.length > 1 ? (
            <label className="text-sm">
              <span className="mb-1 block font-bold text-muted">Cycle</span>
              <select
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
                className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {loading ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}

        {error ? (
          <p className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {report ? (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${STATE_TONE[report.report_status] ?? STATE_TONE.draft}`}
              >
                {STATE_LABEL[report.report_status] ?? report.report_status}
              </span>
              <a
                href={`/api/assessments/exports?cycleId=${encodeURIComponent(cycleId)}&format=csv`}
                className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-4 text-sm font-black"
              >
                <Download className="h-4 w-4" /> Export cycle data
              </a>
            </div>

            {/* Headline */}
            <div className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-muted">Overall weighted score</p>
              <p className="mt-1 text-4xl font-black leading-none">{fmt(report.weighted_score)}</p>
              <p className="mt-1 text-xs text-muted">
                Out of 5, weighted across the rater groups that met the confidentiality minimum. Self is
                scored but carries no weight.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(report.group_scores ?? {}).map(([group, score]) => (
                  <div key={group} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 font-bold">{GROUP_LABEL[group] ?? group}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <span className="block h-full rounded-full bg-pulse" style={{ width: `${pct(score)}%` }} />
                    </span>
                    <span className="w-10 shrink-0 text-right font-black tabular-nums">{fmt(score)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Competencies */}
            <h2 className="mt-7 text-sm font-black uppercase tracking-wide text-muted">By competency</h2>
            <ul className="mt-3 space-y-3">
              {report.competency_scores.map((competency) => {
                const open = expanded.has(competency.competencyId);
                return (
                  <li key={competency.competencyId} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-black leading-6">{competency.competencyName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Others {fmt(competency.mean)} · Self {fmt(competency.selfMean)}
                          {competency.gap !== null ? ` · gap ${competency.gap > 0 ? "+" : ""}${competency.gap.toFixed(2)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {competency.blindSpot ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800">
                            <TrendingDown className="h-3 w-3" /> Blind spot
                          </span>
                        ) : null}
                        {competency.hiddenStrength ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                            <TrendingUp className="h-3 w-3" /> Hidden strength
                          </span>
                        ) : null}
                        <span className="text-xl font-black tabular-nums">{fmt(competency.mean)}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {competency.byGroup.map((cell) => (
                        <div key={cell.raterGroup} className="flex items-center gap-3 text-xs">
                          <span className="w-32 shrink-0 font-bold">{GROUP_LABEL[cell.raterGroup] ?? cell.raterGroup}</span>
                          {cell.suppressed ? (
                            <span className="flex flex-1 items-center gap-1.5 text-muted">
                              <Lock className="h-3 w-3" />
                              Withheld — {cell.raterCount} {cell.raterCount === 1 ? "rater" : "raters"}, below the
                              confidentiality minimum
                            </span>
                          ) : (
                            <>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                                <span
                                  className="block h-full rounded-full bg-ink/60"
                                  style={{ width: `${pct(cell.mean)}%` }}
                                />
                              </span>
                              <span className="w-24 shrink-0 text-right text-muted">
                                {cell.raterCount} {cell.raterCount === 1 ? "rater" : "raters"}
                              </span>
                              <span className="w-10 shrink-0 text-right font-black tabular-nums">{fmt(cell.mean)}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    {competency.items.length ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggle(competency.competencyId)}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-muted hover:text-ink"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {open ? "Hide" : "Show"} the {competency.items.length} statements
                        </button>
                        {open ? (
                          <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                            {competency.items.map((item) => (
                              <li key={item.itemId} className="flex items-start justify-between gap-3">
                                <span className="min-w-0 flex-1">{item.text ?? item.itemId}</span>
                                <span className="shrink-0 text-muted">
                                  {item.suppressed ? "withheld" : `${fmt(item.mean)} · ${item.raterCount}`}
                                  {item.selfRating !== null ? ` · self ${item.selfRating}` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Narrative */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-black">Strengths</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                  {report.strengths.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-black">Development areas</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                  {report.development_areas.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-black">
                <AlertTriangle className="h-4 w-4" /> How to read this report
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-6 text-muted">
                {report.risk_notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
