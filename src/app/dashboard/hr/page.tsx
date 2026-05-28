"use client";

import { useState } from "react";
import clsx from "clsx";
import { RefreshCw, X } from "lucide-react";
import { employees, departments, org } from "@/data/mockData";
import type { Employee, Department } from "@/data/mockData";
import type { AIRecommendation } from "@/data/mockData";
import Avatar from "@/components/ui/Avatar";

// ── Derived data ───────────────────────────────────────────────────────────────

const orgHealthScore = Math.round(
  employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
);
const promotionReady  = employees.filter((e) => e.aiRec.recommendation === "promote");
const pipCandidates   = employees.filter((e) => e.aiRec.recommendation === "pip");
const exitRisk        = employees.filter((e) => e.aiRec.recommendation === "exit_risk");
const compliantCount  = employees.filter((e) => e.weekStreak >= 1).length;
const reportCompliance = Math.round((compliantCount / employees.length) * 100);

type FilterKey = "all" | AIRecommendation;

const recMeta: Record<AIRecommendation, { label: string; bg: string; text: string; border: string }> = {
  promote:       { label: "Promote",       bg: "bg-green-soft",  text: "text-green",  border: "border-green/20"  },
  good_standing: { label: "Good Standing", bg: "bg-border",      text: "text-muted",  border: "border-border"    },
  pip:           { label: "PIP",           bg: "bg-amber-soft",  text: "text-amber",  border: "border-amber/20"  },
  exit_risk:     { label: "Exit Risk",     bg: "bg-red-soft",    text: "text-red",    border: "border-red/20"    },
};

const deptEmpMap = new Map<string, Employee[]>();
for (const emp of employees) {
  deptEmpMap.set(emp.department, [...(deptEmpMap.get(emp.department) ?? []), emp]);
}

