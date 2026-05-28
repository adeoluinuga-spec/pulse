"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, X, Download } from "lucide-react";
import { employees, departments } from "@/data/mockData";
import type { Employee, AIRecommendation } from "@/data/mockData";
import { useRole } from "@/context/RoleContext";
import Avatar from "@/components/ui/Avatar";
import ProgressBar from "@/components/ui/ProgressBar";
import { SectionLabel } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppraisalState {
  selfSubmitted: boolean;
  selfRatings: [number, number, number];
  selfTexts: [string, string];
  managerSubmitted: boolean;
  managerRatings: [number, number, number, number, number];
  managerComment: string;
  hrSignedOff: boolean;
  hrAgreed: boolean | null;
  hrOverrideReason: string;
}

// ── Weights (configurable) ────────────────────────────────────────────────────

const WEIGHTS = {
  goalAchievement:   30,
  reportConsistency: 20,
  managerAssessment: 25,
  peerFeedback:      15,
  selfAssessment:    10,
} as const;

// ── Static content ────────────────────────────────────────────────────────────

const SELF_QUESTIONS = [
  { id: "q1", type: "star" as const, label: "Rate your collaboration and teamwork this quarter" },
  { id: "q2", type: "text" as const, label: "Describe your biggest professional achievement this quarter" },
  { id: "q3", type: "star" as const, label: "How effectively did you manage your goals and deliverables?" },
  { id: "q4", type: "text" as const, label: "What challenges did you face and how did you address them?" },
  { id: "q5", type: "star" as const, label: "Rate your communication with stakeholders and peers" },
];

// precomputed type index for each question
const Q_MAP: { type: "star" | "text"; idx: number }[] = (() => {
  let si = 0, ti = 0;
  return SELF_QUESTIONS.map((q) =>
    q.type === "star" ? { type: "star", idx: si++ } : { type: "text", idx: ti++ }
  );
})();

const MANAGER_COMPETENCIES = [
  "Goal Achievement Quality",
  "Collaboration & Leadership",
  "Initiative & Problem Solving",
  "Communication & Stakeholder Management",
  "Growth & Development",
];

const PEER_FEEDBACK: Record<string, { rating: number; text: string }[]> = {
  e1: [
    { rating: 5, text: "Consistently the strongest cross-functional collaborator on the team." },
    { rating: 5, text: "Exceptional at roadmap presentations — rarely needs to explain things twice." },
    { rating: 4, text: "Proactive about unblocking the team and very clear in written communication." },
  ],
  e2: [
    { rating: 5, text: "Fantastic technical mentor. Very patient and thorough with junior engineers." },
    { rating: 4, text: "Strong code review feedback. Always explains the rationale behind suggestions." },
  ],
  e4: [
    { rating: 5, text: "The most energising sales leader I've worked with. Sets clear direction." },
    { rating: 4, text: "Great at rallying the team around targets. Could improve async update cadence." },
  ],
  e6: [
    { rating: 5, text: "Exceptional CSAT scores speak for themselves. A genuinely customer-first mindset." },
    { rating: 4, text: "Reliable, proactive, and thorough in quarterly business review preparation." },
  ],
};

const REC_META: Record<AIRecommendation, { label: string; bg: string; text: string; border: string }> = {
  promote:       { label: "Promote",       bg: "bg-green-soft",  text: "text-green",  border: "border-green/20"  },
  good_standing: { label: "Good Standing", bg: "bg-border",      text: "text-muted",  border: "border-border"    },
  pip:           { label: "PIP Review",    bg: "bg-amber-soft",  text: "text-amber",  border: "border-amber/20"  },
  exit_risk:     { label: "Exit Risk",     bg: "bg-red-soft",    text: "text-red",    border: "border-red/20"    },
};

const SCORE_BANDS = [
  { label: "85–100", min: 85, max: 100, color: "bg-green"  },
  { label: "75–84",  min: 75, max:  84, color: "bg-pulse"  },
  { label: "65–74",  min: 65, max:  74, color: "bg-amber"  },
  { label: "50–64",  min: 50, max:  64, color: "bg-red"    },
  { label: "0–49",   min:  0, max:  49, color: "bg-border" },
];

// ── Initial state ─────────────────────────────────────────────────────────────

function makeState(over: Partial<AppraisalState> = {}): AppraisalState {
  return {
    selfSubmitted: false,    selfRatings: [0, 0, 0],     selfTexts: ["", ""],
    managerSubmitted: false, managerRatings: [0,0,0,0,0], managerComment: "",
    hrSignedOff: false,      hrAgreed: null,               hrOverrideReason: "",
    ...over,
  };
}

