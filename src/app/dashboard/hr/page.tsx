"use client";

import { useState } from "react";
import clsx from "clsx";
import { X, Bell, Download, RefreshCw, Settings, ChevronRight } from "lucide-react";
import { employees, departments, org } from "@/data/mockData";
import type { Employee, Department, AIRecommendation } from "@/data/mockData";
import Avatar from "@/components/ui/Avatar";
import { SectionLabel } from "@/components/ui";

// ── Derived data ──────────────────────────────────────────────────────────────

const orgHealthScore = Math.round(
  employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
);

const promotionReady = employees.filter((e) => e.aiRec.recommendation === "promote");
const pipCandidates  = employees.filter((e) => e.aiRec.recommendation === "pip");
const riskFlags      = employees.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement");

const compliantCount     = employees.filter((e) => e.weekStreak >= 1).length;
const reportCompliancePct = Math.round((compliantCount / employees.length) * 100);

// One or more representative employees per department
const deptEmpMap = new Map<string, Employee[]>();
for (const emp of employees) {
  deptEmpMap.set(emp.department, [...(deptEmpMap.get(emp.department) ?? []), emp]);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "all" | AIRecommendation;

type CycleMilestone =
  | { label: string; pct: number; type: "pct" }
  | { label: string; count: number; type: "count" };

// ── Static mock data ──────────────────────────────────────────────────────────

const cycleMilestones: CycleMilestone[] = [
  { label: "Self-assessments submitted",  pct: 72,  type: "pct"   },
  { label: "Manager reviews done",        pct: 60,  type: "pct"   },
  { label: "Peer feedback collected",     pct: 88,  type: "pct"   },
  { label: "AI recommendations ready",   pct: 100, type: "pct"   },
  { label: "HR sign-offs pending",        count: 3, type: "count" },
];

const recMeta: Record<AIRecommendation, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  promote:       { label: "Promote",       emoji: "✅", bg: "bg-green-soft",  text: "text-green",  border: "border-green/20"  },
  good_standing: { label: "Good Standing", emoji: "📈", bg: "bg-border",      text: "text-muted",  border: "border-border"    },
  pip:           { label: "PIP",           emoji: "⚠️", bg: "bg-amber-soft",  text: "text-amber",  border: "border-amber/20"  },
  exit_risk:     { label: "Exit Risk",     emoji: "🔴", bg: "bg-red-soft",    text: "text-red",    border: "border-red/20"    },
};

