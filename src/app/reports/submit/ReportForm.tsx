"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  ChevronLeft,
  Check,
  Sparkles,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { employees } from "@/data/mockData";

type Mood = "energised" | "good" | "okay" | "drained";
type SubmitState = "idle" | "processing" | "done";

interface AIDigest {
  accomplishments: string[];
  blockers: string[];
  goalsReferenced: string[];
  sentiment: string;
  collaborationMentions: string[];
}

interface GoalEntry {
  id: string;
  name: string;
  originalPct: number;
  currentPct: number;
}

const moods: { key: Mood; emoji: string; label: string }[] = [
  { key: "energised", emoji: "🔥", label: "Energised" },
  { key: "good", emoji: "😊", label: "Good" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "drained", emoji: "😓", label: "Drained" },
];

const moodMeta: Record<Mood, { emoji: string; label: string }> = {
  energised: { emoji: "🔥", label: "Energised" },
  good: { emoji: "😊", label: "Good" },
  okay: { emoji: "😐", label: "Okay" },
  drained: { emoji: "😓", label: "Drained" },
};

const steps = ["This Week", "Goal Progress", "Review"];

const me = employees[0];
const activeGoals = me.goals.filter((g) => g.status !== "completed");

function barColor(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

export default function ReportForm() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [accomplishments, setAccomplishments] = useState("");
  const [blockers, setBlockers] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [goalEntries, setGoalEntries] = useState<GoalEntry[]>(
    activeGoals.map((g) => ({
      id: g.id,
      name: g.name,
      originalPct: g.percentComplete,
      currentPct: g.percentComplete,
    }))
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [showToast, setShowToast] = useState(false);
  const [aiDigest, setAiDigest] = useState<AIDigest | null>(null);
  const [aiError, setAiError] = useState(false);

  const updateGoal = (id: string, raw: number) => {
    const val = Math.min(100, Math.max(0, raw));
    setGoalEntries((prev) =>
      prev.map((g) => (g.id === id ? { ...g, currentPct: val } : g))
    );
  };

  const handleSubmit = async () => {
    setSubmitState("processing");
    setShowToast(true);
    try {
      const res = await fetch("/api/ai/analyze-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accomplishments,
          blockers,
          mood,
          goalProgress: goalEntries.map((g) => ({
            name: g.name,
            pct: g.currentPct,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiDigest(data);
      } else {
        setAiError(true);
      }
    } catch {
      setAiError(true);
    }
    setSubmitState("done");
  };

  return (
    <div className="dashboard-page">

      {/* ── TOAST ──────────────────────────────────────────────── */}
      {showToast && (
        <div
          className="fixed z-[100] animate-fade-up"
          style={{
            top: "112px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 2rem)",
            maxWidth: "32rem",
          }}
        >
          <div className="bg-ink text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl">
            <CheckCircle size={15} className="text-green flex-shrink-0" />
            <p className="text-sm font-medium">
              Report submitted. Your manager has been notified.
            </p>
          </div>
        </div>
      )}

      <div className="px-4 space-y-5">

        {/* ── BACK BUTTON ────────────────────────────────────────── */}
        <Link
          href="/dashboard/employee"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors"
        >
          <ChevronLeft size={16} />
          Back
        </Link>

        {/* ── AI CHIP ────────────────────────────────────────────── */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 bg-ink rounded-full px-4 py-2">
            <Sparkles size={12} className="text-pulse flex-shrink-0" />
            <span className="text-white text-xs font-medium">
              AI will extract key insights from your text
            </span>
          </div>
        </div>

        {/* ── STEP INDICATOR ─────────────────────────────────────── */}
        <div className="flex">
          {steps.map((label, i) => {
            const num = i + 1;
            const isDone = step > num;
            const isCurrent = step === num;
            return (
              <Fragment key={label}>
                <div className="flex flex-col items-center">
                  <div
                    className={clsx(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                      isDone
                        ? "bg-green text-white"
                        : isCurrent
                        ? "bg-pulse text-white"
                        : "bg-border text-muted"
                    )}
                  >
                    {isDone ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      num
                    )}
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] mt-1.5 text-center leading-tight",
                      isCurrent
                        ? "text-pulse font-semibold"
                        : "text-muted"
                    )}
                  >
                    {label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex-1 flex items-start pt-3">
                    <div
                      className={clsx(
                        "w-full h-px",
                        isDone ? "bg-green/30" : "bg-border"
                      )}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {/* ── STEP CONTENT ───────────────────────────────────────── */}
        <div key={step} className="animate-fade-up space-y-4">

          {/* STEP 1 — This Week */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  What did you accomplish this week?
                </label>
                <textarea
                  value={accomplishments}
                  onChange={(e) => setAccomplishments(e.target.value)}
                  placeholder="Describe your key wins, deliverables, and progress..."
                  className="w-full rounded-xl border border-border bg-card p-3.5 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:border-pulse focus:ring-2 focus:ring-pulse/10 transition-colors"
                  style={{ minHeight: "100px" }}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Any blockers or challenges?
                </label>
                <textarea
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  placeholder="What slowed you down or needs support?"
                  className="w-full rounded-xl border border-border bg-card p-3.5 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:border-pulse focus:ring-2 focus:ring-pulse/10 transition-colors"
                  style={{ minHeight: "80px" }}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-3">
                  How are you feeling this week?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {moods.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMood(m.key)}
                      className={clsx(
                        "flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all text-left",
                        mood === m.key
                          ? "bg-pulse-soft border-pulse text-pulse"
                          : "bg-card border-border text-ink hover:border-pulse/40"
                      )}
                    >
                      <span>{m.emoji}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full bg-pulse text-white font-semibold text-sm py-3 rounded-xl hover:bg-pulse/90 transition-colors flex items-center justify-center gap-2"
              >
                Next
                <ArrowRight size={15} />
              </button>
            </>
          )}

          {/* STEP 2 — Goal Progress */}
          {step === 2 && (
            <>
              <p className="text-sm text-muted leading-relaxed">
                Update your progress on each active goal.
              </p>

              <div className="space-y-3">
                {goalEntries.map((goal) => {
                  const changed = goal.currentPct !== goal.originalPct;
                  const improved = goal.currentPct > goal.originalPct;
                  return (
                    <div
                      key={goal.id}
                      className="bg-card rounded-2xl border border-border p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-sm font-medium text-ink leading-snug flex-1">
                          {goal.name}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={goal.currentPct}
                            onChange={(e) =>
                              updateGoal(goal.id, Number(e.target.value))
                            }
                            className="w-14 text-right border border-border rounded-lg px-2 py-1.5 text-sm font-bold text-ink focus:outline-none focus:border-pulse focus:ring-2 focus:ring-pulse/10 transition-colors"
                          />
                          <span className="text-sm text-muted">%</span>
                        </div>
                      </div>

                      {/* Live progress bar */}
                      <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all duration-300",
                            barColor(goal.currentPct)
                          )}
                          style={{ width: `${goal.currentPct}%` }}
                        />
                      </div>

                      {changed ? (
                        <p
                          className={clsx(
                            "text-[11px] font-semibold",
                            improved ? "text-green" : "text-red"
                          )}
                        >
                          {goal.originalPct}% → {goal.currentPct}%{" "}
                          {improved ? "↑" : "↓"}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted">
                          No change from {goal.originalPct}%
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted hover:border-ink hover:text-ink transition-colors flex items-center justify-center gap-1.5"
                >
                  <ChevronLeft size={15} />
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-pulse text-white font-semibold text-sm py-3 rounded-xl hover:bg-pulse/90 transition-colors flex items-center justify-center gap-2"
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}

          {/* STEP 3 — Review & Submit */}
          {step === 3 && (
            <>
              {/* Summary card */}
              <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                    This Week
                  </p>
                  {accomplishments ? (
                    <p className="text-sm text-ink leading-relaxed line-clamp-2">
                      {accomplishments}
                    </p>
                  ) : (
                    <p className="text-sm text-muted italic">
                      No accomplishments entered
                    </p>
                  )}
                  {blockers && (
                    <p className="text-xs text-muted mt-2 line-clamp-2">
                      <span className="font-semibold text-ink">Blockers:</span>{" "}
                      {blockers}
                    </p>
                  )}
                </div>

                {mood && (
                  <div className="flex items-center gap-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Mood
                    </p>
                    <span className="px-3 py-1 bg-pulse-soft text-pulse text-xs font-semibold rounded-full">
                      {moodMeta[mood].emoji} {moodMeta[mood].label}
                    </span>
                  </div>
                )}
              </div>

              {/* Goal updates */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2.5">
                  Goal Updates
                </p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                  {goalEntries.map((goal) => {
                    const changed = goal.currentPct !== goal.originalPct;
                    const improved = goal.currentPct > goal.originalPct;
                    return (
                      <div
                        key={goal.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <p className="text-sm text-ink truncate flex-1">
                          {goal.name}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0 text-sm">
                          {changed ? (
                            <>
                              <span className="text-muted">
                                {goal.originalPct}%
                              </span>
                              <span className="text-muted">→</span>
                              <span
                                className={clsx(
                                  "font-bold",
                                  improved ? "text-green" : "text-red"
                                )}
                              >
                                {goal.currentPct}%{" "}
                                {improved ? "↑" : "↓"}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted">
                              {goal.currentPct}% — no change
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={submitState !== "idle"}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted hover:border-ink hover:text-ink transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronLeft size={15} />
                  Back
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={submitState !== "idle"}
                  className={clsx(
                    "flex-1 text-white font-semibold text-sm py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed",
                    submitState === "idle" && "bg-pulse hover:bg-pulse/90",
                    submitState === "processing" && "bg-ink",
                    submitState === "done" && "bg-green"
                  )}
                >
                  {submitState === "idle" && "Submit Report"}
                  {submitState === "processing" && (
                    <>
                      <Sparkles size={14} className="animate-pulse" />
                      AI Processing...
                    </>
                  )}
                  {submitState === "done" && (
                    <>
                      <CheckCircle size={14} />
                      Submitted!
                    </>
                  )}
                </button>
              </div>

              {/* AI Digest — shown after submit */}
              {submitState === "done" && (
                <div className="space-y-3 animate-fade-up">
                  {aiError && (
                    <div className="bg-amber-soft rounded-xl border border-amber/20 p-3.5 flex items-start gap-2.5">
                      <span className="text-amber flex-shrink-0 text-sm">⚠</span>
                      <p className="text-xs text-amber leading-relaxed">
                        AI analysis unavailable. Your report was saved successfully.
                      </p>
                    </div>
                  )}

                  {aiDigest && (
                    <div className="bg-ink rounded-[20px] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-4 rounded-full bg-pulse flex-shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-pulse">
                            AI Report Digest
                          </span>
                        </div>
                        <span
                          className={clsx(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold",
                            aiDigest.sentiment === "positive"
                              ? "bg-green/20 text-green"
                              : aiDigest.sentiment === "concerning"
                              ? "bg-amber/20 text-amber"
                              : "bg-white/10 text-white/60"
                          )}
                        >
                          {aiDigest.sentiment}
                        </span>
                      </div>

                      {aiDigest.accomplishments.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                            Key Accomplishments
                          </p>
                          <div className="space-y-1.5">
                            {aiDigest.accomplishments.map((item, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="w-1 h-1 rounded-full bg-green mt-2 flex-shrink-0" />
                                <p className="text-white/60 text-xs leading-relaxed">
                                  {item}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {aiDigest.blockers.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                            Flagged Blockers
                          </p>
                          <div className="space-y-1.5">
                            {aiDigest.blockers.map((item, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="w-1 h-1 rounded-full bg-amber mt-2 flex-shrink-0" />
                                <p className="text-white/60 text-xs leading-relaxed">
                                  {item}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {aiDigest.collaborationMentions.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                            Collaboration
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {aiDigest.collaborationMentions.map((name, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 bg-white/10 text-white/60 text-[10px] rounded-full"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => router.push("/dashboard/employee")}
                    className="w-full bg-green text-white font-semibold text-sm py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-green/90 transition-colors"
                  >
                    <ArrowRight size={15} />
                    View Dashboard
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
