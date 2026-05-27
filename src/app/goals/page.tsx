"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { Search, ChevronDown, Plus, X } from "lucide-react";
import { employees, departments } from "@/data/mockData";
import type { Goal, GoalType, GoalStatus } from "@/data/mockData";
import { useRole } from "@/context/RoleContext";
import Avatar from "@/components/ui/Avatar";
import ProgressBar from "@/components/ui/ProgressBar";
import { StatCard, SectionLabel } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoalWithOwner extends Goal {
  ownerId: string;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  ownerDept: string;
}

type FilterKey = "all" | "on_track" | "at_risk" | "completed";

interface GoalTask      { id: string; label: string; done: boolean; }
interface GoalHistoryPt { date: string; pct: number; }
interface GoalComment   { author: string; text: string; time: string; }
interface GoalMeta {
  description: string;
  tasks: GoalTask[];
  history: GoalHistoryPt[];
  comments: GoalComment[];
}

// ── Meta enrichment ───────────────────────────────────────────────────────────

const GOAL_META: Record<string, GoalMeta> = {
  g1: {
    description:
      "Coordinate the full Q2 product roadmap launch, aligning engineering, design, and stakeholders to deliver 8 planned features on schedule.",
    tasks: [
      { id: "t1", label: "Finalise roadmap with VP Product", done: true },
      { id: "t2", label: "Align Engineering on sprint plan", done: true },
      { id: "t3", label: "Stakeholder sign-off meeting", done: true },
      { id: "t4", label: "Launch comms to all-hands", done: false },
    ],
    history: [
      { date: "Apr 1", pct: 45 }, { date: "Apr 15", pct: 60 },
      { date: "May 1", pct: 74 }, { date: "May 15", pct: 88 },
    ],
    comments: [
      { author: "BA", text: "Excellent progress. Keep the momentum going.", time: "2d ago" },
      { author: "AO", text: "Final comms scheduled for June 28.", time: "1d ago" },
    ],
  },
  g2: {
    description:
      "Drive a cross-functional initiative to improve user retention by 15% through onboarding improvements and product engagement features.",
    tasks: [
      { id: "t1", label: "Identify retention drop-off points", done: true },
      { id: "t2", label: "Ship onboarding v2 flow", done: false },
      { id: "t3", label: "A/B test engagement nudges", done: false },
    ],
    history: [
      { date: "Apr 1", pct: 20 }, { date: "Apr 15", pct: 40 },
      { date: "May 1", pct: 55 }, { date: "May 15", pct: 65 },
    ],
    comments: [
      { author: "BA", text: "At risk — onboarding v2 needs to ship by June 1.", time: "3d ago" },
    ],
  },
  g6: {
    description:
      "Migrate the authentication service from legacy session-based auth to OAuth 2.0 with full backward compatibility and zero downtime.",
    tasks: [
      { id: "t1", label: "Audit existing auth flows", done: true },
      { id: "t2", label: "Implement OAuth provider integration", done: true },
      { id: "t3", label: "Write migration tests", done: false },
      { id: "t4", label: "Staged rollout to 10% of users", done: false },
    ],
    history: [
      { date: "Apr 1", pct: 20 }, { date: "Apr 15", pct: 40 },
      { date: "May 1", pct: 58 }, { date: "May 15", pct: 72 },
    ],
    comments: [{ author: "BA", text: "Good pace. Rollout plan looks solid.", time: "1d ago" }],
  },
  g16: {
    description:
      "Achieve the Q2 revenue target of $2.4M through enterprise deal closures and pipeline activation across all sales verticals.",
    tasks: [
      { id: "t1", label: "Close top 3 enterprise prospects", done: true },
      { id: "t2", label: "Activate 5 dormant pipeline accounts", done: false },
      { id: "t3", label: "Reach $2.4M by June 30", done: false },
    ],
    history: [
      { date: "Apr 1", pct: 40 }, { date: "Apr 15", pct: 55 },
      { date: "May 1", pct: 68 }, { date: "May 15", pct: 78 },
    ],
    comments: [
      { author: "ZC", text: "Strong trajectory. 6 weeks to close the remaining gap.", time: "4d ago" },
    ],
  },
  g36: {
    description:
      "Deliver accurate Q2 financial reports across all 8 cost centres with zero material errors, meeting all reporting deadlines.",
    tasks: [
      { id: "t1", label: "Reconcile all cost centre data", done: false },
      { id: "t2", label: "Correct April report errors", done: false },
      { id: "t3", label: "Final review with Finance Director", done: false },
    ],
    history: [
      { date: "Apr 1", pct: 30 }, { date: "Apr 15", pct: 40 },
      { date: "May 1", pct: 48 }, { date: "May 15", pct: 55 },
    ],
    comments: [
      { author: "HR", text: "Support plan being developed alongside this goal.", time: "2d ago" },
    ],
  },
};

