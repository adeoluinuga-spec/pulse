"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Loader2, Target } from "lucide-react";
import clsx from "clsx";
import My360StatusCard from "@/components/assessments/My360StatusCard";
import { useUser } from "@/context/UserContext";
import { getMyGoals } from "@/lib/api/goals";
import { getMyReports } from "@/lib/api/reports";
import type { Goal, Report } from "@/types";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function barColor(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

function EmptyBlock({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-pulse-soft text-pulse">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export default function EmployeeDashboard() {
  const { user, loading } = useUser();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (loading) return;
      if (user.id === "unlinked") {
        setDataLoading(false);
        return;
      }
      setDataLoading(true);
      const [goalRows, reportRows] = await Promise.all([
        getMyGoals(),
        getMyReports(5),
      ]);
      if (!active) return;
      setGoals(goalRows);
      setReports(reportRows);
      setDataLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [loading, user.id]);

  const firstName = useMemo(() => user.name.split(" ")[0] || "there", [user.name]);
  const activeGoals = goals.filter((goal) => goal.status !== "completed");
  const onTrackGoals = goals.filter(
    (goal) => goal.status === "on_track" || goal.status === "completed",
  );
  const latestReport = reports[0];

  if (loading || dataLoading) {
    return (
      <div className="dashboard-page flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          <Loader2 size={16} className="animate-spin text-pulse" />
          Loading your workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page space-y-5">
      <section className="px-4">
        <div className="rounded-[20px] bg-ink p-5">
          <p className="text-sm text-white/45">{greeting()},</p>
          <h1
            className="mt-0.5 text-xl font-bold text-white"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {firstName}
          </h1>

          <div className="mt-5 flex items-end gap-2">
            <span
              className="text-5xl font-bold leading-none text-white"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {user.performanceScore || "--"}
            </span>
            <span className="pb-1.5 text-sm font-semibold text-white/45">
              {user.performanceScore ? "current score" : "score pending"}
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-pulse"
              style={{ width: `${user.performanceScore || 0}%` }}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-pulse/20 px-2.5 py-1 text-[11px] font-semibold text-pulse">
              {user.badge}
            </span>
            {user.department && (
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/55">
                {user.department}
              </span>
            )}
            {user.role && (
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/55">
                {user.role}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="px-4">
        <My360StatusCard compact />
      </section>

      <section className="grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="type-label mb-2">Goals On Track</p>
          <p className="text-3xl font-bold text-ink">
            {onTrackGoals.length}
            <span className="text-base font-medium text-muted">/{goals.length}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="type-label mb-2">Reports</p>
          <p className="text-3xl font-bold text-ink">{reports.length}</p>
        </div>
        <div className="rounded-2xl bg-pulse p-4">
          <p className="type-label mb-2 text-white/55">Week Streak</p>
          <p className="text-3xl font-bold text-white">{user.weekStreak || 0}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="type-label mb-2">Peer Rating</p>
          <p className="text-3xl font-bold text-ink">
            {user.peerRating || "--"}
            {user.peerRating ? <span className="text-base text-muted">/5</span> : null}
          </p>
        </div>
      </section>

      <section className="px-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="type-label">Active Goals</p>
          <Link href="/goals" className="text-xs font-semibold text-pulse">
            View all
          </Link>
        </div>

        {activeGoals.length === 0 ? (
          <EmptyBlock
            icon={<Target size={18} />}
            title="No goals assigned yet"
            body="This workspace is clean. Goals will appear here once HR or your manager creates them."
          />
        ) : (
          <div className="space-y-2.5">
            {activeGoals.slice(0, 4).map((goal) => (
              <Link
                key={goal.id}
                href="/goals"
                className="block rounded-2xl border border-border bg-card p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-ink">{goal.name}</p>
                  <span className="text-xs font-bold text-ink">
                    {goal.percentComplete}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={clsx("h-full rounded-full", barColor(goal.percentComplete))}
                    style={{ width: `${goal.percentComplete}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="type-label">Weekly Reports</p>
          <Link
            href="/reports/submit"
            className="inline-flex items-center gap-1 text-xs font-semibold text-pulse"
          >
            Submit <ArrowRight size={12} />
          </Link>
        </div>

        {!latestReport ? (
          <EmptyBlock
            icon={<FileText size={18} />}
            title="No reports submitted"
            body="Your submitted reports will appear here after you send your first weekly update."
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase text-muted">
              Latest report · {latestReport.date || "recent"}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink">
              {latestReport.qualitative || "Report submitted successfully."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
