"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  FileText,
  CheckCircle,
  Check,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { employees } from "@/data/mockData";
import type { Employee } from "@/data/mockData";
import Avatar from "@/components/ui/Avatar";
import { SectionLabel } from "@/components/ui";

// ─── Derived data ─────────────────────────────────────────────────────────────

const managerName = "Alex Rivera";
const managerRole = "Head of People & Performance";

const teamAvgScore = Math.round(
  employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
);

const riskCount = employees.filter(
  (e) => e.badge === "At Risk" || e.badge === "Needs Improvement"
).length;

const allGoals = employees.flatMap((e) => e.goals);
const teamGoalAvg = Math.round(
  allGoals.reduce((s, g) => s + g.percentComplete, 0) / allGoals.length
);

const reviewedCount = 5;
const unreviewedCount = employees.length - reviewedCount;

// Pending reviews — ordered by urgency (At Risk first, then Needs Improvement, then others)
const pendingReviewEmployees = [employees[7], employees[4], employees[5], employees[6]];

// ─── AI Alerts ────────────────────────────────────────────────────────────────

type AlertKind = "blocker" | "risk" | "strong";

interface AIAlert {
  id: string;
  kind: AlertKind;
  empName: string;
  title: string;
  detail: string;
}

const aiAlerts: AIAlert[] = [
  {
    id: "a1",
    kind: "blocker",
    empName: "Sofia Reyes",
    title: "Repeated Blocker Detected",
    detail:
      "Monthly close deadline missed 3 consecutive times. April errors require correction. Q2 reporting at risk of further slippage.",
  },
  {
    id: "a2",
    kind: "risk",
    empName: "Priya Sharma",
    title: "Goal Trajectory Risk",
    detail:
      "Dashboard Launch (35%) and Report Automation (20%) are off-pace for June targets. At current velocity, both will fall short without intervention.",
  },
  {
    id: "a3",
    kind: "strong",
    empName: "Amara Osei",
    title: "Strong Performer Signal",
    detail:
      "7-week consistency streak with 91% score and 4.6/5 peer rating. AI confidence at 91% for promotion readiness this cycle.",
  },
];

const alertMeta: Record<
  AlertKind,
  { emoji: string; bg: string; border: string; nameColor: string }
