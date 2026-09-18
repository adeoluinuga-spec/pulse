"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Plus } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { Avatar, Notice, Panel, SectionTitle } from "./teamUi";
import { api, formatDate, type Person, type Task, type TasksResponse } from "./teamClient";

type Filter = "mine" | "set";

export default function TasksTab({ presetAssignee, onPresetUsed }: { presetAssignee: Person | null; onPresetUsed: () => void }) {
  const { showToast } = useToast();
  const [data, setData] = useState<TasksResponse | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("mine");
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState<{ title: string; dueDate: string; assigneeId: string; goalId: string } | null>(
    presetAssignee ? { title: "", dueDate: "", assigneeId: presetAssignee.id, goalId: "" } : null,
  );
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<TasksResponse>("/api/team/tasks"));
      setError("");
    } catch (thrown) {
      setError((thrown as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    if (presetAssignee) onPresetUsed();
    return () => {
      cancelled = true;
    };
    // The preset is consumed once, on arrival from My Team.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const toggle = async (task: Task) => {
    try {
      await api("/api/team/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, complete: !task.complete }) });
      await load();
    } catch (thrown) {
      showToast((thrown as Error).message, "error");
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setFormError("");
    try {
      await api("/api/team/tasks", { method: "POST", body: JSON.stringify(form) });
      showToast("Task saved.", "success");
      setForm(null);
      await load();
    } catch (thrown) {
      setFormError((thrown as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <section className="px-4"><Notice tone="error">{error}</Notice></section>;
  if (!data) return <section className="px-4"><Notice>Loading tasks…</Notice></section>;

  const today = new Date().toISOString().slice(0, 10);
  const visible = data.tasks.filter((task) => (filter === "mine" ? task.mine : !task.mine));
  const open = visible.filter((task) => !task.complete).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const done = visible.filter((task) => task.complete);
  const setByMeCount = data.tasks.filter((task) => !task.mine).length;

  return (
    <section className="space-y-4 px-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["mine", "My tasks"], ["set", `Set by me (${setByMeCount})`]] as const).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={clsx("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === key ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}
          >
            {text}
          </button>
        ))}
        <button onClick={() => setForm({ title: "", dueDate: "", assigneeId: "", goalId: "" })} className="ml-auto flex items-center gap-1 rounded-lg bg-pulse px-3 py-2 text-xs font-semibold text-white">
          <Plus size={14} /> New task
        </button>
      </div>

      {form && (
        <Panel className="space-y-3">
          <p className="text-sm font-semibold text-ink">New task</p>
          <label className="block text-xs font-semibold text-muted">
            What needs doing
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-xs font-semibold text-muted">
              Due
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
            </label>
            <label className="block text-xs font-semibold text-muted">
              For
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink">
                <option value="">Me</option>
                {/* The first assignable person is always you, offered above as "Me". */}
                {data.assignable.slice(1).map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Linked goal (optional)
              <select value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-base text-ink">
                <option value="">None</option>
                {data.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
            </label>
          </div>
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || form.title.trim().length < 2} className="rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? "Saving…" : "Save task"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
          </div>
        </Panel>
      )}

      {!open.length && !done.length && (
        <Notice>{filter === "mine" ? "You have no tasks. Tasks you or your manager set will appear here." : "You have not set anyone a task yet."}</Notice>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Open</SectionTitle>
          {open.map((task) => <TaskRow key={task.id} task={task} overdue={Boolean(task.dueDate && task.dueDate < today)} onToggle={toggle} showAssignee={filter === "set"} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="text-sm font-semibold text-muted">
            Done ({done.length})
          </button>
          {showDone && done.map((task) => <TaskRow key={task.id} task={task} overdue={false} onToggle={toggle} showAssignee={filter === "set"} />)}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, overdue, onToggle, showAssignee }: { task: Task; overdue: boolean; onToggle: (task: Task) => void; showAssignee: boolean }) {
  return (
    <div className={clsx("rounded-lg border bg-card p-4", overdue ? "border-l-4 border-red" : "border-border")}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task)}
          aria-label={task.complete ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          className={clsx("mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border", task.complete ? "border-green bg-green text-white" : "border-border")}
        >
          {task.complete && <Check size={12} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx("text-sm font-semibold text-ink", task.complete && "line-through opacity-50")}>{task.title}</p>
          <p className={clsx("mt-1 text-xs", overdue ? "text-red" : "text-muted")}>
            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}
            {task.mine && task.setBy && task.setBy.id !== task.assignee?.id ? ` · set by ${task.setBy.name}` : ""}
            {showAssignee && task.assignee ? ` · for ${task.assignee.name}` : ""}
          </p>
          {task.linkedGoal?.title && <span className="mt-2 inline-block rounded-full bg-pulse-soft px-2 py-1 text-[10px] font-semibold text-pulse">{task.linkedGoal.title}</span>}
        </div>
        {showAssignee && task.assignee && <Avatar person={task.assignee} size="sm" />}
      </div>
    </div>
  );
}
