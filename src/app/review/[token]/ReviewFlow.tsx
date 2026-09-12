"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";

import {
  buildDraftMap,
  countAnsweredReviewItems,
  flattenReviewInstrument,
  relationshipLabel,
  type ReviewDraftResponse,
  type ReviewInstrument,
  type ReviewInstrumentItem,
} from "@/lib/reviewInstrument";
import { isResponseAnswered, type ReviewResponse } from "@/lib/reviewSubmission";

type ReviewLoadState = "loading" | "ready" | "invalid" | "expired" | "submitted" | "error";
type SaveState = "idle" | "saving" | "saved" | "failed";

type ReviewPayload = {
  status: ReviewLoadState;
  subject?: { name: string };
  relationshipType?: string;
  expiresAt?: string | null;
  lastSavedAt?: string | null;
  submittedAt?: string | null;
  instrument?: ReviewInstrument;
  draft?: { responses: ReviewDraftResponse[] };
  message?: string;
  contactPath?: string;
};

type AnswerState = Record<string, ReviewResponse>;

const ratingLabels = ["Never", "Rarely", "Sometimes", "Often", "Consistently"];

function formatDateTime(value?: string | null) {
  if (!value) return "Not saved yet";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function answeredDraftResponses(items: ReviewInstrumentItem[], answers: AnswerState): ReviewResponse[] {
  return items
    .map((item) => ({
      ...answers[item.id],
      itemId: item.id,
      itemType: item.type,
    }))
    .filter((response) => isResponseAnswered(response));
}

function submissionResponses(items: ReviewInstrumentItem[], answers: AnswerState): ReviewResponse[] {
  return items.map((item) => {
    const answer = answers[item.id] ?? {};

    return {
      ...answer,
      itemId: item.id,
      itemType: item.type,
      comment: answer.comment ?? "",
    };
  });
}

function StatusScreen({
  title,
  message,
  tone = "neutral",
  contactPath = "/review/contact",
}: {
  title: string;
  message: string;
  tone?: "neutral" | "success" | "warning";
  contactPath?: string;
}) {
  const iconClass = tone === "success" ? "bg-green-soft text-green" : tone === "warning" ? "bg-amber-soft text-amber" : "bg-pulse-soft text-pulse";

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className={`grid h-12 w-12 place-items-center rounded-lg ${iconClass}`}>
            {tone === "success" ? <Check size={22} /> : <AlertCircle size={22} />}
          </div>
          <h1 className="mt-5 text-2xl font-semibold leading-tight">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
          <a
            href={contactPath}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white"
          >
            Contact HR
          </a>
        </div>
      </section>
    </main>
  );
}

