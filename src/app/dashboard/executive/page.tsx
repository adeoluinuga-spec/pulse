"use client";

import { useState } from "react";
import clsx from "clsx";
import { Loader2, Sparkles } from "lucide-react";
import { employees, departments, org } from "@/data/mockData";

// ── Derived data ───────────────────────────────────────────────────────────────

const orgGoals = employees
  .flatMap((e) =>
    e.goals.filter((g) => g.type === "org").map((g) => ({ ...g, ownerDept: e.department }))
  )
  .filter((g, i, arr) => arr.findIndex((x) => x.name === g.name) === i)
  .sort((a, b) => {
    const rank = (s: string) => (s === "behind" ? 0 : s === "at_risk" ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });

const orgGoalProgress = Math.round(
  orgGoals.reduce((s, g) => s + g.percentComplete, 0) / Math.max(orgGoals.length, 1)
);

const orgAvgScore = Math.round(
  employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
);

const highPerformers = employees.filter((e) => e.performanceScore >= 85);
const goodStanding   = employees.filter((e) => e.performanceScore >= 60 && e.performanceScore < 85);
const needsSupport   = employees.filter((e) => e.performanceScore >= 40 && e.performanceScore < 60);
const criticalRisk   = employees.filter((e) => e.performanceScore < 40);

const promotionReady = employees.filter((e) => e.aiRec.recommendation === "promote");
const pipCandidates  = employees.filter(
  (e) => e.aiRec.recommendation === "pip" || e.aiRec.recommendation === "exit_risk"
);

const sortedDepts = [...departments].sort((a, b) => b.avgScore - a.avgScore);
const atRiskOKRs  = orgGoals.filter((g) => g.status === "at_risk" || g.status === "behind");

const trendMonths = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const trendValues = [64, 67, 69, 68, 71, 76];

// ── Helpers ────────────────────────────────────────────────────────────────────

function barColor(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

function deptColor(score: number) {
  if (score >= 75) return { bar: "bg-green", text: "text-green" };
  if (score >= 65) return { bar: "bg-amber", text: "text-amber" };
  return { bar: "bg-red", text: "text-red" };
}

// ── SVG Trend Sparkline ────────────────────────────────────────────────────────

function TrendSparkline() {
  const W = 320, H = 120, pad = 20;
  const chartH = H - pad * 2;
  const chartW = W - pad * 2;
  const minV = Math.min(...trendValues) - 4;
  const maxV = Math.max(...trendValues) + 4;
  const range = maxV - minV;

  const pts = trendValues.map((v, i) => ({
    x: pad + (i / (trendValues.length - 1)) * chartW,
    y: pad + chartH - ((v - minV) / range) * chartH,
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Performance trend">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8440a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#e8440a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((f, i) => {
        const y = pad + chartH * (1 - f);
        return (
          <line key={i} x1={pad} y1={y} x2={W - pad} y2={y}
            stroke="#e8e3dc" strokeWidth="0.5" strokeDasharray="3 3" />
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#trendGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#e8440a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={isLast ? 4 : 2.5}
              fill={isLast ? "#e8440a" : "#ffffff"} stroke="#e8440a"
              strokeWidth={isLast ? 0 : 1.5} />
            {isLast && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10"
                fontWeight="700" fill="#e8440a" fontFamily="'Syne', sans-serif">
                {trendValues[i]}
              </text>
            )}
          </g>
        );
      })}

      {/* Month labels */}
      {trendMonths.map((m, i) => (
        <text key={m} x={pts[i].x} y={H - 2} textAnchor="middle" fontSize="9"
          fill={i === trendMonths.length - 1 ? "#0d0d0d" : "#7a7570"}
          fontFamily="'DM Sans', sans-serif" fontWeight={i === trendMonths.length - 1 ? "600" : "400"}>
          {m}
        </text>
      ))}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const [briefingText, setBriefingText]       = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError]     = useState(false);
  const [briefingFetched, setBriefingFetched] = useState(false);

  async function fetchBriefing() {
    if (briefingFetched || briefingLoading) return;
    setBriefingLoading(true);
    setBriefingError(false);
    try {
      const res = await fetch("/api/ai/executive-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: org.name,
          orgGoalProgress,
          atRiskOKRsCount: atRiskOKRs.length,
          highPerformersPct: Math.round((highPerformers.length / employees.length) * 100),
          goodStandingPct: Math.round((goodStanding.length / employees.length) * 100),
          needsSupportPct: Math.round((needsSupport.length / employees.length) * 100),
          criticalRiskCount: criticalRisk.length,
          departments: sortedDepts.map((d) => ({ name: d.name, score: d.avgScore })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBriefingText(data.briefing);
      } else {
        setBriefingError(true);
      }
    } catch {
      setBriefingError(true);
    } finally {
      setBriefingLoading(false);
      setBriefingFetched(true);
    }
  }

  return (
    <div className="space-y-7 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}>

      {/* ── Strategic Header ──────────────────────────────────────── */}
      <div className="px-5 pt-5 animate-fade-up">
        <p className="type-label">Strategic View · {org.name}</p>
        <h1 className="text-[26px] font-bold text-ink mt-1 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
          Q2 2026 Intelligence
        </h1>
        <p className="text-[11px] text-muted/70 mt-0.5">
          {employees.length} employees · {departments.length} departments · Appraisal closes Jun 30
        </p>
      </div>

      {/* ── Org Score Strip ───────────────────────────────────────── */}
      <div className="animate-fade-up delay-75">
        <div className="mx-5 bg-ink rounded-2xl px-5 py-5 relative overflow-hidden">
          {/* Decorative radial glow */}
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(232,68,10,0.12) 0%, transparent 70%)" }} />

          <div className="flex items-end gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Org Avg Score</p>
              <div className="flex items-end gap-1.5">
                <span className="text-[56px] font-bold leading-none text-white" style={{ fontFamily: "var(--font-syne)" }}>
                  {orgAvgScore}
                </span>
                <span className="text-white/40 pb-1.5 text-xl">/100</span>
                <span className="text-green text-sm font-semibold pb-2 ml-1">↑ +12 pts</span>
              </div>
            </div>
          </div>

          <div className="h-[3px] bg-white/10 rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${orgAvgScore}%`,
                background: "linear-gradient(90deg, #e8440a, #ff8c57)",
                transformOrigin: "left center",
                animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
                animationDelay: "0.35s",
              }}
            />
          </div>

          {/* Inline stats */}
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
            {[
              { label: "High Perf.", value: highPerformers.length, color: "text-green" },
              { label: "Good Standing", value: goodStanding.length, color: "text-white" },
              { label: "Needs Support", value: needsSupport.length, color: "text-amber" },
              { label: "Critical", value: criticalRisk.length, color: criticalRisk.length > 0 ? "text-red" : "text-white/40" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={clsx("text-xl font-bold leading-none", s.color)} style={{ fontFamily: "var(--font-syne)" }}>
                  {s.value}
                </p>
                <p className="text-[9px] text-white/40 font-medium mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Executive Briefing ─────────────────────────────────── */}
      <div className="px-5 animate-fade-up delay-150">
        <div className="flex items-center justify-between mb-3">
          <p className="type-label">Executive Briefing</p>
          {!briefingFetched && !briefingLoading && (
            <button
              onClick={fetchBriefing}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-pulse hover:text-pulse/80 transition-colors"
            >
              <Sparkles size={11} />
              Generate with AI
            </button>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          {briefingLoading ? (
            <div className="flex items-center gap-2.5 py-2">
              <Loader2 size={14} className="text-pulse animate-spin flex-shrink-0" />
              <p className="text-sm text-muted">Pulse is analysing your organisation…</p>
            </div>
          ) : briefingError ? (
            <p className="text-sm text-amber">Unable to generate briefing. Please try again.</p>
          ) : briefingText ? (
            <p className="text-sm text-ink leading-relaxed">{briefingText}</p>
          ) : (
            <p className="text-sm text-ink/80 leading-relaxed">
              {org.name} is tracking at <strong>{orgAvgScore}/100</strong> aggregate performance this cycle —
              up <span className="text-green font-semibold">+12 points</span> over the trailing six months.
              OKR completion stands at <strong>{orgGoalProgress}%</strong>, with{" "}
              <span className="text-pulse font-semibold">{atRiskOKRs.length} objective{atRiskOKRs.length !== 1 ? "s" : ""}</span> flagged at risk
              before the Q2 close. {promotionReady.length} employees are ready for promotion
              {pipCandidates.length > 0 && ` and ${pipCandidates.length} require intervention`}.
            </p>
          )}
        </div>
      </div>

      {/* ── Talent Signals ────────────────────────────────────────── */}
      <div className="px-5 animate-fade-up delay-225">
        <p className="type-label mb-3">Talent Signals</p>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-green-soft rounded-2xl p-4 border border-green/15">
            <p className="text-xs font-semibold text-green uppercase tracking-widest mb-3">
              Promotion Ready · {promotionReady.length}
            </p>
            <div className="space-y-2">
              {promotionReady.slice(0, 3).map((emp) => (
                <div key={emp.id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: emp.avatarColor }}>
                    {emp.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-ink truncate">{emp.name}</p>
                    <p className="text-[10px] text-muted truncate">{emp.department}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-soft rounded-2xl p-4 border border-amber/15">
            <p className="text-xs font-semibold text-amber uppercase tracking-widest mb-3">
              PIP Pipeline · {pipCandidates.length}
            </p>
            <div className="space-y-2">
              {pipCandidates.slice(0, 3).map((emp) => (
                <div key={emp.id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: emp.avatarColor }}>
                    {emp.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-ink truncate">{emp.name}</p>
                    <p className="text-[10px] text-muted truncate capitalize">{emp.aiRec.recommendation.replace("_", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── OKR Execution ─────────────────────────────────────────── */}
      <div className="px-5 animate-fade-up delay-300">
        <div className="flex items-center justify-between mb-3">
          <p className="type-label">Company OKRs</p>
          <span className="text-xs text-muted">{orgGoalProgress}% avg progress</span>
        </div>
        <div className="space-y-4">
          {orgGoals.slice(0, 5).map((goal) => (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {(goal.status === "at_risk" || goal.status === "behind") && (
                    <span className="text-pulse text-xs flex-shrink-0">⚠</span>
                  )}
                  <span className="text-sm text-ink truncate">{goal.name}</span>
                </div>
                <span className="text-sm font-bold text-ink ml-3 flex-shrink-0">
                  {goal.percentComplete}%
                </span>
              </div>
              <div className="h-[3px] bg-border rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full", barColor(goal.percentComplete))}
                  style={{ width: `${goal.percentComplete}%` }}
                />
              </div>
              <p className="text-[10px] text-muted mt-1">{goal.ownerDept}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Department Performance ────────────────────────────────── */}
      <div className="px-5 animate-fade-up delay-375">
        <p className="type-label mb-3">Department Rankings</p>
        <div className="space-y-3">
          {sortedDepts.map((dept, i) => {
            const { bar, text } = deptColor(dept.avgScore);
            const isTop  = i === 0;
            const isLast = i === sortedDepts.length - 1;
            const maxScore = sortedDepts[0].avgScore;
            return (
              <div key={dept.id} className="flex items-center gap-3">
                <span className="text-[10px] text-muted w-3.5 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-ink">{dept.name}</span>
                      {isTop  && <span className="text-[9px] bg-green-soft text-green px-1.5 py-0.5 rounded font-semibold">Top</span>}
                      {isLast && <span className="text-[9px] bg-pulse-soft text-pulse px-1.5 py-0.5 rounded font-semibold">Watch</span>}
                    </div>
                    <span className={clsx("text-sm font-bold", text)}>{dept.avgScore}</span>
                  </div>
                  <div className="h-[2px] bg-border rounded-full overflow-hidden">
                    <div
                      className={clsx("h-full rounded-full", bar)}
                      style={{ width: `${(dept.avgScore / maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Performance Trend ─────────────────────────────────────── */}
      <div className="px-5 animate-fade-up delay-450">
        <div className="flex items-center justify-between mb-3">
          <p className="type-label">6-Month Trend</p>
          <span className="text-[11px] text-green font-semibold">
            ↑ +{trendValues[trendValues.length - 1] - trendValues[0]} pts
          </span>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <TrendSparkline />
          <p className="text-[10px] text-muted text-center mt-1">Org avg score · Dec 2025 – May 2026</p>
        </div>
      </div>

    </div>
  );
}
