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
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import { employees, org } from "@/data/mockData";
import type { Employee } from "@/data/mockData";
import Avatar from "@/components/ui/Avatar";
import { useUser } from "@/context/UserContext";

// ─── Derived data ─────────────────────────────────────────────────────────────

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

const strongCount = employees.filter((e) => e.badge === "Strong Performer").length;
const reviewedCount = 5;
const unreviewedCount = employees.length - reviewedCount;

const pendingReviewEmployees = [employees[7], employees[4], employees[5], employees[6]];

const aboveEighty = employees.filter((e) => e.performanceScore >= 80).length;
const sixtyToEighty = employees.filter((e) => e.performanceScore >= 60 && e.performanceScore < 80).length;
const belowSixty = employees.filter((e) => e.performanceScore < 60).length;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function empGoalAvg(emp: Employee) {
  return Math.round(emp.goals.reduce((s, g) => s + g.percentComplete, 0) / emp.goals.length);
}

function scoreColor(s: number) {
  if (s >= 75) return "text-green";
  if (s >= 60) return "text-amber";
  return "text-pulse";
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
  const { user } = useUser();
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

  return (
    <>
      <div className="space-y-6 pb-8">

        {/* ── 1. AI TEAM BRIEF ────────────────────────────────────────── */}
        <section className="px-5 pt-5 animate-slide-up">
          <div className="insight-card bg-ink rounded-[24px] p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-3.5 rounded-full bg-pulse flex-shrink-0" />
              <span className="type-label text-pulse">
                Pulse · Team Intelligence
              </span>
            </div>

            <p className="text-white text-[17px] font-medium leading-snug mb-1" style={{ fontFamily: "var(--font-syne)" }}>
              {user.name.split(" ")[0]}, your team is trending up.
            </p>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              {strongCount} member{strongCount !== 1 ? "s" : ""} on a strong
              trajectory this cycle.{" "}
              {riskCount > 0 && (
                <>
                  <span className="text-pulse/90 font-medium">
                    {riskCount} require{riskCount === 1 ? "s" : ""} attention
                  </span>{" "}
                  — reviews are pending.
                </>
              )}
            </p>

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Team Avg", value: `${teamAvgScore}%`, accent: false },
                { label: "At Risk", value: String(riskCount), accent: riskCount > 0 },
                { label: "Goals", value: `${teamGoalAvg}%`, accent: false },
                { label: "Pending", value: String(unreviewedCount), accent: unreviewedCount > 0 },
              ].map((s) => (
                <div key={s.label}>
                  <p
                    className={clsx(
                      "text-xl font-bold leading-none",
                      s.accent ? "text-pulse" : "text-white"
                    )}
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {s.value}
                  </p>
                  <p className="text-[10px] text-white/35 mt-1 leading-none">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 h-[3px] bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${teamAvgScore}%`,
                  background: "linear-gradient(90deg, #e8440a, #ff8c57)",
                  animation: "score-bar-fill 1.2s cubic-bezier(0.22,1,0.36,1) both",
                  animationDelay: "0.35s",
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-white/20">{org.currentCycle}</span>
              <span className="text-[10px] text-white/20">{employees.length} reports</span>
            </div>
          </div>
        </section>

        {/* ── 2. PENDING REVIEWS ──────────────────────────────────────── */}
        {unreviewedCount > 0 && (
          <section className="px-5 animate-slide-up delay-75">
            <div className="flex items-baseline justify-between mb-3">
              <p className="type-label">Needs Your Review</p>
              <span className="text-[11px] text-pulse font-semibold">
                {pendingReviewEmployees.length} pending
              </span>
            </div>
            <div className="space-y-2.5">
              {pendingReviewEmployees.map((emp) => {
                const r = emp.reports[0];
                const date = new Date(r.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                });
                const isRisk = emp.badge === "At Risk" || emp.badge === "Needs Improvement";
                return (
                  <div
                    key={emp.id}
                    className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3"
                  >
                    <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-ink leading-tight">{emp.name}</p>
                        {isRisk && (
                          <span className="text-[10px] font-semibold text-pulse bg-pulse/8 px-2 py-0.5 rounded-full">
                            {emp.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5 capitalize">
                        {r.type} · {date}
                      </p>
                    </div>
                    <button
                      onClick={() => openReview(emp)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-ink text-white text-[11px] font-semibold hover:bg-ink/90 transition-colors"
                    >
                      Review <ArrowRight size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 3. TEAM ROSTER ──────────────────────────────────────────── */}
        <section className="px-5 animate-slide-up delay-150">
          <div className="flex items-baseline justify-between mb-3">
            <p className="type-label">Team Performance</p>
            <span className="text-[11px] text-muted">{employees.length} people</span>
          </div>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {employees.map((emp) => {
              const isOpen = expandedId === emp.id;
              const goalAvg = empGoalAvg(emp);
              const lastDate = new Date(emp.reports[0].date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              });
              return (
                <div key={emp.id}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : emp.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-paper/50 transition-colors"
                  >
                    <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink leading-tight">{emp.name}</p>
                      <p className="text-[11px] text-muted mt-0.5 truncate">{emp.role}</p>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <div className="text-right">
                        <p className={clsx("text-sm font-bold", scoreColor(emp.performanceScore))}>
                          {emp.performanceScore}%
                        </p>
                        <div className="w-12 h-[3px] bg-border rounded-full overflow-hidden mt-1">
                          <div
                            className={clsx("h-full rounded-full", barColor(emp.performanceScore))}
                            style={{ width: `${emp.performanceScore}%` }}
                          />
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp size={13} className="text-muted" />
                      ) : (
                        <ChevronDown size={13} className="text-muted" />
                      )}
                    </div>
                  </button>

                  <div
                    style={{
                      maxHeight: isOpen ? "200px" : "0px",
                      overflow: "hidden",
                      transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    <div className="px-4 pb-4">
                      <div className="bg-paper rounded-xl p-3.5">
                        <div className="grid grid-cols-3 gap-2 text-center mb-3">
                          {[
                            { label: "Goals", value: `${goalAvg}%` },
                            { label: "Last Report", value: lastDate },
                            { label: "Consistency", value: `${emp.consistencyIndex}` },
                          ].map((s) => (
                            <div key={s.label}>
                              <p className="text-sm font-bold text-ink">{s.value}</p>
                              <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openReview(emp)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-ink text-white text-xs font-semibold hover:bg-ink/90 transition-colors"
                          >
                            <FileText size={11} /> View Report
                          </button>
                          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted hover:border-ink hover:text-ink transition-colors">
                            <Calendar size={11} /> 1:1
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

        {/* ── 4. DISTRIBUTION STRIP ───────────────────────────────────── */}
        <section className="px-5 animate-slide-up delay-225">
          <p className="type-label mb-3">Score Distribution</p>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3.5">
            {[
              { label: "Strong (80%+)", count: aboveEighty, color: "bg-green", total: employees.length },
              { label: "Developing (60–79%)", count: sixtyToEighty, color: "bg-amber", total: employees.length },
              { label: "At Risk (<60%)", count: belowSixty, color: "bg-pulse", total: employees.length },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-ink font-medium">{row.label}</span>
                  <span className="text-xs font-bold text-ink">{row.count}</span>
                </div>
                <div className="h-[3px] bg-border rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full transition-all duration-700", row.color)}
                    style={{ width: `${(row.count / row.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. AI TEAM SUMMARY ──────────────────────────────────────── */}
        <section className="px-5 pb-2 animate-slide-up delay-300">
          <button
            onClick={openAiSummary}
            className="w-full flex items-center justify-between gap-3 bg-ink rounded-2xl px-5 py-4"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles size={14} className="text-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-white">
                {aiOpen ? "Hide AI Summary" : "Generate AI Team Summary"}
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
            <div className="mt-2 bg-ink rounded-[20px] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 rounded-full bg-pulse flex-shrink-0" />
                <span className="type-label text-pulse">AI Summary · {org.currentCycle}</span>
              </div>

              {summaryLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="text-pulse animate-spin flex-shrink-0" />
                  <p className="text-white/50 text-sm">Generating summary...</p>
                </div>
              ) : summaryError ? (
                <div className="bg-amber/10 rounded-xl p-3 flex items-start gap-2">
                  <span className="text-amber flex-shrink-0">⚠</span>
                  <p className="text-xs text-amber leading-relaxed">
                    Unable to generate summary. Try again.
                  </p>
                </div>
              ) : teamSummaryText ? (
                <p className="text-white/70 text-sm leading-relaxed">{teamSummaryText}</p>
              ) : (
                <p className="text-white/70 text-sm leading-relaxed">
                  Your team averaged{" "}
                  <span className="text-white font-semibold">{teamAvgScore}%</span>{" "}
                  this cycle — up 3 points vs last month.{" "}
                  {riskCount > 0 && (
                    <>
                      <span className="text-pulse font-semibold">
                        {riskCount} member{riskCount !== 1 ? "s" : ""}
                      </span>{" "}
                      require immediate attention.
                    </>
                  )}
                </p>
              )}

              <div className="space-y-2.5">
                {[
                  { dot: "bg-green", text: `${aboveEighty} member${aboveEighty !== 1 ? "s" : ""} performing at 80%+ — strong upward trajectory.` },
                  { dot: "bg-amber", text: `${sixtyToEighty} member${sixtyToEighty !== 1 ? "s" : ""} in the 60–79 range — monitor and support.` },
                  { dot: "bg-pulse", text: `${belowSixty} member${belowSixty !== 1 ? "s" : ""} below 60 — escalation recommended.` },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className={clsx("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", item.dot)} />
                    <p className="text-white/55 text-xs leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="type-label text-white/30 mb-2">Top Recommendation</p>
                <p className="text-white/65 text-xs leading-relaxed">
                  Prioritise 1:1s for Sofia Reyes and Priya Sharma this week.
                  Nominate Amara Osei for the Q2 promotion pipeline. James Kirkland
                  and Marcus Chen merit recognition at the next all-hands.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── REVIEW BOTTOM SHEET ───────────────────────────────────────── */}
      {reviewEmp && report && (
        <>
          <div
            onClick={closeReview}
            className="fixed inset-0 z-[60] bg-black/50"
            style={{ opacity: sheetOpen ? 1 : 0, transition: "opacity 0.3s ease" }}
          />

          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-paper rounded-t-[24px] max-h-[85vh] overflow-y-auto overscroll-contain"
            style={{
              transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
              transition: "transform 0.35s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            <div className="sticky top-0 bg-paper flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-5 pb-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar initials={reviewEmp.initials} color={reviewEmp.avatarColor} size="sm" />
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

              <div className="bg-ink rounded-[20px] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-3.5 rounded-full bg-pulse flex-shrink-0" />
                  <span className="type-label text-pulse">AI Report Digest</span>
                </div>
                <p className="text-white/60 text-xs leading-relaxed">
                  {report.qualitative.length > 160
                    ? report.qualitative.slice(0, 160) + "..."
                    : report.qualitative}
                </p>
              </div>

              <div>
                <p className="type-label mb-2">Key Metrics</p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                  {report.metrics.map((m) => (
                    <div
                      key={m.metric}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle size={11} className="text-green flex-shrink-0" />
                        <span className="text-xs text-ink truncate">{m.metric}</span>
                      </div>
                      <span className="text-xs font-bold text-ink flex-shrink-0">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {reviewEmp.goals.some((g) => g.status === "behind" || g.status === "at_risk") && (
                <div>
                  <p className="type-label mb-2">Flagged Blockers</p>
                  <div className="bg-amber/5 rounded-2xl border border-amber/20 p-4 space-y-2.5">
                    {reviewEmp.goals
                      .filter((g) => g.status === "behind" || g.status === "at_risk")
                      .slice(0, 3)
                      .map((g) => (
                        <div key={g.id} className="flex items-start gap-2">
                          <span className="text-amber mt-0.5 flex-shrink-0">⚠</span>
                          <p className="text-xs text-ink leading-snug">
                            <span className="font-semibold">{g.name}</span>{" "}
                            <span className="text-muted">
                              — {g.percentComplete}% ({g.status.replace("_", " ")})
                            </span>
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <p className="type-label mb-2">Goal Progress</p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                  {reviewEmp.goals.map((g) => (
                    <div key={g.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs text-ink truncate flex-1">{g.name}</p>
                        <span className={clsx("text-xs font-bold flex-shrink-0", barTextColor(g.percentComplete))}>
                          {g.percentComplete}%
                        </span>
                      </div>
                      <div className="h-[3px] bg-border rounded-full overflow-hidden">
                        <div
                          className={clsx("h-full rounded-full", barColor(g.percentComplete))}
                          style={{ width: `${g.percentComplete}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setRawExpanded((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-muted font-semibold hover:text-ink transition-colors mb-2"
                >
                  <FileText size={11} />
                  {rawExpanded ? "Hide full report" : "Show full report"}
                  {rawExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                <div
                  style={{
                    maxHeight: rawExpanded ? "300px" : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.3s ease",
                  }}
                >
                  <div className="bg-card rounded-2xl border border-border p-4">
                    <p className="text-xs text-muted leading-relaxed">{report.qualitative}</p>
                  </div>
                </div>
              </div>

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
                    <><Check size={14} /> Acknowledged</>
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
