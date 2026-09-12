"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  Check,
  CheckCircle,
  ChevronDown,
  HelpCircle,
  Info,
  MessageCircle,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import type { AppraisalComponent, Goal, KPI } from "@/types";

type SubSection = "kpis" | "goals" | "charts" | "appraisal";
type MetricMode = "kpi" | "okr";
type TimeFilter = "cycle" | "quarter" | "six" | "year";

interface GoalTask {
  id: string;
  label: string;
  done: boolean;
}

interface GoalComment {
  id: string;
  author: string;
  body: string;
  time: string;
}

interface GoalState extends Goal {
  assignedBy: string;
  startDate: string;
  tasks: GoalTask[];
  history: { date: string; value: number; note: string }[];
  comments: GoalComment[];
}

interface UpdateDraft {
  value: number;
  note: string;
}

const sections: { key: SubSection; label: string }[] = [
  { key: "kpis", label: "KPIs & OKRs" },
  { key: "goals", label: "Goals" },
  { key: "charts", label: "Charts" },
  { key: "appraisal", label: "Appraisal" },
];

const timeFilters: { key: TimeFilter; label: string }[] = [
  { key: "cycle", label: "This Cycle" },
  { key: "quarter", label: "Last Quarter" },
  { key: "six", label: "6 Months" },
  { key: "year", label: "This Year" },
];

const appraisalSteps = [
  { label: "Cycle Opened", sub: "Jan 2026", status: "done" },
  { label: "Peer Feedback", sub: "Mar 2026", status: "done" },
  { label: "Self-Assessment", sub: "Due May 31", status: "current" },
  { label: "Manager Review", sub: "Jun 2026", status: "upcoming" },
  { label: "Final Results", sub: "Jun 30, 2026", status: "upcoming" },
] as const;

const historicalAppraisals = [
  {
    cycle: "Q1 2026",
    score: 86,
    rec: "Strong Performer",
    closed: "Mar 31, 2026",
    breakdown: [
      ["Goal Achievement", "34.2"],
      ["Report Consistency", "18.4"],
      ["KPI Performance", "22.8"],
      ["Peer Feedback", "4.6"],
    ],
  },
  {
    cycle: "Q4 2025",
    score: 82,
    rec: "Good Standing",
    closed: "Dec 22, 2025",
    breakdown: [
      ["Goal Achievement", "31.0"],
      ["Report Consistency", "17.2"],
      ["KPI Performance", "21.1"],
      ["Peer Feedback", "4.1"],
    ],
  },
  {
    cycle: "Q3 2025",
    score: 78,
    rec: "Good Standing",
    closed: "Sep 30, 2025",
    breakdown: [
      ["Goal Achievement", "29.8"],
      ["Report Consistency", "16.8"],
      ["KPI Performance", "18.9"],
      ["Peer Feedback", "3.9"],
    ],
  },
];

function formatValue(value: number | string, unit?: string) {
  if (typeof value === "string") return value;
  if (unit === "NGN") return `₦${Math.round(value).toLocaleString("en-NG")}`;
  if (unit === "%") return `${value}%`;
  if (unit === "x") return `${value}x`;
  if (unit === "pts") return `${value} pts`;
  return value.toLocaleString();
}

function compactValue(value: number | string, unit?: string) {
  if (typeof value === "string") return value;
  if (unit === "NGN") {
    if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  }
  return formatValue(value, unit);
}

function pctClass(value: number) {
  if (value >= 75) return "bg-green";
  if (value >= 50) return "bg-amber";
  return "bg-red";
}

function textClass(value: number) {
  if (value >= 75) return "text-green";
  if (value >= 50) return "text-amber";
  return "text-red";
}

function statusMeta(status: Goal["status"]) {
  if (status === "completed") return { label: "Completed", cls: "bg-green-soft text-green border-green/20" };
  if (status === "at_risk") return { label: "At Risk", cls: "bg-amber-soft text-amber border-amber/20" };
  if (status === "behind") return { label: "Overdue", cls: "bg-red-soft text-red border-red/20" };
  return { label: "On Track", cls: "bg-green-soft text-green border-green/20" };
}

