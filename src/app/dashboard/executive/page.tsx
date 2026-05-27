"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  ChevronDown, ChevronUp, Sparkles,
  Code2, TrendingUp, Users, BarChart2, Target, Megaphone, DollarSign, Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { employees, departments, org } from "@/data/mockData";
import { SectionLabel } from "@/components/ui";

// ── Derived data ──────────────────────────────────────────────────────────────

const orgGoals = employees
  .flatMap((e) =>
    e.goals
      .filter((g) => g.type === "org")
      .map((g) => ({ ...g, ownerDept: e.department }))
  )
  .sort((a, b) => {
    // At-risk / behind first, then by due date ascending
    const rankStatus = (s: string) =>
      s === "behind" ? 0 : s === "at_risk" ? 1 : 2;
    const rs = rankStatus(a.status) - rankStatus(b.status);
    if (rs !== 0) return rs;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

const orgGoalProgress = Math.round(
  orgGoals.reduce((s, g) => s + g.percentComplete, 0) / orgGoals.length
);

const highPerformers = employees.filter((e) => e.performanceScore >= 85);
const goodStanding   = employees.filter((e) => e.performanceScore >= 60 && e.performanceScore < 85);
const needsSupport   = employees.filter((e) => e.performanceScore >= 40 && e.performanceScore < 60);
const criticalRisk   = employees.filter((e) => e.performanceScore < 40);

function bucketPct(n: number) {
  return Math.round((n / employees.length) * 100);
}

const sortedDepts = [...departments].sort((a, b) => b.avgScore - a.avgScore);

// ── Static editorial data ─────────────────────────────────────────────────────

const deptIconMap: Record<string, LucideIcon> = {
  Engineering:           Code2,
  Sales:                 TrendingUp,
  "Human Resources":     Users,
  Analytics:             BarChart2,
  Product:               Target,
  Marketing:             Megaphone,
  Finance:               DollarSign,
  "Customer Experience": Star,
};

const okrAlignedDepts: Record<string, string[]> = {
  "Q2 Product Roadmap Launch":         ["Product", "Engineering", "Sales"],
  "Annual Performance Review Cycle":   ["All Depts"],
  "Implement 360 Feedback Platform":   ["HR", "All Depts"],
  "Q2 Revenue Target $2.4M":           ["Sales", "Marketing"],
  "Churn Rate Below 3%":               ["CX", "Product"],
  "Brand Refresh Campaign Launch":     ["Marketing", "Product"],
  "Q2 Financial Reporting Accuracy":   ["Finance", "Analytics"],
};

const trendMonths = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const trendValues = [64, 67, 69, 68, 71, 76];

// ── Helpers ───────────────────────────────────────────────────────────────────

function barColorClass(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

function barTextClass(pct: number) {
  if (pct >= 75) return "text-green";
  if (pct >= 50) return "text-amber";
  return "text-pulse";
}

function deptScoreClass(score: number) {
  if (score >= 75) return "text-green";
  if (score >= 65) return "text-amber";
  return "text-red";
}

function deptBarClass(score: number) {
  if (score >= 75) return "bg-green";
  if (score >= 65) return "bg-amber";
  return "bg-red";
}

// ── Trend Chart — pure SVG, no library ───────────────────────────────────────

function TrendChart() {
  const svgW     = 320;
  const svgH     = 132;
  const chartTop = 22;   // y where chart area starts (leaves room for value labels)
  const chartH   = 76;   // height of the chart area
  const chartBot = chartTop + chartH;
  const groupW   = svgW / trendValues.length;
  const barW     = 26;

  const bx = (i: number) => groupW * i + (groupW - barW) / 2;
  const bh = (v: number) => (v / 100) * chartH;
  const by = (v: number) => chartTop + chartH - bh(v);

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      aria-label="Organisation performance trend over 6 months"
    >
      {/* Subtle grid lines */}
      {[50, 75].map((v) => {
        const y = chartTop + chartH - (v / 100) * chartH;
        return (
          <g key={v}>
            <line
              x1={0} y1={y} x2={svgW} y2={y}
              stroke="#e2ddd6" strokeWidth="0.75" strokeDasharray="4 3"
            />
            <text x={2} y={y - 3} fontSize="7" fill="#7a7570"
              fontFamily="'DM Sans', sans-serif">
              {v}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {trendValues.map((v, i) => {
        const isLast = i === trendValues.length - 1;
        const x = bx(i);
        const h = bh(v);
        const y = by(v);
        // Progressive opacity: earlier months are more faded
        const opacity = isLast ? 1 : 0.35 + i * 0.11;

        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={x} y={y}
              width={barW} height={h}
              rx={4} ry={4}
              fill="#e8440a"
              opacity={opacity}
            />

            {/* Value label above bar */}
            <text
              x={x + barW / 2} y={y - 5}
              textAnchor="middle" fontSize="9.5"
              fontWeight={isLast ? "700" : "600"}
              fill={isLast ? "#e8440a" : "#0d0d0d"}
              fontFamily="'Syne', sans-serif"
            >
              {v}
            </text>

            {/* Month label below chart */}
            <text
              x={x + barW / 2} y={chartBot + 14}
              textAnchor="middle" fontSize="9"
              fill={isLast ? "#0d0d0d" : "#7a7570"}
              fontWeight={isLast ? "600" : "400"}
              fontFamily="'DM Sans', sans-serif"
            >
              {trendMonths[i]}
            </text>
          </g>
        );
      })}

      {/* Delta annotation on last bar */}
      {(() => {
        const last = trendValues[trendValues.length - 1];
        const first = trendValues[0];
        const delta = last - first;
        const x = bx(trendValues.length - 1);
        const y = by(last) - 18;
        return (
          <text
            x={x + barW / 2} y={y}
            textAnchor="middle" fontSize="8"
            fill="#1a7a4a" fontWeight="700"
            fontFamily="'DM Sans', sans-serif"
          >
            ↑ +{delta}
          </text>
        );
      })()}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const [briefingOpen, setBriefingOpen] = useState(false);

  const atRiskOKRs = orgGoals.filter(
    (g) => g.status === "at_risk" || g.status === "behind"
  );

  return (
    <div className="dashboard-page space-y-5">

      {/* ── 1. HERO CARD ─────────────────────────────────────────── */}
      <section className="animate-fade-up px-4" style={{ animationDelay: "0ms" }}>
        <div className="bg-ink rounded-[20px] p-5">
          <p className="text-white/40 text-sm">Strategic View</p>
          <h1
            className="text-white text-xl font-bold mt-0.5"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {org.name}
          </h1>
          <p className="text-white/35 text-xs mt-0.5">
            Q2 2026 · Performance Cycle
          </p>

          <div className="mt-5 flex items-end gap-1">
            <span
              className="text-white font-bold leading-none"
              style={{ fontSize: "52px", fontFamily: "var(--font-syne)" }}
            >
              {orgGoalProgress}
            </span>
            <span
              className="text-pulse font-bold pb-1.5 text-2xl"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              %
            </span>
            <span className="text-green text-sm font-semibold pb-2 ml-2">
              Org goal progress
            </span>
          </div>

          <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${orgGoalProgress}%`,
                background: "linear-gradient(90deg, #e8440a, #ff9046)",
                transformOrigin: "left center",
                animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
                animationDelay: "0.35s",
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-white/25">0</span>
            <span className="text-[10px] text-white/25">100</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="px-2.5 py-1 bg-white/8 text-white/50 text-[11px] rounded-full">
              {org.staffCount} Staff
            </span>
            <span className="px-2.5 py-1 bg-white/8 text-white/50 text-[11px] rounded-full">
              {org.departmentCount} Departments
            </span>
            <span className="px-2.5 py-1 bg-pulse/20 text-pulse text-[11px] font-semibold rounded-full">
              Appraisal: Jun 30
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. STAT GRID ─────────────────────────────────────────── */}
      <section
        className="animate-fade-up grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3"
        style={{ animationDelay: "80ms" }}
      >
        {/* High performers */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            High Performers
          </p>
          <p
            className="text-[2rem] font-bold text-green leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {bucketPct(highPerformers.length)}
            <span className="text-base text-muted font-medium">%</span>
          </p>
          <p className="text-[11px] text-muted mt-1.5">
            {highPerformers.length} of {employees.length} · Score ≥85
          </p>
        </div>

        {/* Good standing */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Good Standing
          </p>
          <p
            className="text-[2rem] font-bold text-ink leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {bucketPct(goodStanding.length)}
            <span className="text-base text-muted font-medium">%</span>
          </p>
          <p className="text-[11px] text-muted mt-1.5">
            {goodStanding.length} of {employees.length} · Score 60–84
          </p>
        </div>

        {/* Needs support — pulse accent */}
        <div className="bg-pulse rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
            Needs Support
          </p>
          <p
            className="text-[2rem] font-bold text-white leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {bucketPct(needsSupport.length)}
            <span className="text-base font-medium text-white/60">%</span>
          </p>
          <p className="text-[11px] text-white/60 mt-1.5">
            {needsSupport.length} of {employees.length} · Score 40–59
          </p>
        </div>

        {/* Critical risk */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Critical Risk
          </p>
          <p
            className={clsx(
              "text-[2rem] font-bold leading-none",
              criticalRisk.length > 0 ? "text-red" : "text-ink"
            )}
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {bucketPct(criticalRisk.length)}
            <span className="text-base text-muted font-medium">%</span>
          </p>
          <p
            className={clsx(
              "text-[11px] mt-1.5",
              criticalRisk.length > 0 ? "text-red" : "text-muted"
            )}
          >
            {criticalRisk.length > 0
              ? `${criticalRisk.length} employee${criticalRisk.length !== 1 ? "s" : ""} flagged`
              : "None flagged · Score <40"}
          </p>
        </div>
      </section>

      {/* ── 3. COMPANY OKRs ──────────────────────────────────────── */}
      <section className="animate-fade-up px-4" style={{ animationDelay: "160ms" }}>
        <SectionLabel right={`${orgGoals.length} objectives`}>Company OKRs</SectionLabel>

        <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {orgGoals.map((goal) => {
            const pct  = goal.percentComplete;
            const isAtRisk = goal.status === "at_risk" || goal.status === "behind";
            const dueDate  = new Date(goal.dueDate).toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            });
            const aligned = okrAlignedDepts[goal.name] ?? [goal.ownerDept];

            return (
              <div key={goal.id} className="p-4">
                {/* Name + badge + pct */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-ink leading-snug flex-1">
                    {goal.name}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isAtRisk && (
                      <span className="px-2 py-0.5 bg-pulse/10 text-pulse text-[10px] font-bold rounded-full whitespace-nowrap">
                        ⚠ At Risk
                      </span>
                    )}
                    <span className={clsx("text-sm font-bold", barTextClass(pct))}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2.5">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-700",
                      barColorClass(pct)
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Dept tags + due date */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    {aligned.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 bg-paper text-muted text-[9px] font-semibold rounded border border-border"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted flex-shrink-0">
                    Due {dueDate}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. DEPARTMENT BENCHMARKS ─────────────────────────────── */}
      <section className="animate-fade-up px-4" style={{ animationDelay: "240ms" }}>
        <SectionLabel right="highest → lowest">Department Benchmarks</SectionLabel>

        <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {sortedDepts.map((dept, i) => {
            const Icon   = deptIconMap[dept.name] ?? BarChart2;
            const isTop  = i === 0;
            const isLast = i === sortedDepts.length - 1;

            return (
              <div key={dept.id} className="flex items-center gap-3 px-4 py-3.5">
                {/* Rank */}
                <span className="text-[10px] font-bold text-muted w-3 text-right flex-shrink-0">
                  {i + 1}
                </span>

                {/* Icon */}
                <div className="w-7 h-7 rounded-lg bg-paper border border-border flex items-center justify-center flex-shrink-0">
                  <Icon size={13} className="text-muted" />
                </div>

                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <p className="text-sm font-semibold text-ink leading-none truncate">
                      {dept.name}
                    </p>
                    {isTop && (
                      <span className="text-[9px] bg-green-soft text-green px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                        Top
                      </span>
                    )}
                    {isLast && (
                      <span className="text-[9px] bg-pulse-soft text-pulse px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                        Watch
                      </span>
                    )}
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        deptBarClass(dept.avgScore)
                      )}
                      style={{ width: `${dept.avgScore}%` }}
                    />
                  </div>
                </div>

                {/* Score */}
                <span
                  className={clsx(
                    "text-base font-bold flex-shrink-0 w-7 text-right tabular-nums",
                    deptScoreClass(dept.avgScore)
                  )}
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {dept.avgScore}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {[
            { label: "≥75  Strong", cls: "bg-green" },
            { label: "≥65  Adequate", cls: "bg-amber" },
            { label: "<65  Concern", cls: "bg-red" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={clsx("w-2.5 h-2.5 rounded-sm", l.cls)} />
              <span className="text-[10px] text-muted">{l.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. TREND CHART ───────────────────────────────────────── */}
      <section className="animate-fade-up px-4" style={{ animationDelay: "320ms" }}>
        <SectionLabel>Performance Trend — Last 6 Months</SectionLabel>

        <div className="bg-card rounded-2xl border border-border p-4 pt-5">
          <TrendChart />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted">
              Org avg score · Dec 2025 – May 2026
            </p>
            <span className="text-[11px] text-green font-semibold">
              ↑ +{trendValues[trendValues.length - 1] - trendValues[0]} pts over period
            </span>
          </div>
        </div>
      </section>

      {/* ── 6. AI EXECUTIVE BRIEFING ─────────────────────────────── */}
      <section className="animate-fade-up px-4 pb-2" style={{ animationDelay: "400ms" }}>
        <button
          onClick={() => setBriefingOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 bg-ink rounded-2xl px-5 py-4"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles size={14} className="text-pulse flex-shrink-0" />
            <span className="text-sm font-semibold text-white">
              {briefingOpen ? "Hide Executive Briefing" : "✦ Get Executive Briefing"}
            </span>
          </div>
          {briefingOpen ? (
            <ChevronUp size={16} className="text-white/40 flex-shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-white/40 flex-shrink-0" />
          )}
        </button>

        <div
          style={{
            maxHeight: briefingOpen ? "640px" : "0px",
            overflow: "hidden",
            transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <div className="mt-3 bg-ink rounded-[20px] p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-pulse flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-pulse">
                AI Executive Briefing · Q2 2026
              </span>
            </div>

            {/* Summary paragraph */}
            <p className="text-white/70 text-sm leading-relaxed">
              {org.name} is tracking at{" "}
              <span className="text-white font-semibold">76/100</span>{" "}
              aggregate performance this cycle — up{" "}
              <span className="text-green font-semibold">+12 points</span> over
              the trailing six months. Company OKR completion stands at{" "}
              <span className="text-white font-semibold">{orgGoalProgress}%</span>, with{" "}
              <span className="text-pulse font-semibold">
                {atRiskOKRs.length} objective
                {atRiskOKRs.length !== 1 ? "s" : ""}
              </span>{" "}
              flagged as at risk before the Q2 close.
            </p>

            {/* Bullets */}
            <div className="space-y-3">
              {[
                {
                  dot: "bg-green",
                  text: `Talent distribution is healthy: ${bucketPct(highPerformers.length)}% of staff are high performers. Product (89) and Sales (87) are outperforming all departmental benchmarks.`,
                },
                {
                  dot: "bg-amber",
                  text: `${bucketPct(needsSupport.length)}% of staff require active support. Finance and Analytics present the most acute personnel risk this cycle, each with a flagged individual case.`,
                },
                {
                  dot: "bg-pulse",
                  text: `Q2 Financial Reporting Accuracy (55%, at risk) is the highest-priority OKR concern. Continued slippage creates material exposure before the June 30 deadline.`,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className={clsx(
                      "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                      item.dot
                    )}
                  />
                  <p className="text-white/55 text-xs leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                Board-Level Recommendations
              </p>
              {[
                {
                  n: "01",
                  text: "Proceed with promotion nominations for Amara Osei, James Kirkland, and Marcus Chen — all three meet confidence threshold.",
                },
                {
                  n: "02",
                  text: "Initiate formal PIP for Priya Sharma (Analytics) with a 60-day structured review and checkpoint.",
                },
                {
                  n: "03",
                  text: "Escalate Q2 Financial Reporting Accuracy risk to the CFO. Current trajectory (55%, 34 days remaining) warrants executive intervention.",
                },
                {
                  n: "04",
                  text: "Recognise Product and Sales at the next all-hands. Sustained outperformance over two consecutive quarters merits public acknowledgement.",
                },
              ].map((item) => (
                <div key={item.n} className="flex items-start gap-3">
                  <span className="text-[10px] font-bold text-pulse/50 flex-shrink-0 pt-0.5 w-4 tabular-nums">
                    {item.n}
                  </span>
                  <p className="text-white/60 text-xs leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
