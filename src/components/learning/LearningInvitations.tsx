"use client";
import { useEffect, useRef, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import {
  invitationUnavailable,
  type InvitationTrainee,
} from "@/lib/learningInvitations";
import { useToast } from "@/components/ui/Toast";
import s from "./learning.module.css";

type Trainee = InvitationTrainee & {
  id: string;
  display_name: string;
  token: string | null;
};
type Result = { status: "sending" | "accepted" | "failed"; message: string };

export default function LearningInvitations({
  cohortId,
  active,
  trainees,
}: {
  cohortId: string;
  active: boolean;
  trainees: Trainee[];
}) {
  const { showToast } = useToast();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [sending, setSending] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requests = useRef<Record<string, { token: string | null; id: string }>>(
    {},
  );
  const eligible = trainees.filter((t) => t.token && !invitationUnavailable(t));
  async function send(targets: Trainee[]) {
    if (locked.current || !active || !targets.length) return;
    locked.current = true;
    setSending(true);
    let accepted = 0;
    try {
      for (const t of targets) {
        if (!mounted.current) break;
        if (requests.current[t.id]?.token !== t.token)
          requests.current[t.id] = { token: t.token, id: crypto.randomUUID() };
        setResults((old) => ({
          ...old,
          [t.id]: { status: "sending", message: "Sending..." },
        }));
        try {
          const response = await fetch(
            `/api/learning/cohorts/${cohortId}/invitations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                traineeId: t.id,
                requestId: requests.current[t.id].id,
              }),
            },
          );
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error || "Could not confirm sending. Please retry.",
            );
          accepted++;
          delete requests.current[t.id];
          setResults((old) => ({
            ...old,
            [t.id]: { status: "accepted", message: "Accepted by Resend" },
          }));
        } catch (e) {
          setResults((old) => ({
            ...old,
            [t.id]: {
              status: "failed",
              message:
                e instanceof Error ? e.message : "Could not confirm sending.",
            },
          }));
        }
        // Pace a shared Resend account and avoid a long-running bulk HTTP request.
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (mounted.current)
        showToast(
          `${accepted} invitation${accepted === 1 ? "" : "s"} accepted by Resend; ${targets.length - accepted} unsuccessful.`,
          accepted === targets.length ? "success" : "error",
        );
    } finally {
      locked.current = false;
      setSending(false);
    }
  }
  const pending = eligible.filter((t) => results[t.id]?.status !== "accepted");
  return (
    <details>
      <summary className={s.button}>
        <Mail size={16} /> Email invitations
      </summary>
      <div className={s.row}>
        <button
          className={s.primary}
          disabled={!active || sending || !pending.length}
          onClick={() => void send(pending)}
        >
          <Mail size={16} />
          {sending ? "Sending invitations..." : "Send invitations"}
        </button>
        <span className={s.muted}>
          {eligible.length} eligible / {trainees.length} trainees
        </span>
      </div>
      <p className={s.muted}>
        Keep this page open while sending. Results below apply to this session;
        acceptance is not confirmation of inbox delivery.
      </p>
      {!active && <p className={s.error}>This programme is archived.</p>}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Trainee</th>
              <th>Email invitation</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {trainees.map((t) => {
              const unavailable =
                invitationUnavailable(t) ||
                (!t.token ? "Issue a new personal link first." : null);
              const result = results[t.id];
              return (
                <tr key={t.id}>
                  <td>
                    {t.display_name}
                    <p className={s.muted}>{t.email || "No email"}</p>
                  </td>
                  <td aria-live="polite">
                    {unavailable ||
                      result?.message ||
                      "Not sent in this session"}
                  </td>
                  <td>
                    <button
                      className={s.icon}
                      title={`${result?.status === "accepted" ? "Resend" : "Send"} invitation to ${t.display_name}`}
                      aria-label={`${result?.status === "accepted" ? "Resend" : "Send"} invitation to ${t.display_name}`}
                      disabled={!active || sending || !!unavailable}
                      onClick={() => void send([t])}
                    >
                      {result ? <RefreshCw size={16} /> : <Mail size={16} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