// ── Derived data ──────────────────────────────────────────────────────────────

const initialGoals: GoalWithOwner[] = employees.flatMap((emp) =>
  emp.goals.map((g) => ({
    ...g,
    ownerId: emp.id,
    ownerName: emp.name,
    ownerInitials: emp.initials,
    ownerColor: emp.avatarColor,
    ownerDept: emp.department,
  }))
);

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<GoalStatus, { label: string; color: string; dot: string }> = {
  on_track:  { label: "On Track",  color: "text-green",  dot: "bg-green"  },
  at_risk:   { label: "At Risk",   color: "text-amber",  dot: "bg-amber"  },
  behind:    { label: "Behind",    color: "text-red",    dot: "bg-red"    },
  completed: { label: "Completed", color: "text-muted",  dot: "bg-border" },
};

const TYPE_BADGE: Record<GoalType, string> = {
  org:        "bg-ink text-white",
  dept:       "bg-pulse-soft text-pulse",
  team:       "bg-green-soft text-green",
  individual: "bg-border text-muted",
};

const TYPE_LABEL: Record<GoalType, string> = {
  org: "Org", dept: "Dept", team: "Team", individual: "Individual",
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "All"       },
  { key: "on_track",  label: "On Track"  },
  { key: "at_risk",   label: "At Risk"   },
  { key: "completed", label: "Completed" },
];

function matchesFilter(goal: GoalWithOwner, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "on_track") return goal.status === "on_track";
  if (filter === "at_risk") return goal.status === "at_risk" || goal.status === "behind";
  return goal.status === "completed";
}