const INIT_APPRAISALS: Record<string, AppraisalState> = {
  e1: makeState(),
  e2: makeState({ selfSubmitted: true, selfRatings: [4, 4, 4] }),
  e3: makeState({
    selfSubmitted: true, selfRatings: [3, 4, 3],
    managerSubmitted: true, managerRatings: [3, 4, 3, 4, 3],
    managerComment: "Solid progress on the review cycle. The attrition reduction goal needs a more targeted intervention strategy.",
  }),
  e4: makeState({ selfSubmitted: true, selfRatings: [4, 4, 4] }),
  e5: makeState(),
  e6: makeState({
    selfSubmitted: true, selfRatings: [4, 4, 4],
    managerSubmitted: true, managerRatings: [4, 4, 4, 3, 4],
    managerComment: "Consistently strong CSAT and QBR delivery. Playbook documentation remains the key area to address going forward.",
  }),
  e7: makeState({ selfSubmitted: true, selfRatings: [4, 3, 4] }),
  e8: makeState(),
};

// ── Score helpers ─────────────────────────────────────────────────────────────

function goalScore(emp: Employee): number {
  const tw = emp.goals.reduce((s, g) => s + g.weight, 0);
  if (!tw) return 0;
  return Math.round(emp.goals.reduce((s, g) => s + g.percentComplete * g.weight, 0) / tw);
}

function starAvg(ratings: readonly number[]): number {
  const filled = ratings.filter((r) => r > 0);
  if (!filled.length) return 0;
  return Math.round((filled.reduce((s, r) => s + r, 0) / filled.length) * 20);
}

function calcScore(emp: Employee, state: AppraisalState): number {
  const parts: { score: number; w: number }[] = [
    { score: goalScore(emp),                         w: WEIGHTS.goalAchievement   },
    { score: emp.consistencyIndex,                   w: WEIGHTS.reportConsistency },
    { score: Math.round(emp.peerRating * 20),         w: WEIGHTS.peerFeedback      },
  ];
  if (state.managerSubmitted) parts.push({ score: starAvg(state.managerRatings), w: WEIGHTS.managerAssessment });
  if (state.selfSubmitted)    parts.push({ score: starAvg(state.selfRatings),    w: WEIGHTS.selfAssessment    });
  const tw = parts.reduce((s, p) => s + p.w, 0);
  return tw ? Math.round(parts.reduce((s, p) => s + p.score * p.w, 0) / tw) : 0;
}

function completionStatus(state: AppraisalState): "pending" | "partial" | "complete" {
  if (state.managerSubmitted && state.selfSubmitted) return "complete";
  if (state.selfSubmitted || state.managerSubmitted) return "partial";
  return "pending";
}

function scoreBand(score: number): { label: string; dotColor: string; textColor: string } {
  if (score >= 85) return { label: "Strong Performer", dotColor: "bg-green",  textColor: "text-green"  };
  if (score >= 75) return { label: "Good Standing",    dotColor: "bg-ink",    textColor: "text-ink"    };
  if (score >= 65) return { label: "Needs Improvement",dotColor: "bg-amber",  textColor: "text-amber"  };
  return               { label: "At Risk",            dotColor: "bg-red",    textColor: "text-red"    };
}

// ── UI atoms ──────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => onChange(s)} className="text-2xl leading-none">
          <span className={s <= value ? "text-pulse" : "text-border"}>★</span>
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={clsx("text-sm", s <= Math.round(value) ? "text-pulse" : "text-border")}>★</span>
      ))}
    </span>
  );
}

function StatusPip({ status }: { status: "pending" | "partial" | "complete" }) {
  return (
    <span className={clsx(
      "inline-block w-2.5 h-2.5 rounded-full shrink-0",
      status === "complete" ? "bg-green" : status === "partial" ? "bg-amber" : "bg-red"
    )} />
  );
}

function RecBadge({ rec }: { rec: AIRecommendation }) {
  const m = REC_META[rec];
  return (
    <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border", m.bg, m.text, m.border)}>
      {m.label}
    </span>
  );
}

// ── FormulaSheet ──────────────────────────────────────────────────────────────

