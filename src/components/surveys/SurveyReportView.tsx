"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Copy, Download } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { Alert, Muted, StatusPill } from "./SurveysWorkspace";

/**
 * One survey: the link to send, and the results.
 *
 * Everything shown here is an aggregate. There is no screen, and no endpoint,
 * that shows one person's submission — see src/lib/survey.ts for why.
 */

type Question = { questionId: string; prompt: string; type: "scale" | "text"; answered: number; mean: number | null; distribution: number[]; comments: string[] };
type Breakdown = { key: string; label: string; hiddenGroups: number; groups: Array<{ value: string; responses: number; suppressed: boolean; mean: number | null; questions: Array<{ questionId: string; mean: number | null; answered: number }> }> };
type Report = { responses: number; minimumGroup: number; suppressed: boolean; overallMean: number | null; questions: Question[]; breakdowns: Breakdown[] };
type Survey = { id: string; title: string; slug: string; status: "draft" | "open" | "closed"; minimumGroup: number; questions: Array<{ id: string; prompt: string }> };

export default function SurveyReportView({ surveyId, onChanged }: { surveyId: string; onChanged: () => Promise<void> | void }) {
  const { showToast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [themes, setThemes] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load this survey.");
      setSurvey(body.survey);
      setReport(body.report);
      setError("");
    } catch (thrown) {
      setError((thrown as Error).message);
    }
  }, [surveyId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const act = async (action: "open" | "close" | "reopen") => {
    setBusy(true);
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "That did not work.");
      showToast(action === "close" ? "Survey closed." : "Survey open. The link works now.", "success");
      await load();
      await onChanged();
    } catch (thrown) {
      showToast((thrown as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const askForThemes = async () => {
    setThemes({ loading: true, text: "" });
    try {
      const response = await fetch(`/api/surveys/${surveyId}/themes`, { method: "POST" });
      const body = await response.json();
      setThemes({ loading: false, text: body.themes ?? body.error ?? "No themes available." });
    } catch {
      setThemes({ loading: false, text: "The themes could not be produced right now." });
    }
  };

  if (error) return <Alert>{error}</Alert>;
  if (!survey || !report) return <Muted>Loading…</Muted>;

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/s/${survey.slug}`;
  const comments = report.questions.filter((question) => question.type === "text");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{survey.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {report.responses} {report.responses === 1 ? "response" : "responses"} · groups under {report.minimumGroup} are left out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={survey.status} />
          {survey.status === "draft" && <button disabled={busy} onClick={() => act("open")} className="rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Open survey</button>}
          {survey.status === "open" && <button disabled={busy} onClick={() => act("close")} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted">Close</button>}
          {survey.status === "closed" && <button disabled={busy} onClick={() => act("reopen")} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted">Reopen</button>}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-semibold text-ink">The link to send</p>
        <p className="mt-1 text-xs text-muted">
          One link for everyone. Anyone who has it can answer — there is no sign-in, which is what makes it anonymous.
          {survey.status === "draft" && " It does not work until you open the survey."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-paper px-3 py-2.5 text-sm text-ink">{link}</code>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(
                () => showToast("Link copied.", "success"),
                () => showToast("Copy it by hand — your browser blocked the clipboard.", "warning"),
              );
            }}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-ink"
          >
            <Copy size={15} /> Copy
          </button>
        </div>
      </section>

      {report.suppressed ? (
        <Muted>
          {report.responses === 0
            ? "No answers yet. Results appear once enough people have answered."
            : `${report.responses} ${report.responses === 1 ? "person has" : "people have"} answered. Results stay hidden until ${report.minimumGroup} have, so nobody can work out who said what.`}
        </Muted>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <Stat label="Responses" value={report.responses} />
            <Stat label="Average across rated questions" value={report.overallMean ?? "—"} />
            <Stat label="Comments" value={comments.reduce((sum, question) => sum + question.comments.length, 0)} />
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Question by question</p>
              <a href={`/api/surveys/${surveyId}?format=csv`} className="flex items-center gap-2 text-sm font-semibold text-pulse">
                <Download size={15} /> CSV
              </a>
            </div>
            <div className="mt-4 space-y-4">
              {report.questions.filter((question) => question.type === "scale").map((question) => (
                <div key={question.questionId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-ink">{question.prompt}</p>
                    <p className="text-sm font-semibold text-ink">{question.mean ?? "—"}</p>
                  </div>
                  <div className="mt-2 flex gap-1" aria-hidden="true">
                    {question.distribution.map((count, index) => (
                      <div key={index} className="flex-1">
                        <div className="h-16 rounded bg-paper" style={{ position: "relative" }}>
                          <div
                            className="absolute inset-x-0 bottom-0 rounded bg-pulse"
                            style={{ height: `${question.answered ? (count / Math.max(...question.distribution)) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="mt-1 text-center text-[10px] text-muted">{index + 1}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted">{question.answered} answered</p>
                </div>
              ))}
            </div>
          </section>

          {report.breakdowns.map((breakdown) => (
            <section key={breakdown.key} className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-semibold text-ink">By {breakdown.label.toLowerCase()}</p>
              <p className="mt-1 text-xs text-muted">Reported on its own. It is never combined with another grouping, which is how a group of three stays a group of three.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted">
                      <th className="py-2">{breakdown.label}</th>
                      <th className="py-2">Responses</th>
                      <th className="py-2">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.groups.map((group) => (
                      <tr key={group.value} className={clsx("border-b border-border last:border-0", group.suppressed && "text-muted")}>
                        <td className="py-2">{group.value}</td>
                        <td className="py-2">{group.suppressed ? "—" : group.responses}</td>
                        <td className="py-2">{group.suppressed ? <span className="text-xs">too few to show</span> : group.mean ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {breakdown.hiddenGroups > 0 && (
                <p className="mt-3 text-xs text-muted">
                  {breakdown.hiddenGroups} {breakdown.hiddenGroups === 1 ? "group is" : "groups are"} hidden for having fewer than {report.minimumGroup} answers.
                  Their answers are still counted in the totals above.
                </p>
              )}
            </section>
          ))}

          {comments.map((question) => (
            <section key={question.questionId} className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-semibold text-ink">{question.prompt}</p>
              <p className="mt-1 text-xs text-muted">{question.comments.length} answered. Comments are shown without department or level — a sentence is easy to recognise.</p>
              <ul className="mt-3 space-y-2">
                {question.comments.map((comment, index) => (
                  <li key={index} className="whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm text-ink">{comment}</li>
                ))}
              </ul>
            </section>
          ))}

          {comments.some((question) => question.comments.length >= 3) && (
            <section className="rounded-lg bg-ink p-5 text-white">
              <p className="text-sm font-semibold">Themes across the comments</p>
              <p className="mt-1 text-xs text-white/60">Written from the comments alone, with no department, level or name attached.</p>
              <button onClick={askForThemes} disabled={themes.loading} className="mt-3 rounded-lg bg-pulse px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {themes.loading ? "Reading…" : themes.text ? "Read again" : "Find the themes"}
              </button>
              {themes.text && <div className="mt-4 whitespace-pre-wrap rounded-lg bg-white/5 p-4 text-sm leading-relaxed text-white/85">{themes.text}</div>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-2xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
    </div>
  );
}