function RatingControl({
  item,
  answer,
  onChange,
}: {
  item: ReviewInstrumentItem;
  answer: ReviewResponse | undefined;
  onChange: (response: ReviewResponse) => void;
}) {
  const currentScore = answer?.notObserved ? null : answer?.score ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-base font-semibold leading-6 text-ink">{item.body}</p>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => {
          const selected = currentScore === score;
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange({ itemId: item.id, itemType: "scale", score, notObserved: false, comment: answer?.comment ?? "" })}
              className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-1 text-sm font-semibold transition ${
                selected ? "border-pulse bg-pulse text-white" : "border-border bg-paper text-ink"
              }`}
              aria-pressed={selected}
            >
              <span>{score}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2 text-center text-[10px] font-semibold text-muted">
        {ratingLabels.map((label) => (
          <span key={label} className="leading-3">{label}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ itemId: item.id, itemType: "scale", score: null, notObserved: true, comment: answer?.comment ?? "" })}
        className={`mt-4 flex min-h-12 w-full items-center justify-between rounded-lg border px-3 text-left text-sm font-semibold ${
          answer?.notObserved ? "border-amber bg-amber-soft text-amber" : "border-border bg-paper text-ink"
        }`}
        aria-pressed={answer?.notObserved === true}
      >
        <span>Unable to Observe</span>
        {answer?.notObserved && <Check size={18} />}
      </button>
      <p className="mt-2 text-xs leading-5 text-muted">
        Use this when you have not seen enough of this behaviour to give a fair rating.
      </p>
      <textarea
        value={answer?.comment ?? ""}
        onChange={(event) =>
          onChange({
            itemId: item.id,
            itemType: "scale",
            score: answer?.notObserved ? null : answer?.score ?? null,
            notObserved: answer?.notObserved === true,
            comment: event.target.value,
          })
        }
        placeholder="Optional comment"
        className="mt-4 min-h-24 w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none transition focus:border-pulse"
      />
    </div>
  );
}

function TextControl({
  item,
  answer,
  onChange,
}: {
  item: ReviewInstrumentItem;
  answer: ReviewResponse | undefined;
  onChange: (response: ReviewResponse) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <label className="text-base font-semibold leading-6 text-ink" htmlFor={`text-${item.id}`}>
        {item.body}
      </label>
      <textarea
        id={`text-${item.id}`}
        value={answer?.comment ?? ""}
        onChange={(event) => onChange({ itemId: item.id, itemType: "text", comment: event.target.value })}
        className="mt-4 min-h-36 w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none transition focus:border-pulse"
      />
    </div>
  );
}

export default function ReviewFlow({ token }: { token: string }) {
  const [loadState, setLoadState] = useState<ReviewLoadState>("loading");
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const hasHydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      try {
        const response = await fetch(`/api/assessments/submissions?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as ReviewPayload;

        if (cancelled) return;

        setPayload(data);
        setLoadState(data.status ?? (response.ok ? "ready" : "error"));
        setSavedAt(data.lastSavedAt ?? null);

        if (data.instrument && data.draft?.responses) {
          setAnswers(buildDraftMap(data.draft.responses));
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setPayload({
            status: "error",
            message: "We could not load this assessment. Please check your connection and try again.",
          });
        }
      } finally {
        hasHydrated.current = true;
      }
    }

    void loadReview();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const instrument = payload?.instrument;
  const allItems = useMemo(() => instrument ? flattenReviewInstrument(instrument) : [], [instrument]);
  const screens = useMemo(() => {
    if (!instrument) return [];

    return [
      ...instrument.competencies
        .filter((competency) => competency.items.length > 0)
        .map((competency) => ({ type: "competency" as const, id: competency.id, title: competency.name, description: competency.description, items: competency.items })),
      ...(instrument.textItems.length
        ? [{ type: "text" as const, id: "narrative", title: "Final comments", description: "Add any narrative feedback that would help this leader grow.", items: instrument.textItems }]
        : []),
      { type: "review" as const, id: "review", title: "Review your answers", description: "Check your responses before final submission.", items: allItems },
    ];
  }, [allItems, instrument]);

  const progress = useMemo(() => instrument ? countAnsweredReviewItems(instrument, answers) : { answered: 0, total: 0, unansweredItemIds: [] }, [answers, instrument]);
  const scaleItems = allItems.filter((item) => item.type === "scale");
  const unansweredScaleItems = scaleItems.filter((item) => !isResponseAnswered({ ...answers[item.id], itemId: item.id, itemType: item.type }));
  const currentScreen = screens[step];
  const pageCount = Math.max(screens.length, 1);
  const isReviewStep = currentScreen?.type === "review";

  useEffect(() => {
    if (!hasHydrated.current || loadState !== "ready" || allItems.length === 0) return;

    const responses = answeredDraftResponses(allItems, answers);
    if (responses.length === 0) return;

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/assessments/submissions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, mode: "draft", responses }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to save draft");
        }

        setSaveState("saved");
        setSavedAt(data?.submission?.lastSavedAt ?? new Date().toISOString());
      } catch {
        setSaveState("failed");
      }
    }, 800);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [allItems, answers, loadState, token]);

  function updateAnswer(itemId: string, response: ReviewResponse) {
    setAnswers((current) => ({
      ...current,
      [itemId]: response,
    }));
  }

  async function submitReview() {
    setSubmitError("");

    if (unansweredScaleItems.length > 0) {
      setSubmitError("Please rate every scale item or mark Unable to Observe before submitting.");
      return;
    }

    setSaveState("saving");

    try {
      const response = await fetch("/api/assessments/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mode: "submit", responses: submissionResponses(allItems, answers) }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to submit assessment");
      }

      setPayload({
        status: "submitted",
        subject: payload?.subject,
        relationshipType: payload?.relationshipType,
        submittedAt: data?.submission?.submittedAt ?? new Date().toISOString(),
        message: "Thank you. Your assessment has been submitted and this link is now closed.",
      });
      setLoadState("submitted");
    } catch (error) {
      setSaveState("failed");
      setSubmitError(error instanceof Error ? error.message : "Unable to submit assessment");
    }
  }

  if (loadState === "loading") {
    return <StatusScreen title="Loading assessment" message="Please hold on while we open your secure review link." />;
  }

  if (loadState !== "ready" || !payload?.subject || !instrument) {
    const title = loadState === "submitted" ? "Assessment already submitted" : loadState === "expired" ? "Assessment link expired" : "Assessment link unavailable";
    const tone = loadState === "submitted" ? "success" : loadState === "expired" ? "warning" : "neutral";

    return <StatusScreen title={title} message={payload?.message ?? "Please contact HR for a fresh assessment link."} tone={tone} contactPath={payload?.contactPath} />;
  }

  if (allItems.length === 0 || screens.length <= 1) {
    return <StatusScreen title="Assessment not ready" message="The questions for this assessment are not available yet. Please contact HR." tone="warning" />;
  }

  return (
    <main className="min-h-screen bg-background text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-6 lg:max-w-4xl lg:py-8">
        <header className="border-b border-border pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-pulse text-sm font-semibold text-white">P</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Pulse 360 assessment</p>
              <h1 className="truncate text-xl font-semibold text-ink">{payload.subject.name}</h1>
            </div>
            <span className="rounded-lg bg-pulse-soft px-2 py-1 text-xs font-semibold text-pulse">
              {relationshipLabel(payload.relationshipType ?? "")}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>{progress.answered} of {progress.total} answered</span>
              <span>{Math.min(step + 1, pageCount)} of {pageCount}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-200">
              <div
                className="h-full rounded-full bg-pulse transition-all"
                style={{ width: `${Math.round(((step + 1) / pageCount) * 100)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className={saveState === "failed" ? "text-red" : saveState === "saving" ? "text-amber" : "text-green"}>
              {saveState === "saving" && "Saving draft..."}
              {saveState === "saved" && `Saved ${formatDateTime(savedAt)}`}
              {saveState === "failed" && "Draft save failed. Check your connection."}
              {saveState === "idle" && `Last saved: ${formatDateTime(savedAt)}`}
            </span>
            <span>Expires {formatDateTime(payload.expiresAt)}</span>
          </div>
        </header>

        <div className="flex-1 py-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {isReviewStep ? "Final check" : currentScreen.type === "text" ? "Narrative feedback" : "Competency"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight text-ink">{currentScreen.title}</h2>
            {currentScreen.description && <p className="mt-2 text-sm leading-6 text-muted">{currentScreen.description}</p>}
          </div>

          {isReviewStep ? (
            <div className="space-y-3">
              {progress.unansweredItemIds.length > 0 && (
                <div className="rounded-lg border border-amber/30 bg-amber-soft p-3 text-sm font-semibold leading-6 text-amber">
                  {unansweredScaleItems.length > 0
                    ? `${unansweredScaleItems.length} scale item${unansweredScaleItems.length === 1 ? "" : "s"} still need a rating or Unable to Observe.`
                    : "Some narrative prompts are blank. You may submit if you have no more comments to add."}
                </div>
              )}
              {allItems.map((item) => {
                const answer = answers[item.id];
                const answered = isResponseAnswered({ ...answer, itemId: item.id, itemType: item.type });
                const value = item.type === "text"
                  ? answer?.comment?.trim() || "No narrative response"
                  : answer?.notObserved
                    ? "Unable to Observe"
                    : answer?.score
                      ? `${answer.score}/5`
                      : "Unanswered";

                return (
                  <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold leading-5 text-ink">{item.body}</p>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${answered ? "bg-green-soft text-green" : "bg-amber-soft text-amber"}`}>
                        {answered ? "Done" : "Missing"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{value}</p>
                  </div>
                );
              })}
              {submitError && <p className="rounded-lg bg-red-soft p-3 text-sm font-semibold text-red">{submitError}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {currentScreen.items.map((item) => (
                item.type === "text" ? (
                  <TextControl key={item.id} item={item} answer={answers[item.id]} onChange={(response) => updateAnswer(item.id, response)} />
                ) : (
                  <RatingControl key={item.id} item={item} answer={answers[item.id]} onChange={(response) => updateAnswer(item.id, response)} />
                )
              ))}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 pb-safe backdrop-blur sm:-mx-6 sm:px-6">
          <div className="grid grid-cols-[1fr_1.4fr] gap-3">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink disabled:opacity-40"
            >
              <ChevronLeft size={18} />
              Back
            </button>
            {isReviewStep ? (
              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={saveState === "saving"}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saveState === "saving" ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Submit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(screens.length - 1, current + 1))}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-sm font-semibold text-white"
              >
                Continue
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
}