const cycleMilestones = [
  { label: "Self-assessments submitted",  value: "72%",  pct: 72,  done: false },
  { label: "Manager reviews complete",    value: "60%",  pct: 60,  done: false },
  { label: "Peer feedback collected",     value: "88%",  pct: 88,  done: false },
  { label: "AI recommendations ready",   value: "100%", pct: 100, done: true  },
  { label: "HR sign-offs pending",        value: "3",    pct: 0,   done: false, isCount: true },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function confColor(c: number) {
  if (c >= 0.8) return "text-green";
  if (c >= 0.7) return "text-amber";
  return "text-pulse";
}

// ── Dept Detail Sheet ─────────────────────────────────────────────────────────

function DeptSheet({
  dept,
  onClose,
}: {
  dept: Department;
  onClose: () => void;
}) {
  const emps = deptEmpMap.get(dept.name) ?? [];
  const top  = emps.reduce<Employee | null>((b, e) => (!b || e.performanceScore > b.performanceScore ? e : b), null);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-[80vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-2 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
              {dept.name}
            </h2>
            <p className="text-xs text-muted">{dept.headCount} employees</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={clsx(
              "text-2xl font-bold",
              dept.avgScore >= 75 ? "text-green" : dept.avgScore >= 65 ? "text-amber" : "text-red"
            )} style={{ fontFamily: "var(--font-syne)" }}>
              {dept.avgScore}
            </span>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-10 pt-4 space-y-4">
          {top && (
            <div className="bg-green-soft rounded-xl p-3.5 border border-green/15 flex items-center gap-3">
              <Avatar initials={top.initials} color={top.avatarColor} size="sm" />
              <div>
                <p className="text-xs font-semibold text-green">Top performer</p>
                <p className="text-sm font-bold text-ink">{top.name}</p>
                <p className="text-xs text-muted">{top.performanceScore}/100</p>
              </div>
            </div>
          )}
          {emps.map((emp) => (
            <div key={emp.id} className="flex items-center gap-3">
              <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{emp.name}</p>
                <p className="text-xs text-muted truncate">{emp.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">{emp.performanceScore}</span>
                <span className={clsx(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  recMeta[emp.aiRec.recommendation].bg,
                  recMeta[emp.aiRec.recommendation].text,
                  recMeta[emp.aiRec.recommendation].border,
                )}>
                  {recMeta[emp.aiRec.recommendation].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HRDashboard() {
  const [filter, setFilter]                 = useState<FilterKey>("all");
  const [selectedDept, setSelectedDept]     = useState<Department | null>(null);
  const [sentSet, setSentSet]               = useState<Set<string>>(new Set());

  type RecalcResult = { recommendation: AIRecommendation; confidence: number; evidence: string[]; note: string };
  const [recalcLoading, setRecalcLoading]   = useState<Set<string>>(new Set());
  const [recalcResults, setRecalcResults]   = useState<Record<string, RecalcResult>>({});
  const [recalcErrors, setRecalcErrors]     = useState<Set<string>>(new Set());

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
          goalCompletion: Math.round(emp.goals.reduce((s, g) => s + g.percentComplete, 0) / emp.goals.length),
          weekStreak: emp.weekStreak,
          badge: emp.badge,
          reportConsistency: emp.consistencyIndex,
          peerRating: emp.peerRating,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecalcResults((prev) => ({ ...prev, [emp.id]: { ...data, confidence: data.confidence / 100 } }));
      } else {
        setRecalcErrors((prev) => new Set(prev).add(emp.id));
      }
    } catch {
      setRecalcErrors((prev) => new Set(prev).add(emp.id));
    } finally {
      setRecalcLoading((prev) => { const n = new Set(prev); n.delete(emp.id); return n; });
    }
  }

  const visibleEmployees = filter === "all"
    ? employees
    : employees.filter((e) => e.aiRec.recommendation === filter);

  return (
    <>
      <div className="space-y-7 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="px-5 pt-5 animate-fade-up">
          <p className="type-label">HR Intelligence · {org.name}</p>
          <h1 className="text-[26px] font-bold text-ink mt-1 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
            Workforce View
          </h1>
          <p className="text-[11px] text-muted/70 mt-0.5">
            {employees.length} employees · Q2 2026 cycle
          </p>
        </div>

        {/* ── Org Health Strip ──────────────────────────────────── */}
        <div className="animate-fade-up delay-75">
          <div className="mx-5 bg-ink rounded-2xl px-5 py-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(232,68,10,0.10) 0%, transparent 70%)" }} />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              Organisation Health Score
            </p>
            <div className="flex items-end gap-3 mb-4">
              <span className="text-[52px] font-bold leading-none text-white" style={{ fontFamily: "var(--font-syne)" }}>
                {orgHealthScore}
              </span>
              <div className="pb-1.5">
                <span className="text-white/40 text-xl">/100</span>
                <p className="text-green text-sm font-semibold">↑ +2.8 pts this cycle</p>
              </div>
            </div>
            <div className="h-[3px] bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${orgHealthScore}%`,
                  background: "linear-gradient(90deg, #e8440a, #ff8c57)",
                  animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
                  animationDelay: "0.35s",
                }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/10">
              {[
                { label: "For Promotion", value: promotionReady.length, color: "text-green" },
                { label: "PIP Candidates", value: pipCandidates.length, color: "text-amber" },
                { label: "Exit Risk", value: exitRisk.length, color: exitRisk.length > 0 ? "text-red" : "text-white/40" },
                { label: "Compliance", value: `${reportCompliance}%`, color: "text-white" },
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

        {/* ── Appraisal Cycle Status ─────────────────────────────── */}
        <div className="px-5 animate-fade-up delay-150">
          <p className="type-label mb-3">Appraisal Cycle · Q2 2026</p>
          <div className="space-y-3.5">
            {cycleMilestones.map((m) => {
              const isSent = sentSet.has(m.label);
              return (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-ink">{m.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-xs font-semibold",
                        m.done ? "text-green" : m.isCount ? "text-pulse font-bold" : "text-ink"
                      )}>
                        {m.done ? "✓ " : ""}{m.value}
                      </span>
                      {!m.done && !m.isCount && m.pct < 100 && (
                        <button
                          onClick={() => sendReminder(m.label)}
                          disabled={isSent}
                          className={clsx(
                            "text-[10px] font-semibold transition-colors",
                            isSent ? "text-green" : "text-pulse hover:underline"
                          )}
                        >
                          {isSent ? "Sent ✓" : "Remind"}
                        </button>
                      )}
                    </div>
                  </div>
                  {!m.isCount && (
                    <div className="h-[3px] bg-border rounded-full overflow-hidden">
                      <div
                        className={clsx("h-full rounded-full", m.done ? "bg-green" : "bg-pulse")}
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Department Heatmap ─────────────────────────────────── */}
        <div className="px-5 animate-fade-up delay-225">
          <p className="type-label mb-3">Department Heatmap · tap for detail</p>
          <div className="grid grid-cols-4 gap-2">
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => setSelectedDept(dept)}
                className={clsx(
                  "rounded-xl p-3 text-left transition-all active:scale-95",
                  heatBg(dept.avgScore)
                )}
              >
                <p className={clsx("text-[9px] font-bold leading-tight", heatText(dept.avgScore))}>
                  {dept.name}
                </p>
                <p className={clsx("text-base font-bold mt-1 leading-none", heatText(dept.avgScore))}
                  style={{ fontFamily: "var(--font-syne)" }}>
                  {dept.avgScore}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ── AI Appraisal Recommendations ──────────────────────── */}
        <div className="px-5 animate-fade-up delay-300">
          <div className="flex items-center justify-between mb-3">
            <p className="type-label">AI Recommendations</p>
            <span className="text-xs text-muted">{visibleEmployees.length} shown</span>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3">
            {(["all", "promote", "pip", "exit_risk", "good_standing"] as FilterKey[]).map((key) => {
              const labels: Record<FilterKey, string> = {
                all: "All", promote: "Promote", pip: "PIP", exit_risk: "Exit Risk", good_standing: "Good Standing",
              };
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={clsx(
                    "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    filter === key
                      ? "bg-ink text-white border-ink"
                      : "bg-card text-muted border-border hover:text-ink hover:border-ink"
                  )}
                >
                  {labels[key]}
                </button>
              );
            })}
          </div>

          {/* Employee list */}
          <div className="space-y-2">
            {visibleEmployees.map((emp) => {
              const override    = recalcResults[emp.id];
              const activeRec   = override?.recommendation ?? emp.aiRec.recommendation;
              const activeConf  = override?.confidence     ?? emp.aiRec.confidence;
              const activeEvid  = override?.evidence       ?? emp.aiRec.evidence;
              const meta        = recMeta[activeRec];
              const isLoading   = recalcLoading.has(emp.id);
              const hasError    = recalcErrors.has(emp.id);

              return (
                <div key={emp.id} className="bg-card rounded-2xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{emp.name}</p>
                          <p className="text-[11px] text-muted mt-0.5">{emp.role} · {emp.performanceScore}/100</p>
                        </div>
                        <span className={clsx(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0",
                          meta.bg, meta.text, meta.border,
                        )}>
                          {meta.label}
                        </span>
                      </div>

                      <p className="text-xs text-muted mt-2 leading-snug line-clamp-2">
                        {activeEvid[0]}
                      </p>

                      {override?.note && (
                        <p className="text-xs text-green mt-1 italic leading-snug">{override.note}</p>
                      )}

                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-[10px] text-muted">
                          Confidence:{" "}
                          <span className={clsx("font-semibold", confColor(activeConf))}>
                            {Math.round(activeConf * 100)}%
                          </span>
                          {override && <span className="text-green ml-1 font-semibold">· updated</span>}
                        </span>
                        <button
                          onClick={() => handleRecalculate(emp)}
                          disabled={isLoading}
                          className="text-[11px] text-muted font-semibold flex items-center gap-1 hover:text-ink transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
                          {isLoading ? "Recalculating…" : "Recalculate"}
                        </button>
                      </div>

                      {hasError && (
                        <p className="text-[10px] text-amber mt-1.5">AI unavailable — showing original data.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted text-center mt-4 px-2 leading-relaxed">
            All recommendations are advisory. Final decisions require HR and manager confirmation.
          </p>
        </div>

      </div>

      {/* Dept detail sheet */}
      {selectedDept && (
        <DeptSheet dept={selectedDept} onClose={() => setSelectedDept(null)} />
      )}
    </>
  );
}