> = {
  blocker: {
    emoji: "🔴",
    bg: "bg-pulse/5",
    border: "border-pulse/20",
    nameColor: "text-pulse",
  },
  risk: {
    emoji: "📉",
    bg: "bg-amber/5",
    border: "border-amber/20",
    nameColor: "text-amber",
  },
  strong: {
    emoji: "🌟",
    bg: "bg-green/5",
    border: "border-green/20",
    nameColor: "text-green",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return "text-green";
  if (s >= 60) return "text-amber";
  return "text-pulse";
}

function badgeEmoji(badge: string) {
  if (badge === "Strong Performer") return " 🌟";
  if (badge === "At Risk") return " 🔴";
  if (badge === "Needs Improvement") return " 📉";
  return "";
}

function empGoalAvg(emp: Employee) {
  return Math.round(
    emp.goals.reduce((s, g) => s + g.percentComplete, 0) / emp.goals.length
  );
}

function barColor(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

function barTextColor(pct: number) {
  if (pct >= 75) return "text-green";
  if (pct >= 50) return "text-amber";
  return "text-pulse";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewEmp, setReviewEmp] = useState<Employee | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null);
  const [teamSummaryText, setTeamSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  function openReview(emp: Employee) {
    setReviewEmp(emp);
    setRawExpanded(false);
    setAcknowledgedId(null);
    requestAnimationFrame(() => setSheetOpen(true));
  }

  function closeReview() {
    setSheetOpen(false);
    setTimeout(() => setReviewEmp(null), 350);
  }

  async function openAiSummary() {
    const nextOpen = !aiOpen;
    setAiOpen(nextOpen);
    if (nextOpen && !teamSummaryText && !summaryLoading) {
      setSummaryLoading(true);
      setSummaryError(false);
      try {
        const res = await fetch("/api/ai/team-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamAvgScore,
            riskCount,
            teamGoalAvg,
            employees: employees.map((e) => ({
              name: e.name,
              score: e.performanceScore,
              badge: e.badge,
              goalAvg: empGoalAvg(e),
              weekStreak: e.weekStreak,
            })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setTeamSummaryText(data.summary);
        } else {
          setSummaryError(true);
        }
      } catch {
        setSummaryError(true);
      } finally {
        setSummaryLoading(false);
      }
    }
  }

  const report = reviewEmp?.reports[0];

  const aboveEighty = employees.filter((e) => e.performanceScore >= 80).length;
  const sixtyToEighty = employees.filter(
    (e) => e.performanceScore >= 60 && e.performanceScore < 80
  ).length;
  const belowSixty = employees.filter((e) => e.performanceScore < 60).length;

  return (
    <>
      <div className="dashboard-page space-y-5">

        {/* ── 1. HERO CARD ───────────────────────────────────────────── */}
        <section
          className="animate-fade-up px-4"
          style={{ animationDelay: "0ms" }}
        >
          <div className="bg-ink rounded-[20px] p-5">
            <p className="text-white/40 text-sm">Team Overview</p>
            <h1
              className="text-white text-xl font-bold mt-0.5"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {managerName}
            </h1>
            <p className="text-white/35 text-xs mt-0.5">{managerRole}</p>

            <div className="mt-5 flex items-end gap-1">
              <span
                className="text-white font-bold leading-none"
                style={{ fontSize: "52px", fontFamily: "var(--font-syne)" }}
              >
                {teamAvgScore}
              </span>
              <span
                className="text-pulse font-bold pb-1.5 text-2xl"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                %
              </span>
              <span className="text-green text-sm font-semibold pb-2 ml-2">
                ↑ +3 pts vs last month
              </span>
            </div>

            <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${teamAvgScore}%`,
                  background: "linear-gradient(90deg, #e8440a, #ff9046)",
                  transformOrigin: "left center",
                  animation:
                    "score-bar-fill 1.2s cubic-bezier(0.22,1,0.36,1) both",
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
                {employees.length} Direct Reports
              </span>
              <span className="px-2.5 py-1 bg-pulse/20 text-pulse text-[11px] font-semibold rounded-full">
                {unreviewedCount} Pending Reviews
              </span>
              <span className="px-2.5 py-1 bg-white/8 text-white/50 text-[11px] rounded-full">
                Q2 2026 Cycle
              </span>
            </div>
          </div>
        </section>

        {/* ── 2. STAT GRID ───────────────────────────────────────────── */}
        <section
          className="animate-fade-up grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3"
          style={{ animationDelay: "80ms" }}
        >
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Reviewed This Week
            </p>
            <p
              className="text-[2rem] font-bold text-ink leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {reviewedCount}
              <span className="text-base text-muted font-medium">
                /{employees.length}
              </span>
            </p>
            <p className="text-[11px] text-green mt-1.5">↑ 2 more than last week</p>
          </div>

          <div className="bg-pulse rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
              Risk Flags
            </p>
            <p
              className="text-[2rem] font-bold text-white leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {riskCount}
            </p>
            <p className="text-[11px] text-white/60 mt-1.5">Require attention</p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Goal Completion
            </p>
            <p
              className="text-[2rem] font-bold text-ink leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {teamGoalAvg}
              <span className="text-base text-muted font-medium">%</span>
            </p>
            <p className="text-[11px] text-muted mt-1.5">Avg across all goals</p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Unreviewed
            </p>
            <p
              className={clsx(
                "text-[2rem] font-bold leading-none",
                unreviewedCount > 0 ? "text-pulse" : "text-ink"
              )}
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {unreviewedCount}
            </p>
            <p
              className={clsx(
                "text-[11px] mt-1.5",
                unreviewedCount > 0 ? "text-pulse" : "text-muted"
              )}
            >
              {unreviewedCount > 0 ? "Reports pending" : "All reviewed"}
            </p>
          </div>
        </section>

        {/* ── 3. AI ALERTS ───────────────────────────────────────────── */}
        <section
          className="animate-fade-up px-4"
          style={{ animationDelay: "160ms" }}
        >
          <SectionLabel>AI Alerts</SectionLabel>
          <div className="space-y-2.5">
            {aiAlerts.map((alert) => {
              const meta = alertMeta[alert.kind];
              return (
                <div
                  key={alert.id}
                  className={clsx(
                    "rounded-2xl border p-4 flex items-start gap-3",
                    meta.bg,
                    meta.border
                  )}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">
                    {meta.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span
                        className={clsx("text-xs font-bold", meta.nameColor)}
                      >
                        {alert.empName}
                      </span>
                      <span className="text-xs font-semibold text-ink">
                        {alert.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      {alert.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 4. TEAM PERFORMANCE LIST ───────────────────────────────── */}
        <section
          className="animate-fade-up px-4"
          style={{ animationDelay: "240ms" }}
        >
          <SectionLabel right={`${employees.length} people`}>
            Team Performance
          </SectionLabel>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {employees.map((emp) => {
              const isOpen = expandedId === emp.id;
              const goalAvg = empGoalAvg(emp);
              const lastDate = new Date(emp.reports[0].date).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short" }
              );
              return (
                <div key={emp.id}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : emp.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-paper/60 transition-colors"
                  >
                    <Avatar
                      initials={emp.initials}
                      color={emp.avatarColor}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink leading-tight">
                        {emp.name}
                        <span className="font-normal">
                          {badgeEmoji(emp.badge)}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 truncate">
                        {emp.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={clsx(
                          "text-sm font-bold",
                          scoreColor(emp.performanceScore)
                        )}
                      >
                        {emp.performanceScore}%
                      </span>
                      {isOpen ? (
                        <ChevronUp size={13} className="text-muted" />
                      ) : (
                        <ChevronDown size={13} className="text-muted" />
                      )}
                    </div>
                  </button>

                  {/* Expanded panel */}
                  <div
                    style={{
                      maxHeight: isOpen ? "220px" : "0px",
                      overflow: "hidden",
                      transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    <div className="px-4 pb-4">
                      <div className="bg-paper rounded-xl p-3.5 space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: "Goal Avg", value: `${goalAvg}%` },
                            { label: "Last Report", value: lastDate },
                            { label: "Consistency", value: `${emp.consistencyIndex}` },
                          ].map((s) => (
                            <div key={s.label}>
                              <p className="text-sm font-bold text-ink">
                                {s.value}
                              </p>
                              <p className="text-[10px] text-muted mt-0.5">
                                {s.label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openReview(emp)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-ink text-white text-xs font-semibold hover:bg-ink/90 transition-colors"
                          >
                            <FileText size={11} />
                            View Report
                          </button>
                          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted hover:border-ink hover:text-ink transition-colors">
                            <Calendar size={11} />
                            Schedule 1:1
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 5. PENDING REPORT REVIEWS ──────────────────────────────── */}
        <section
          className="animate-fade-up px-4"
          style={{ animationDelay: "320ms" }}
        >
          <SectionLabel right={`${pendingReviewEmployees.length} pending`}>
            Pending Reviews
          </SectionLabel>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {pendingReviewEmployees.map((emp) => {
              const r = emp.reports[0];
              const date = new Date(r.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              });
              return (
                <div key={emp.id} className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar
                    initials={emp.initials}
                    color={emp.avatarColor}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{emp.name}</p>
                    <p className="text-[11px] text-muted mt-0.5 capitalize">
                      {r.type} report · {date}
                    </p>
                  </div>
                  <button
                    onClick={() => openReview(emp)}
                    className="flex-shrink-0 px-3.5 py-1.5 rounded-lg bg-pulse text-white text-xs font-semibold hover:bg-pulse/90 transition-colors"
                  >
                    Review
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 6. AI TEAM SUMMARY (on-demand) ─────────────────────────── */}
        <section
          className="animate-fade-up px-4 pb-2"
          style={{ animationDelay: "400ms" }}
        >
          <button
            onClick={openAiSummary}
            className="w-full flex items-center justify-between gap-3 bg-ink rounded-2xl px-5 py-4"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles size={14} className="text-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-white">
                {aiOpen ? "Hide AI Team Summary" : "✦ Get AI Team Summary"}
              </span>
            </div>
            {aiOpen ? (
              <ChevronUp size={16} className="text-white/40 flex-shrink-0" />
            ) : (
              <ChevronDown size={16} className="text-white/40 flex-shrink-0" />
            )}
          </button>

          <div
            style={{
              maxHeight: aiOpen ? "520px" : "0px",
              overflow: "hidden",
              transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <div className="mt-3 bg-ink rounded-[20px] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-pulse flex-shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-pulse">
                  AI Team Summary · Q2 2026
                </span>
              </div>

              {summaryLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="text-pulse animate-spin flex-shrink-0" />
                  <p className="text-white/50 text-sm">Generating team summary...</p>
                </div>
              ) : summaryError ? (
                <div className="bg-amber/10 rounded-xl p-3 flex items-start gap-2">
                  <span className="text-amber flex-shrink-0 text-sm">⚠</span>
                  <p className="text-xs text-amber leading-relaxed">
                    Unable to generate summary. Check your API key or try again.
                  </p>
                </div>
              ) : teamSummaryText ? (
                <p className="text-white/70 text-sm leading-relaxed">{teamSummaryText}</p>
              ) : (
                <p className="text-white/70 text-sm leading-relaxed">
                  Your team averaged{" "}
                  <span className="text-white font-semibold">{teamAvgScore}%</span>{" "}
                  performance this cycle — up 3 points vs last month.{" "}
                  <span className="text-pulse font-semibold">
                    {riskCount} member{riskCount !== 1 ? "s" : ""}
                  </span>{" "}
                  require immediate attention.
                </p>
              )}

              <div className="space-y-2.5">
                {[
                  {
                    dot: "bg-green",
                    text: `${aboveEighty} member${aboveEighty !== 1 ? "s" : ""} performing at 80%+ — strong upward trajectory.`,
                  },
                  {
                    dot: "bg-amber",
                    text: `${sixtyToEighty} member${sixtyToEighty !== 1 ? "s" : ""} in the 60–79 range — monitor and support.`,
                  },
                  {
                    dot: "bg-pulse",
                    text: `${belowSixty} member${belowSixty !== 1 ? "s" : ""} below 60 — escalation recommended.`,
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

              <div className="border-t border-white/10 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                  Top Recommendation
                </p>
                <p className="text-white/65 text-xs leading-relaxed">
                  Prioritise 1:1 interventions for Sofia Reyes and Priya Sharma
                  this week. Nominate Amara Osei for the Q2 promotion pipeline.
                  James Kirkland and Marcus Chen merit recognition in the next
                  all-hands.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── REVIEW BOTTOM SHEET ────────────────────────────────────── */}
      {reviewEmp && report && (
        <>
          {/* Overlay */}
          <div
            onClick={closeReview}
            className="fixed inset-0 z-[60] bg-black/50"
            style={{
              opacity: sheetOpen ? 1 : 0,
              transition: "opacity 0.3s ease",
            }}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-paper rounded-t-[24px] max-h-[85vh] overflow-y-auto overscroll-contain"
            style={{
              transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
              transition: "transform 0.35s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {/* Drag handle */}
            <div className="sticky top-0 bg-paper flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-4 pb-10 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar
                    initials={reviewEmp.initials}
                    color={reviewEmp.avatarColor}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-bold text-ink">{reviewEmp.name}</p>
                    <p className="text-[11px] text-muted">{reviewEmp.role}</p>
                  </div>
                </div>
                <button
                  onClick={closeReview}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-border text-muted hover:text-ink transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* AI Digest — dark card */}
              <div className="bg-ink rounded-[20px] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-pulse">✦</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-pulse">
                    AI Report Digest
                  </span>
                </div>
                <p className="text-white/60 text-xs leading-relaxed">
                  {report.qualitative.length > 160
                    ? report.qualitative.slice(0, 160) + "..."
                    : report.qualitative}
                </p>
              </div>

              {/* Key Metrics */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
                  Key Metrics
                </p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                  {report.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle
                          size={11}
                          className="text-green flex-shrink-0"
                        />
                        <span className="text-xs text-ink truncate">
                          {m.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-ink flex-shrink-0">
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Flagged Blockers — only if any goals are behind or at_risk */}
              {reviewEmp.goals.some(
                (g) => g.status === "behind" || g.status === "at_risk"
              ) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
                    Flagged Blockers
                  </p>
                  <div className="bg-amber/5 rounded-2xl border border-amber/20 p-4 space-y-2.5">
                    {reviewEmp.goals
                      .filter(
                        (g) => g.status === "behind" || g.status === "at_risk"
                      )
                      .slice(0, 3)
                      .map((g) => (
                        <div key={g.id} className="flex items-start gap-2">
                          <span className="text-amber mt-0.5 flex-shrink-0 text-sm">
                            ⚠
                          </span>
                          <p className="text-xs text-ink leading-snug">
                            <span className="font-semibold">{g.name}</span>{" "}
                            <span className="text-muted">
                              — {g.percentComplete}%&nbsp;(
                              {g.status.replace("_", " ")})
                            </span>
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Goal Progress */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
                  Goal Progress
                </p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                  {reviewEmp.goals.map((g) => (
                    <div key={g.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs text-ink truncate flex-1">
                          {g.name}
                        </p>
                        <span
                          className={clsx(
                            "text-xs font-bold flex-shrink-0",
                            barTextColor(g.percentComplete)
                          )}
                        >
                          {g.percentComplete}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            "h-full rounded-full",
                            barColor(g.percentComplete)
                          )}
                          style={{ width: `${g.percentComplete}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw report — collapsible */}
              <div>
                <button
                  onClick={() => setRawExpanded((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-muted font-semibold hover:text-ink transition-colors mb-2"
                >
                  <FileText size={11} />
                  {rawExpanded ? "Hide full report" : "Show full report"}
                  {rawExpanded ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )}
                </button>
                <div
                  style={{
                    maxHeight: rawExpanded ? "300px" : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.3s ease",
                  }}
                >
                  <div className="bg-card rounded-2xl border border-border p-4">
                    <p className="text-xs text-muted leading-relaxed">
                      {report.qualitative}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAcknowledgedId(reviewEmp.id);
                    setTimeout(closeReview, 700);
                  }}
                  disabled={acknowledgedId === reviewEmp.id}
                  className={clsx(
                    "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                    acknowledgedId === reviewEmp.id
                      ? "bg-green text-white"
                      : "bg-ink text-white hover:bg-ink/90"
                  )}
                >
                  {acknowledgedId === reviewEmp.id ? (
                    <>
                      <Check size={14} />
                      Acknowledged
                    </>
                  ) : (
                    "Acknowledge"
                  )}
                </button>
                <button className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted hover:border-ink hover:text-ink transition-colors">
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
