"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BarChart2,
  Download,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { departments, employees, org } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Department, Employee, Goal } from "@/types";

type ExecTab = "overview" | "okrs" | "talent" | "departments" | "briefing";
type TalentBand = "strong" | "good" | "support" | "risk";
type DeptView = "quarter" | "last" | "org";

const tabs: { key: ExecTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "okrs", label: "OKRs" },
  { key: "talent", label: "Talent" },
  { key: "departments", label: "Departments" },
  { key: "briefing", label: "Briefing" },
];

const trendMonths = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const trendValues = [64, 67, 69, 68, 71, 76];
const cycleDeadline = "2026-06-30";
const today = new Date("2026-05-28");
const deptEmojis = ["📈", "⚙️", "📣", "💻", "🎧", "💼", "⚖️", "🧭", "👥", "📊", "🤝"];

function avg(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function daysUntil(date: string) {
  return Math.max(0, Math.ceil((new Date(date).getTime() - today.getTime()) / 86_400_000));
}

function pct(count: number) {
  return Math.round((count / employees.length) * 100);
}

function scoreTone(score: number) {
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

function progressTone(score: number) {
  if (score >= 80) return "bg-green";
  if (score >= 60) return "bg-amber";
  return "bg-red";
}

function tagClass(kind: "green" | "amber" | "red" | "ink") {
  return {
    green: "bg-green-soft text-green",
    amber: "bg-amber-soft text-amber",
    red: "bg-red-soft text-red",
    ink: "bg-ink/5 text-muted",
  }[kind];
}

function getOrgGoals() {
  const map = new Map<string, Goal & { departments: string[] }>();
  employees.forEach((employee) => {
    employee.goals.filter((goal) => goal.type === "org").forEach((goal) => {
      const existing = map.get(goal.name);
      if (existing) {
        existing.percentComplete = avg([existing.percentComplete, goal.percentComplete]);
        existing.departments = Array.from(new Set([...existing.departments, employee.department]));
      } else {
        map.set(goal.name, { ...goal, departments: [employee.department] });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

function getBucket(employee: Employee): TalentBand {
  if (employee.performanceScore >= 85) return "strong";
  if (employee.performanceScore >= 60) return "good";
  if (employee.performanceScore >= 40) return "support";
  return "risk";
}

function fallbackBriefing() {
  return "Overall Health — Zenith Corp is improving steadily, with organisation performance trending upward across the last six months and company OKRs moving into a stronger delivery posture. Top Risk — Support and Operations remain the main watch areas because their department scores sit below the organisation average while several goals approach the Q2 deadline. Top Strength — Product, Sales, and Customer Success are setting the pace with strong scores and clearer promotion signals. Recommended Action — Ask each department head below 70 to submit a two-week recovery plan tied to their riskiest OKR.";
}

export default function ExecutivePortal() {
  const { user } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExecTab>("overview");
  const [toast, setToast] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<(Goal & { departments: string[] }) | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedBand, setSelectedBand] = useState<TalentBand | null>(null);
  const [deptView, setDeptView] = useState<DeptView>("quarter");
  const [briefing, setBriefing] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);

  const allowed = user.platformRole === "executive_view" || user.platformRole === "super_admin";

  const orgGoals = getOrgGoals();
  const orgGoalProgress = avg(orgGoals.map((goal) => goal.percentComplete));
  const sortedDepartments = [...departments].sort((a, b) => b.avgScore - a.avgScore);
  const strong = employees.filter((employee) => getBucket(employee) === "strong");
  const good = employees.filter((employee) => getBucket(employee) === "good");
  const support = employees.filter((employee) => getBucket(employee) === "support");
  const risk = employees.filter((employee) => getBucket(employee) === "risk");
  const promotionPipeline = employees.filter((employee) => employee.aiRec.recommendation === "promote");
  const pipPipeline = employees.filter((employee) => employee.aiRec.recommendation === "pip" || employee.aiRec.recommendation === "exit_risk");
  const atRiskGoals = orgGoals.filter((goal) => goal.percentComplete < 50 && daysUntil(goal.dueDate) < 30);
  const completedGoals = orgGoals.filter((goal) => goal.status === "completed");
  const flightRisks = employees.filter((employee) => {
    const lowWellbeing = employee.wellbeingHistory.slice(-2).some((entry) => entry.mood === "drained");
    return employee.consistencyIndex < 65 && employee.performanceScore < 70 && lowWellbeing;
  });

  useEffect(() => {
    if (!allowed) {
      const id = window.setTimeout(() => router.replace("/dashboard"), 900);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [allowed, router]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function generateBriefing() {
    setBriefingOpen(true);
    setBriefingLoading(true);
    try {
      const response = await fetch("/api/ai/executive-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: org.name,
          departments: sortedDepartments.map((department, index) => ({
            name: department.name,
            score: department.avgScore,
            trend: index % 3 === 0 ? "down" : "up",
          })),
          overallScore: avg(employees.map((employee) => employee.performanceScore)),
          promotionCount: promotionPipeline.length,
          pipCount: pipPipeline.length,
          atRiskGoals: atRiskGoals.map((goal) => goal.name),
          cycleDeadline,
        }),
      });
      const data = await response.json();
      setBriefing(data.briefing || fallbackBriefing());
    } catch {
      setBriefing(fallbackBriefing());
    } finally {
      setBriefingLoading(false);
    }
  }

  function openHrProfile(employee: Employee) {
    showToast(`Opening HR profile for ${employee.name}`);
    router.push(`/hr?employee=${employee.id}`);
  }

  if (!allowed) {
    return (
      <div className="fixed inset-0 z-[150] grid place-items-center bg-paper px-6 text-center">
        <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-lg)]">
          <p className="text-sm font-bold text-ink">Redirecting to dashboard</p>
          <p className="mt-1 text-xs text-muted">Executive access is restricted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-paper text-ink">
      {toast && <Toast message={toast} />}
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <Link href="/dashboard/profile" className="text-xs font-bold text-white/50">← Back to My Dashboard</Link>
            <h1 className="mt-1 font-syne text-xl font-bold">Executive Portal</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs text-white/65">
            <span className="h-2 w-2 rounded-full bg-pulse" />
            {user.name}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
                activeTab === tab.key ? "bg-pulse text-white" : "bg-white/8 text-white/55 hover:bg-white/12"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-16">
        {activeTab === "overview" && (
          <Overview
            orgGoalProgress={orgGoalProgress}
            strong={strong}
            good={good}
            support={support}
            risk={risk}
            promotionPipeline={promotionPipeline}
            pipPipeline={pipPipeline}
            orgGoals={orgGoals}
            atRiskGoals={atRiskGoals}
            completedGoals={completedGoals}
          />
        )}

        {activeTab === "okrs" && (
          <Okrs orgGoals={orgGoals} onSelectGoal={setSelectedGoal} />
        )}

        {activeTab === "talent" && (
          <Talent
            bands={{ strong, good, support, risk }}
            selectedBand={selectedBand}
            setSelectedBand={setSelectedBand}
            promotionPipeline={promotionPipeline}
            pipPipeline={pipPipeline}
            flightRisks={flightRisks}
            onOpenProfile={openHrProfile}
            showToast={showToast}
          />
        )}

        {activeTab === "departments" && (
          <Departments
            sortedDepartments={sortedDepartments}
            deptView={deptView}
            setDeptView={setDeptView}
            onSelectDept={setSelectedDept}
          />
        )}

        {activeTab === "briefing" && (
          <Briefing
            briefing={briefing}
            briefingOpen={briefingOpen}
            loading={briefingLoading}
            onGenerate={generateBriefing}
            showToast={showToast}
          />
        )}
      </main>

      {selectedGoal && <GoalSheet goal={selectedGoal} onClose={() => setSelectedGoal(null)} />}
      {selectedDept && <DeptSheet department={selectedDept} onClose={() => setSelectedDept(null)} />}
    </div>
  );
}

function Overview({ orgGoalProgress, strong, good, support, risk, promotionPipeline, pipPipeline, orgGoals, atRiskGoals, completedGoals }: { orgGoalProgress: number; strong: Employee[]; good: Employee[]; support: Employee[]; risk: Employee[]; promotionPipeline: Employee[]; pipPipeline: Employee[]; orgGoals: Goal[]; atRiskGoals: Goal[]; completedGoals: Goal[] }) {
  return (
    <>
      <section className="rounded-[20px] bg-ink p-5 text-white">
        <p className="text-sm text-white/45">Strategic View — {org.name} · Q2 2026</p>
        <div className="mt-5 flex items-end gap-2">
          <span className="font-syne text-[52px] font-extrabold leading-none">{orgGoalProgress}</span>
          <span className="pb-2 font-syne text-2xl font-bold text-pulse">%</span>
          <span className="pb-3 text-sm font-bold text-green">↑ +5 pts this quarter</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-pulse to-orange" style={{ width: `${orgGoalProgress}%` }} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/10 px-3 py-1 text-white/60">{org.staffCount} staff</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-white/60">{org.departmentCount} departments</span>
          <span className="rounded-full bg-pulse/20 px-3 py-1 text-pulse">Cycle deadline: Jun 30</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat title="High Performers" value={`${pct(strong.length)}%`} note={`Score ≥85 · ${strong.length} people`} />
        <Stat title="Good Standing" value={`${pct(good.length)}%`} note={`Score 60-84 · ${good.length} people`} />
        <Stat title="Needs Support" value={`${pct(support.length)}%`} note={`Score 40-59 · ${support.length} people`} accent />
        <Stat title="Critical Risk" value={`${pct(risk.length)}%`} note={`Score <40 · ${risk.length} people`} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <SectionTitle icon={BarChart2}>Performance Trend</SectionTitle>
        <TrendChart />
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1">
        {[
          ["Total Goals", orgGoals.length],
          ["On Track", orgGoals.filter((goal) => goal.status === "on_track").length],
          ["At Risk", atRiskGoals.length],
          ["Completed", completedGoals.length],
          ["Promotion Pipeline", promotionPipeline.length],
          ["PIP Pipeline", pipPipeline.length],
        ].map(([label, value]) => (
          <div key={label} className="min-w-36 rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
            <p className="mt-2 font-syne text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </section>
    </>
  );
}

function Okrs({ orgGoals, onSelectGoal }: { orgGoals: (Goal & { departments: string[] })[]; onSelectGoal: (goal: Goal & { departments: string[] }) => void }) {
  const atRisk = orgGoals.filter((goal) => goal.percentComplete < 50 && daysUntil(goal.dueDate) < 30);
  const completed = orgGoals.filter((goal) => goal.status === "completed");
  const onTrack = orgGoals.length - atRisk.length - completed.length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <MiniChip tone="green">{onTrack} on track</MiniChip>
        <MiniChip tone="red">{atRisk.length} at risk</MiniChip>
        <MiniChip tone="ink">{completed.length} completed</MiniChip>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {orgGoals.map((goal) => {
          const risk = goal.percentComplete < 50 && daysUntil(goal.dueDate) < 30;
          return (
            <button key={goal.id} onClick={() => onSelectGoal(goal)} className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-pulse/35">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-syne text-base font-bold text-ink">{goal.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {goal.departments.slice(0, 4).map((dept) => <span key={dept} className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold text-muted">{dept}</span>)}
                    {goal.departments.length > 4 && <span className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold text-muted">+{goal.departments.length - 4}</span>}
                  </div>
                </div>
                <span className={clsx("font-syne text-3xl font-bold", scoreTone(goal.percentComplete))}>{goal.percentComplete}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
                <div className={clsx("h-full rounded-full", progressTone(goal.percentComplete))} style={{ width: `${goal.percentComplete}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>Due {new Date(goal.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {daysUntil(goal.dueDate)} days left</span>
                {risk && <span className="rounded-full bg-red-soft px-2 py-1 font-bold text-red">⚠️ AT RISK</span>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Talent({ bands, selectedBand, setSelectedBand, promotionPipeline, pipPipeline, flightRisks, onOpenProfile, showToast }: { bands: Record<TalentBand, Employee[]>; selectedBand: TalentBand | null; setSelectedBand: (band: TalentBand | null) => void; promotionPipeline: Employee[]; pipPipeline: Employee[]; flightRisks: Employee[]; onOpenProfile: (employee: Employee) => void; showToast: (message: string) => void }) {
  const labels: Record<TalentBand, string> = { strong: "Strong Performers", good: "Good Standing", support: "Needs Support", risk: "Critical Risk" };
  const colors: Record<TalentBand, string> = { strong: "bg-green text-white", good: "bg-green-soft text-green", support: "bg-amber text-white", risk: "bg-red text-white" };
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4">
        <SectionTitle icon={Users}>Talent Distribution</SectionTitle>
        <div className="flex h-12 overflow-hidden rounded-lg">
          {(["strong", "good", "support", "risk"] as TalentBand[]).map((band) => (
            <button
              key={band}
              onClick={() => setSelectedBand(selectedBand === band ? null : band)}
              className={clsx("px-2 text-xs font-bold transition", colors[band])}
              style={{ width: `${pct(bands[band].length)}%`, minWidth: "68px" }}
            >
              {labels[band]} {pct(bands[band].length)}%
            </button>
          ))}
        </div>
        {selectedBand && (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {bands[selectedBand].map((employee) => <PersonMini key={employee.id} employee={employee} />)}
          </div>
        )}
      </div>

      <Pipeline title="Promotion Pipeline" employees={promotionPipeline} onOpenProfile={onOpenProfile} />
      <Pipeline title="PIP Pipeline" employees={pipPipeline} onOpenProfile={onOpenProfile} showActions showToast={showToast} />

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Flight Risk Indicator</p>
            <p className="mt-1 font-syne text-3xl font-bold text-red">{flightRisks.length}</p>
          </div>
          <button onClick={() => showToast("Flight risk list opened")} className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">Review</button>
        </div>
        <div className="mt-3 space-y-2">
          {flightRisks.length ? flightRisks.map((employee) => <PersonMini key={employee.id} employee={employee} trendDown />) : <p className="text-sm text-muted">No flight-risk pattern found in the current mock data.</p>}
        </div>
      </div>
    </section>
  );
}

function Departments({ sortedDepartments, deptView, setDeptView, onSelectDept }: { sortedDepartments: Department[]; deptView: DeptView; setDeptView: (view: DeptView) => void; onSelectDept: (department: Department) => void }) {
  const orgAvg = avg(departments.map((department) => department.avgScore));
  return (
    <section className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {[
          ["quarter", "This Quarter"],
          ["last", "vs Last Quarter"],
          ["org", "vs Org Average"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setDeptView(key as DeptView)} className={clsx("shrink-0 rounded-full px-4 py-2 text-sm font-bold", deptView === key ? "bg-pulse text-white" : "bg-card text-muted")}>{label}</button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card">
        {sortedDepartments.map((department, index) => {
          const delta = deptView === "last" ? (index % 2 === 0 ? 4 : -3) : department.avgScore - orgAvg;
          return (
            <button key={department.id} onClick={() => onSelectDept(department)} className="grid w-full grid-cols-[36px_1fr_72px] items-center gap-3 border-b border-border p-4 text-left last:border-b-0">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-lg">{deptEmojis[index % deptEmojis.length]}</div>
              <div className="min-w-0">
                <p className="font-bold text-ink">{department.name}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className={clsx("h-full rounded-full", progressTone(department.avgScore))} style={{ width: `${department.avgScore}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{department.headCount} staff</p>
              </div>
              <div className="text-right">
                <p className={clsx("font-syne text-2xl font-bold", scoreTone(department.avgScore))}>{department.avgScore}</p>
                <p className={clsx("text-xs font-bold", delta >= 0 ? "text-green" : "text-red")}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Briefing({ briefing, briefingOpen, loading, onGenerate, showToast }: { briefing: string; briefingOpen: boolean; loading: boolean; onGenerate: () => void; showToast: (message: string) => void }) {
  return (
    <section className="space-y-4">
      <div className="rounded-[20px] bg-ink p-5 text-white">
        <div className="flex items-center gap-2 text-pulse"><Sparkles size={18} /><span className="font-bold">Get Executive Briefing</span></div>
        <p className="mt-2 max-w-2xl text-sm text-white/55">AI-generated strategic summary of org health, risks, and recommended actions.</p>
        <button onClick={onGenerate} disabled={loading} className="mt-5 rounded-lg border border-pulse px-4 py-3 text-sm font-bold text-pulse disabled:opacity-60">
          {loading ? <><Loader2 size={14} className="mr-2 inline animate-spin" />✦ Generating briefing...</> : briefing ? "Refresh Briefing" : "Generate Briefing"}
        </button>
      </div>
      {briefingOpen && (
        <div className="rounded-[20px] bg-ink p-5 text-white animate-fade-up">
          <h2 className="font-syne text-lg font-bold">Executive Briefing — May 28, 2026</h2>
          <BriefingText text={briefing || fallbackBriefing()} />
          <p className="mt-5 text-xs text-white/35">Generated by Pulse AI · Based on data as of today · Refresh for updated analysis</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onGenerate} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/60">Refresh Briefing</button>
            <button onClick={() => showToast("Export coming soon")} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/60"><Download size={13} className="mr-1 inline" />Export as PDF</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TrendChart() {
  return (
    <svg viewBox="0 0 360 160" className="h-56 w-full" role="img" aria-label="Six month organisation score trend">
      {[50, 75].map((value) => <line key={value} x1="28" x2="350" y1={140 - value} y2={140 - value} stroke="#e7e0d7" strokeDasharray="4 4" />)}
      {trendValues.map((value, index) => {
        const height = value * 1.15;
        const x = 38 + index * 52;
        return (
          <g key={trendMonths[index]}>
            <rect x={x} y={130 - height} width="30" height={height} rx="6" fill="#e8440a" opacity={0.4 + index * 0.1} />
            <text x={x + 15} y={122 - height} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0d0d0d">{value}</text>
            <text x={x + 15} y="150" textAnchor="middle" fontSize="10" fill="#6f747d">{trendMonths[index]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Pipeline({ title, employees: people, onOpenProfile, showActions, showToast }: { title: string; employees: Employee[]; onOpenProfile: (employee: Employee) => void; showActions?: boolean; showToast?: (message: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <SectionTitle icon={title.includes("Promotion") ? TrendingUp : TrendingDown}>{title}</SectionTitle>
      <div className="space-y-2">
        {people.map((employee) => (
          <div key={employee.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold text-ink">{employee.name}</p><p className="text-xs text-muted">{employee.department} · {employee.band.current} · {daysUntil(employee.joinDate) === 0 ? "tenured" : "long-tenured"}</p></div>
              <span className="text-xs font-bold text-pulse">{Math.round(employee.aiRec.confidence * 100)}%</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onOpenProfile(employee)} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">View Full Profile</button>
              {showActions && <button onClick={() => showToast?.("Manager review requested")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Send to Manager</button>}
              {showActions && <button onClick={() => showToast?.("HR meeting scheduled")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Schedule HR Meeting</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeptSheet({ department, onClose }: { department: Department; onClose: () => void }) {
  const people = employees.filter((employee) => employee.department === department.name);
  const top = [...people].sort((a, b) => b.performanceScore - a.performanceScore)[0];
  const low = [...people].sort((a, b) => a.performanceScore - b.performanceScore)[0];
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="font-syne text-xl font-bold text-ink">{department.name}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat title="Avg score" value={department.avgScore} />
        <Stat title="Staff count" value={department.headCount} />
        <Stat title="Goal completion" value={`${avg(people.map((employee) => avg(employee.goals.map((goal) => goal.percentComplete))))}%`} />
        <Stat title="Active flags" value={people.filter((employee) => employee.aiRec.recommendation === "pip" || employee.aiRec.recommendation === "exit_risk").length} accent />
      </div>
      <div className="mt-4 space-y-2 text-sm text-muted">
        <p><span className="font-bold text-ink">Top performer:</span> {top ? `${top.name} · ${top.performanceScore}` : "No data"}</p>
        <p><span className="font-bold text-ink">Lowest performer:</span> {low ? `${low.name} · ${low.performanceScore}` : "No data"}</p>
        <p><span className="font-bold text-ink">Report compliance:</span> {department.avgScore >= 70 ? "84%" : "62%"}</p>
      </div>
    </BottomSheet>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal & { departments: string[] }; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="font-syne text-xl font-bold text-ink">{goal.name}</h2>
      <p className="mt-2 text-sm text-muted">Contributing departments and their individual contribution estimate.</p>
      <div className="mt-4 space-y-2">
        {goal.departments.map((department, index) => {
          const contribution = Math.max(20, Math.min(100, goal.percentComplete + (index % 2 === 0 ? 8 : -7)));
          return (
            <div key={department} className="rounded-lg border border-border p-3">
              <div className="flex justify-between text-sm font-bold"><span>{department}</span><span>{contribution}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className={clsx("h-full rounded-full", progressTone(contribution))} style={{ width: `${contribution}%` }} /></div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function BriefingText({ text }: { text: string }) {
  const sections = ["Overall Health", "Top Risk", "Top Strength", "Recommended Action"];
  return (
    <div className="mt-5 space-y-4">
      {sections.map((section, index) => {
        const next = sections[index + 1];
        const marker = text.includes(`${section} —`) ? `${section} —` : `${section} -`;
        const nextMarker = next ? (text.includes(`${next} —`) ? `${next} —` : `${next} -`) : "";
        const start = text.indexOf(marker);
        const end = nextMarker ? text.indexOf(nextMarker) : -1;
        const content = start >= 0 ? text.slice(start + marker.length, end > start ? end : undefined).trim() : "";
        return (
          <div key={section}>
            <p className="text-xs font-bold uppercase tracking-widest text-pulse">✦ {section}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/70">{content || text}</p>
          </div>
        );
      })}
    </div>
  );
}

function PersonMini({ employee, trendDown = false }: { employee: Employee; trendDown?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-paper p-3">
      <div><p className="text-sm font-bold text-ink">{employee.name}</p><p className="text-xs text-muted">{employee.department}</p></div>
      <span className={clsx("text-sm font-bold", trendDown ? "text-red" : scoreTone(employee.performanceScore))}>{trendDown ? "↓ " : ""}{employee.performanceScore}</span>
    </div>
  );
}

function SectionTitle({ children, icon: Icon }: { children: string; icon?: typeof BarChart2 }) {
  return <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">{Icon && <Icon size={15} className="text-pulse" />}{children}</div>;
}

function Stat({ title, value, note, accent = false }: { title: string; value: string | number; note?: string; accent?: boolean }) {
  return (
    <div className={clsx("rounded-lg border p-4", accent ? "border-pulse bg-pulse text-white" : "border-border bg-card")}>
      <p className={clsx("text-xs font-bold uppercase tracking-widest", accent ? "text-white/60" : "text-muted")}>{title}</p>
      <p className={clsx("mt-2 font-syne text-3xl font-bold", accent ? "text-white" : "text-ink")}>{value}</p>
      {note && <p className={clsx("mt-1 text-xs", accent ? "text-white/65" : "text-muted")}>{note}</p>}
    </div>
  );
}

function MiniChip({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "red" | "ink" }) {
  return <span className={clsx("rounded-full px-3 py-2 text-xs font-bold", tagClass(tone))}>{children}</span>;
}

function Toast({ message }: { message: string }) {
  return <div className="fixed left-1/2 top-4 z-[230] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-lg)]">{message}</div>;
}

function BottomSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[220]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[82vh] max-w-4xl overflow-y-auto rounded-t-[24px] bg-card p-5 shadow-[0_-12px_45px_rgba(0,0,0,0.2)]">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border" />
        {children}
      </div>
    </div>
  );
}
