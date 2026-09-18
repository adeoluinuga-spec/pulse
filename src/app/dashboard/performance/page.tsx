"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PlanningNav from "@/components/planning/PlanningNav";
import { useUser } from "@/context/UserContext";

/**
 * Performance, at a glance, pointing to where the work actually lives.
 *
 * This page used to be a separate performance dashboard with its own goals —
 * editable here, saved nowhere — and a history of appraisal scores that were
 * made up. The real goals, KPIs, strategy and appraisal each have their own
 * workspace now; this page counts what is in them and links to them, so there
 * is one place to change anything.
 */

type Goal = { owner_id: string | null; percent_complete: number | null; status: string | null };
type Kpi = { employee_id: string | null };

export default function PerformancePage() {
  const { user } = useUser();
  const [counts, setCounts] = useState<{ goals: number; averageProgress: number | null; atRisk: number; kpis: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/goals?ownerId=${encodeURIComponent(user.id)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/kpis", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([goalBody, kpiBody]: [{ goals?: Goal[] }, { kpis?: Kpi[] }]) => {
        if (cancelled) return;
        const goals = goalBody.goals ?? [];
        setCounts({
          goals: goals.length,
          averageProgress: goals.length ? Math.round(goals.reduce((sum, goal) => sum + (goal.percent_complete ?? 0), 0) / goals.length) : null,
          atRisk: goals.filter((goal) => goal.status === "at_risk" || goal.status === "behind").length,
          kpis: (kpiBody.kpis ?? []).filter((kpi) => kpi.employee_id === user.id).length,
        });
      })
      .catch(() => !cancelled && setError("Could not load your goals and KPIs. Please retry."));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const cards = [
    {
      href: "/goals",
      title: "Goals",
      body: counts ? (counts.goals ? `${counts.goals} goal${counts.goals === 1 ? "" : "s"} · ${counts.averageProgress}% average progress${counts.atRisk ? ` · ${counts.atRisk} at risk` : ""}` : "No goals set yet") : "…",
    },
    { href: "/kpis", title: "KPIs", body: counts ? (counts.kpis ? `${counts.kpis} KPI${counts.kpis === 1 ? "" : "s"} you own` : "No KPIs yet") : "…" },
    { href: "/appraisal", title: "Appraisal", body: "Your self-review, your manager's review, and released results" },
    { href: "/strategy", title: "Strategy", body: "How your goals connect to the organisation's objectives" },
    { href: "/dashboard/reports", title: "Work reports", body: "Weekly and monthly reports — they count towards your appraisal" },
  ];

  return (
    <div className="dashboard-page space-y-5 px-4">
      <PlanningNav />
      {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-soft p-4 text-sm text-red">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-lg border border-border bg-card p-4 hover:border-pulse">
            <p className="text-base font-semibold text-ink">{card.title} →</p>
            <p className="mt-1 text-sm text-muted">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
