"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, Trash2, UserMinus, UserPlus } from "lucide-react";

import CohortBuilder from "./CohortBuilder";

/**
 * Taking people back out of a cycle.
 *
 * Until this existed a participant or a rater could be added and never removed:
 * a wrong address, a duplicate, or somebody who left the company stayed in the
 * cohort permanently, counted in the headline number and shown as blocked on
 * the completion dashboard forever.
 *
 * Nothing here asks the operator to choose between deleting and withdrawing.
 * The server decides from what has been collected, and this page asks it first
 * — so the confirmation says what will actually happen to this particular
 * person, rather than describing a rule and hoping it applies.
 */

type Cycle = { id: string; name: string; status: string };

type Participant = {
  id: string;
  name: string | null;
  email: string | null;
  level: string | null;
  function_name: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
};

type Rater = {
  id: string;
  subject_id: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewer_group: string | null;
  status: string | null;
  invite_status: string | null;
};

type Decision = { action: "delete" | "withdraw" | "revoke" | "blocked"; explanation: string };

type Pending = {
  kind: "participant" | "rater";
  id: string;
  label: string;
  decision: Decision;
};

const GROUP_LABEL: Record<string, string> = {
  self: "Self",
  line_manager: "Line manager",
  colleague: "Colleague",
  direct_report: "Direct report",
  customer: "Customer",
};

