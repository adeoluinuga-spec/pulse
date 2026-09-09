"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, Users, Wand2 } from "lucide-react";

/**
 * Building a cohort from the published organisation chart.
 *
 * Two steps that used to be entirely manual: choosing who is assessed, and
 * choosing who rates them. Both are previewed before anything is written,
 * because the interesting output is not the list of raters — it is the list of
 * things that could not be filled, and an operator needs to see that while they
 * can still do something about it rather than after the reports come back thin.
 */

type Cycle = { id: string; name: string; status: string };

type Level = {
  tier: string;
  label: string;
  total: number;
  alreadyParticipants: number;
  missingEmail: number;
};

type Feasibility = { feasible: boolean; message: string };

type Rules = {
  minimumPerGroup: number;
  suppressionMode: "merge" | "suppress";
  quota: { colleague: number; direct_report: number };
  lockedAt: string | null;
};

type Shortfall = { group: string; wanted: number; found: number; message: string };

type Plan = {
  subjectId: string;
  subjectName: string;
  unlinked: boolean;
  newRaters: Array<{ name: string; email: string; group: string; rationale: string }>;
  shortfalls: Shortfall[];
};

const GROUP_LABEL: Record<string, string> = {
  self: "Self",
  line_manager: "Line manager",
  colleague: "Colleague",
  direct_report: "Direct report",
};