function typeLabel(type: Goal["type"]) {
  return type === "org" ? "Org" : type === "dept" ? "Dept" : type === "team" ? "Team" : "Individual";
}

function typeClass(type: Goal["type"]) {
  if (type === "org") return "bg-ink text-white";
  if (type === "dept") return "bg-pulse-soft text-pulse";
  if (type === "team") return "bg-green-soft text-green";
  return "bg-border text-muted";
}

function makeGoalState(goal: Goal, index: number): GoalState {
  const doneCount = Math.max(1, Math.round(goal.percentComplete / 25));
  const tasks = ["Scope agreed", "Milestone delivered", "Stakeholder review", "Final sign-off"].map((label, i) => ({
    id: `${goal.id}-task-${i}`,
    label,
    done: i < doneCount || goal.status === "completed",
  }));
  return {
    ...goal,
    assignedBy: goal.type === "individual" ? "Line Manager" : goal.type === "org" ? "Executive Office" : "Department Lead",
    startDate: `2026-0${Math.min(index + 1, 5)}-01`,
    description: goal.description || `${goal.name} is tracked as part of the current performance cycle and contributes to the live appraisal score.`,
    tasks,
    history: [
      { date: "Apr 15", value: Math.max(5, goal.percentComplete - 24), note: "Initial update logged" },
      { date: "May 01", value: Math.max(10, goal.percentComplete - 12), note: "Progress reviewed with manager" },
      { date: "May 21", value: goal.percentComplete, note: "Latest cycle update" },
    ],
    comments: [
      { id: `${goal.id}-c1`, author: "BA", body: "Keep progress notes specific and evidence-based.", time: "2d ago" },
      { id: `${goal.id}-c2`, author: "AO", body: "Next milestone is already queued for review.", time: "1d ago" },
    ],
  };
}

function kpiAchievement(kpi: KPI) {
  if (!kpi.target) return 0;
  return Math.min(125, Math.round((kpi.current / kpi.target) * 100));
}