export default function ParticipantConsole() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [raters, setRaters] = useState<Rater[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    fetch("/api/assessments/cycles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: Cycle[] = d.cycles ?? [];
        setCycles(list);
        setCycleId((current) => current || list[0]?.id || "");
      })
      .catch(() => setError("Could not load assessment cycles."))
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [subjectsRes, ratersRes] = await Promise.all([
        fetch(`/api/assessments/subjects?cycleId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/assessments/reviewers?cycleId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      const subjectsBody = await subjectsRes.json();
      const ratersBody = await ratersRes.json();
      if (!subjectsRes.ok) throw new Error(subjectsBody.error ?? "Could not load participants");
      setParticipants(subjectsBody.subjects ?? []);
      setRaters(ratersRes.ok ? ratersBody.reviewers ?? [] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load participants");
      setParticipants([]);
      setRaters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cycleId);
  }, [cycleId, load]);

  /** Asks the server what removing this row would do, without doing it. */
  const ask = useCallback(
    async (kind: "participant" | "rater", id: string, label: string) => {
      setBusyId(id);
      setNotice("");
      try {
        const url =
          kind === "participant"
            ? `/api/assessments/subjects?id=${encodeURIComponent(id)}&cycleId=${encodeURIComponent(cycleId)}&dryRun=true`
            : `/api/assessments/reviewers?id=${encodeURIComponent(id)}&dryRun=true`;
        const res = await fetch(url, { method: "DELETE" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not check this person");
        setPending({ kind, id, label, decision: body.decision });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not check this person");
      } finally {
        setBusyId("");
      }
    },
    [cycleId],
  );

  const confirm = useCallback(async () => {
    if (!pending) return;
    setBusyId(pending.id);
    setError("");
    try {
      const url =
        pending.kind === "participant"
          ? `/api/assessments/subjects?id=${encodeURIComponent(pending.id)}&cycleId=${encodeURIComponent(cycleId)}`
          : `/api/assessments/reviewers?id=${encodeURIComponent(pending.id)}`;
      const res = await fetch(url, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Removal failed");

      setNotice(
        body.deleted
          ? `${pending.label} was removed from the cycle${body.ratersRemoved ? `, along with ${body.ratersRemoved} rater assignment${body.ratersRemoved === 1 ? "" : "s"}` : ""}.`
          : body.withdrawn
            ? `${pending.label} was withdrawn. Their feedback is kept but excluded from scoring, reports and exports.`
            : `${pending.label}'s link was revoked. Their existing answers still count.`,
      );
      setPending(null);
      await load(cycleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setBusyId("");
    }
  }, [pending, cycleId, load]);

  const reinstate = useCallback(
    async (participant: Participant) => {
      setBusyId(participant.id);
      setError("");
      try {
        const res = await fetch("/api/assessments/subjects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId, subjectId: participant.id, action: "reinstate" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not reinstate");
        setNotice(`${participant.name ?? "Participant"} is back in the cycle.`);
        await load(cycleId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reinstate");
      } finally {
        setBusyId("");
      }
    },
    [cycleId, load],
  );

  const active = participants.filter((p) => !p.withdrawn_at);
  const withdrawn = participants.filter((p) => p.withdrawn_at);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto w-full max-w-4xl">
        <Link href="/assessments" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to the 360 console
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black leading-tight">Participants and raters</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Remove someone added by mistake, or take out a person who has left. What happens depends
              on whether feedback has already been given — Pulse checks before you confirm and tells you
              which it will be.
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-bold text-muted">Cycle</span>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {cycleId ? (
          <CohortBuilder cycles={cycles} cycleId={cycleId} onChanged={() => void load(cycleId)} />
        ) : null}

        {notice ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : null}

        {pending ? (
          <div className="mt-5 rounded-lg border-2 border-ink/20 bg-card p-4 shadow-sm">
            <p className="text-sm font-black">
              {pending.decision.action === "delete"
                ? `Remove ${pending.label} from this cycle?`
                : pending.decision.action === "withdraw"
                  ? `Withdraw ${pending.label} from this cycle?`
                  : pending.decision.action === "revoke"
                    ? `Revoke ${pending.label}'s link?`
                    : `${pending.label} cannot be removed`}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">{pending.decision.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.decision.action !== "blocked" ? (
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={Boolean(busyId)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-40"
                >
                  {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {pending.decision.action === "delete"
                    ? "Remove them"
                    : pending.decision.action === "withdraw"
                      ? "Withdraw them"
                      : "Revoke the link"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPending(null)}
                className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 px-4 text-sm font-black"
              >
                {pending.decision.action === "blocked" ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}

        {!loading ? (
          <>
            <h2 className="mt-7 text-sm font-black uppercase tracking-wide text-muted">
              Being assessed ({active.length})
            </h2>
            <ul className="mt-3 space-y-2">
              {active.map((participant) => {
                const theirRaters = raters.filter((r) => r.subject_id === participant.id);
                return (
                  <li key={participant.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black leading-6">{participant.name ?? "Unnamed"}</p>
                        <p className="mt-0.5 text-xs font-bold text-muted">{participant.email ?? "no email"}</p>
                        <p className="mt-1 text-xs text-muted">
                          {theirRaters.length === 0
                            ? "No raters assigned"
                            : `${theirRaters.length} rater${theirRaters.length === 1 ? "" : "s"}: ${theirRaters
                                .map((r) => `${r.reviewer_name ?? "?"} (${GROUP_LABEL[r.reviewer_group ?? ""] ?? r.reviewer_group})`)
                                .join(", ")}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void ask("participant", participant.id, participant.name ?? "This participant")}
                        disabled={busyId === participant.id}
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-black disabled:opacity-40"
                      >
                        {busyId === participant.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                        Remove
                      </button>
                    </div>

                    {theirRaters.length ? (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3">
                        {theirRaters.map((rater) => (
                          <li key={rater.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate">
                              <span className="font-bold">{rater.reviewer_name ?? "Unnamed rater"}</span>{" "}
                              <span className="text-muted">
                                {rater.reviewer_email} · {GROUP_LABEL[rater.reviewer_group ?? ""] ?? rater.reviewer_group} ·{" "}
                                {rater.status} · invite {rater.invite_status}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void ask("rater", rater.id, rater.reviewer_name ?? "This rater")}
                              disabled={busyId === rater.id}
                              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 font-black disabled:opacity-40"
                            >
                              {busyId === rater.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {!active.length ? (
              <p className="mt-3 rounded-lg border border-border bg-card p-4 text-sm text-muted">
                Nobody is being assessed in this cycle yet.
              </p>
            ) : null}

            {withdrawn.length ? (
              <>
                <h2 className="mt-7 text-sm font-black uppercase tracking-wide text-muted">
                  Withdrawn ({withdrawn.length})
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Excluded from scoring, reports, exports and completion. Their feedback is kept.
                </p>
                <ul className="mt-3 space-y-2">
                  {withdrawn.map((participant) => (
                    <li
                      key={participant.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 opacity-80 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{participant.name ?? "Unnamed"}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Withdrawn{" "}
                          {participant.withdrawn_at
                            ? new Date(participant.withdrawn_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })
                            : ""}
                          {participant.withdrawn_reason ? ` — ${participant.withdrawn_reason}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void reinstate(participant)}
                        disabled={busyId === participant.id}
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-black disabled:opacity-40"
                      >
                        {busyId === participant.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        Put back in the cycle
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}

        <p className="mt-7 flex items-start gap-2 text-xs leading-5 text-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Somebody nobody has rated yet is removed outright. Once feedback exists it is never deleted:
            a participant is withdrawn and a rater&apos;s link is revoked, because dropping answers would
            change which rater groups are large enough to show in everyone&apos;s report. A participant whose
            report has already been released cannot be removed at all.
          </span>
        </p>
      </section>
    </main>
  );
}
