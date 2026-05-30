"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getSupabase } from "@/lib/supabase";

interface OrgRow {
  id: string;
  name: string;
  current_cycle: string | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  department: string | null;
  team: string | null;
  role: string | null;
  platform_role: string | null;
  performance_score: number | null;
  consistency_index: number | null;
  badge: string | null;
  ai_rec: { recommendation?: string; confidence?: number; evidence?: string[] } | null;
}

interface GoalRow {
  id: string;
  title: string;
  goal_type: string;
  department: string | null;
  team: string | null;
  percent_complete: number | null;
  status: string | null;
  due_date: string | null;
}

interface ExecutiveState {
  org: OrgRow | null;
  employees: EmployeeRow[];
  goals: GoalRow[];
}

interface ExecutiveMetrics {
  staff: EmployeeRow[];
  departments: string[];
  teams: string[];
  orgScore: number;
  consistency: number;
  orgGoals: GoalRow[];
  teamGoals: GoalRow[];
  goalProgress: number;
  atRiskGoals: GoalRow[];
  riskEmployees: EmployeeRow[];
  readiness: number;
  enoughForDashboard: boolean;
}

type ViewTab = "overview" | "goals" | "talent" | "readiness";

const tabs: Array<{ key: ViewTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "goals", label: "Goals" },
  { key: "talent", label: "Talent" },
  { key: "readiness", label: "Readiness" },
];

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function scoreTone(score: number) {
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

function barTone(score: number) {
  if (score >= 80) return "bg-green";
  if (score >= 60) return "bg-amber";
  return "bg-red";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EX";
}

export default function ExecutiveDashboard() {
  const { user } = useUser();
  const [active, setActive] = useState<ViewTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState<ExecutiveState>({ org: null, employees: [], goals: [] });
  const [briefing, setBriefing] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadExecutiveData() {
      setLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setError("Session not found. Sign in again.");
          return;
        }

        const { data: me, error: meError } = await supabase
          .from("employees")
          .select("org_id")
          .eq("user_id", authUser.id)
          .single();

        const orgId = (me as { org_id?: string } | null)?.org_id;
        if (meError || !orgId) {
          setError("Your executive profile is not linked to an organisation yet.");
          return;
        }

        const [orgResult, employeeResult, goalResult] = await Promise.all([
          supabase
            .from("organisations")
            .select("id, name, current_cycle, cycle_start_date, cycle_end_date")
            .eq("id", orgId)
            .single(),
          supabase
            .from("employees")
            .select("id, name, email, department, team, role, platform_role, performance_score, consistency_index, badge, ai_rec")
            .eq("org_id", orgId)
            .order("created_at", { ascending: true }),
          supabase
            .from("goals")
            .select("id, title, goal_type, department, team, percent_complete, status, due_date")
            .eq("org_id", orgId)
            .order("created_at", { ascending: true }),
        ]);

        if (!alive) return;

        setState({
          org: (orgResult.data as OrgRow | null) ?? null,
          employees: (employeeResult.data as EmployeeRow[] | null) ?? [],
          goals: (goalResult.data as GoalRow[] | null) ?? [],
        });
      } catch {
        if (alive) setError("Could not load executive data. Refresh and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadExecutiveData();

    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const staff = state.employees.filter((employee) => employee.platform_role !== "hr_admin" && employee.platform_role !== "executive_view");
    const departments = unique(state.employees.map((employee) => employee.department));
    const teams = unique(state.employees.map((employee) => employee.team));
    const scored = staff.filter((employee) => typeof employee.performance_score === "number");
    const orgScore = average(scored.map((employee) => employee.performance_score ?? 0));
    const consistency = average(staff.map((employee) => employee.consistency_index ?? 0).filter((value) => value > 0));
    const orgGoals = state.goals.filter((goal) => goal.goal_type === "org");
    const teamGoals = state.goals.filter((goal) => goal.goal_type === "team");
    const goalProgress = average(state.goals.map((goal) => goal.percent_complete ?? 0));
    const atRiskGoals = state.goals.filter((goal) => goal.status === "at_risk" || goal.status === "behind");
    const riskEmployees = staff.filter((employee) => {
      const rec = employee.ai_rec?.recommendation;
      return rec === "pip" || rec === "exit_risk" || employee.badge === "At Risk" || employee.badge === "Needs Improvement";
    });
    const readyItems = [
      staff.length > 0,
      departments.length > 0,
      teams.length > 0,
      state.goals.length > 0,
      orgGoals.length > 0,
      teamGoals.length > 0,
      scored.length > 0,
      Boolean(state.org?.current_cycle || state.org?.cycle_start_date),
    ];

    return {
      staff,
      departments,
      teams,
      orgScore,
      consistency,
      orgGoals,
      teamGoals,
      goalProgress,
      atRiskGoals,
      riskEmployees,
      readiness: Math.round((readyItems.filter(Boolean).length / readyItems.length) * 100),
      enoughForDashboard: staff.length > 0 && (state.goals.length > 0 || departments.length > 0),
    };
  }, [state]);

  async function generateBriefing() {
    if (briefingLoading) return;
    setBriefingLoading(true);
    setBriefing("");

    try {
      const response = await fetch("/api/ai/executive-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: state.org?.name ?? "the organisation",
          departments: metrics.departments.map((department) => ({
            name: department,
            score: average(
              metrics.staff
                .filter((employee) => employee.department === department)
                .map((employee) => employee.performance_score ?? 0)
                .filter((score) => score > 0),
            ),
          })),
          overallScore: metrics.orgScore,
          promotionCount: metrics.staff.filter((employee) => employee.ai_rec?.recommendation === "promote").length,
          pipCount: metrics.riskEmployees.length,
          atRiskGoals: metrics.atRiskGoals.map((goal) => goal.title),
          cycleDeadline: state.org?.cycle_end_date,
        }),
      });
      const data = await response.json();
      setBriefing(data.briefing || "Pulse does not have enough live data to produce a useful executive briefing yet.");
    } catch {
      setBriefing("Pulse could not generate a briefing right now. The live dashboard data above is still available.");
    } finally {
      setBriefingLoading(false);
    }
  }

  if (user.platformRole !== "executive_view" && user.platformRole !== "super_admin") {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-sm rounded-lg border border-border bg-card p-5 text-center shadow-[var(--shadow-lg)]">
          <ShieldCheck className="mx-auto text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-ink">Executive access is restricted.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Your profile is not configured for executive view.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-muted">Loading executive workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">
      <section className="rounded-lg bg-ink p-5 text-white md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">Executive workspace</p>
            <h1 className="mt-2 font-syne text-3xl font-bold leading-tight">
              {state.org?.name ?? "Organisation"} strategy view
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
              This dashboard stays grounded in live organisation data. It will fill up as HR adds employees, teams, goals, and appraisal settings.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-right">
            <p className="text-3xl font-bold">{metrics.readiness}%</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/42">data ready</p>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-red/20 bg-red-soft px-4 py-3 text-sm font-bold text-red">
          {error}
        </section>
      ) : null}

      {!metrics.enoughForDashboard ? (
        <ExecutiveEmptyState
          orgName={state.org?.name}
          staffCount={metrics.staff.length}
          deptCount={metrics.departments.length}
          goalCount={state.goals.length}
          readiness={metrics.readiness}
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Org score" value={metrics.orgScore || "Pending"} icon={TrendingUp} tone={metrics.orgScore >= 70 ? "green" : "ink"} />
            <MetricCard label="Employees" value={metrics.staff.length} icon={Users} />
            <MetricCard label="Goal progress" value={`${metrics.goalProgress}%`} icon={Target} tone={metrics.goalProgress >= 70 ? "green" : "amber"} />
            <MetricCard label="Risk flags" value={metrics.riskEmployees.length + metrics.atRiskGoals.length} icon={AlertTriangle} tone={metrics.riskEmployees.length ? "red" : "ink"} />
          </section>

          <section className="flex gap-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={clsx(
                  "h-10 flex-shrink-0 rounded-full border px-4 text-xs font-bold transition",
                  active === tab.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted hover:text-ink",
                )}
              >
                {tab.label}
              </button>
            ))}
          </section>

          {active === "overview" && <Overview metrics={metrics} />}
          {active === "goals" && <Goals goals={state.goals} />}
          {active === "talent" && <Talent employees={metrics.staff} />}
          {active === "readiness" && <Readiness metrics={metrics} org={state.org} />}

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black text-ink">AI executive briefing</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">Generate a briefing from the live data currently available.</p>
              </div>
              <button
                onClick={generateBriefing}
                disabled={briefingLoading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-xs font-black text-white disabled:opacity-50"
              >
                {briefingLoading ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                Generate briefing
              </button>
            </div>
            {briefing ? (
              <p className="mt-4 rounded-lg bg-paper p-4 text-sm leading-relaxed text-ink">{briefing}</p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function ExecutiveEmptyState({
  orgName,
  staffCount,
  deptCount,
  goalCount,
  readiness,
}: {
  orgName?: string;
  staffCount: number;
  deptCount: number;
  goalCount: number;
  readiness: number;
}) {
  const items = [
    { label: "Employees added", value: staffCount, done: staffCount > 0 },
    { label: "Departments created", value: deptCount, done: deptCount > 0 },
    { label: "Goals configured", value: goalCount, done: goalCount > 0 },
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-pulse-soft text-pulse">
          <BriefcaseBusiness size={23} />
        </span>
        <h2 className="mt-4 font-syne text-2xl font-bold text-ink">
          {orgName ?? "This organisation"} is still being set up.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          The executive dashboard will not show sample companies or placeholder scores. Once HR adds people, teams, goals, and appraisal settings, this view becomes the board-level operating dashboard.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-paper p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-widest text-muted">{item.label}</p>
                {item.done ? <CheckCircle2 size={16} className="text-green" /> : <span className="h-2 w-2 rounded-full bg-muted/35" />}
              </div>
              <p className="mt-3 text-3xl font-bold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Data readiness</p>
        <p className="mt-3 text-4xl font-bold text-ink">{readiness}%</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-pulse" style={{ width: `${readiness}%` }} />
        </div>
        <div className="mt-5 space-y-2">
          {[
            "HR imports employees",
            "HR defines teams and departments",
            "HR adds organisation and team goals",
            "Appraisal cycle is configured",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2">
              <ClipboardList size={15} className="text-pulse" />
              <span className="text-xs font-bold text-ink">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Overview({ metrics }: { metrics: ExecutiveMetrics }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-black text-ink">Department picture</p>
        <div className="mt-4 space-y-3">
          {metrics.departments.length ? metrics.departments.map((department) => {
            const people = metrics.staff.filter((employee) => employee.department === department);
            const score = average(people.map((employee) => employee.performance_score ?? 0).filter((value) => value > 0));
            return (
              <div key={department}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-ink">{department}</span>
                  <span className={clsx("text-sm font-black", scoreTone(score))}>{score || "Pending"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div className={clsx("h-full rounded-full", barTone(score))} style={{ width: `${score || 8}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-muted">{people.length} employees</p>
              </div>
            );
          }) : (
            <EmptyBlock title="No departments yet" body="Department performance appears after HR imports employees with department data." />
          )}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-black text-ink">Watch list</p>
        <div className="mt-4 space-y-3">
          <WatchRow label="At-risk goals" value={metrics.atRiskGoals.length} />
          <WatchRow label="Talent risk flags" value={metrics.riskEmployees.length} />
          <WatchRow label="Teams configured" value={metrics.teams.length} />
          <WatchRow label="Consistency index" value={metrics.consistency || "Pending"} />
        </div>
      </div>
    </section>
  );
}

function Goals({ goals }: { goals: GoalRow[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Organisation goals</p>
        <p className="mt-1 text-xs text-muted">{goals.length ? `${goals.length} live goals` : "No goals configured yet"}</p>
      </div>
      {goals.length ? (
        <div className="divide-y divide-border">
          {goals.map((goal) => {
            const progress = goal.percent_complete ?? 0;
            return (
              <div key={goal.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{goal.title}</p>
                    <p className="mt-1 text-xs text-muted">{goal.goal_type} · {goal.department || goal.team || "Organisation wide"}</p>
                  </div>
                  <span className="text-sm font-black text-ink">{progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                  <div className={clsx("h-full rounded-full", barTone(progress))} style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyBlock title="No goals yet" body="This view fills after HR adds organisation and team goals." />
      )}
    </section>
  );
}

function Talent({ employees }: { employees: EmployeeRow[] }) {
  const sorted = [...employees].sort((a, b) => (b.performance_score ?? 0) - (a.performance_score ?? 0));
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Talent view</p>
        <p className="mt-1 text-xs text-muted">Live employee performance appears after appraisal data exists.</p>
      </div>
      {sorted.length ? (
        <div className="divide-y divide-border">
          {sorted.slice(0, 12).map((employee) => (
            <div key={employee.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                {initials(employee.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{employee.name}</span>
                <span className="block truncate text-xs text-muted">{employee.role || "Role pending"} · {employee.department || "Department pending"}</span>
              </span>
              <span className={clsx("text-sm font-black", scoreTone(employee.performance_score ?? 0))}>
                {employee.performance_score ?? "Pending"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No employees yet" body="Talent signals appear after HR imports employees." />
      )}
    </section>
  );
}

function Readiness({ metrics, org }: { metrics: ExecutiveMetrics; org: OrgRow | null }) {
  const rows = [
    ["Employees imported", metrics.staff.length > 0],
    ["Departments available", metrics.departments.length > 0],
    ["Teams available", metrics.teams.length > 0],
    ["Organisation goals added", metrics.orgGoals.length > 0],
    ["Team goals added", metrics.teamGoals.length > 0],
    ["Appraisal cycle configured", Boolean(org?.current_cycle || org?.cycle_start_date)],
  ];

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-black text-ink">Executive data readiness</p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rows.map(([label, done]) => (
          <div key={String(label)} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
            <span className="text-xs font-bold text-ink">{label}</span>
            {done ? <CheckCircle2 size={16} className="text-green" /> : <span className="h-2 w-2 rounded-full bg-muted/40" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone?: "ink" | "green" | "amber" | "red";
}) {
  const toneClass = {
    ink: "text-ink bg-paper",
    green: "text-green bg-green-soft",
    amber: "text-amber bg-amber-soft",
    red: "text-red bg-red-soft",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
        <span className={clsx("grid h-8 w-8 place-items-center rounded-full", toneClass)}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function WatchRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="text-sm font-black text-ink">{value}</span>
    </div>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-paper text-muted">
          <BarChart3 size={22} />
        </span>
        <p className="mt-3 text-sm font-black text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