function weightedGoalScore(goals: GoalState[]) {
  const totalWeight = goals.reduce((sum, goal) => sum + goal.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(goals.reduce((sum, goal) => sum + goal.percentComplete * goal.weight, 0) / totalWeight);
}

function monthScores(baseScore: number, filter: TimeFilter) {
  const labels =
    filter === "year"
      ? ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"]
      : filter === "six"
        ? ["Dec", "Jan", "Feb", "Mar", "Apr", "May"]
        : ["Mar", "Apr", "May", "Jun"];
  return labels.map((label, i) => ({
    label,
    score: Math.max(45, Math.min(98, baseScore - (labels.length - i - 1) * 2 + (i % 2 ? 1 : -1))),
  }));
}

function PerformanceHero({
  score,
  badge,
  label = "Performance Score",
}: {
  score: number;
  badge: string;
  label?: string;
}) {
  return (
    <section className="px-4">
      <div className="rounded-lg bg-ink p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/65">{label}</p>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-[52px] font-semibold leading-none" style={{ fontFamily: "var(--font-syne)" }}>
                {score}
              </span>
              <span className="pb-1.5 text-2xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>
                %
              </span>
              <span className="pb-2 pl-2 text-sm font-semibold text-green">↑ +4 pts this month</span>
            </div>
          </div>
          <span className="rounded-full bg-pulse/20 px-2.5 py-1 text-[11px] font-semibold text-pulse">{badge}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${score}%`,
              background: "linear-gradient(90deg, #245de8, #6490f5)",
              animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
            }}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/65">Q2 2026 Cycle</span>
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/65">Appraisal: Jun 30</span>
        </div>
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-card p-1">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={clsx(
            "flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors md:text-sm",
            value === item.key ? "bg-ink text-white" : "text-muted hover:text-ink",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function KpiCard({
  kpi,
  entryMode,
  onHelp,
}: {
  kpi: KPI;
  entryMode: boolean;
  onHelp: (text: string) => void;
}) {
  const achieved = kpiAchievement(kpi);
  const TrendIcon = kpi.trend === "down" ? TrendingDown : TrendingUp;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-ink">{kpi.name}</p>
            <button
              onClick={() => onHelp(`${kpi.name} compares your current value against the target and applies its ${kpi.weight}% weighting in the cycle.`)}
              className="text-muted"
              aria-label={`Explain ${kpi.name}`}
            >
              {entryMode ? <HelpCircle size={14} /> : <Info size={14} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            {compactValue(kpi.current, kpi.unit)} / {compactValue(kpi.target, kpi.unit)} target
          </p>
        </div>
        <span className="rounded-full bg-paper px-2 py-1 text-[10px] font-semibold text-muted">{kpi.weight}% weight</span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <p className={clsx("text-3xl font-semibold leading-none", textClass(achieved))} style={{ fontFamily: "var(--font-syne)" }}>
          {achieved}%
        </p>
        <span className={clsx("flex items-center gap-1 text-xs font-semibold", kpi.trend === "down" ? "text-red" : "text-green")}>
          <TrendIcon size={14} />
          vs last period
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
        <div className={clsx("h-full rounded-full", pctClass(achieved))} style={{ width: `${Math.min(100, achieved)}%` }} />
      </div>
    </div>
  );
}

function OkrCard({
  title,
  goals,
  open,
  onToggle,
}: {
  title: string;
  goals: GoalState[];
  open: boolean;
  onToggle: () => void;
}) {
  const progress = weightedGoalScore(goals);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="mt-1 text-xs text-muted">{goals.length} key results</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>{progress}%</span>
            <ChevronDown className={clsx("text-muted transition-transform", open && "rotate-180")} size={16} />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
          <div className={clsx("h-full rounded-full", pctClass(progress))} style={{ width: `${progress}%` }} />
        </div>
      </button>
      <div className={clsx("grid transition-all", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="divide-y divide-border border-t border-border">
            {goals.map((goal) => (
              <div key={goal.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-pulse text-xs font-semibold text-white">AO</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{goal.name}</p>
                  <p className="text-xs text-muted">Target 100% · current {goal.percentComplete}% · due {formatShortDate(goal.dueDate)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                    <div className={clsx("h-full rounded-full", pctClass(goal.percentComplete))} style={{ width: `${goal.percentComplete}%` }} />
                  </div>
                </div>
                <span className="text-sm font-semibold text-ink">{goal.percentComplete}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function GoalCard({ goal, onSelect }: { goal: GoalState; onSelect: (goal: GoalState) => void }) {
  const meta = statusMeta(goal.status);
  return (
    <button onClick={() => onSelect(goal)} className="w-full rounded-lg border border-border bg-card p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", typeClass(goal.type))}>{typeLabel(goal.type)}</span>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{goal.name}</p>
          <p className="mt-1 text-xs text-muted">Due {formatShortDate(goal.dueDate)} · {goal.weight}% weight · {goal.assignedBy}</p>
        </div>
        <p className="text-2xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>{goal.percentComplete}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
        <div className={clsx("h-full rounded-full", pctClass(goal.percentComplete))} style={{ width: `${goal.percentComplete}%` }} />
      </div>
      <span className={clsx("mt-3 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold", meta.cls)}>{meta.label}</span>
    </button>
  );
}

function GoalGroup({
  title,
  goals,
  defaultOpen = true,
  interactive = false,
  onSelect,
}: {
  title: string;
  goals: GoalState[];
  defaultOpen?: boolean;
  interactive?: boolean;
  onSelect: (goal: GoalState) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title}</span>
        <ChevronDown size={16} className={clsx("text-muted transition-transform", open && "rotate-180")} />
      </button>
      <div className={clsx("grid transition-all", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
            {goals.length ? goals.map((goal) => <GoalCard key={goal.id} goal={goal} onSelect={onSelect} />) : <p className="text-sm text-muted">No goals in this layer.</p>}
            {!interactive && goals.length > 0 && <p className="md:col-span-2 text-xs text-muted">Read-only layer for this cadre.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttView({ goals, todayTime }: { goals: GoalState[]; todayTime: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Goal Tracker</p>
        <span className="text-xs text-muted">Jan → Jun</span>
      </div>
      <div className="relative space-y-3">
        <div className="absolute bottom-0 top-0 w-px bg-pulse/60" style={{ left: "78%" }}>
          <span className="absolute -top-4 -translate-x-1/2 text-[10px] font-semibold text-pulse">Today</span>
        </div>
        {goals.map((goal, index) => {
          const start = Math.min(70, 8 + index * 8);
          const width = Math.max(18, 86 - start);
          const dueSoon = (new Date(goal.dueDate).getTime() - todayTime) / 86_400_000 < 14 && goal.percentComplete < 60;
          return (
            <div key={goal.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-ink">{goal.name}</p>
                {dueSoon && <span className="text-[10px] font-semibold text-red">At risk</span>}
              </div>
              <div className="h-5 rounded-full bg-paper">
                <div className="h-full rounded-full bg-border" style={{ marginLeft: `${start}%`, width: `${width}%` }}>
                  <div className={clsx("h-full rounded-full", pctClass(goal.percentComplete))} style={{ width: `${goal.percentComplete}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalGauge({ percent, onTrack, total }: { percent: number; onTrack: number; total: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-center">
      <svg viewBox="0 0 140 140" className="mx-auto h-40 w-40">
        <defs>
          <linearGradient id="goalGauge" x1="0" x2="1">
            <stop offset="0%" stopColor="#245de8" />
            <stop offset="100%" stopColor="#1a7a4a" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#dfe6ef" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="url(#goalGauge)"
          strokeLinecap="round"
          strokeWidth="12"
          strokeDasharray={c}
          strokeDashoffset={c - (percent / 100) * c}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="76" textAnchor="middle" fontSize="28" fontWeight="800" fill="#182438" fontFamily="Inter, sans-serif">
          {percent}%
        </text>
      </svg>
      <p className="text-sm text-muted">{onTrack} of {total} goals on track</p>
    </div>
  );
}

function GoalsBarChart({ goals }: { goals: GoalState[] }) {
  const chartGoals = goals.slice(0, 5);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-ink">Goals vs Achieved</p>
      <svg viewBox="0 0 340 180" className="h-56 w-full">
        {[25, 50, 75, 100].map((line) => (
          <line key={line} x1="24" x2="330" y1={150 - line * 1.2} y2={150 - line * 1.2} stroke="#dfe6ef" strokeDasharray="4 4" />
        ))}
        {chartGoals.map((goal, i) => {
          const x = 40 + i * 58;
          const achievedHeight = goal.percentComplete * 1.2;
          return (
            <g key={goal.id}>
              <rect x={x} y={30} width="18" height="120" rx="4" fill="#eaf0f7" />
              <rect x={x + 22} y={150 - achievedHeight} width="18" height={achievedHeight} rx="4" fill="#245de8" />
              <text x={x + 20} y="170" textAnchor="middle" fontSize="9" fill="#66758a">{goal.name.slice(0, 8)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TrendLine({
  data,
  activePoint,
  onPoint,
}: {
  data: { label: string; score: number }[];
  activePoint: number | null;
  onPoint: (index: number | null) => void;
}) {
  const points = data.map((item, i) => {
    const x = 24 + i * (280 / Math.max(1, data.length - 1));
    const y = 142 - ((item.score - 40) / 60) * 108;
    return { ...item, x, y };
  });
  const d = points.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-ink">Performance Score Trend</p>
      <svg viewBox="0 0 330 170" className="h-56 w-full">
        <path d={d} fill="none" stroke="#245de8" strokeWidth="3" />
        {points.map((point, i) => (
          <g key={point.label}>
            <button onMouseEnter={() => onPoint(i)} onMouseLeave={() => onPoint(null)} onClick={() => onPoint(activePoint === i ? null : i)}>
              <circle cx={point.x} cy={point.y} r="5" fill="#245de8" />
            </button>
            <text x={point.x} y="162" textAnchor="middle" fontSize="9" fill="#66758a">{point.label}</text>
            {activePoint === i && (
              <g>
                <rect x={point.x - 22} y={point.y - 34} width="44" height="22" rx="5" fill="#182438" />
                <text x={point.x} y={point.y - 19} textAnchor="middle" fontSize="10" fill="white">{point.score}%</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function KpiHeatmap({
  kpis,
  months,
  activeCell,
  onCell,
}: {
  kpis: KPI[];
  months: string[];
  activeCell: string | null;
  onCell: (value: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-ink">KPI Achievement Heatmap</p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-1" style={{ gridTemplateColumns: `120px repeat(${months.length}, minmax(42px, 1fr))` }}>
          <div />
          {months.map((month) => <p key={month} className="text-center text-[10px] font-semibold text-muted">{month}</p>)}
          {kpis.map((kpi, row) => (
            <>
              <p key={`${kpi.id}-label`} className="truncate text-xs font-semibold text-ink">{kpi.name}</p>
              {months.map((month, col) => {
                const value = Math.max(35, Math.min(120, kpiAchievement(kpi) - (months.length - col - 1) * 5 + row * 3));
                const color = value >= 105 ? "bg-green" : value >= 90 ? "bg-green-soft" : value >= 70 ? "bg-amber-soft" : "bg-red-soft";
                const key = `${kpi.id}-${month}`;
                return (
                  <button
                    key={key}
                    onClick={() => onCell(activeCell === key ? null : key)}
                    className={clsx("relative h-9 rounded", color)}
                    title={`${kpi.name} ${month}: ${value}%`}
                  >
                    {activeCell === key && <span className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded bg-ink px-2 py-1 text-[10px] font-semibold text-white">{value}%</span>}
                  </button>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

function DonutChart({ value }: { value: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <p className="mb-3 text-sm font-semibold text-ink">Team Contribution</p>
      <svg viewBox="0 0 120 120" className="mx-auto h-36 w-36">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#dfe6ef" strokeWidth="14" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#245de8" strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} transform="rotate(-90 60 60)" />
        <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="800" fill="#182438" fontFamily="Inter, sans-serif">{value}%</text>
      </svg>
      <p className="text-xs text-muted">Estimated contribution to team goal progress</p>
    </div>
  );
}

function AppraisalMatrix({
  components,
  goalScore,
  kpiScore,
  peerRating,
}: {
  components: AppraisalComponent[];
  goalScore: number;
  kpiScore: number;
  peerRating: number;
}) {
  const rows = components.map((component) => {
    const normalizedScore =
      component.name.toLowerCase().includes("goal")
        ? goalScore
        : component.name.toLowerCase().includes("kpi")
          ? kpiScore
          : component.name.toLowerCase().includes("peer")
            ? Math.round(peerRating * 20)
            : component.score;
    return {
      ...component,
      score: component.status === "pending" ? null : normalizedScore,
      weighted: component.status === "pending" ? null : (normalizedScore * component.weight) / 100,
    };
  });
  const total = rows.reduce((sum, row) => sum + (row.weighted ?? 0), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[1fr_58px_58px_78px] gap-2 border-b border-border px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
        <span>Component</span>
        <span>Weight</span>
        <span>Score</span>
        <span>Weighted</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_58px_58px_78px] gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0">
          <div>
            <p className="font-semibold text-ink">{row.name}</p>
            {row.status === "pending" && <p className="text-[11px] text-muted">Expected Jun 2026</p>}
          </div>
          <span className="text-muted">{row.weight}%</span>
          <span className="font-semibold text-ink">{row.score === null ? "Pending" : row.name.toLowerCase().includes("peer") ? `${peerRating}/5` : `${row.score}%`}</span>
          <span className="font-semibold text-ink">{row.weighted === null ? "—" : row.weighted.toFixed(1)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_58px_58px_78px] gap-2 bg-paper px-4 py-3 text-sm font-semibold text-ink">
        <span>Total</span>
        <span>100%</span>
        <span />
        <span>{total.toFixed(1)} / 100</span>
      </div>
    </div>
  );
}

function Timeline() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {appraisalSteps.map((step, i) => {
        const done = step.status === "done";
        const current = step.status === "current";
        return (
          <div key={step.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={clsx("flex h-5 w-5 items-center justify-center rounded-full", done ? "bg-green" : current ? "bg-pulse animate-pulse" : "border-2 border-border bg-card")}>
                {done && <CheckCircle size={12} className="text-white" />}
              </div>
              {i < appraisalSteps.length - 1 && <div className="my-1 h-9 w-px bg-border" />}
            </div>
            <div className={clsx("pt-0.5", i < appraisalSteps.length - 1 && "pb-2")}>
              <p className={clsx("text-sm font-semibold", done ? "text-green" : current ? "text-ink" : "text-muted")}>{step.label}</p>
              <p className={clsx("mt-0.5 text-xs", current ? "text-pulse" : "text-muted")}>{step.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/45" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-h-[88vh] max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </>
  );
}

export default function PerformancePage() {
  const { user } = useUser();
  const [activeSection, setActiveSection] = useState<SubSection>("kpis");
  const [metricMode, setMetricMode] = useState<MetricMode>(user.cadre === "executive" ? "okr" : "kpi");
  const [openOkr, setOpenOkr] = useState("org");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("cycle");
  const [goals, setGoals] = useState<GoalState[]>(() => user.goals.map(makeGoalState));
  const [selectedGoal, setSelectedGoal] = useState<GoalState | null>(null);
  const [updateDraft, setUpdateDraft] = useState<UpdateDraft | null>(null);
  const [comment, setComment] = useState("");
  const [helpText, setHelpText] = useState<string | null>(null);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [activeTrendPoint, setActiveTrendPoint] = useState<number | null>(null);
  const [activeHeatCell, setActiveHeatCell] = useState<string | null>(null);
  const [todayTime] = useState(() => Date.now());

  const entryMode = user.cadre === "entry";
  const executiveMode = user.cadre === "executive";
  const showToggle = !entryMode && !executiveMode;
  const effectiveMetricMode = executiveMode ? "okr" : entryMode ? "kpi" : metricMode;
  const goalScore = weightedGoalScore(goals);
  const kpiScore = Math.round(user.kpis.reduce((sum, kpi) => sum + Math.min(100, kpiAchievement(kpi)) * kpi.weight, 0) / Math.max(1, user.kpis.reduce((sum, kpi) => sum + kpi.weight, 0)));
  const onTrackGoals = goals.filter((goal) => goal.status === "on_track" || goal.status === "completed").length;
  const trendData = monthScores(user.performanceScore, timeFilter);
  const months = trendData.map((item) => item.label);
  const teamContribution = Math.min(78, Math.max(22, Math.round(goalScore * 0.62)));

  function updateGoal(next: GoalState) {
    setGoals((prev) => prev.map((goal) => (goal.id === next.id ? next : goal)));
    setSelectedGoal(next);
  }

  function toggleTask(taskId: string) {
    if (!selectedGoal) return;
    const tasks = selectedGoal.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
    const pct = Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100);
    const next: GoalState = {
      ...selectedGoal,
      tasks,
      percentComplete: pct,
      status: pct >= 100 ? "completed" : pct >= 65 ? "on_track" : pct >= 35 ? "at_risk" : "behind",
      history: [...selectedGoal.history, { date: "Today", value: pct, note: "Task checklist updated" }],
    };
    updateGoal(next);
  }

  function saveProgress() {
    if (!selectedGoal || !updateDraft) return;
    const pct = updateDraft.value;
    const next: GoalState = {
      ...selectedGoal,
      percentComplete: pct,
      status: pct >= 100 ? "completed" : pct >= 65 ? "on_track" : pct >= 35 ? "at_risk" : "behind",
      history: [...selectedGoal.history, { date: "Today", value: pct, note: updateDraft.note || "Manual progress update" }],
    };
    updateGoal(next);
    setUpdateDraft(null);
  }

  function addComment() {
    if (!selectedGoal || !comment.trim()) return;
    const next = {
      ...selectedGoal,
      comments: [...selectedGoal.comments, { id: `${selectedGoal.id}-${Date.now()}`, author: user.initials, body: comment.trim(), time: "Just now" }],
    };
    updateGoal(next);
    setComment("");
  }

  const groupedGoals = {
    org: goals.filter((goal) => goal.type === "org"),
    dept: goals.filter((goal) => goal.type === "dept"),
    team: goals.filter((goal) => goal.type === "team"),
    individual: goals.filter((goal) => goal.type === "individual"),
  };

  return (
    <div className="dashboard-page space-y-5">
      <section className="px-4">
        <Segmented value={activeSection} items={sections} onChange={setActiveSection} />
      </section>

      {activeSection === "kpis" && (
        <>
          <PerformanceHero score={user.performanceScore} badge={user.badge} />
          {showToggle && (
            <section className="px-4">
              <Segmented
                value={metricMode}
                items={[{ key: "kpi", label: "KPI View" }, { key: "okr", label: "OKR View" }]}
                onChange={setMetricMode}
              />
            </section>
          )}
          {entryMode && (
            <section className="px-4">
              <div className="rounded-lg border border-pulse/20 bg-pulse-soft p-3 text-xs font-semibold text-pulse">
                Entry view shows guided KPI cards only. Tap each help icon to understand the metric.
              </div>
            </section>
          )}
          {effectiveMetricMode === "kpi" ? (
            <section className="grid gap-3 px-4 md:grid-cols-2">
              {user.kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} entryMode={entryMode} onHelp={setHelpText} />)}
            </section>
          ) : (
            <section className="space-y-3 px-4">
              <OkrCard title="Company Objectives" goals={groupedGoals.org} open={openOkr === "org"} onToggle={() => setOpenOkr(openOkr === "org" ? "" : "org")} />
              <OkrCard title="Department Objectives" goals={groupedGoals.dept} open={openOkr === "dept"} onToggle={() => setOpenOkr(openOkr === "dept" ? "" : "dept")} />
              <OkrCard title="Team Objectives" goals={groupedGoals.team} open={openOkr === "team"} onToggle={() => setOpenOkr(openOkr === "team" ? "" : "team")} />
            </section>
          )}
        </>
      )}

      {activeSection === "goals" && (
        <section className="space-y-4 px-4">
          <GoalGroup title="Org Goals" goals={groupedGoals.org} interactive={false} onSelect={setSelectedGoal} />
          {(user.cadre !== "entry" || groupedGoals.dept.length > 0) && <GoalGroup title="Dept Goals" goals={groupedGoals.dept} interactive={user.cadre !== "entry"} onSelect={setSelectedGoal} />}
          <GoalGroup title="Team Goals" goals={groupedGoals.team} interactive={user.cadre !== "entry"} onSelect={setSelectedGoal} />
          <GoalGroup title="My Goals" goals={groupedGoals.individual} interactive onSelect={setSelectedGoal} />
          <GanttView goals={goals} todayTime={todayTime} />
        </section>
      )}

      {activeSection === "charts" && (
        <>
          <section className="px-4">
            <Segmented value={timeFilter} items={timeFilters} onChange={setTimeFilter} />
          </section>
          <section className="grid gap-4 px-4 lg:grid-cols-2">
            <GoalGauge percent={goalScore} onTrack={onTrackGoals} total={goals.length} />
            <GoalsBarChart goals={goals} />
            <TrendLine data={trendData} activePoint={activeTrendPoint} onPoint={setActiveTrendPoint} />
            <KpiHeatmap kpis={user.kpis} months={months} activeCell={activeHeatCell} onCell={setActiveHeatCell} />
            {(user.peopleResponsibility !== "none" || user.cadre !== "entry") && <DonutChart value={teamContribution} />}
          </section>
        </>
      )}

      {activeSection === "appraisal" && (
        <>
          <PerformanceHero score={Math.round((goalScore * 0.35) + (user.consistencyIndex * 0.2) + (kpiScore * 0.25) + (user.peerRating * 20 * 0.05))} badge="Live Score" label="Live Score" />
          <section className="space-y-3 px-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Score Breakdown</p>
              <button onClick={() => setFormulaOpen(true)} className="text-xs font-semibold text-pulse">How is this calculated?</button>
            </div>
            <AppraisalMatrix components={user.appraisalComponents} goalScore={goalScore} kpiScore={kpiScore} peerRating={user.peerRating} />
          </section>
          <section className="space-y-3 px-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Appraisal Status</p>
            <Timeline />
          </section>
          <section className="space-y-3 px-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Historical Appraisals</p>
            <div className="space-y-2">
              {historicalAppraisals.map((item) => (
                <div key={item.cycle} className="rounded-lg border border-border bg-card">
                  <button onClick={() => setExpandedHistory(expandedHistory === item.cycle ? null : item.cycle)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.cycle}</p>
                      <p className="text-xs text-muted">Closed {item.closed} · {item.rec}</p>
                    </div>
                    <span className="text-xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>{item.score}</span>
                  </button>
                  {expandedHistory === item.cycle && (
                    <div className="border-t border-border px-4 py-3">
                      {item.breakdown.map(([label, value]) => (
                        <div key={label} className="flex justify-between py-1 text-sm">
                          <span className="text-muted">{label}</span>
                          <span className="font-semibold text-ink">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-green">Your score has improved {historicalAppraisals[0].score - historicalAppraisals[2].score} points over the last 4 quarters.</p>
          </section>
        </>
      )}

      {helpText && (
        <BottomSheet onClose={() => setHelpText(null)}>
          <div className="flex items-start gap-3">
            <HelpCircle size={18} className="mt-0.5 text-pulse" />
            <div>
              <p className="text-base font-semibold text-ink">Metric guidance</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{helpText}</p>
            </div>
          </div>
        </BottomSheet>
      )}

      {selectedGoal && (
        <BottomSheet onClose={() => { setSelectedGoal(null); setUpdateDraft(null); }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", typeClass(selectedGoal.type))}>{typeLabel(selectedGoal.type)}</span>
              <h2 className="mt-2 text-lg font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>{selectedGoal.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{selectedGoal.description}</p>
            </div>
            <button onClick={() => setSelectedGoal(null)} className="text-muted"><X size={18} /></button>
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Tasks</p>
            {selectedGoal.tasks.map((task) => (
              <button key={task.id} onClick={() => toggleTask(task.id)} className="flex w-full items-center gap-3 rounded-lg bg-paper px-3 py-2 text-left">
                <span className={clsx("flex h-5 w-5 items-center justify-center rounded-full border", task.done ? "border-green bg-green text-white" : "border-border")}>{task.done && <Check size={12} />}</span>
                <span className={clsx("text-sm", task.done ? "text-muted line-through" : "text-ink")}>{task.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Progress History</p>
            {selectedGoal.history.map((item, index) => (
              <div key={`${item.date}-${index}`} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-pulse" />
                <div>
                  <p className="text-sm font-semibold text-ink">{item.value}% · {item.date}</p>
                  <p className="text-xs text-muted">{item.note}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Comments</p>
            {selectedGoal.comments.map((item) => (
              <div key={item.id} className="rounded-lg bg-paper px-3 py-2">
                <p className="text-sm text-ink"><span className="font-semibold">{item.author}</span> {item.body}</p>
                <p className="mt-1 text-[10px] text-muted">{item.time}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-pulse" />
              <button onClick={addComment} className="rounded-lg bg-ink px-3 py-2 text-white"><MessageCircle size={15} /></button>
            </div>
          </div>

          <div className="mt-5">
            {updateDraft ? (
              <div className="rounded-lg border border-border bg-paper p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Update Progress</p>
                  <span className="text-sm font-semibold text-pulse">{updateDraft.value}%</span>
                </div>
                <input type="range" min={0} max={100} value={updateDraft.value} onChange={(event) => setUpdateDraft({ ...updateDraft, value: Number(event.target.value) })} className="mt-3 w-full accent-pulse" />
                <textarea value={updateDraft.note} onChange={(event) => setUpdateDraft({ ...updateDraft, note: event.target.value })} placeholder="Add update note" className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-pulse" />
                <button onClick={saveProgress} className="mt-3 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white">Save Progress</button>
              </div>
            ) : (
              <button onClick={() => setUpdateDraft({ value: selectedGoal.percentComplete, note: "" })} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white">Update Progress</button>
            )}
          </div>
        </BottomSheet>
      )}

      {formulaOpen && (
        <BottomSheet onClose={() => setFormulaOpen(false)}>
          <p className="text-base font-semibold text-ink">How the live score is calculated</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pulse multiplies each component score by its weight, then adds the weighted values. Goal Achievement is recalculated from your current goal progress, so ticking tasks or moving a goal slider updates this table immediately.
          </p>
          <div className="mt-4 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white">
            Score = sum(component score × component weight)
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
