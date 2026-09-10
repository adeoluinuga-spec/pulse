"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Plus, Target, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { GOAL_STATUS_LABEL, GOAL_TYPE_LABEL, GOAL_TYPES, type GoalType } from "@/lib/goalRules";
import styles from "./goals.module.css";

/**
 * Authoring goals.
 *
 * The page this replaces rendered a demo company's objectives from a fixture,
 * so nobody could create one — while the appraisal engine scored goals at 35%
 * of every total and blocked on their absence.
 *
 * Editing rights come from the server on each row rather than being re-derived
 * here. A goal already attached to an appraisal cycle is frozen, and the reason
 * is shown in place instead of a disabled control with no explanation.
 */

type Person = { id: string; name: string | null; email: string | null; department: string | null; team: string | null };

type Editable = { allowed: boolean; reason?: string };

type Goal = {
  id: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  goal_type: string;
  target_metric: string | null;
  weight: number | null;
  percent_complete: number | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  cycle: string | null;
  appraisal_cycle_id: string | null;
  editable: Editable;
};

type Viewer = {
  employeeId: string;
  role: string | null;
  directReportIds: string[];
  canCreateOrgGoals: boolean;
};

type Payload = {
  viewer: Viewer;
  people: Person[];
  goals: Goal[];
  weightByOwner: Record<string, { total: number; remaining: number }>;
};

type Scope = "mine" | "team" | "all";

const today = () => new Date().toISOString().slice(0, 10);
const inNinetyDays = () => {
  const date = new Date();
  date.setDate(date.getDate() + 90);
  return date.toISOString().slice(0, 10);
};

const blankDraft = () => ({
  title: "",
  description: "",
  goalType: "individual" as GoalType,
  ownerId: "",
  weight: 25,
  percentComplete: 0,
  startDate: today(),
  dueDate: inNinetyDays(),
  targetMetric: "",
  cycle: "",
});