function dueFmt(dueDate: string, includeYear = true) {
  return new Date(dueDate).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}),
  });
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  showOwner = false,
  compact = false,
  onSelect,
}: {
  goal: GoalWithOwner;
  showOwner?: boolean;
  compact?: boolean;
  onSelect: (g: GoalWithOwner) => void;
}) {
  const sm = STATUS_META[goal.status];

  return (
    <button
      onClick={() => onSelect(goal)}
      className="w-full text-left bg-card rounded-2xl p-4 border border-border"
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-sm font-semibold text-ink leading-snug flex-1 min-w-0 line-clamp-2">
          {goal.name}
        </p>
        <span className={clsx("shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded", TYPE_BADGE[goal.type])}>
          {TYPE_LABEL[goal.type]}
        </span>
      </div>

      {showOwner && (
        <div className="flex items-center gap-1.5 mb-2">
          <Avatar initials={goal.ownerInitials} color={goal.ownerColor} size="xs" />
          <span className="text-[11px] text-muted truncate">{goal.ownerName} · {goal.ownerDept}</span>
        </div>
      )}

      <ProgressBar value={goal.percentComplete} status={goal.status} height="thin" className="mb-2" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", sm.dot)} />
          <span className={clsx("text-xs font-medium", sm.color)}>{sm.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>{goal.percentComplete}%</span>
          {!compact && (
            <>
              <span>· {dueFmt(goal.dueDate, false)}</span>
              <span>· {goal.weight}%</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// ── GoalDetailSheet ───────────────────────────────────────────────────────────

function GoalDetailSheet({
  goal,
  canEdit,
  onClose,
  onUpdateProgress,
}: {
  goal: GoalWithOwner;
  canEdit: boolean;
  onClose: () => void;
  onUpdateProgress: (goalId: string, pct: number) => void;
}) {
  const meta = GOAL_META[goal.id] as GoalMeta | undefined;
  const sm   = STATUS_META[goal.status];
  const [draft, setDraft] = useState(goal.percentComplete);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-[88vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-10 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded", TYPE_BADGE[goal.type])}>
                  {TYPE_LABEL[goal.type]}
                </span>
                <div className="flex items-center gap-1">
                  <span className={clsx("w-1.5 h-1.5 rounded-full", sm.dot)} />
                  <span className={clsx("text-xs font-medium", sm.color)}>{sm.label}</span>
                </div>
                <span className="text-[11px] text-muted">Due {dueFmt(goal.dueDate)}</span>
              </div>
              <h2 className="text-base font-bold text-ink leading-snug" style={{ fontFamily: "var(--font-syne)" }}>
                {goal.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted"
            >
              <X size={14} />
            </button>
          </div>

          {/* Owner */}
          <div className="flex items-center gap-2.5">
            <Avatar initials={goal.ownerInitials} color={goal.ownerColor} size="sm" />
            <div>
              <p className="text-sm font-semibold text-ink">{goal.ownerName}</p>
              <p className="text-xs text-muted">{goal.ownerDept} · Weight {goal.weight}%</p>
            </div>
          </div>

          {/* Description */}
          {meta?.description && (
            <p className="text-sm text-muted leading-relaxed">{meta.description}</p>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Progress</span>
              <span className="text-sm font-bold text-ink">{canEdit ? draft : goal.percentComplete}%</span>
            </div>
            <ProgressBar value={canEdit ? draft : goal.percentComplete} status={goal.status} />
            {canEdit && (
              <div className="pt-1 space-y-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draft}
                  onChange={(e) => setDraft(Number(e.target.value))}
                  className="w-full accent-pulse"
                />
                <button
                  className="w-full py-2.5 bg-pulse text-white rounded-xl text-sm font-semibold"
                  onClick={() => { onUpdateProgress(goal.id, draft); onClose(); }}
                >
                  Save Progress
                </button>
              </div>
            )}
          </div>

          {/* Tasks */}
          {meta?.tasks && meta.tasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">Key Tasks</p>
              <div className="bg-paper rounded-xl divide-y divide-border overflow-hidden">
                {meta.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={clsx(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      t.done ? "bg-green border-green" : "border-border"
                    )}>
                      {t.done && <span className="text-white text-[9px] leading-none">✓</span>}
                    </div>
                    <span className={clsx("text-sm", t.done ? "line-through text-muted" : "text-ink")}>
                      {t.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress history */}
          {meta?.history && meta.history.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">Progress History</p>
              <div className="flex items-end gap-3" style={{ height: "72px" }}>
                {meta.history.map((h) => (
                  <div key={h.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end" style={{ height: "48px" }}>
                      <div
                        className="w-full bg-pulse rounded-sm opacity-80"
                        style={{ height: `${(h.pct / 100) * 48}px` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted">{h.date}</span>
                    <span className="text-[9px] font-semibold text-ink">{h.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {meta?.comments && meta.comments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">Comments</p>
              <div className="space-y-2">
                {meta.comments.map((c, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-ink text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {c.author}
                    </div>
                    <div className="flex-1 bg-paper rounded-xl px-3 py-2.5">
                      <p className="text-sm text-ink leading-snug">{c.text}</p>
                      <p className="text-[10px] text-muted mt-1">{c.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── GoalCreateSheet ───────────────────────────────────────────────────────────

function GoalCreateSheet({
  role,
  onClose,
  onCreate,
}: {
  role: string;
  onClose: () => void;
  onCreate: (goal: GoalWithOwner) => void;
}) {
  const [name,       setName]       = useState("");
  const [type,       setType]       = useState<GoalType>(role === "hr" ? "org" : "team");
  const [dueDate,    setDueDate]    = useState("2026-12-31");
  const [weight,     setWeight]     = useState(20);
  const [assignTo,   setAssignTo]   = useState(employees[0].id);
  const [alignedDept,setAlignedDept]= useState("Engineering");
  const deptNames = departments.map((d) => d.name);

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const emp = employees.find((e) => e.id === assignTo) ?? employees[0];
    onCreate({
      id: `g_${Date.now()}`,
      name: trimmed,
      type,
      percentComplete: 0,
      dueDate,
      weight,
      status: "on_track",
      ownerId: emp.id,
      ownerName: emp.name,
      ownerInitials: emp.initials,
      ownerColor: emp.avatarColor,
      ownerDept: emp.department,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
              Create Goal
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-border text-muted"
            >
              <X size={14} />
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              Goal Name
            </label>
            <input
              type="text"
              placeholder="e.g. Improve customer NPS by 15 pts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {(["org", "dept", "team", "individual"] as GoalType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={clsx(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                    type === t
                      ? "bg-pulse text-white border-pulse"
                      : "bg-card text-muted border-border"
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Assign to — manager only */}
          {role === "manager" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
                Assign To
              </label>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-pulse"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.department}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Aligned dept — HR only */}
          {role === "hr" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
                Aligned Department
              </label>
              <select
                value={alignedDept}
                onChange={(e) => setAlignedDept(e.target.value)}
                className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-pulse"
              >
                {deptNames.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          )}

          {/* Due date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-paper border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-pulse"
            />
          </div>

          {/* Weight */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted uppercase tracking-widest">
                Weight
              </label>
              <span className="text-sm font-bold text-ink">{weight}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-full accent-pulse"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full py-3 bg-pulse text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            Create Goal
          </button>
        </div>
      </div>
    </>
  );
}

// ── EmployeeView ──────────────────────────────────────────────────────────────

function EmployeeView({
  goals,
  filter,
  onSelect,
}: {
  goals: GoalWithOwner[];
  filter: FilterKey;
  onSelect: (g: GoalWithOwner) => void;
}) {
  const myGoals = goals
    .filter((g) => g.ownerId === employees[0].id && matchesFilter(g, filter))
    .sort((a, b) => b.weight - a.weight);

  const teamGoals = goals
    .filter((g) => (g.type === "team" || g.type === "dept") && g.ownerId !== employees[0].id && matchesFilter(g, filter))
    .slice(0, 4);

  const orgGoals = goals.filter(
    (g) => g.type === "org" && g.ownerId !== employees[0].id && matchesFilter(g, filter)
  );

  return (
    <>
      <section className="animate-fade-up px-4">
        <SectionLabel right={`${myGoals.length} goals`}>My Goals</SectionLabel>
        {myGoals.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <p className="text-sm text-muted">No goals match this filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myGoals.map((g) => <GoalCard key={g.id} goal={g} onSelect={onSelect} />)}
          </div>
        )}
      </section>

      {teamGoals.length > 0 && (
        <section className="animate-fade-up px-4">
          <SectionLabel>Team &amp; Dept Goals</SectionLabel>
          <div className="space-y-3">
            {teamGoals.map((g) => (
              <GoalCard key={g.id} goal={g} showOwner compact onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}

      {orgGoals.length > 0 && (
        <section className="animate-fade-up px-4">
          <SectionLabel>Org Goals</SectionLabel>
          <div className="space-y-3">
            {orgGoals.map((g) => (
              <GoalCard key={g.id} goal={g} showOwner compact onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── ManagerView ───────────────────────────────────────────────────────────────

function ManagerView({
  goals,
  filter,
  onSelect,
  onShowCreate,
}: {
  goals: GoalWithOwner[];
  filter: FilterKey;
  onSelect: (g: GoalWithOwner) => void;
  onShowCreate: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const teamGoals = goals.filter(
    (g) => (g.type === "team" || g.type === "dept") && matchesFilter(g, filter)
  );

  const byEmployee = useMemo(() => {
    const map = new Map<string, {
      ownerId: string; ownerName: string; ownerInitials: string;
      ownerColor: string; ownerDept: string; goals: GoalWithOwner[];
    }>();
    for (const g of goals.filter((g) => matchesFilter(g, filter))) {
      if (!map.has(g.ownerId)) {
        map.set(g.ownerId, {
          ownerId: g.ownerId, ownerName: g.ownerName, ownerInitials: g.ownerInitials,
          ownerColor: g.ownerColor, ownerDept: g.ownerDept, goals: [],
        });
      }
      map.get(g.ownerId)!.goals.push(g);
    }
    return Array.from(map.values());
  }, [goals, filter]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <section className="animate-fade-up px-4">
        <SectionLabel
          right={
            <button
              onClick={onShowCreate}
              className="flex items-center gap-1 text-xs font-semibold text-pulse"
            >
              <Plus size={12} />
              New Goal
            </button>
          }
        >
          Team Goals ({teamGoals.length})
        </SectionLabel>
        {teamGoals.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <p className="text-sm text-muted">No team goals match this filter.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {teamGoals.map((g) => <GoalCard key={g.id} goal={g} showOwner onSelect={onSelect} />)}
          </div>
        )}
      </section>

      <section className="animate-fade-up px-4">
        <SectionLabel>Individual Goals by Person</SectionLabel>
        <div className="space-y-3">
          {byEmployee.map(({ ownerId, ownerName, ownerInitials, ownerColor, ownerDept, goals: empGoals }) => {
            const isOpen    = !collapsed.has(ownerId);
            const onTrack   = empGoals.filter((g) => g.status === "on_track").length;
            const atRisk    = empGoals.filter((g) => g.status === "at_risk" || g.status === "behind").length;

            return (
              <div key={ownerId} className="bg-card rounded-2xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3"
                  onClick={() => toggle(ownerId)}
                >
                  <Avatar initials={ownerInitials} color={ownerColor} size="sm" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-ink">{ownerName}</p>
                    <p className="text-xs text-muted">{ownerDept} · {empGoals.length} goals</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onTrack > 0 && (
                      <span className="text-[10px] font-semibold text-green bg-green-soft px-1.5 py-0.5 rounded-full">
                        {onTrack} on track
                      </span>
                    )}
                    {atRisk > 0 && (
                      <span className="text-[10px] font-semibold text-red bg-red-soft px-1.5 py-0.5 rounded-full">
                        {atRisk} risk
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={clsx("text-muted transition-transform duration-200", isOpen && "rotate-180")}
                    />
                  </div>
                </button>
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: isOpen ? `${empGoals.length * 140}px` : "0px" }}
                >
                  <div className="px-3 pb-3 space-y-2">
                    {empGoals.map((g) => (
                      <GoalCard key={g.id} goal={g} compact onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ── HRView ────────────────────────────────────────────────────────────────────

function HRView({
  goals,
  filter,
  onSelect,
  onShowCreate,
}: {
  goals: GoalWithOwner[];
  filter: FilterKey;
  onSelect: (g: GoalWithOwner) => void;
  onShowCreate: () => void;
}) {
  const total          = goals.length;
  const onTrackCount   = goals.filter((g) => g.status === "on_track").length;
  const atRiskCount    = goals.filter((g) => g.status === "at_risk" || g.status === "behind").length;
  const completedCount = goals.filter((g) => g.status === "completed").length;
  const onTrackPct     = total > 0 ? Math.round((onTrackCount / total) * 100) : 0;

  const orgGoals = goals.filter((g) => g.type === "org" && matchesFilter(g, filter));

  return (
    <>
      <section className="animate-fade-up px-4">
        <SectionLabel>Goal Health Overview</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Goals"     value={total}           />
          <StatCard label="On Track"        value={`${onTrackPct}%`} sub="of all goals"   />
          <StatCard label="At Risk / Behind" value={atRiskCount}    sub="need attention"  />
          <StatCard label="Completed"        value={completedCount}                        />
        </div>
      </section>

      <section className="animate-fade-up px-4">
        <SectionLabel
          right={
            <button
              onClick={onShowCreate}
              className="flex items-center gap-1 text-xs font-semibold text-pulse"
            >
              <Plus size={12} />
              Create Org Goal
            </button>
          }
        >
          Org Goals ({orgGoals.length})
        </SectionLabel>
        {orgGoals.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <p className="text-sm text-muted">No org goals match this filter.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {orgGoals.map((g) => (
              <GoalCard key={g.id} goal={g} showOwner onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ── ExecutiveView ─────────────────────────────────────────────────────────────

function ExecutiveView({
  goals,
  filter,
  onSelect,
}: {
  goals: GoalWithOwner[];
  filter: FilterKey;
  onSelect: (g: GoalWithOwner) => void;
}) {
  const allOrg = goals.filter((g) => g.type === "org");
  const avgPct = allOrg.length
    ? Math.round(allOrg.reduce((s, g) => s + g.percentComplete, 0) / allOrg.length)
    : 0;
  const onTrackOrg = allOrg.filter(
    (g) => g.status === "on_track" || g.status === "completed"
  ).length;

  const visible = allOrg
    .filter((g) => matchesFilter(g, filter))
    .sort((a, b) => b.percentComplete - a.percentComplete);

  return (
    <>
      <section className="animate-fade-up px-4">
        <SectionLabel>Company Objectives</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Org Goals"    value={allOrg.length}    />
          <StatCard label="Avg Progress" value={`${avgPct}%`} accent />
          <StatCard label="On Track"     value={onTrackOrg}        />
        </div>
      </section>

      <section className="animate-fade-up px-4">
        <SectionLabel right={`${visible.length} shown`}>Strategic Objectives</SectionLabel>
        {visible.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <p className="text-sm text-muted">No org goals match this filter.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {visible.map((g) => (
              <GoalCard key={g.id} goal={g} showOwner onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ── GoalsPage ─────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const { role } = useRole();
  const [allGoals, setAllGoals]         = useState<GoalWithOwner[]>(initialGoals);
  const [filter, setFilter]             = useState<FilterKey>("all");
  const [search, setSearch]             = useState("");
  const [selectedGoal, setSelectedGoal] = useState<GoalWithOwner | null>(null);
  const [showCreate, setShowCreate]     = useState(false);

  function handleUpdateProgress(goalId: string, pct: number) {
    setAllGoals((prev) =>
      prev.map((g) =>
        g.id !== goalId ? g : {
          ...g,
          percentComplete: pct,
          status:
            pct >= 100 ? "completed" :
            pct >= 65  ? "on_track"  :
            pct >= 35  ? "at_risk"   : "behind",
        }
      )
    );
  }

  function handleCreate(goal: GoalWithOwner) {
    setAllGoals((prev) => [goal, ...prev]);
  }

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? allGoals.filter(
          (g) => g.name.toLowerCase().includes(q) || g.ownerName.toLowerCase().includes(q)
        )
      : allGoals;
  }, [allGoals, search]);

  const totalFiltered = searched.filter((g) => matchesFilter(g, filter)).length;

  return (
    <div className="dashboard-page space-y-5">

      {/* Header + search + filter chips */}
      <section className="animate-fade-up px-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
              Goals
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {totalFiltered} goal{totalFiltered !== 1 ? "s" : ""} · {role} view
            </p>
          </div>
          {(role === "manager" || role === "hr") && (
            <button
              onClick={() => setShowCreate(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-pulse text-white rounded-xl text-sm font-semibold"
            >
              <Plus size={14} />
              Goal
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search goals or people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pulse"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                filter === f.key
                  ? "bg-pulse text-white border-pulse"
                  : "bg-card text-muted border-border"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Role-aware content */}
      {role === "employee"  && (
        <EmployeeView goals={searched} filter={filter} onSelect={setSelectedGoal} />
      )}
      {role === "manager" && (
        <ManagerView
          goals={searched}
          filter={filter}
          onSelect={setSelectedGoal}
          onShowCreate={() => setShowCreate(true)}
        />
      )}
      {role === "hr" && (
        <HRView
          goals={searched}
          filter={filter}
          onSelect={setSelectedGoal}
          onShowCreate={() => setShowCreate(true)}
        />
      )}
      {role === "executive" && (
        <ExecutiveView goals={searched} filter={filter} onSelect={setSelectedGoal} />
      )}

      {/* Detail sheet */}
      {selectedGoal && (
        <GoalDetailSheet
          key={selectedGoal.id}
          goal={selectedGoal}
          canEdit={role === "manager" || role === "hr"}
          onClose={() => setSelectedGoal(null)}
          onUpdateProgress={handleUpdateProgress}
        />
      )}

      {/* Create sheet */}
      {showCreate && (
        <GoalCreateSheet
          role={role}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
