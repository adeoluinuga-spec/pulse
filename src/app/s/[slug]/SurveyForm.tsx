"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

/**
 * Answering a survey: no sign-in, no account, one page.
 *
 * Written for someone opening a link on their phone at their desk, who was told
 * it is anonymous and would like to believe it. So the page says plainly what is
 * and is not collected, and it collects nothing else.
 */

type Question = { id: string; type: "scale" | "text"; prompt: string; section: string | null; lowLabel: string | null; highLabel: string | null; required: boolean };
type GroupField = { key: string; label: string; options: string[]; required: boolean };
type Survey = { title: string; intro: string | null; status: "open" | "closed"; closingNote: string | null; groupFields: GroupField[]; questions: Question[] };

const SCALE = [1, 2, 3, 4, 5];

export default function SurveyForm({ slug }: { slug: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loadError, setLoadError] = useState("");
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ note: string | null } | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        // A browser that refuses storage is fine; it only means no reminder.
        if (window.localStorage.getItem(`pulse-survey-${slug}`)) setAlreadySent(true);
      } catch {}
    });
    fetch(`/api/public/survey/${slug}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "This link could not be opened.");
        setSurvey(body.survey);
      })
      .catch((thrown: Error) => setLoadError(thrown.message));
  }, [slug]);

  const send = async () => {
    // Checked here so nobody waits for a round trip to be told they missed
    // question 7. The server checks again, and it is the one that decides.
    const missing: string[] = [];
    for (const field of survey?.groupFields ?? []) {
      if (field.required && !groups[field.key]) missing.push(`Choose your ${field.label.toLowerCase()}.`);
    }
    (survey?.questions ?? []).forEach((question, index) => {
      const answer = answers[question.id];
      const empty = answer === undefined || answer === "" || (typeof answer === "string" && !answer.trim());
      if (question.required && empty) missing.push(`Question ${index + 1} needs an answer.`);
    });
    if (missing.length) {
      setErrors(missing);
      return;
    }

    setSending(true);
    setErrors([]);
    try {
      const response = await fetch(`/api/public/survey/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups,
          answers: Object.entries(answers).map(([questionId, value]) =>
            typeof value === "number" ? { questionId, rating: value } : { questionId, text: value },
          ),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(body.errors?.length ? body.errors : [body.error ?? "Your answers could not be sent."]);
        return;
      }
      try {
        window.localStorage.setItem(`pulse-survey-${slug}`, new Date().toISOString());
      } catch {
        // Nothing depends on this.
      }
      setDone({ note: body.closingNote ?? null });
    } catch {
      setErrors(["Your answers could not be sent. Check your connection and try again."]);
    } finally {
      setSending(false);
    }
  };

  if (loadError) return <Shell><Card><h1 className="text-xl font-semibold text-ink">This link could not be opened</h1><p className="mt-3 text-sm text-muted">{loadError}</p></Card></Shell>;
  if (!survey) return <Shell><Card><p className="text-sm text-muted">Loading…</p></Card></Shell>;

  if (done) {
    return (
      <Shell>
        <Card>
          <h1 className="text-2xl font-semibold text-ink">Thank you</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your answers have been recorded anonymously. They are combined with everyone else&apos;s before anyone sees them.
          </p>
          {done.note && <p className="mt-4 rounded-lg bg-pulse-soft px-4 py-3 text-sm text-pulse">{done.note}</p>}
        </Card>
      </Shell>
    );
  }

  if (survey.status === "closed") {
    return <Shell><Card><h1 className="text-xl font-semibold text-ink">{survey.title}</h1><p className="mt-3 text-sm text-muted">This survey has closed. Thank you to everyone who answered.</p></Card></Shell>;
  }

  return (
    <Shell>
      <Card>
        <h1 className="text-2xl font-semibold leading-tight text-ink">{survey.title}</h1>
        {survey.intro && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{survey.intro}</p>}
        <div className="mt-4 rounded-lg border border-border bg-paper p-4 text-sm leading-relaxed text-muted">
          <p className="font-semibold text-ink">This is anonymous.</p>
          <p className="mt-1">
            You are not signing in and your name, email address and device are not recorded. Answers are reported as averages
            across everyone, and any group too small to stay anonymous is left out of the results entirely.
          </p>
        </div>
        {alreadySent && (
          <p className="mt-4 rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
            This browser has already sent an answer to this survey. Please don&apos;t send a second one unless you were asked to.
          </p>
        )}
      </Card>

      {survey.groupFields.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-ink">About you</h2>
          <p className="mt-1 text-xs text-muted">Used only to group the results. Never shown next to your answers.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {survey.groupFields.map((field) => (
              <label key={field.key} className="block text-sm font-semibold text-ink">
                {field.label}{!field.required && <span className="font-normal text-muted"> (optional)</span>}
                <select
                  value={groups[field.key] ?? ""}
                  onChange={(event) => setGroups({ ...groups, [field.key]: event.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base font-normal text-ink"
                >
                  <option value="">Choose…</option>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
        </Card>
      )}

      {survey.questions.map((question, index) => (
        <div key={question.id} className="space-y-4">
          {question.section && question.section !== survey.questions[index - 1]?.section && (
            <h2 className="px-1 pt-2 text-sm font-semibold uppercase tracking-widest text-muted">{question.section}</h2>
          )}
          <Card>
          <fieldset>
            <legend className="text-sm font-semibold leading-snug text-ink">
              {index + 1}. {question.prompt}
              {!question.required && <span className="font-normal text-muted"> (optional)</span>}
            </legend>
            {question.type === "scale" ? (
              <>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {SCALE.map((value) => {
                    const chosen = answers[question.id] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setAnswers({ ...answers, [question.id]: value })}
                        className={clsx(
                          "min-h-[52px] rounded-lg border text-base font-semibold transition-colors",
                          chosen ? "border-pulse bg-pulse text-white" : "border-border bg-card text-ink hover:border-pulse",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>{question.lowLabel || "Strongly disagree"}</span>
                  <span>{question.highLabel || "Strongly agree"}</span>
                </div>
              </>
            ) : (
              <textarea
                value={String(answers[question.id] ?? "")}
                onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
                maxLength={4000}
                rows={4}
                className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-ink"
                placeholder="Write as much or as little as you like"
              />
            )}
          </fieldset>
          </Card>
        </div>
      ))}

      <Card>
        {errors.length > 0 && (
          <ul role="alert" className="mb-4 space-y-1 rounded-lg border border-red/30 bg-red-soft p-4 text-sm text-red">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}
        <button
          onClick={send}
          disabled={sending}
          className="w-full rounded-lg bg-pulse px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send my answers"}
        </button>
        <p className="mt-3 text-center text-xs text-muted">Once sent, answers cannot be traced back or withdrawn — because nothing records who sent them.</p>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {children}
        <p className="pb-6 pt-2 text-center text-xs text-muted">Powered by Pulse</p>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-5 shadow-sm">{children}</section>;
}