export default function CohortBuilder({
  cycles,
  cycleId,
  onChanged,
}: {
  cycles: Cycle[];
  cycleId: string;
  onChanged: () => void;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [feasibility, setFeasibility] = useState<Feasibility | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [totalNew, setTotalNew] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLevels = useCallback(async () => {
    if (!cycleId) return;
    setError("");
    try {
      const [levelsRes, rulesRes] = await Promise.all([
        fetch(`/api/assessments/participants/bulk?cycleId=${encodeURIComponent(cycleId)}`, { cache: "no-store" }),
        fetch(`/api/assessments/cycles/rules?cycleId=${encodeURIComponent(cycleId)}`, { cache: "no-store" }),
      ]);
      const levelsBody = await levelsRes.json();
      const rulesBody = await rulesRes.json();
      if (!levelsRes.ok) throw new Error(levelsBody.error ?? "Could not read the organisation chart");
      setLevels(levelsBody.levels ?? []);
      setFeasibility(levelsBody.feasibility ?? null);
      if (rulesRes.ok) setRules(rulesBody.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the organisation chart");
    }
  }, [cycleId]);

  useEffect(() => {
    setPlans(null);
    setChosen(new Set());
    void loadLevels();
  }, [loadLevels]);

  const addLevels = useCallback(async () => {
    if (!chosen.size) return;
    setBusy("add");
    setError("");
    try {
      const res = await fetch("/api/assessments/participants/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, tiers: [...chosen] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add participants");
      const skippedNote = body.skipped?.length
        ? ` ${body.skipped.length} skipped (${[...new Set(body.skipped.map((s: { reason: string }) => s.reason))].join("; ")}).`
        : "";
      setNotice(`Added ${body.added?.length ?? 0} participants.${skippedNote}`);
      setChosen(new Set());
      await loadLevels();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add participants");
    } finally {
      setBusy("");
    }
  }, [chosen, cycleId, loadLevels, onChanged]);

  const preview = useCallback(async () => {
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/assessments/reviewers/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, dryRun: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not plan raters");
      setPlans(body.plans ?? []);
      setTotalNew(body.totalNewRaters ?? 0);
      if (body.rules) {
        setRules((current) => (current ? { ...current, ...body.rules } : current));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not plan raters");
    } finally {
      setBusy("");
    }
  }, [cycleId]);

  const apply = useCallback(async () => {
    setBusy("apply");
    setError("");
    try {
      const res = await fetch("/api/assessments/reviewers/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, dryRun: false }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not assign raters");
      setNotice(
        `${body.created ?? 0} rater assignments created. No invitations have been sent — issue them from the 360 console when you are ready.`,
      );
      setPlans(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign raters");
    } finally {
      setBusy("");
    }
  }, [cycleId, onChanged]);

  const saveRules = useCallback(
    async (patch: Partial<Rules>) => {
      setBusy("rules");
      setError("");
      try {
        const res = await fetch("/api/assessments/cycles/rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId, ...patch }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not save the rules");
        setRules(body.rules);
        setPlans(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the rules");
      } finally {
        setBusy("");
      }
    },
    [cycleId],
  );

  const locked = Boolean(rules?.lockedAt);
  const cycleName = cycles.find((c) => c.id === cycleId)?.name ?? "this cycle";

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-black">
        <Users className="h-4 w-4" /> Build the cohort from the org chart
      </h2>
      <p className="mt-1 text-sm text-muted">
        Add everyone at a level as participants, then let Pulse pick their raters. Only external
        people — customers — need entering by hand.
      </p>

      {feasibility && !feasibility.feasible ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {feasibility.message}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {/* Step 1 — participants by level */}
      <h3 className="mt-5 text-xs font-black uppercase tracking-wide text-muted">1 · Who is assessed</h3>
      <div className="mt-2 space-y-2">
        {levels.map((level) => {
          const remaining = level.total - level.alreadyParticipants;
          return (
            <label
              key={level.tier}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={chosen.has(level.tier)}
                disabled={remaining === 0}
                onChange={(e) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(level.tier);
                    else next.delete(level.tier);
                    return next;
                  })
                }
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-black">
                  {level.label} — {level.total} {level.total === 1 ? "person" : "people"}
                </span>
                <span className="block text-xs text-muted">
                  {level.alreadyParticipants ? `${level.alreadyParticipants} already in this cycle. ` : ""}
                  {remaining ? `${remaining} would be added. ` : "Nobody left to add. "}
                  {level.missingEmail ? `${level.missingEmail} have no email and will be skipped.` : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void addLevels()}
        disabled={!chosen.size || busy === "add"}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-40"
      >
        {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        Add the selected levels
      </button>

      {/* Step 2 — the rules */}
      <h3 className="mt-6 text-xs font-black uppercase tracking-wide text-muted">2 · Rater rules</h3>
      {rules ? (
        <>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            {(
              [
                ["Colleagues each", "colleague"],
                ["Direct reports each", "direct_report"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="text-xs">
                <span className="mb-1 block font-bold text-muted">{label}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rules.quota[key]}
                  disabled={locked || busy === "rules"}
                  onChange={(e) =>
                    void saveRules({ quota: { ...rules.quota, [key]: Number(e.target.value) } } as Partial<Rules>)
                  }
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
                />
              </label>
            ))}
            <label className="text-xs">
              <span className="mb-1 block font-bold text-muted">Minimum to show a group</span>
              <input
                type="number"
                min={2}
                max={5}
                value={rules.minimumPerGroup}
                disabled={locked || busy === "rules"}
                onChange={(e) => void saveRules({ minimumPerGroup: Number(e.target.value) } as Partial<Rules>)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold text-muted">Groups below the minimum</span>
              <select
                value={rules.suppressionMode}
                disabled={locked || busy === "rules"}
                onChange={(e) => void saveRules({ suppressionMode: e.target.value as "merge" | "suppress" })}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="merge">Pool into &quot;Others&quot;</option>
                <option value="suppress">Hide from the report</option>
              </select>
            </label>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted">
            {locked ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>
              {locked
                ? `Locked when the first invitation was sent. Raters were promised confidentiality on these terms, so they cannot change now — clone ${cycleName} to run it differently.`
                : "Editable until the first invitation is sent. After that they are frozen, because the invitation email promises confidentiality on these terms."}
            </span>
          </p>
        </>
      ) : null}

      {/* Step 3 — the plan */}
      <h3 className="mt-6 text-xs font-black uppercase tracking-wide text-muted">3 · Who rates them</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void preview()}
          disabled={busy === "preview"}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-4 text-sm font-black disabled:opacity-40"
        >
          {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Preview the rater plan
        </button>
        {plans?.length ? (
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy === "apply" || !totalNew}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Create {totalNew} rater assignment{totalNew === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      {plans ? (
        <ul className="mt-3 space-y-2">
          {plans.map((plan) => (
            <li key={plan.subjectId} className="rounded-lg border border-border bg-background p-3">
              <p className="text-sm font-black">{plan.subjectName}</p>
              {plan.newRaters.length ? (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {plan.newRaters.map((rater) => (
                    <li key={`${rater.group}-${rater.email}`}>
                      <span className="font-bold">{GROUP_LABEL[rater.group] ?? rater.group}</span>
                      {" · "}
                      {rater.name}{" "}
                      <span className="text-muted">
                        {rater.email} — {rater.rationale}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {plan.unlinked ? "" : "Every rater Pulse would assign is already in place."}
                </p>
              )}
              {plan.shortfalls.map((shortfall, index) => (
                <p
                  key={`${shortfall.group}-${index}`}
                  className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-800"
                >
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {shortfall.message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      {plans && !plans.length ? (
        <p className="mt-3 text-sm text-muted">No participants in this cycle yet — add some above first.</p>
      ) : null}
    </section>
  );
}