const pendingActionsMap: Record<string, string[]> = {
  Finance:              ["Initiate PIP for Sofia Reyes", "Schedule Finance Director review", "Correct Q2 reporting errors"],
  Analytics:            ["Review support plan for Priya Sharma", "Assess dashboard project delay", "Schedule manager 1:1"],
  Engineering:          ["Complete Q2 manager reviews", "Confirm promotion nomination for James Kirkland"],
  Sales:                ["Finalise Marcus Chen promotion case", "Close new-logo gap before Q2 end"],
  Product:              ["Submit Amara Osei promotion recommendation", "Sign off Q2 roadmap appraisal"],
  Marketing:            ["Monitor social velocity goal risk", "Agency partnership review rescheduled to June"],
  "Human Resources":    ["Finalise HR sign-off backlog (3 pending)", "Strengthen attrition goal intervention plan"],
  "Customer Experience":["CS playbook follow-up with Derek Okafor", "Complete QBR cycle sign-off"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function heatBg(score: number) {
  if (score >= 80) return "bg-green-soft";
  if (score >= 70) return "bg-green/10";
  if (score >= 60) return "bg-amber-soft";
  return "bg-red-soft";
}

function heatText(score: number) {
  if (score >= 70) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

function heatBar(score: number) {
  if (score >= 80) return "bg-green";
  if (score >= 70) return "bg-green/60";
  if (score >= 60) return "bg-amber";
  return "bg-red";
}

function pctColor(pct: number) {
  if (pct === 100) return "text-green font-bold";
  if (pct >= 75)   return "text-ink font-semibold";
  if (pct >= 50)   return "text-amber font-semibold";
  return "text-pulse font-bold";
}

function confColor(c: number) {
  if (c >= 0.8)  return "text-green";
  if (c >= 0.7)  return "text-amber";
  return "text-pulse";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HRDashboard() {
  const [filter, setFilter]         = useState<FilterKey>("all");
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [sentSet, setSentSet]       = useState<Set<string>>(new Set());

  type RecalcResult = { recommendation: AIRecommendation; confidence: number; evidence: string[]; note: string };
  const [recalcLoading, setRecalcLoading] = useState<Set<string>>(new Set());
  const [recalcResults, setRecalcResults] = useState<Record<string, RecalcResult>>({});
  const [recalcErrors, setRecalcErrors]   = useState<Set<string>>(new Set());

  function openDept(dept: Department) {
    setSelectedDept(dept);
    requestAnimationFrame(() => setSheetOpen(true));
  }

  function closeDept() {
    setSheetOpen(false);
    setTimeout(() => setSelectedDept(null), 350);
  }

  function sendReminder(label: string) {
    setSentSet((prev) => new Set(prev).add(label));
    setTimeout(() => {
      setSentSet((prev) => { const n = new Set(prev); n.delete(label); return n; });
    }, 2500);
  }

  async function handleRecalculate(emp: Employee) {
    setRecalcLoading((prev) => new Set(prev).add(emp.id));
    setRecalcErrors((prev) => { const n = new Set(prev); n.delete(emp.id); return n; });
    try {
      const res = await fetch("/api/ai/appraisal-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: emp.name,
          performanceScore: emp.performanceScore,
          goalCompletion: Math.round(
            emp.goals.reduce((s, g) => s + g.percentComplete, 0) / emp.goals.length
          ),
          weekStreak: emp.weekStreak,
          badge: emp.badge,
          reportConsistency: emp.consistencyIndex,
          peerRating: emp.peerRating,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecalcResults((prev) => ({
          ...prev,
          [emp.id]: { ...data, confidence: data.confidence / 100 },
        }));
      } else {
        setRecalcErrors((prev) => new Set(prev).add(emp.id));
      }
    } catch {
      setRecalcErrors((prev) => new Set(prev).add(emp.id));
    } finally {
      setRecalcLoading((prev) => { const n = new Set(prev); n.delete(emp.id); return n; });
    }
  }

  const visibleEmployees =
    filter === "all"
      ? employees
      : employees.filter((e) => e.aiRec.recommendation === filter);

  // Dept sheet derived
  const deptEmps       = selectedDept ? (deptEmpMap.get(selectedDept.name) ?? []) : [];
  const deptGoalAvg    = deptEmps.length
    ? Math.round(deptEmps.flatMap((e) => e.goals).reduce((s, g) => s + g.percentComplete, 0) / deptEmps.flatMap((e) => e.goals).length)
    : null;
  const topPerformer   = deptEmps.reduce<Employee | null>((b, e) => (!b || e.performanceScore > b.performanceScore ? e : b), null);
  const lowestPerformer = deptEmps.reduce<Employee | null>((w, e) => (!w || e.performanceScore < w.performanceScore ? e : w), null);

  return (
    <>
      <div className="dashboard-page space-y-5">

        {/* ── 1. HERO CARD ─────────────────────────────────────────── */}
        <section className="animate-fade-up px-4" style={{ animationDelay: "0ms" }}>
          <div className="bg-ink rounded-[20px] p-5">
            <p className="text-white/40 text-sm">Organisation Overview</p>
            <h1
              className="text-white text-xl font-bold mt-0.5"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {org.name}
            </h1>
            <p className="text-white/35 text-xs mt-0.5">
              {org.staffCount} employees · {org.departmentCount} departments
            </p>

            <div className="mt-5 flex items-end gap-1">
              <span
                className="text-white font-bold leading-none"
                style={{ fontSize: "52px", fontFamily: "var(--font-syne)" }}
              >
                {orgHealthScore}
              </span>
              <span
                className="text-pulse font-bold pb-1.5 text-2xl"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                %
              </span>
              <span className="text-green text-sm font-semibold pb-2 ml-2">
                ↑ +2.8 pts this cycle
              </span>
            </div>

            <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${orgHealthScore}%`,
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
              <span className="px-2.5 py-1 bg-green/20 text-green text-[11px] font-semibold rounded-full">
                Q2 2026 Active
              </span>
              <span className="px-2.5 py-1 bg-pulse/20 text-pulse text-[11px] font-semibold rounded-full">
                {riskFlags.length} Risk Flag{riskFlags.length !== 1 ? "s" : ""}
              </span>
              <span className="px-2.5 py-1 bg-amber/15 text-amber text-[11px] font-semibold rounded-full">
                {pipCandidates.length} PIP Candidate{pipCandidates.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </section>

        {/* ── 2. STAT GRID ─────────────────────────────────────────── */}
        <section
          className="animate-fade-up grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3"
          style={{ animationDelay: "80ms" }}
        >
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Promotion Ready
            </p>
            <p
              className="text-[2rem] font-bold text-ink leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {promotionReady.length}
              <span className="text-base text-muted font-medium">
                /{employees.length}
              </span>
            </p>
            <p className="text-[11px] text-green mt-1.5">↑ Score ≥85 this cycle</p>
          </div>

          <div className="bg-pulse rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
              PIP Candidates
            </p>
            <p
              className="text-[2rem] font-bold text-white leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {pipCandidates.length}
            </p>
            <p className="text-[11px] text-white/60 mt-1.5">Require formal plan</p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Report Compliance
            </p>
            <p
              className="text-[2rem] font-bold text-ink leading-none"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {reportCompliancePct}
              <span className="text-base text-muted font-medium">%</span>
            </p>
            <p className="text-[11px] text-muted mt-1.5">
              {compliantCount}/{employees.length} submitted on time
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Active Risk Flags
            </p>
            <p
              className={clsx(
                "text-[2rem] font-bold leading-none",
                riskFlags.length > 0 ? "text-pulse" : "text-ink"
              )}
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {riskFlags.length}
            </p>
            <p
              className={clsx(
                "text-[11px] mt-1.5",
                riskFlags.length > 0 ? "text-pulse" : "text-muted"
              )}
            >
              {riskFlags.length > 0 ? "Require attention" : "All clear"}
            </p>
          </div>
        </section>

        {/* ── 3. AI APPRAISAL RECOMMENDATIONS ─────────────────────── */}
        <section className="animate-fade-up px-4" style={{ animationDelay: "160ms" }}>
          <SectionLabel right={`${visibleEmployees.length} shown`}>
            AI Appraisal Recommendations
          </SectionLabel>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3 pb-0.5">
            {(["all", "promote", "pip", "exit_risk", "good_standing"] as FilterKey[]).map((key) => {
              const labelMap: Record<FilterKey, string> = {
                all: "All", promote: "Promote", pip: "PIP",
                exit_risk: "Exit Risk", good_standing: "Good Standing",
              };
              const isActive = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={clsx(
                    "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    isActive
                      ? "bg-ink text-white border-ink"
                      : "bg-card text-muted border-border hover:border-ink hover:text-ink"
                  )}
                >
                  {labelMap[key]}
                </button>
              );
            })}
          </div>

          {/* Employee rows */}
          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {visibleEmployees.map((emp) => {
              const override    = recalcResults[emp.id];
              const activeRec   = override?.recommendation ?? emp.aiRec.recommendation;
              const activeConf  = override?.confidence     ?? emp.aiRec.confidence;
              const activeEvid  = override?.evidence       ?? emp.aiRec.evidence;
              const meta        = recMeta[activeRec];
              const isLoading   = recalcLoading.has(emp.id);
              const hasError    = recalcErrors.has(emp.id);
              return (
                <div key={emp.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink leading-tight">
                            {emp.name}
                          </p>
                          <p className="text-[11px] text-muted mt-0.5 truncate">
                            {emp.role} · {emp.performanceScore}%
                          </p>
                        </div>
                        <span
                          className={clsx(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 mt-0.5",
                            meta.bg, meta.text, meta.border
                          )}
                        >
                          {meta.emoji} {meta.label}
                        </span>
                      </div>

                      {/* Evidence */}
                      <p className="text-xs text-muted mt-2 leading-snug line-clamp-2">
                        {activeEvid[0]}
                      </p>
                      {override?.note && (
                        <p className="text-xs text-green mt-1 leading-snug italic">
                          {override.note}
                        </p>
                      )}

                      {/* Confidence + actions */}
                      <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
                        <span className="text-[10px] text-muted">
                          AI confidence:{" "}
                          <span className={clsx("font-semibold", confColor(activeConf))}>
                            {Math.round(activeConf * 100)}%
                          </span>
                          {override && (
                            <span className="text-green ml-1 font-semibold">· updated</span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRecalculate(emp)}
                            disabled={isLoading}
                            className="text-[11px] text-muted font-semibold flex items-center gap-1 hover:text-ink transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
                            {isLoading ? "Recalculating..." : "Recalculate"}
                          </button>
                          <button className="text-[11px] text-pulse font-semibold flex items-center gap-0.5 hover:underline">
                            View full <ChevronRight size={11} />
                          </button>
                        </div>
                      </div>
                      {hasError && (
                        <p className="text-[10px] text-amber mt-1.5">
                          AI unavailable — showing original data.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Advisory note */}
          <div className="mt-3 bg-amber-soft rounded-xl border border-amber/20 p-3.5 flex items-start gap-2.5">
            <span className="text-amber flex-shrink-0 text-sm">⚠</span>
            <p className="text-xs text-amber leading-relaxed">
              All recommendations are advisory only. Final decisions require HR and manager confirmation.
            </p>
          </div>
        </section>

        {/* ── 4. DEPARTMENT HEATMAP ────────────────────────────────── */}
        <section className="animate-fade-up px-4" style={{ animationDelay: "240ms" }}>
          <SectionLabel right="tap for details">Department Heatmap</SectionLabel>

          <div className="grid grid-cols-4 gap-2 md:grid-cols-8 md:gap-3">
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => openDept(dept)}
                className={clsx(
                  "rounded-2xl p-2.5 text-left transition-all active:scale-95",
                  heatBg(dept.avgScore)
                )}
              >
                <p
                  className={clsx(
                    "text-[9px] font-bold leading-tight break-words",
                    heatText(dept.avgScore)
                  )}
                >
                  {dept.name}
                </p>
                <p
                  className={clsx("text-base font-bold mt-1 leading-none", heatText(dept.avgScore))}
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {dept.avgScore}
                </p>
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {[
              { label: "≥80", bgClass: "bg-green-soft",  textClass: "text-green" },
              { label: "≥70", bgClass: "bg-green/10",    textClass: "text-green" },
              { label: "≥60", bgClass: "bg-amber-soft",  textClass: "text-amber" },
              { label: "<60", bgClass: "bg-red-soft",    textClass: "text-red"   },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={clsx("w-3 h-3 rounded-sm", l.bgClass)} />
                <span className={clsx("text-[10px] font-medium", l.textClass)}>{l.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. APPRAISAL CYCLE STATUS ────────────────────────────── */}
        <section className="animate-fade-up px-4" style={{ animationDelay: "320ms" }}>
          <SectionLabel>Appraisal Cycle Status</SectionLabel>

          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {cycleMilestones.map((m) => {
              const isSent      = sentSet.has(m.label);
              const isComplete  = m.type === "pct" && m.pct === 100;
              const needsAction = m.type === "pct" ? m.pct < 100 : m.count > 0;

              return (
                <div key={m.label} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{m.label}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {m.type === "pct" ? (
                      <span className={clsx("text-sm tabular-nums", pctColor(m.pct))}>
                        {m.pct}%
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-pulse tabular-nums">
                        {m.count} pending
                      </span>
                    )}

                    {isComplete && (
                      <span className="text-[11px] text-green font-semibold">✓ Done</span>
                    )}

                    {needsAction && (
                      <button
                        onClick={() => sendReminder(m.label)}
                        disabled={isSent}
                        className={clsx(
                          "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                          isSent
                            ? "bg-green-soft text-green border-green/20 cursor-default"
                            : "bg-card text-muted border-border hover:border-pulse hover:text-pulse"
                        )}
                      >
                        <Bell size={10} />
                        {isSent ? "Sent ✓" : "Remind"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 6. QUICK ACTIONS ─────────────────────────────────────── */}
        <section className="animate-fade-up px-4 pb-2" style={{ animationDelay: "400ms" }}>
          <SectionLabel>Quick Actions</SectionLabel>

          <div className="grid grid-cols-3 gap-2 md:max-w-xl">
            {[
              { Icon: Download,   label: "Export Report"      },
              { Icon: RefreshCw,  label: "Start New Cycle"    },
              { Icon: Settings,   label: "Configure Weights"  },
            ].map(({ Icon, label }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border border-border bg-card text-muted hover:border-ink hover:text-ink transition-colors"
              >
                <Icon size={18} />
                <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── DEPARTMENT BOTTOM SHEET ──────────────────────────────────── */}
      {selectedDept && (
        <>
          {/* Overlay */}
          <div
            onClick={closeDept}
            className="fixed inset-0 z-[60] bg-black/50"
            style={{ opacity: sheetOpen ? 1 : 0, transition: "opacity 0.3s ease" }}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-paper rounded-t-[24px] max-h-[82vh] overflow-y-auto overscroll-contain"
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
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="text-lg font-bold text-ink"
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {selectedDept.name}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {selectedDept.headCount} employees
                  </p>
                </div>
                <button
                  onClick={closeDept}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-border text-muted hover:text-ink transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Score hero */}
              <div className={clsx("rounded-2xl p-4", heatBg(selectedDept.avgScore))}>
                <p
                  className={clsx(
                    "text-[10px] font-semibold uppercase tracking-widest mb-1",
                    heatText(selectedDept.avgScore)
                  )}
                >
                  Avg Performance Score
                </p>
                <p
                  className={clsx("text-4xl font-bold leading-none", heatText(selectedDept.avgScore))}
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {selectedDept.avgScore}
                </p>
                <div className="mt-3 h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full transition-all duration-700", heatBar(selectedDept.avgScore))}
                    style={{ width: `${selectedDept.avgScore}%` }}
                  />
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card rounded-2xl border border-border p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">
                    Goal Completion
                  </p>
                  <p
                    className="text-2xl font-bold text-ink leading-none"
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {deptGoalAvg !== null ? `${deptGoalAvg}%` : "—"}
                  </p>
                  <p className="text-[11px] text-muted mt-1">Avg across all goals</p>
                </div>
                <div className="bg-card rounded-2xl border border-border p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">
                    Head Count
                  </p>
                  <p
                    className="text-2xl font-bold text-ink leading-none"
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {selectedDept.headCount}
                  </p>
                  <p className="text-[11px] text-muted mt-1">Total employees</p>
                </div>
              </div>

              {/* Top performer */}
              {topPerformer && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                    Top Performer
                  </p>
                  <div className="bg-card rounded-2xl border border-border p-3.5 flex items-center gap-3">
                    <Avatar initials={topPerformer.initials} color={topPerformer.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{topPerformer.name}</p>
                      <p className="text-[11px] text-muted truncate">{topPerformer.role}</p>
                    </div>
                    <span className="text-sm font-bold text-green flex-shrink-0">
                      {topPerformer.performanceScore}%
                    </span>
                  </div>
                </div>
              )}

              {/* Lowest performer — only shown when different person */}
              {lowestPerformer && lowestPerformer.id !== topPerformer?.id && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                    Needs Attention
                  </p>
                  <div className="bg-card rounded-2xl border border-border p-3.5 flex items-center gap-3">
                    <Avatar initials={lowestPerformer.initials} color={lowestPerformer.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{lowestPerformer.name}</p>
                      <p className="text-[11px] text-muted truncate">{lowestPerformer.role}</p>
                    </div>
                    <span className="text-sm font-bold text-pulse flex-shrink-0">
                      {lowestPerformer.performanceScore}%
                    </span>
                  </div>
                </div>
              )}

              {/* Pending actions */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                  Pending Actions
                </p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {(pendingActionsMap[selectedDept.name] ?? ["No pending actions."]).map((action) => (
                    <div key={action} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-pulse flex-shrink-0" />
                      <p className="text-xs text-ink leading-snug">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
