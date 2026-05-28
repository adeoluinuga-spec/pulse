"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  FileText,
  MessageSquare,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { employees } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Employee, Goal, GoalStatus, GoalType } from "@/types";
import Celebration from "@/components/ui/Celebration";

type FilterKey = "all" | "on_track" | "at_risk" | "completed" | "overdue";
type GoalView = "entry" | "mid" | "manager" | "senior_manager" | "hr" | "executive";

interface GoalRecord extends Goal {
  ownerId: string;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  ownerDept: string;
  startDate: string;
  targetMetric: string;
  parentGoalId?: string;
  contributors: string[];
  managerNote?: string;
}

interface GoalTask {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  done: boolean;
}

interface GoalHistory {
  id: string;
  date: string;
  oldPct: number;
  newPct: number;
  note?: string;
}

interface GoalComment {
  id: string;
  author: string;
  text: string;
  date: string;
}

interface GoalMeta {
  tasks: GoalTask[];
  history: GoalHistory[];
  comments: GoalComment[];
  files: string[];
  contributeNote?: string;
}

const today = new Date("2026-05-28");

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on_track", label: "On Track" },
  { key: "at_risk", label: "At Risk" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

const typeBadge: Record<GoalType, string> = {
  org: "bg-ink text-white",
  dept: "bg-pulse text-white",
  team: "bg-green text-white",
  individual: "bg-amber text-white",
};

const typeLabel: Record<GoalType, string> = {
  org: "Org",
  dept: "Dept",
  team: "Team",
  individual: "Individual",
};

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - today.getTime()) / 86_400_000);
}

function fmt(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

function statusFor(percent: number): GoalStatus {
  if (percent >= 100) return "completed";
  if (percent >= 65) return "on_track";
  if (percent >= 35) return "at_risk";
  return "behind";
}

function statusLabel(goal: GoalRecord) {
  if (isOverdue(goal)) return "Overdue";
  if (goal.status === "on_track") return "On Track";
  if (goal.status === "completed") return "Completed";
  return "At Risk";
}

function isOverdue(goal: GoalRecord) {
  return goal.status !== "completed" && daysUntil(goal.dueDate) < 0;
}

function progressColor(percent: number, overdue = false) {
  if (overdue) return "bg-red";
  if (percent >= 75) return "bg-green";
  if (percent >= 50) return "bg-amber";
  return "bg-red";
}

function statusClass(goal: GoalRecord) {
  if (isOverdue(goal)) return "bg-red-soft text-red border-red/20";
  if (goal.status === "completed") return "bg-green-soft text-green border-green/20";
  if (goal.status === "on_track") return "bg-green-soft text-green border-green/20";
  return "bg-amber-soft text-amber border-amber/20";
}

function initialGoals(): GoalRecord[] {
  return employees.flatMap((employee, employeeIndex) =>
    employee.goals.map((goal, goalIndex) => ({
      ...goal,
      description: goal.description || `${goal.name} supports ${employee.department}'s contribution to the active Q2 performance cycle.`,
      ownerId: employee.id,
      ownerName: employee.name,
      ownerInitials: employee.initials,
      ownerColor: employee.avatarColor,
      ownerDept: employee.department,
      startDate: goalIndex % 2 === 0 ? "2026-04-01" : "2026-05-01",
      targetMetric: goal.name.includes("Revenue") ? "Revenue target" : goal.name.includes("Certification") ? "Certificate completion" : "100% completion",
      contributors: [employee.id, employees[(employeeIndex + 1) % employees.length].id],
      managerNote: goal.status === "at_risk" || goal.status === "behind" ? "Needs tighter weekly tracking." : undefined,
    }))
  );
}

function makeMeta(goals: GoalRecord[]): Record<string, GoalMeta> {
  return Object.fromEntries(
    goals.map((goal) => {
      const assignee = goal.ownerName;
      const taskCount = goal.type === "individual" ? 3 : 4;
      const doneCount = Math.round((goal.percentComplete / 100) * taskCount);
      return [
        goal.id,
        {
          tasks: Array.from({ length: taskCount }, (_, index) => ({
            id: `${goal.id}-task-${index}`,
            title: ["Define success metric", "Complete milestone work", "Share progress update", "Final review and sign-off"][index],
            assignee,
            dueDate: index < 2 ? "2026-06-15" : goal.dueDate,
            done: index < doneCount,
          })),
          history: [
            { id: `${goal.id}-h1`, date: "Apr 15", oldPct: 0, newPct: Math.max(10, goal.percentComplete - 28), note: "Baseline set" },
            { id: `${goal.id}-h2`, date: "May 15", oldPct: Math.max(10, goal.percentComplete - 28), newPct: goal.percentComplete, note: "Latest update" },
          ],
          comments: [
            { id: `${goal.id}-c1`, author: goal.ownerInitials, text: "Progress updated for the current cycle.", date: "2d ago" },
          ],
          files: [`${goal.name.slice(0, 22)} plan.pdf`, "Progress evidence.docx"],
          contributeNote: `Your work contributes through ${goal.ownerDept} delivery metrics.`,
        },
      ];
    })
  );
}

function deriveView(user: Employee): GoalView {
  if (user.platformRole === "hr_admin" || user.platformRole === "super_admin") return "hr";
  if (user.platformRole === "executive_view") return "executive";
  if (user.peopleResponsibility === "senior_manager" || user.peopleResponsibility === "director") return "senior_manager";
  if (user.peopleResponsibility === "manager") return "manager";
  if (user.cadre === "entry") return "entry";
  return "mid";
}

function canEditGoal(goal: GoalRecord, user: Employee, view: GoalView) {
  if (view === "hr") return goal.type === "org";
  if (view === "executive") return false;
  if (view === "senior_manager") return goal.type !== "org" || goal.contributors.includes(user.id);
  if (view === "manager") return goal.type === "team" || goal.ownerId === user.id;
  if (view === "mid") return goal.ownerId === user.id || goal.contributors.includes(user.id);
  return goal.ownerId === user.id && goal.type === "individual";
}

function matchesFilter(goal: GoalRecord, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "overdue") return isOverdue(goal);
  if (filter === "completed") return goal.status === "completed";
  if (filter === "at_risk") return goal.status === "at_risk" || goal.status === "behind";
  return goal.status === "on_track";
}

