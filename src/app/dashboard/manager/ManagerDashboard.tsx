"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import clsx from "clsx";
import { useUser } from "@/context/UserContext";
import { getSupabase } from "@/lib/supabase";

interface DirectReport {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  avatarColor: string;
  performanceScore: number;
  badge: string;
}

interface GoalRow {
  owner_id: string;
  percent_complete: number;
  status: string;
}

interface ReportRow {
  employee_id: string;
  submitted_at: string | null;
  status: string | null;
}

function scoreColor(score: number) {
  if (score >= 75) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-pulse";
}

function barColor(score: number) {
  if (score >= 75) return "bg-green";
  if (score >= 60) return "bg-amber";
  return "bg-pulse";
}

export default function ManagerDashboard() {
  const { user, loading } = useUser();
  const [team, setTeam] = useState<DirectReport[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
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

      const supabase = getSupabase();
      const { data: directReports } = await supabase
        .from("employees")
        .select("id, name, initials, role, department, avatar_color, performance_score, badge")
        .eq("line_manager_id", user.id)
        .order("name", { ascending: true });

      const teamRows = (directReports ?? []) as Record<string, unknown>[];
      const mappedTeam: DirectReport[] = teamRows.map((row) => ({
        id: row.id as string,
        name: (row.name as string) ?? "",
        initials: (row.initials as string) ?? "PU",
        role: (row.role as string) ?? "",
        department: (row.department as string) ?? "",
        avatarColor: (row.avatar_color as string) ?? "#e8440a",
        performanceScore: (row.performance_score as number) ?? 0,
        badge: (row.badge as string) ?? "Good Standing",
      }));

      const reportIds = mappedTeam.map((member) => member.id);
      let goalRows: GoalRow[] = [];
      let reportRows: ReportRow[] = [];

      if (reportIds.length > 0) {
        const [{ data: goalData }, { data: reportData }] = await Promise.all([
          supabase
            .from("goals")
            .select("owner_id, percent_complete, status")
            .in("owner_id", reportIds),
          supabase
            .from("reports")
            .select("employee_id, submitted_at, status")
            .in("employee_id", reportIds)
            .order("submitted_at", { ascending: false }),
        ]);
        goalRows = (goalData ?? []) as GoalRow[];
        reportRows = (reportData ?? []) as ReportRow[];
      }

      if (!active) return;
      setTeam(mappedTeam);
      setGoals(goalRows);
      setReports(reportRows);
      setDataLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [loading, user.id]);

  const avgScore = useMemo(() => {
    if (!team.length) return 0;
    return Math.round(
      team.reduce((sum, member) => sum + member.performanceScore, 0) / team.length,
    );
  }, [team]);

  const riskCount = team.filter(
    (member) => member.badge === "At Risk" || member.badge === "Needs Improvement",
  ).length;

  const avgGoal = useMemo(() => {
    if (!goals.length) return 0;
    return Math.round(
      goals.reduce((sum, goal) => sum + goal.percent_complete, 0) / goals.length,
    );
  }, [goals]);

  const latestReportByEmployee = useMemo(() => {
    const map = new Map<string, ReportRow>();
    reports.forEach((report) => {
      if (!map.has(report.employee_id)) map.set(report.employee_id, report);
    });
    return map;
  }, [reports]);

  if (loading || dataLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          <Loader2 size={16} className="animate-spin text-pulse" />
          Loading team workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="px-5 pt-5">
        <div className="rounded-[24px] bg-ink p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-pulse" />
            <span className="type-label text-pulse">Team Intelligence</span>
          </div>
          <p
            className="mb-1 text-[17px] font-medium leading-snug text-white"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {user.name.split(" ")[0] || "Manager"}, here is your live team view.
          </p>
          <p className="mb-5 text-sm leading-relaxed text-white/55">
            This page only uses people assigned to you in this organisation.
            Seeded demo employees will not appear in a live tenant.
          </p>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Team", value: String(team.length), accent: false },
              { label: "Avg", value: `${avgScore}%`, accent: false },
              { label: "At Risk", value: String(riskCount), accent: riskCount > 0 },
              { label: "Goals", value: `${avgGoal}%`, accent: false },
            ].map((stat) => (
              <div key={stat.label}>
                <p
                  className={clsx(
                    "text-xl font-bold leading-none",
                    stat.accent ? "text-pulse" : "text-white",
                  )}
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {stat.value}
                </p>
                <p className="mt-1 text-[10px] leading-none text-white/35">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {team.length === 0 ? (
        <section className="px-5">
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-pulse-soft text-pulse">
              <Users size={20} />
            </div>
            <p className="text-sm font-semibold text-ink">No direct reports yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Once HR assigns employees to you as line manager, they will appear
              here with their live goals and reports.
            </p>
          </div>
        </section>
      ) : (
        <section className="px-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="type-label">Direct Reports</p>
            <span className="text-[11px] text-muted">{team.length} people</span>
          </div>
          <div className="space-y-2.5">
            {team.map((member) => {
              const latestReport = latestReportByEmployee.get(member.id);
              return (
                <div
                  key={member.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: member.avatarColor }}
                    >
                      {member.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {member.name}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {member.role || member.department || "Employee"}
                      </p>
                    </div>
                    <p className={clsx("text-lg font-bold", scoreColor(member.performanceScore))}>
                      {member.performanceScore || "--"}
                    </p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className={clsx("h-full rounded-full", barColor(member.performanceScore))}
                      style={{ width: `${member.performanceScore || 0}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>{member.badge}</span>
                    <span>
                      {latestReport?.submitted_at
                        ? `Report ${latestReport.submitted_at.slice(0, 10)}`
                        : "No reports yet"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="px-5">
        <div className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted">
          Team management actions will appear here as employees submit reports
          and HR completes the live organisation setup.
        </div>
      </section>
    </div>
  );
}