function FormulaSheet({ onClose }: { onClose: () => void }) {
  const rows = [
    { label: "Goal Achievement",    w: WEIGHTS.goalAchievement,   source: "Weighted avg progress across all active goals" },
    { label: "Report Consistency",  w: WEIGHTS.reportConsistency, source: "Consistency index derived from report patterns" },
    { label: "Peer Feedback",       w: WEIGHTS.peerFeedback,      source: "Average rating from the 360° peer review cycle" },
    { label: "Manager Assessment",  w: WEIGHTS.managerAssessment, source: "Manager's ratings on 5 core competencies"       },
    { label: "Self-Assessment",     w: WEIGHTS.selfAssessment,    source: "Your own self-rated competency scores"          },
  ];
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl">
        <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 bg-border rounded-full" /></div>
        <div className="px-5 pb-10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>How your score is calculated</h2>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted"><X size={14} /></button>
          </div>
          <p className="text-sm text-muted">A weighted average of five components. Weights scale to include only available data.</p>
          <div className="bg-paper rounded-xl overflow-hidden divide-y divide-border">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start gap-3 px-4 py-3">
                <div className="shrink-0 w-9 h-6 flex items-center justify-center bg-pulse text-white text-xs font-bold rounded">
                  {row.w}%
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{row.label}</p>
                  <p className="text-xs text-muted">{row.source}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-ink text-white rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-1">Formula</p>
            <p className="text-sm font-semibold">Score = Σ (component × weight) ÷ total available weight</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── SelfAssessmentSection ─────────────────────────────────────────────────────

function SelfAssessmentSection({
  onSubmit,
}: {
  onSubmit: (ratings: [number, number, number], texts: [string, string]) => void;
}) {
  const [ratings, setRatings] = useState<[number, number, number]>([0, 0, 0]);
  const [texts, setTexts]     = useState<[string, string]>(["", ""]);
  const [processing, setProcessing] = useState(false);

  const canSubmit = ratings.every((r) => r > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    setProcessing(true);
    setTimeout(() => onSubmit(ratings, texts), 2500);
  }

  if (processing) {
    return (
      <div className="bg-card rounded-2xl p-8 border border-border text-center space-y-4">
        <div className="w-12 h-12 mx-auto relative">
          <div className="absolute inset-0 rounded-full border-2 border-pulse/20" />
          <div className="absolute inset-0 rounded-full border-t-2 border-pulse animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Analysing responses with AI…</p>
          <p className="text-xs text-muted mt-1">This takes just a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold text-ink">Self-Assessment</p>
        <p className="text-xs text-muted mt-0.5">Complete all star ratings to submit · Q2 2026</p>
      </div>
      <div className="px-4 py-4 space-y-5">
        {SELF_QUESTIONS.map((q, qi) => {
          const { type, idx } = Q_MAP[qi];
          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium text-ink">{q.label}</p>
              {type === "star" ? (
                <StarRating
                  value={ratings[idx]}
                  onChange={(v) =>
                    setRatings((prev) => {
                      const next = [...prev] as [number, number, number];
                      next[idx] = v;
                      return next;
                    })
                  }
                />
              ) : (
                <textarea
                  rows={3}
                  value={texts[idx]}
                  onChange={(e) =>
                    setTexts((prev) => {
                      const next = [...prev] as [string, string];
                      next[idx] = e.target.value;
                      return next;
                    })
                  }
                  placeholder="Write your response here…"
                  className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse resize-none"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 bg-pulse text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          Submit Self-Assessment
        </button>
      </div>
    </div>
  );
}

// ── ManagerReviewSheet ────────────────────────────────────────────────────────

function ManagerReviewSheet({
  employee,
  state,
  onSubmit,
  onClose,
}: {
  employee: Employee;
  state: AppraisalState;
  onSubmit: (ratings: [number,number,number,number,number], comment: string) => void;
  onClose: () => void;
}) {
  const score = calcScore(employee, state);
  const [ratings, setRatings] = useState<[number,number,number,number,number]>(
    state.managerSubmitted ? state.managerRatings : [0, 0, 0, 0, 0]
  );
  const [comment, setComment] = useState(state.managerComment);
  const [aiAgreed, setAiAgreed] = useState<boolean | null>(null);
  const [aiNote, setAiNote] = useState("");

  const canSubmit = ratings.every((r) => r > 0) && comment.trim().length > 0;
  const gScore  = goalScore(employee);
  const pScore  = Math.round(employee.peerRating * 20);
  const rec     = employee.aiRec;
  const recMeta = REC_META[rec.recommendation];

  const componentRows = [
    { label: "Goal Achievement",    weight: WEIGHTS.goalAchievement,   score: gScore,                value: null    },
    { label: "Report Consistency",  weight: WEIGHTS.reportConsistency, score: employee.consistencyIndex, value: null },
    { label: "Peer Feedback",       weight: WEIGHTS.peerFeedback,      score: pScore,                value: employee.peerRating },
    { label: "Self-Assessment",     weight: WEIGHTS.selfAssessment,    score: state.selfSubmitted ? starAvg(state.selfRatings) : null, value: null },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-10 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar initials={employee.initials} color={employee.avatarColor} size="sm" />
              <div>
                <p className="text-sm font-bold text-ink">{employee.name}</p>
                <p className="text-xs text-muted">{employee.role} · {employee.department}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* Score snapshot */}
          <div className="bg-ink rounded-2xl px-5 py-4 text-white">
            <div className="flex items-end gap-2 mb-3">
              <span className="text-4xl font-bold leading-none" style={{ fontFamily: "var(--font-syne)" }}>{score}</span>
              <span className="pb-1 text-white/50 text-sm">/100 current score</span>
            </div>
            <div className="space-y-1.5">
              {componentRows.map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-white/50 w-36 shrink-0">{c.label}</span>
                  {c.score != null ? (
                    <>
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-white/70 rounded-full" style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-white/80 w-7 text-right">{c.score}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-white/30">Pending</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Manager assessment form */}
          <div>
            <SectionLabel>Manager Assessment</SectionLabel>
            <div className="bg-paper rounded-xl divide-y divide-border overflow-hidden">
              {MANAGER_COMPETENCIES.map((comp, i) => (
                <div key={comp} className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm text-ink flex-1">{comp}</p>
                  <StarRating
                    value={ratings[i]}
                    onChange={(v) =>
                      setRatings((prev) => {
                        const next = [...prev] as [number,number,number,number,number];
                        next[i] = v;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Overall comment */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Overall Comment</p>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Summarise your assessment of this employee's performance this quarter…"
              className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse resize-none"
            />
          </div>

          {/* AI recommendation */}
          <div className="space-y-3">
            <SectionLabel>AI Recommendation</SectionLabel>
            <div className={clsx("rounded-xl p-4 border space-y-3", recMeta.bg, recMeta.border)}>
              <div className="flex items-center justify-between">
                <RecBadge rec={rec.recommendation} />
                <span className="text-xs text-muted">{Math.round(rec.confidence * 100)}% confidence</span>
              </div>
              <ul className="space-y-1">
                {rec.evidence.slice(0, 3).map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted">
                    <span className="shrink-0 mt-0.5 text-green">✓</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setAiAgreed(true)}
                  className={clsx(
                    "flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors",
                    aiAgreed === true ? "bg-green text-white border-green" : "bg-card text-muted border-border"
                  )}
                >
                  Agree
                </button>
                <button
                  onClick={() => setAiAgreed(false)}
                  className={clsx(
                    "flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors",
                    aiAgreed === false ? "bg-ink text-white border-ink" : "bg-card text-muted border-border"
                  )}
                >
                  Disagree + Note
                </button>
              </div>
              {aiAgreed === false && (
                <textarea
                  rows={2}
                  value={aiNote}
                  onChange={(e) => setAiNote(e.target.value)}
                  placeholder="Explain your disagreement…"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse resize-none"
                />
              )}
            </div>
          </div>

          <button
            onClick={() => onSubmit(ratings, comment)}
            disabled={!canSubmit}
            className="w-full py-3 bg-pulse text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            Submit Assessment
          </button>
        </div>
      </div>
    </>
  );
}

// ── HRSignOffSheet ────────────────────────────────────────────────────────────

function HRSignOffSheet({
  employee,
  state,
  onSubmit,
  onClose,
}: {
  employee: Employee;
  state: AppraisalState;
  onSubmit: (agreed: boolean, reason: string) => void;
  onClose: () => void;
}) {
  const score   = calcScore(employee, state);
  const rec     = employee.aiRec;
  const recMeta = REC_META[rec.recommendation];
  const [agreed, setAgreed]   = useState<boolean | null>(null);
  const [reason, setReason]   = useState("");

  const canSubmit = agreed !== null && (agreed === true || reason.trim().length > 0);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl">
        <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 bg-border rounded-full" /></div>
        <div className="px-5 pb-10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>HR Sign-off</h2>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted"><X size={14} /></button>
          </div>

          <div className="flex items-center gap-3">
            <Avatar initials={employee.initials} color={employee.avatarColor} size="sm" />
            <div>
              <p className="text-sm font-bold text-ink">{employee.name}</p>
              <p className="text-xs text-muted">{employee.department} · Score {score}/100</p>
            </div>
          </div>

          {/* AI recommendation */}
          <div className={clsx("rounded-xl p-4 border", recMeta.bg, recMeta.border)}>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-2">AI Recommendation</p>
            <div className="flex items-center justify-between">
              <RecBadge rec={rec.recommendation} />
              <span className="text-xs text-muted">{Math.round(rec.confidence * 100)}% confidence</span>
            </div>
            {state.managerComment && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-[11px] text-muted mb-1">Manager comment:</p>
                <p className="text-xs text-ink italic">&ldquo;{state.managerComment}&rdquo;</p>
              </div>
            )}
          </div>

          {/* Decision */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">Your Decision</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAgreed(true)}
                className={clsx(
                  "py-3 rounded-xl text-sm font-semibold border transition-colors",
                  agreed === true ? "bg-green text-white border-green" : "bg-card text-muted border-border"
                )}
              >
                Confirm Recommendation
              </button>
              <button
                onClick={() => setAgreed(false)}
                className={clsx(
                  "py-3 rounded-xl text-sm font-semibold border transition-colors",
                  agreed === false ? "bg-ink text-white border-ink" : "bg-card text-muted border-border"
                )}
              >
                Override
              </button>
            </div>
            {agreed === false && (
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide your override reason and intended outcome…"
                className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse resize-none"
              />
            )}
          </div>

          <button
            onClick={() => onSubmit(agreed!, reason)}
            disabled={!canSubmit}
            className="w-full py-3 bg-pulse text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            Finalise Sign-off
          </button>
        </div>
      </div>
    </>
  );
}

// ── EmployeeView ──────────────────────────────────────────────────────────────

function EmployeeView({
  employee,
  state,
  onSubmitSelf,
}: {
  employee: Employee;
  state: AppraisalState;
  onSubmitSelf: (ratings: [number,number,number], texts: [string,string]) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);

  const score   = calcScore(employee, state);
  const band    = scoreBand(score);
  const gScore  = goalScore(employee);
  const pScore  = Math.round(employee.peerRating * 20);
  const peers   = PEER_FEEDBACK[employee.id] ?? [];

  const breakdownRows = [
    {
      key: "goal", label: "Goal Achievement",
      weight: WEIGHTS.goalAchievement,
      score: gScore, pending: false,
      detail: `Weighted avg of ${employee.goals.length} goals. Components: ${employee.goals.map(g => `${g.name.slice(0, 20)}… ${g.percentComplete}%`).slice(0, 2).join(", ")}.`,
    },
    {
      key: "consistency", label: "Report Consistency",
      weight: WEIGHTS.reportConsistency,
      score: employee.consistencyIndex, pending: false,
      detail: `Based on ${employee.reports.length} submitted reports. Measures regularity and improvement trend.`,
    },
    {
      key: "peer", label: "Peer Feedback",
      weight: WEIGHTS.peerFeedback,
      score: pScore, pending: false,
      detail: `${employee.peerRating.toFixed(1)}/5 average from 360° peer review. Mapped to 0–100 scale.`,
    },
    {
      key: "manager", label: "Manager Assessment",
      weight: WEIGHTS.managerAssessment,
      score: state.managerSubmitted ? starAvg(state.managerRatings) : null,
      pending: !state.managerSubmitted,
      detail: state.managerSubmitted ? "Manager has rated 5 core competencies." : "Your manager has not yet completed their assessment.",
    },
    {
      key: "self", label: "Self-Assessment",
      weight: WEIGHTS.selfAssessment,
      score: state.selfSubmitted ? starAvg(state.selfRatings) : null,
      pending: !state.selfSubmitted,
      detail: state.selfSubmitted ? "You completed your self-assessment." : "Submit your self-assessment below to include it in your score.",
    },
  ];

  function toggle(key: string) {
    setExpandedRow((prev) => (prev === key ? null : key));
  }

  return (
    <>
      {/* Hero score card */}
      <section className="animate-fade-up px-4">
        <div className="bg-ink rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Q2 2026 Appraisal</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-5xl font-bold leading-none" style={{ fontFamily: "var(--font-syne)" }}>{score}</span>
                <span className="pb-1 text-white/40 text-sm">/100</span>
              </div>
            </div>
            <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white mt-1")}>
              {band.label}
            </span>
          </div>
          <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${score}%` }} />
          </div>
          <p className="text-[11px] text-white/40 mt-2">
            {state.managerSubmitted && state.selfSubmitted
              ? "All components included"
              : `Based on ${state.managerSubmitted || state.selfSubmitted ? "partial" : "available"} data — assessments pending`}
          </p>
        </div>
      </section>

      {/* Score breakdown */}
      <section className="animate-fade-up px-4">
        <SectionLabel>Score Breakdown</SectionLabel>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {breakdownRows.map((row, i) => (
            <div key={row.key} className={clsx("border-border", i > 0 && "border-t")}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3"
                onClick={() => toggle(row.key)}
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{row.label}</p>
                    <span className="text-[10px] text-muted bg-border px-1.5 py-0.5 rounded">{row.weight}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {row.pending ? (
                    <span className="text-xs text-muted">Pending</span>
                  ) : (
                    <span className="text-sm font-bold text-ink">{row.score}</span>
                  )}
                  <ChevronDown size={14} className={clsx("text-muted transition-transform duration-200", expandedRow === row.key && "rotate-180")} />
                </div>
              </button>
              {expandedRow === row.key && (
                <div className="px-4 pb-3">
                  {!row.pending && row.score != null && (
                    <ProgressBar value={row.score} status={row.score >= 75 ? "on_track" : row.score >= 50 ? "at_risk" : "behind"} height="thin" className="mb-2" />
                  )}
                  <p className="text-xs text-muted">{row.detail}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowFormula(true)}
          className="mt-3 text-xs font-semibold text-pulse"
        >
          How is this score calculated? →
        </button>
      </section>

      {/* Self-assessment */}
      {!state.selfSubmitted ? (
        <section className="animate-fade-up px-4">
          <SectionLabel>Self-Assessment</SectionLabel>
          <SelfAssessmentSection onSubmit={onSubmitSelf} />
        </section>
      ) : (
        <section className="animate-fade-up px-4">
          <div className="bg-green-soft rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-green text-xl">✓</span>
            <div>
              <p className="text-sm font-semibold text-green">Self-Assessment Submitted</p>
              <p className="text-xs text-green/70 mt-0.5">Your responses have been included in your score.</p>
            </div>
          </div>
        </section>
      )}

      {/* Peer feedback */}
      <section className="animate-fade-up px-4">
        <SectionLabel>Peer Feedback Received</SectionLabel>
        {peers.length > 0 ? (
          <div className="space-y-2">
            {peers.map((p, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <StarDisplay value={p.rating} />
                  <span className="text-xs text-muted">Anonymous peer</span>
                </div>
                <p className="text-sm text-muted italic">&ldquo;{p.text}&rdquo;</p>
              </div>
            ))}
            <p className="text-xs text-muted px-1">Peer feedback collection closes Jun 20, 2026. Responses are fully anonymised.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <p className="text-sm text-ink font-semibold mb-1">No peer feedback yet</p>
            <p className="text-xs text-muted">Peer feedback collection closes Jun 20, 2026.</p>
          </div>
        )}
      </section>

      {/* AI recommendation — only after manager reviewed */}
      {state.managerSubmitted && (
        <section className="animate-fade-up px-4">
          <SectionLabel>AI Recommendation</SectionLabel>
          <div className={clsx("rounded-2xl p-4 border space-y-3", REC_META[employee.aiRec.recommendation].bg, REC_META[employee.aiRec.recommendation].border)}>
            <div className="flex items-center justify-between">
              <RecBadge rec={employee.aiRec.recommendation} />
              <span className="text-xs text-muted">{Math.round(employee.aiRec.confidence * 100)}% confidence</span>
            </div>
            <ul className="space-y-1.5">
              {employee.aiRec.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted">
                  <span className="text-green shrink-0 mt-0.5">✓</span>
                  {e}
                </li>
              ))}
            </ul>
            <div className="pt-2 border-t border-border/30">
              <p className="text-[10px] text-muted">
                This is an AI-generated recommendation. The final appraisal decision is made by HR after manager review.
              </p>
            </div>
          </div>
        </section>
      )}

      {showFormula && <FormulaSheet onClose={() => setShowFormula(false)} />}
    </>
  );
}

// ── ManagerView ───────────────────────────────────────────────────────────────

function ManagerView({
  appraisals,
  onReview,
}: {
  appraisals: Record<string, AppraisalState>;
  onReview: (empId: string) => void;
}) {
  return (
    <>
      <section className="animate-fade-up px-4">
        <SectionLabel>Team Appraisals · Q2 2026</SectionLabel>
        <div className="space-y-2">
          {employees.map((emp) => {
            const state  = appraisals[emp.id];
            const score  = calcScore(emp, state);
            const status = completionStatus(state);
            return (
              <div key={emp.id} className="bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3">
                <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{emp.name}</p>
                    <StatusPip status={status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted truncate">{emp.department}</p>
                    <span className="text-[10px] text-muted">·</span>
                    <span className="text-xs font-semibold text-ink">{score}</span>
                    {state.selfSubmitted && (
                      <span className="text-[10px] bg-green-soft text-green px-1.5 py-0.5 rounded-full font-semibold">Self done</span>
                    )}
                    {state.managerSubmitted && (
                      <span className="text-[10px] bg-pulse-soft text-pulse px-1.5 py-0.5 rounded-full font-semibold">Reviewed</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onReview(emp.id)}
                  className={clsx(
                    "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors",
                    state.managerSubmitted
                      ? "bg-card text-muted border-border"
                      : "bg-pulse text-white border-pulse"
                  )}
                >
                  {state.managerSubmitted ? "View" : "Review"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Completion summary */}
      <section className="animate-fade-up px-4">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Completion Summary</p>
          {[
            { label: "Self-assessments submitted", count: employees.filter(e => appraisals[e.id]?.selfSubmitted).length },
            { label: "Manager reviews completed",  count: employees.filter(e => appraisals[e.id]?.managerSubmitted).length },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 mb-2 last:mb-0">
              <p className="text-sm text-ink flex-1">{item.label}</p>
              <span className="text-sm font-bold text-ink">{item.count}/{employees.length}</span>
              <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-pulse rounded-full" style={{ width: `${(item.count / employees.length) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ── HRView ────────────────────────────────────────────────────────────────────

function HRView({
  appraisals,
  onSignOff,
  onExport,
}: {
  appraisals: Record<string, AppraisalState>;
  onSignOff: (empId: string) => void;
  onExport: () => void;
}) {
  const selfDone    = employees.filter((e) => appraisals[e.id]?.selfSubmitted).length;
  const managerDone = employees.filter((e) => appraisals[e.id]?.managerSubmitted).length;
  const hrDone      = employees.filter((e) => appraisals[e.id]?.hrSignedOff).length;
  const total       = employees.length;

  const cycleMilestones = [
    { label: "Self-assessments submitted", pct: Math.round((selfDone / total) * 100),    note: `${selfDone}/${total}` },
    { label: "Manager reviews done",       pct: Math.round((managerDone / total) * 100), note: `${managerDone}/${total}` },
    { label: "Peer feedback collected",    pct: 88,  note: "88%" },
    { label: "AI analysis complete",       pct: 100, note: "100%" },
    { label: "HR sign-offs",               pct: Math.round((hrDone / total) * 100),      note: `${hrDone}/${total}` },
  ];

  return (
    <>
      {/* Cycle overview */}
      <section className="animate-fade-up px-4">
        <div className="bg-ink rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Cycle</p>
              <p className="text-base font-bold text-white mt-0.5" style={{ fontFamily: "var(--font-syne)" }}>
                Q2 2026 Performance Review
              </p>
            </div>
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/70 border border-white/20 px-3 py-1.5 rounded-xl"
            >
              <Download size={12} />
              Export
            </button>
          </div>
          <div className="space-y-2.5">
            {cycleMilestones.map((m) => (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/60">{m.label}</p>
                  <p className="text-xs font-semibold text-white/80">{m.note}</p>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full transition-all duration-700", m.pct === 100 ? "bg-green" : "bg-pulse")}
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Employee list with sign-off */}
      <section className="animate-fade-up px-4">
        <SectionLabel right={`${hrDone}/${total} signed off`}>All Employees</SectionLabel>
        <div className="space-y-2">
          {employees.map((emp) => {
            const state   = appraisals[emp.id];
            const score   = calcScore(emp, state);
            const canSign = state.managerSubmitted && !state.hrSignedOff;
            const signed  = state.hrSignedOff;
            return (
              <div key={emp.id} className="bg-card rounded-2xl border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink">{emp.name}</p>
                      <RecBadge rec={emp.aiRec.recommendation} />
                      {signed && (
                        <span className={clsx(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          state.hrAgreed ? "bg-green-soft text-green" : "bg-amber-soft text-amber"
                        )}>
                          {state.hrAgreed ? "Confirmed" : "Overridden"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted">{emp.department}</p>
                      <span className="text-xs font-bold text-ink">· {score}/100</span>
                      <StatusPip status={completionStatus(state)} />
                    </div>
                  </div>
                  <button
                    onClick={() => canSign && onSignOff(emp.id)}
                    disabled={!canSign && !signed}
                    className={clsx(
                      "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors",
                      signed     ? "bg-green-soft text-green border-green/20 cursor-default" :
                      canSign    ? "bg-pulse text-white border-pulse" :
                                   "bg-card text-muted border-border opacity-40 cursor-not-allowed"
                    )}
                  >
                    {signed ? "Signed Off" : canSign ? "Sign Off" : "Pending"}
                  </button>
                </div>
                {signed && state.hrAgreed === false && state.hrOverrideReason && (
                  <p className="mt-2 text-xs text-amber italic bg-amber-soft rounded-lg px-3 py-2">
                    Override: &ldquo;{state.hrOverrideReason}&rdquo;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ── ExecutiveView ─────────────────────────────────────────────────────────────

function ExecutiveView({ appraisals }: { appraisals: Record<string, AppraisalState> }) {
  const scores       = employees.map((e) => calcScore(e, appraisals[e.id]));
  const avgScore     = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const promotions   = employees.filter((e) => e.aiRec.recommendation === "promote");
  const pipList      = employees.filter((e) => e.aiRec.recommendation === "pip" || e.aiRec.recommendation === "exit_risk");

  const distribution = SCORE_BANDS.map((band) => ({
    ...band,
    count: employees.filter((e) => e.performanceScore >= band.min && e.performanceScore <= band.max).length,
  }));
  const maxBandCount = Math.max(...distribution.map((d) => d.count), 1);

  const deptData = [...departments].sort((a, b) => b.avgScore - a.avgScore);
  const maxDeptScore = Math.max(...deptData.map((d) => d.avgScore));

  return (
    <>
      {/* Summary stats */}
      <section className="animate-fade-up px-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Org Avg Score", value: avgScore, accent: true  },
            { label: "For Promotion", value: promotions.length        },
            { label: "PIP Pipeline",  value: pipList.length           },
          ].map((s) => (
            <div key={s.label} className={clsx("rounded-2xl p-4 text-center border", s.accent ? "bg-ink border-transparent" : "bg-card border-border")}>
              <p className={clsx("text-3xl font-bold leading-none", s.accent ? "text-white" : "text-ink")} style={{ fontFamily: "var(--font-syne)" }}>
                {s.value}
              </p>
              <p className={clsx("text-[10px] font-semibold uppercase tracking-wide mt-1.5", s.accent ? "text-white/50" : "text-muted")}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Score distribution */}
      <section className="animate-fade-up px-4">
        <SectionLabel>Score Distribution</SectionLabel>
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          {distribution.map((band) => (
            <div key={band.label} className="flex items-center gap-3">
              <span className="text-xs text-muted w-14 text-right shrink-0 font-mono">{band.label}</span>
              <div className="flex-1 h-7 bg-border rounded-lg overflow-hidden">
                <div
                  className={clsx("h-full rounded-lg flex items-center justify-end px-2 transition-all duration-700", band.color)}
                  style={{ width: band.count ? `${(band.count / maxBandCount) * 100}%` : "0%" }}
                >
                  {band.count > 0 && (
                    <span className="text-[10px] font-bold text-white">{band.count}</span>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold text-ink w-4 text-right shrink-0">{band.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Department averages */}
      <section className="animate-fade-up px-4">
        <SectionLabel>Department Averages</SectionLabel>
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2.5">
          {deptData.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3">
              <span className="text-xs text-muted w-28 text-right shrink-0 truncate">{dept.name}</span>
              <div className="flex-1 h-5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-pulse rounded-full transition-all duration-700"
                  style={{ width: `${(dept.avgScore / maxDeptScore) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink w-7 text-right shrink-0">{dept.avgScore}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Promotion + PIP pipelines */}
      <section className="animate-fade-up px-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-green-soft rounded-2xl p-4 border border-green/20">
            <p className="text-xs font-semibold text-green uppercase tracking-widest mb-3">
              Promotion Pipeline · {promotions.length}
            </p>
            <div className="space-y-2">
              {promotions.map((emp) => (
                <div key={emp.id} className="flex items-center gap-2">
                  <Avatar initials={emp.initials} color={emp.avatarColor} size="xs" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{emp.name}</p>
                    <p className="text-[10px] text-muted truncate">{emp.department}</p>
                  </div>
                  <span className="text-[10px] font-bold text-green">{emp.performanceScore}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-soft rounded-2xl p-4 border border-amber/20">
            <p className="text-xs font-semibold text-amber uppercase tracking-widest mb-3">
              PIP Pipeline · {pipList.length}
            </p>
            <div className="space-y-2">
              {pipList.map((emp) => (
                <div key={emp.id} className="flex items-center gap-2">
                  <Avatar initials={emp.initials} color={emp.avatarColor} size="xs" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{emp.name}</p>
                    <p className="text-[10px] text-muted truncate">{emp.department}</p>
                  </div>
                  <span className="text-[10px] font-bold text-amber capitalize">
                    {emp.aiRec.recommendation.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ── AppraisalPage ─────────────────────────────────────────────────────────────

export default function AppraisalPage() {
  const { role } = useRole();
  const [appraisals, setAppraisals] = useState<Record<string, AppraisalState>>(INIT_APPRAISALS);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [signOffId,   setSignOffId  ] = useState<string | null>(null);
  const [exportDone,  setExportDone ] = useState(false);

  function submitSelf(ratings: [number,number,number], texts: [string,string]) {
    setAppraisals((prev) => ({
      ...prev,
      [employees[0].id]: { ...prev[employees[0].id], selfSubmitted: true, selfRatings: ratings, selfTexts: texts },
    }));
  }

  function submitManager(empId: string, ratings: [number,number,number,number,number], comment: string) {
    setAppraisals((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], managerSubmitted: true, managerRatings: ratings, managerComment: comment },
    }));
    setReviewingId(null);
  }

  function submitHR(empId: string, agreed: boolean, reason: string) {
    setAppraisals((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], hrSignedOff: true, hrAgreed: agreed, hrOverrideReason: reason },
    }));
    setSignOffId(null);
  }

  function handleExport() {
    setExportDone(true);
    setTimeout(() => setExportDone(false), 3000);
  }

  const reviewingEmp   = reviewingId ? employees.find((e) => e.id === reviewingId)  : null;
  const reviewingState = reviewingId ? appraisals[reviewingId]                       : null;
  const signOffEmp     = signOffId   ? employees.find((e) => e.id === signOffId)     : null;
  const signOffState   = signOffId   ? appraisals[signOffId]                         : null;

  return (
    <div className="dashboard-page space-y-5">

      {/* Page header */}
      <section className="animate-fade-up px-4">
        <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
          Appraisal
        </h1>
        <p className="text-sm text-muted mt-0.5">Q2 2026 · {role} view</p>
      </section>

      {role === "employee" && (
        <EmployeeView
          employee={employees[0]}
          state={appraisals[employees[0].id]}
          onSubmitSelf={submitSelf}
        />
      )}

      {role === "manager" && (
        <ManagerView
          appraisals={appraisals}
          onReview={setReviewingId}
        />
      )}

      {role === "hr" && (
        <HRView
          appraisals={appraisals}
          onSignOff={setSignOffId}
          onExport={handleExport}
        />
      )}

      {role === "executive" && (
        <ExecutiveView appraisals={appraisals} />
      )}

      {/* Manager review sheet */}
      {reviewingEmp && reviewingState && (
        <ManagerReviewSheet
          key={reviewingEmp.id}
          employee={reviewingEmp}
          state={reviewingState}
          onSubmit={(r, c) => submitManager(reviewingEmp.id, r, c)}
          onClose={() => setReviewingId(null)}
        />
      )}

      {/* HR sign-off sheet */}
      {signOffEmp && signOffState && (
        <HRSignOffSheet
          key={signOffEmp.id}
          employee={signOffEmp}
          state={signOffState}
          onSubmit={(a, r) => submitHR(signOffEmp.id, a, r)}
          onClose={() => setSignOffId(null)}
        />
      )}

      {/* Export toast */}
      {exportDone && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-ink text-white text-sm font-semibold px-5 py-3 rounded-full shadow-xl whitespace-nowrap">
          Export ready — check your downloads
        </div>
      )}
    </div>
  );
}
