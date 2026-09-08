"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertCircle, Bell, CheckCircle2, ClipboardList, Loader2, Mail, ShieldCheck } from "lucide-react";

import type { MyAssessmentStatus } from "@/lib/assessmentDashboard";

type LoadState =
  | { loading: true; status: null; error: "" }
  | { loading: false; status: MyAssessmentStatus | null; error: string };

const toneStyles: Record<MyAssessmentStatus["tone"], string> = {
  success: "border-green/25 bg-green-soft text-green",
  warning: "border-amber/25 bg-amber-soft text-amber",
  neutral: "border-border bg-paper text-muted",
};

export default function My360StatusCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<LoadState>({ loading: true, status: null, error: "" });

  useEffect(() => {
    let alive = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/assessments/my-status", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!alive) return;
        if (!response.ok) {
          setState({ loading: false, status: null, error: payload?.error || "Could not load your 360 status." });
          return;
        }
        setState({ loading: false, status: payload.status as MyAssessmentStatus, error: "" });
      } catch {
        if (alive) setState({ loading: false, status: null, error: "Could not load your 360 status." });
      }
    }

    loadStatus();
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) {
    return (
      <section className={clsx("rounded-lg border border-border bg-card p-4", compact ? "" : "md:p-5")}>
        <div className="flex items-center gap-2 text-sm font-bold text-muted">
          <Loader2 size={16} className="animate-spin text-pulse" />
          Checking your 360 assessment status...
        </div>
      </section>
    );
  }

  if (state.error || !state.status) {
    return (
      <section className="rounded-lg border border-red/20 bg-red-soft p-4 text-sm font-bold text-red">
        {state.error || "Could not load your 360 status."}
      </section>
    );
  }

  const status = state.status;

  return (
    <section className={clsx("rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-sm)]", compact ? "" : "md:p-5")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-cobalt-light text-cobalt">
              <ClipboardList size={16} />
            </span>
            <span className={clsx("rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-widest", toneStyles[status.tone])}>
              {status.cycleLabel}
            </span>
            {status.unreadAssessmentNotifications > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-pulse-soft px-2.5 py-1 text-[11px] font-black text-pulse">
                <Bell size={12} />
                {status.unreadAssessmentNotifications} unread
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 font-syne text-xl font-bold leading-tight text-ink">
            {status.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {status.body}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 md:w-[300px]">
          <MiniStat label="Assessee" value={status.participantCount} />
          <MiniStat label="Pending" value={status.pendingReviews} />
          <MiniStat label="Done" value={status.submittedReviews} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <StatusLine
          icon={<ShieldCheck size={15} />}
          text={status.participantCount > 0 ? "You are included in this 360 cycle." : "You are not listed as an assessee in this cycle."}
          active={status.participantCount > 0}
        />
        <StatusLine
          icon={<Mail size={15} />}
          text={status.pendingReviews > 0 ? "Use the secure email link for each review." : "No review request is pending from you."}
          active={status.pendingReviews > 0}
        />
        <StatusLine
          icon={status.cycleIsCollecting ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          text={status.cycleIsCollecting ? "The 360 collection window is open." : "The collection window is not open."}
          active={status.cycleIsCollecting}
        />
      </div>

      {!compact ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Link href="/dashboard/reports" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-paper px-4 text-xs font-black text-ink hover:border-cobalt/40">
            View released reports
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-paper p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function StatusLine({ icon, text, active }: { icon: ReactNode; text: string; active: boolean }) {
  return (
    <div className={clsx("flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-bold leading-relaxed", active ? "bg-cobalt-light text-cobalt-dark" : "bg-paper text-muted")}>
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