export default function GoalsWorkspace() {
  const { showToast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>("mine");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(blankDraft());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/goals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load goals.");
      setData(body);
      setError("");
      setDraft((current) => ({ ...current, ownerId: current.ownerId || body.viewer.employeeId }));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not load goals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    setBusy("create");
    setErrors([]);
    setError("");
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.errors ?? []);
        throw new Error(body.error ?? "Could not create this goal.");
      }
      showToast("Goal created.", "success");
      setCreating(false);
      setDraft({ ...blankDraft(), ownerId: draft.ownerId });
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not create this goal.");
    } finally {
      setBusy("");
    }
  }, [draft, load, showToast]);

  const updateProgress = useCallback(
    async (goal: Goal, percentComplete: number) => {
      setBusy(goal.id);
      setError("");
      try {
        const response = await fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: goal.id, percentComplete }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not update this goal.");
        await load();
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Could not update this goal.");
      } finally {
        setBusy("");
      }
    },
    [load],
  );

  const remove = useCallback(
    async (goal: Goal) => {
      setBusy(goal.id);
      setError("");
      try {
        const response = await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not delete this goal.");
        showToast("Goal deleted.", "success");
        await load();
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Could not delete this goal.");
      } finally {
        setBusy("");
      }
    },
    [load, showToast],
  );

  const visible = useMemo(() => {
    if (!data) return [];
    if (scope === "all") return data.goals;
    if (scope === "mine") return data.goals.filter((goal) => goal.owner_id === data.viewer.employeeId);
    return data.goals.filter(
      (goal) => goal.owner_id && data.viewer.directReportIds.includes(goal.owner_id),
    );
  }, [data, scope]);

  const nameOf = useCallback(
    (id: string | null) => data?.people.find((person) => person.id === id)?.name ?? "Unassigned",
    [data],
  );

  const summary = useMemo(() => {
    const total = visible.length;
    const complete = visible.filter((goal) => goal.status === "completed").length;
    const slipping = visible.filter((goal) => goal.status === "behind" || goal.status === "at_risk").length;
    const average = total
      ? Math.round(visible.reduce((sum, goal) => sum + (goal.percent_complete ?? 0), 0) / total)
      : 0;
    return { total, complete, slipping, average };
  }, [visible]);

  const ownerOptions = useMemo(() => {
    if (!data) return [];
    const canAuthorForAnyone = data.viewer.canCreateOrgGoals;
    return data.people.filter(
      (person) =>
        canAuthorForAnyone ||
        person.id === data.viewer.employeeId ||
        data.viewer.directReportIds.includes(person.id),
    );
  }, [data]);

  const weight = data && draft.ownerId ? data.weightByOwner[draft.ownerId] : undefined;

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Goals</p>
          <h1>Objectives and progress</h1>
          <p className={styles.muted}>
            Goals carry 35% of a performance appraisal. Set them here, keep the progress figure current,
            then attach them to an appraisal cycle when the period closes.
          </p>
        </div>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={() => setCreating((open) => !open)}>
            <Plus size={15} /> {creating ? "Close" : "New goal"}
          </button>
        </div>
      </div>

      {error ? (
        <div className={styles.error}>
          {error}
          {errors.length ? (
            <ul>
              {errors.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <div className={styles.panel}>
          <h2>New goal</h2>
          <p className={styles.muted}>
            An owner, a weight, a progress figure and a period. Those four are what an appraisal reads.
          </p>

          <label className={styles.field}>
            Title
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Grow enterprise pipeline to ₦1.5B"
            />
          </label>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              Owner
              <select value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}>
                <option value="">Choose someone</option>
                {ownerOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name ?? person.email}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Type
              <select
                value={draft.goalType}
                onChange={(event) => setDraft({ ...draft, goalType: event.target.value as GoalType })}
              >
                {GOAL_TYPES.filter((type) => data?.viewer.canCreateOrgGoals || (type !== "org" && type !== "dept")).map(
                  (type) => (
                    <option key={type} value={type}>
                      {GOAL_TYPE_LABEL[type]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className={styles.field}>
              Weight
              <input
                type="number"
                min={0}
                max={100}
                value={draft.weight}
                onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })}
              />
              <span className={styles.hint}>
                {weight ? `${weight.total}% already allocated to this owner, ${weight.remaining}% left.` : "Relative to this owner's other goals."}
              </span>
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              Starts
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              Due
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              Period label
              <input
                value={draft.cycle}
                onChange={(event) => setDraft({ ...draft, cycle: event.target.value })}
                placeholder="Q2 2026"
              />
              <span className={styles.hint}>Optional. Helps match this goal to an appraisal cycle.</span>
            </label>
          </div>

          <label className={styles.field}>
            How success is measured
            <input
              value={draft.targetMetric}
              onChange={(event) => setDraft({ ...draft, targetMetric: event.target.value })}
              placeholder="Signed contract value by 30 June"
            />
          </label>

          <label className={styles.field}>
            Detail
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="What this covers, and what it does not."
            />
          </label>

          <div className={styles.row}>
            <button type="button" className={styles.primary} onClick={() => void create()} disabled={busy === "create"}>
              {busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create goal
            </button>
            <button type="button" className={styles.button} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <strong>{summary.total}</strong>
          <span>Goals in view</span>
        </div>
        <div className={styles.metric}>
          <strong>{summary.average}%</strong>
          <span>Average progress</span>
        </div>
        <div className={styles.metric}>
          <strong>{summary.complete}</strong>
          <span>Completed</span>
        </div>
        <div className={styles.metric}>
          <strong>{summary.slipping}</strong>
          <span>At risk or behind</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(
            [
              ["mine", "Mine"],
              ["team", "My team"],
              ["all", "Everyone"],
            ] as Array<[Scope, string]>
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <Target size={34} />
          <h2>No goals here yet</h2>
          <p className={styles.muted}>
            {scope === "mine"
              ? "Set your first objective. Until a goal exists, goal achievement cannot be scored in an appraisal."
              : "Nobody in this view has objectives set for the current period."}
          </p>
          <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
            <Plus size={15} /> New goal
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Owner</th>
                <th>Weight</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((goal) => (
                <tr key={goal.id}>
                  <td>
                    <strong>{goal.title}</strong>
                    <small>
                      {GOAL_TYPE_LABEL[(goal.goal_type as GoalType) ?? "individual"]}
                      {goal.target_metric ? ` · ${goal.target_metric}` : ""}
                      {goal.cycle ? ` · ${goal.cycle}` : ""}
                    </small>
                  </td>
                  <td>{nameOf(goal.owner_id)}</td>
                  <td>{goal.weight ?? 0}%</td>
                  <td>
                    <div className={styles.progress}>
                      <span style={{ width: `${goal.percent_complete ?? 0}%` }} />
                    </div>
                    {goal.editable.allowed ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={goal.percent_complete ?? 0}
                        className={styles.input}
                        style={{ maxWidth: 80 }}
                        disabled={busy === goal.id}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (next !== (goal.percent_complete ?? 0)) void updateProgress(goal, next);
                        }}
                      />
                    ) : (
                      <small>{goal.percent_complete ?? 0}%</small>
                    )}
                  </td>
                  <td>
                    <span className={styles.badge} data-status={goal.status ?? "on_track"}>
                      {GOAL_STATUS_LABEL[(goal.status as keyof typeof GOAL_STATUS_LABEL) ?? "on_track"] ?? goal.status}
                    </span>
                  </td>
                  <td>{goal.due_date ?? "—"}</td>
                  <td>
                    {goal.appraisal_cycle_id ? (
                      <span className={styles.badge} data-locked="true" title={goal.editable.reason}>
                        <Lock size={10} /> Scored
                      </span>
                    ) : goal.editable.allowed ? (
                      <button
                        type="button"
                        className={`${styles.small} ${styles.danger}`}
                        onClick={() => void remove(goal)}
                        disabled={busy === goal.id}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