export default function GoalsPage() {
  const { user } = useUser();
  const view = deriveView(user);
  const [goals, setGoals] = useState<GoalRecord[]>(() => initialGoals());
  const [meta, setMeta] = useState<Record<string, GoalMeta>>(() => makeMeta(initialGoals()));
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [timeline, setTimeline] = useState(false);
  const [toast, setToast] = useState("");
  const [celebration, setCelebration] = useState("");
  const [collapsedOrg, setCollapsedOrg] = useState(view === "entry");

  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;

  const visibleGoals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return goals.filter((goal) => {
      const searchHit = !q || [goal.name, goal.ownerName, goal.ownerDept, goal.type].some((value) => value.toLowerCase().includes(q));
      return searchHit && matchesFilter(goal, filter);
    });
  }, [goals, search, filter]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function updateProgress(goalId: string, percent: number, note?: string) {
    const current = goals.find((goal) => goal.id === goalId);
    if (!current) return;
    setGoals((prev) => prev.map((goal) => goal.id === goalId ? { ...goal, percentComplete: percent, status: statusFor(percent) } : goal));
    setMeta((prev) => ({
      ...prev,
      [goalId]: {
        ...prev[goalId],
        history: [
          ...prev[goalId].history,
          { id: `${goalId}-h-${Date.now()}`, date: "Today", oldPct: current.percentComplete, newPct: percent, note },
        ],
      },
    }));
    if (percent >= 100 && current.percentComplete < 100) {
      setCelebration("Goal achieved — momentum captured.");
      window.setTimeout(() => setCelebration(""), 1800);
    }
    showToast(percent >= 100 ? "Goal achieved" : "Goal progress updated");
  }

  function toggleTask(goalId: string, taskId: string) {
    const goalMeta = meta[goalId];
    if (!goalMeta) return;
    const nextTasks = goalMeta.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
    const percent = Math.round((nextTasks.filter((task) => task.done).length / nextTasks.length) * 100);
    setMeta((prev) => ({ ...prev, [goalId]: { ...prev[goalId], tasks: nextTasks } }));
    updateProgress(goalId, percent, "Task checklist updated");
  }

  function addComment(goalId: string, text: string) {
    if (!text.trim()) return;
    setMeta((prev) => ({
      ...prev,
      [goalId]: {
        ...prev[goalId],
        comments: [...prev[goalId].comments, { id: `${goalId}-c-${Date.now()}`, author: user.initials, text: text.trim(), date: "Just now" }],
      },
    }));
    showToast("Comment added");
  }

  function markAtRisk(goalId: string) {
    setGoals((prev) => prev.map((goal) => goal.id === goalId ? { ...goal, status: "at_risk", managerNote: "Marked at risk by manager." } : goal));
    showToast("Goal marked at risk. Employee notified.");
  }

  function createGoal(goal: Omit<GoalRecord, "id" | "ownerInitials" | "ownerColor" | "ownerName" | "ownerDept"> & { owner: Employee }) {
    const next: GoalRecord = {
      ...goal,
      id: `g-new-${Date.now()}`,
      ownerId: goal.owner.id,
      ownerName: goal.owner.name,
      ownerInitials: goal.owner.initials,
      ownerColor: goal.owner.avatarColor,
      ownerDept: goal.owner.department,
    };
    setGoals((prev) => [next, ...prev]);
    setMeta((prev) => ({ ...prev, ...makeMeta([next]) }));
    setCreateOpen(false);
    showToast("Goal created and notification sent");
  }

  const canCreate = view === "manager" || view === "senior_manager" || view === "hr";
  const showTimeline = view === "mid" || view === "manager" || view === "senior_manager";

  return (
    <div className="dashboard-page space-y-5">
      {toast && <Toast>{toast}</Toast>}
      <Celebration active={Boolean(celebration)} label={celebration} />

      <section className="px-4 pt-1">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-syne text-2xl font-bold text-ink">Goals</h1>
            <p className="mt-0.5 text-sm text-muted">{visibleGoals.length} shown · {view.replace("_", " ")} view</p>
          </div>
          <div className="flex gap-2">
            {showTimeline && (
              <button onClick={() => setTimeline((value) => !value)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted">
                {timeline ? "Cards" : "Timeline"}
              </button>
            )}
            {canCreate && (
              <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1 rounded-xl bg-pulse px-3 py-2 text-xs font-bold text-white">
                <Plus size={14} /> {view === "hr" ? "Org Goal" : "Create Goal"}
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search goals, owners, departments..."
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-base text-ink outline-none focus:border-pulse"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {filters.map((item) => (
            <button key={item.key} onClick={() => setFilter(item.key)} className={clsx("shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold", filter === item.key ? "border-pulse bg-pulse text-white" : "border-border bg-card text-muted")}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {timeline && showTimeline ? (
        <Timeline goals={visibleGoals} onSelect={(goal) => setSelectedId(goal.id)} />
      ) : (
        <RoleContent
          goals={visibleGoals}
          user={user}
          view={view}
          collapsedOrg={collapsedOrg}
          setCollapsedOrg={setCollapsedOrg}
          onSelect={(goal) => setSelectedId(goal.id)}
          onMarkAtRisk={markAtRisk}
        />
      )}

      {selectedGoal && (
        <GoalDetailSheet
          goal={selectedGoal}
          meta={meta[selectedGoal.id]}
          canEdit={canEditGoal(selectedGoal, user, view)}
          canMarkAtRisk={view === "manager" || view === "senior_manager"}
          onClose={() => setSelectedId(null)}
          onToggleTask={toggleTask}
          onUpdateProgress={updateProgress}
          onAddComment={addComment}
          onMarkAtRisk={markAtRisk}
        />
      )}

      {createOpen && (
        <GoalCreateSheet
          user={user}
          view={view}
          goals={goals}
          onClose={() => setCreateOpen(false)}
          onCreate={createGoal}
        />
      )}
    </div>
  );
}

function RoleContent({ goals, user, view, collapsedOrg, setCollapsedOrg, onSelect, onMarkAtRisk }: { goals: GoalRecord[]; user: Employee; view: GoalView; collapsedOrg: boolean; setCollapsedOrg: (value: boolean) => void; onSelect: (goal: GoalRecord) => void; onMarkAtRisk: (goalId: string) => void }) {
  const mine = goals.filter((goal) => goal.ownerId === user.id && goal.type === "individual");
  const team = goals.filter((goal) => goal.type === "team" && (goal.ownerDept === user.department || goal.contributors.includes(user.id)));
  const dept = goals.filter((goal) => goal.type === "dept" && goal.ownerDept === user.department);
  const orgGoals = goals.filter((goal) => goal.type === "org");

  if (view === "hr" || view === "executive") {
    const onTrack = orgGoals.filter((goal) => goal.status === "on_track").length;
    const atRisk = orgGoals.filter((goal) => goal.status === "at_risk" || goal.status === "behind" || isOverdue(goal)).length;
    const completed = orgGoals.filter((goal) => goal.status === "completed").length;
    return (
      <>
        <section className="px-4">
          <div className="flex flex-wrap gap-2">
            <MiniChip tone="green">{onTrack} on track</MiniChip>
            <MiniChip tone="amber">{atRisk} at risk</MiniChip>
            <MiniChip tone="ink">{completed} completed</MiniChip>
          </div>
        </section>
        <GoalSection title="Org Goals" goals={orgGoals} empty="No org goals match this search." onSelect={onSelect} editable={view === "hr"} />
      </>
    );
  }

  if (view === "manager" || view === "senior_manager") {
    const teamMembers = employees.filter((employee) => employee.department === user.department && employee.id !== user.id);
    return (
      <>
        <GoalSection title="My Goals" goals={mine} empty="No personal goals match this search." onSelect={onSelect} editable />
        <GoalSection title="Team Goals" goals={team} empty="No team goals match this search." onSelect={onSelect} editable onMarkAtRisk={onMarkAtRisk} />
        {view === "senior_manager" && <GoalSection title="Department Goals" goals={dept} empty="No department goals match this search." onSelect={onSelect} editable />}
        <PeopleGoals goals={goals.filter((goal) => goal.type === "individual" && goal.ownerDept === user.department)} people={teamMembers} onSelect={onSelect} />
        {view === "senior_manager" && <ManagerPerformance managers={teamMembers.filter((employee) => employee.peopleResponsibility !== "none")} goals={goals} />}
      </>
    );
  }

  if (view === "mid") {
    return (
      <>
        <GoalSection title="My Goals" goals={mine} empty="No personal goals match this search." onSelect={onSelect} editable />
        <GoalSection title="Team Goals" goals={team} empty="No team goals match this search." onSelect={onSelect} editable />
        <GoalSection title="Dept Goals" goals={dept} empty="No department goals match this search." onSelect={onSelect} />
        <GoalSection title="Org Goals" goals={orgGoals} empty="No org goals match this search." onSelect={onSelect} />
      </>
    );
  }

  return (
    <>
      <GoalSection title="My Goals" goals={mine} empty="No personal goals match this search." onSelect={onSelect} editable />
      <GoalSection title="Team Goals" goals={team} empty="No team goals match this search." onSelect={onSelect} helper="How I contribute notes are available in each goal detail." />
      <section className="px-4">
        <button onClick={() => setCollapsedOrg(!collapsedOrg)} className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left">
          <div>
            <p className="text-sm font-bold text-ink">Org Goals</p>
            <p className="text-xs text-muted">Your company is working toward these goals. Your work contributes to them.</p>
          </div>
          <ChevronDown size={16} className={clsx("text-muted transition", !collapsedOrg && "rotate-180")} />
        </button>
      </section>
      {!collapsedOrg && <GoalSection title="" goals={orgGoals.slice(0, 3)} empty="No org goals match this search." onSelect={onSelect} />}
    </>
  );
}

function GoalSection({ title, goals, empty, helper, editable, onSelect, onMarkAtRisk }: { title: string; goals: GoalRecord[]; empty: string; helper?: string; editable?: boolean; onSelect: (goal: GoalRecord) => void; onMarkAtRisk?: (goalId: string) => void }) {
  return (
    <section className="px-4">
      {title && <div className="mb-2 flex items-end justify-between"><h2 className="text-xs font-bold uppercase tracking-widest text-muted">{title}</h2><span className="text-xs text-muted">{goals.length}</span></div>}
      {helper && <p className="mb-2 text-xs text-muted">{helper}</p>}
      {goals.length ? (
        <div className="space-y-3">
          {goals.map((goal) => <GoalCard key={goal.id} goal={goal} editable={editable} onSelect={onSelect} onMarkAtRisk={onMarkAtRisk} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted">{empty}</div>
      )}
    </section>
  );
}

function GoalCard({ goal, editable, onSelect, onMarkAtRisk }: { goal: GoalRecord; editable?: boolean; onSelect: (goal: GoalRecord) => void; onMarkAtRisk?: (goalId: string) => void }) {
  const days = daysUntil(goal.dueDate);
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <button onClick={() => onSelect(goal)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold", typeBadge[goal.type])}>{typeLabel[goal.type]}</span>
              <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-bold", statusClass(goal))}>{statusLabel(goal)}</span>
            </div>
            <h3 className="font-syne text-sm font-semibold leading-snug text-ink">{goal.name}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-[10px] font-bold text-muted">{goal.weight}% weight</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Avatar initials={goal.ownerInitials} color={goal.ownerColor} />
          <span className="truncate text-xs text-muted">{goal.ownerName} · {goal.ownerDept}</span>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs"><span className="font-bold text-ink">{goal.percentComplete}% complete</span><span className={clsx(days < 7 && goal.status !== "completed" ? "text-red" : "text-muted")}>{fmt(goal.dueDate)} · {days >= 0 ? `${days} days` : `${Math.abs(days)} days late`}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-border"><div className={clsx("h-full rounded-full", progressColor(goal.percentComplete, isOverdue(goal)))} style={{ width: `${goal.percentComplete}%` }} /></div>
        </div>
      </button>
      {editable && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => onSelect(goal)} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">Edit</button>
          {onMarkAtRisk && <button onClick={() => onMarkAtRisk(goal.id)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Mark At-Risk</button>}
        </div>
      )}
    </article>
  );
}

function GoalDetailSheet({ goal, meta, canEdit, canMarkAtRisk, onClose, onToggleTask, onUpdateProgress, onAddComment, onMarkAtRisk }: { goal: GoalRecord; meta: GoalMeta; canEdit: boolean; canMarkAtRisk: boolean; onClose: () => void; onToggleTask: (goalId: string, taskId: string) => void; onUpdateProgress: (goalId: string, pct: number, note?: string) => void; onAddComment: (goalId: string, text: string) => void; onMarkAtRisk: (goalId: string) => void }) {
  const [progressOpen, setProgressOpen] = useState(false);
  const [draftPct, setDraftPct] = useState(goal.percentComplete);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5"><span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold", typeBadge[goal.type])}>{typeLabel[goal.type]}</span><span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-bold", statusClass(goal))}>{statusLabel(goal)}</span></div>
          <h2 className="font-syne text-lg font-bold leading-snug text-ink">{goal.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{goal.description}</p>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-muted"><X size={15} /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <Info label="Owner" value={goal.ownerName} />
        <Info label="Due" value={fmt(goal.dueDate)} />
        <Info label="Weight" value={`${goal.weight}%`} />
        <Info label="Metric" value={goal.targetMetric} />
      </div>

      <div className="mt-5">
        <SectionTitle icon={Target}>Task Checklist</SectionTitle>
        <div className="divide-y divide-border rounded-xl border border-border">
          {meta.tasks.map((task) => (
            <button key={task.id} disabled={!canEdit} onClick={() => onToggleTask(goal.id, task.id)} className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default">
              <span className={clsx("grid h-5 w-5 place-items-center rounded border", task.done ? "border-green bg-green text-white" : "border-border")}><Check size={12} /></span>
              <span className={clsx("flex-1 text-sm", task.done ? "text-muted line-through" : "text-ink")}>{task.title}</span>
              <span className="text-[10px] text-muted">{task.assignee} · {fmt(task.dueDate)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle icon={CalendarDays}>Progress History</SectionTitle>
        <div className="space-y-3">
          {meta.history.map((item) => <div key={item.id} className="border-l-2 border-pulse/25 pl-3 text-sm"><p className="font-bold text-ink">{item.date}: {item.oldPct}% → {item.newPct}%</p>{item.note && <p className="text-xs text-muted">{item.note}</p>}</div>)}
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle icon={MessageSquare}>Comments</SectionTitle>
        <div className="space-y-2">
          {meta.comments.map((item) => <div key={item.id} className="rounded-xl bg-paper p-3"><p className="text-sm text-ink">{item.text}</p><p className="mt-1 text-[10px] text-muted">{item.author} · {item.date}</p></div>)}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={canEdit ? "Add a comment..." : "Add manager comment..."} className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-base outline-none focus:border-pulse" />
          <button onClick={() => { onAddComment(goal.id, comment); setComment(""); }} className="rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white">Add</button>
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle icon={FileText}>Files</SectionTitle>
        <div className="grid gap-2">
          {meta.files.map((file) => <button key={file} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-muted"><span>{file}</span><Download size={14} /></button>)}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {canEdit && <button onClick={() => setProgressOpen(true)} className="rounded-xl bg-pulse px-4 py-3 text-sm font-bold text-white">Update Progress</button>}
        {canMarkAtRisk && <button onClick={() => onMarkAtRisk(goal.id)} className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-muted"><AlertTriangle size={14} className="mr-1 inline" />Mark At-Risk</button>}
      </div>

      {progressOpen && (
        <div className="fixed inset-0 z-[240] grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-lg)]">
            <h3 className="font-syne text-lg font-bold text-ink">Update Progress</h3>
            <p className="mt-2 text-sm text-muted">{draftPct}% complete</p>
            <input type="range" min={0} max={100} value={draftPct} onChange={(event) => setDraftPct(Number(event.target.value))} className="mt-4 w-full accent-pulse" />
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short note" className="mt-3 min-h-24 w-full rounded-xl border border-border px-3 py-2 text-base outline-none focus:border-pulse" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setProgressOpen(false)} className="flex-1 rounded-xl border border-border py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={() => { onUpdateProgress(goal.id, draftPct, note); setProgressOpen(false); }} className="flex-1 rounded-xl bg-pulse py-2 text-sm font-bold text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function GoalCreateSheet({ user, view, goals, onClose, onCreate }: { user: Employee; view: GoalView; goals: GoalRecord[]; onClose: () => void; onCreate: (goal: Omit<GoalRecord, "id" | "ownerInitials" | "ownerColor" | "ownerName" | "ownerDept"> & { owner: Employee }) => void }) {
  const lockedOrg = view === "hr";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<GoalType>(lockedOrg ? "org" : "team");
  const [ownerId, setOwnerId] = useState(user.id);
  const [dueDate, setDueDate] = useState("2026-09-30");
  const [metric, setMetric] = useState("100% completion");
  const [weight, setWeight] = useState(10);
  const [parentGoalId, setParentGoalId] = useState("");
  const owner = employees.find((employee) => employee.id === ownerId) ?? user;
  const remainingWeight = Math.max(0, 100 - goals.filter((goal) => goal.ownerId === ownerId && goal.type === "individual").reduce((sum, goal) => sum + goal.weight, 0));
  const allowedTypes: GoalType[] = lockedOrg ? ["org"] : view === "manager" ? ["individual", "team", "dept"] : ["individual", "team", "dept", "org"];

  return (
    <BottomSheet onClose={onClose}>
      <h2 className="font-syne text-lg font-bold text-ink">{lockedOrg ? "Create Org Goal" : "Create Goal"}</h2>
      <div className="mt-4 grid gap-3">
        <Input label="Goal name" value={name} onChange={setName} />
        <label className="text-xs font-bold uppercase tracking-widest text-muted">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink outline-none focus:border-pulse" /></label>
        <label className="text-xs font-bold uppercase tracking-widest text-muted">Type<select value={type} onChange={(event) => setType(event.target.value as GoalType)} disabled={lockedOrg} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink"><option value="individual" disabled={!allowedTypes.includes("individual")}>Individual</option><option value="team" disabled={!allowedTypes.includes("team")}>Team</option><option value="dept" disabled={!allowedTypes.includes("dept")}>Dept</option><option value="org" disabled={!allowedTypes.includes("org")}>Org</option></select></label>
        <label className="text-xs font-bold uppercase tracking-widest text-muted">Assign to<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></label>
        <Input label="Due date" value={dueDate} onChange={setDueDate} type="date" />
        <Input label="Target metric" value={metric} onChange={setMetric} />
        <label className="text-xs font-bold uppercase tracking-widest text-muted">Linked to<select value={parentGoalId} onChange={(event) => setParentGoalId(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink"><option value="">No parent goal</option>{goals.filter((goal) => goal.type !== "individual").map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label>
        <label className="text-xs font-bold uppercase tracking-widest text-muted">Weight: {weight}% <span className="normal-case tracking-normal text-muted">(remaining budget: {remainingWeight}%)</span><input type="number" min={0} max={remainingWeight || 100} value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink" /></label>
        <button disabled={!name.trim() || weight > (remainingWeight || 100)} onClick={() => onCreate({ name, description, type, status: "on_track", percentComplete: 0, dueDate, weight, startDate: "2026-05-28", targetMetric: metric, parentGoalId: parentGoalId || undefined, contributors: [owner.id], ownerId: owner.id, owner })} className="rounded-xl bg-pulse py-3 text-sm font-bold text-white disabled:opacity-50">Create Goal</button>
      </div>
    </BottomSheet>
  );
}

function Timeline({ goals, onSelect }: { goals: GoalRecord[]; onSelect: (goal: GoalRecord) => void }) {
  return (
    <section className="px-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="relative mb-3 h-6 border-l border-r border-border"><div className="absolute left-[58%] top-0 h-full w-0.5 bg-pulse" /><span className="absolute left-[58%] top-0 -translate-x-1/2 text-[10px] font-bold text-pulse">Today</span></div>
        <div className="space-y-3">
          {goals.map((goal, index) => {
            const start = 5 + (index % 4) * 9;
            const width = Math.min(90 - start, 34 + daysUntil(goal.dueDate) / 3);
            const risk = daysUntil(goal.dueDate) < 14 && goal.percentComplete < 60;
            return (
              <button key={goal.id} onClick={() => onSelect(goal)} className="w-full text-left">
                <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-bold text-ink">{goal.name}</span>{risk && <span className="text-red">At-risk</span>}</div>
                <div className="relative h-8 rounded-lg bg-paper"><div className={clsx("absolute top-1 h-6 rounded-lg", progressColor(goal.percentComplete, risk))} style={{ left: `${start}%`, width: `${width}%` }}><div className="h-full rounded-lg bg-white/30" style={{ width: `${goal.percentComplete}%` }} /></div></div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PeopleGoals({ people, goals, onSelect }: { people: Employee[]; goals: GoalRecord[]; onSelect: (goal: GoalRecord) => void }) {
  const [open, setOpen] = useState<string | null>(people[0]?.id ?? null);
  return (
    <section className="px-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Individual Goals by Person</h2>
      <div className="space-y-3">
        {people.map((person) => {
          const personGoals = goals.filter((goal) => goal.ownerId === person.id);
          if (!personGoals.length) return null;
          const completion = Math.round(personGoals.reduce((sum, goal) => sum + goal.percentComplete, 0) / personGoals.length);
          return (
            <div key={person.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button onClick={() => setOpen(open === person.id ? null : person.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <Avatar initials={person.initials} color={person.avatarColor} />
                <div className="flex-1"><p className="text-sm font-bold text-ink">{person.name}</p><p className="text-xs text-muted">{completion}% overall completion</p></div>
                <ChevronDown size={16} className={clsx("text-muted transition", open === person.id && "rotate-180")} />
              </button>
              {open === person.id && <div className="space-y-2 p-3 pt-0">{personGoals.map((goal) => <GoalCard key={goal.id} goal={goal} onSelect={onSelect} />)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ManagerPerformance({ managers, goals }: { managers: Employee[]; goals: GoalRecord[] }) {
  return (
    <section className="px-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Manager Performance</h2>
      <div className="grid gap-2">
        {managers.map((manager, index) => {
          const managerGoals = goals.filter((goal) => goal.ownerDept === manager.department);
          const avgGoal = managerGoals.length ? Math.round(managerGoals.reduce((sum, goal) => sum + goal.percentComplete, 0) / managerGoals.length) : 0;
          return <div key={manager.id} className="rounded-xl border border-border bg-card p-3"><p className="text-sm font-bold text-ink">{manager.name}</p><p className="text-xs text-muted">Team avg goal completion {avgGoal}% · {index % 2 === 0 ? "↑ 4" : "↓ 2"} vs last month</p></div>;
        })}
      </div>
    </section>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</span>;
}

function SectionTitle({ children, icon: Icon }: { children: string; icon: typeof Target }) {
  return <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Icon size={15} className="text-pulse" />{children}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-paper p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p><p className="mt-1 truncate text-sm font-bold text-ink">{value}</p></div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-xs font-bold uppercase tracking-widest text-muted">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base normal-case tracking-normal text-ink outline-none focus:border-pulse" /></label>;
}

function MiniChip({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "ink" }) {
  const cls = tone === "green" ? "bg-green-soft text-green" : tone === "amber" ? "bg-amber-soft text-amber" : "bg-ink/5 text-muted";
  return <span className={clsx("rounded-full px-3 py-1.5 text-xs font-bold", cls)}>{children}</span>;
}

function Toast({ children }: { children: ReactNode }) {
  return <div className="fixed left-1/2 top-4 z-[250] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-lg)]">{children}</div>;
}

function BottomSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[220]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-[430px] overflow-y-auto rounded-t-[24px] bg-card p-5 shadow-[0_-12px_45px_rgba(0,0,0,0.2)]">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border" />
        {children}
      </div>
    </div>
  );
}
