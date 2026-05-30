"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  Loader2,
  MailPlus,
  Network,
  Settings2,
  ShieldCheck,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getSupabase } from "@/lib/supabase";

type SetupTab = "overview" | "people" | "teams" | "goals" | "appraisal" | "launch";

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  department: string | null;
  team: string | null;
  role: string | null;
  line_manager_id: string | null;
}

interface GoalRow {
  id: string;
  title: string;
  goal_type: string;
  department: string | null;
  team: string | null;
  owner_id: string | null;
  status: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  appraisal_cadence: string | null;
  current_cycle: string | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
}

interface SetupState {
  org: OrgRow | null;
  employees: EmployeeRow[];
  goals: GoalRow[];
}

const tabs: Array<{ key: SetupTab; label: string; icon: typeof Building2 }> = [
  { key: "overview", label: "Setup", icon: ClipboardList },
  { key: "people", label: "People", icon: Users },
  { key: "teams", label: "Teams", icon: Network },
  { key: "goals", label: "Goals", icon: Target },
  { key: "appraisal", label: "Appraisal", icon: BarChart3 },
  { key: "launch", label: "Launch", icon: ShieldCheck },
];

const setupCopy: Record<SetupTab, { title: string; body: string; actions: string[] }> = {
  overview: {
    title: "Build the workspace foundation",
    body: "Start with the core structure. Pulse will stay quiet until people, teams, goals, and appraisal rules exist.",
    actions: ["Confirm organisation profile", "Import the first employee list", "Decide the first appraisal cycle"],
  },
  people: {
    title: "Add employees and reporting lines",
    body: "Upload or enter employees, then assign roles, departments, managers, and access levels before invitations go out.",
    actions: ["Import staff list", "Assign line managers", "Send invite emails"],
  },
  teams: {
    title: "Create departments and teams",
    body: "Use departments for broad ownership and teams for day-to-day execution groups like Sales, Finance, Ops, or Product.",
    actions: ["Group employees by department", "Create team names", "Assign team leads"],
  },
  goals: {
    title: "Set organisation and team goals",
    body: "Create company goals first, then cascade them into department, team, and individual goals with owners and due dates.",
    actions: ["Create company OKRs", "Add team goals", "Attach supporting documents"],
  },
  appraisal: {
    title: "Configure performance rules",
    body: "Choose the appraisal cadence, scoring weights, report expectations, review windows, and approval flow.",
    actions: ["Set appraisal cycle", "Confirm score weights", "Define report rhythm"],
  },
  launch: {
    title: "Review and open the workspace",
    body: "Check that employees, teams, goals, and review settings are ready before asking everyone to start using Pulse.",
    actions: ["Preview employee experience", "Send pending invites", "Open Pulse for the organisation"],
  },
};

function uniqueCount(values: Array<string | null>) {
  return new Set(values.map((value) => value?.trim()).filter(Boolean)).size;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "HR";
}

export default function HRSetupDashboard() {
  const { user } = useUser();
  const [active, setActive] = useState<SetupTab>("overview");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SetupState>({ org: null, employees: [], goals: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadSetup() {
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
          setError("Your HR profile is not linked to an organisation yet.");
          return;
        }

        const [orgResult, employeeResult, goalResult] = await Promise.all([
          supabase
            .from("organisations")
            .select("id, name, appraisal_cadence, current_cycle, cycle_start_date, cycle_end_date")
            .eq("id", orgId)
            .single(),
          supabase
            .from("employees")
            .select("id, name, email, department, team, role, line_manager_id")
            .eq("org_id", orgId)
            .order("created_at", { ascending: true }),
          supabase
            .from("goals")
            .select("id, title, goal_type, department, team, owner_id, status")
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
        if (alive) setError("Could not load setup data. Refresh and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSetup();

    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const employees = state.employees;
    const nonHrEmployees = employees.filter((employee) => employee.email !== user.email);
    const deptCount = uniqueCount(employees.map((employee) => employee.department));
    const teamCount = uniqueCount(employees.map((employee) => employee.team));
    const managerLinks = employees.filter((employee) => employee.line_manager_id).length;
    const orgGoals = state.goals.filter((goal) => goal.goal_type === "org").length;
    const teamGoals = state.goals.filter((goal) => goal.goal_type === "team").length;
    const readyItems = [
      Boolean(state.org?.name),
      nonHrEmployees.length > 0,
      deptCount > 0,
      teamCount > 0,
      managerLinks > 0,
      orgGoals > 0,
      teamGoals > 0,
      Boolean(state.org?.current_cycle || state.org?.cycle_start_date),
    ];

    return {
      peopleCount: nonHrEmployees.length,
      deptCount,
      teamCount,
      managerLinks,
      orgGoals,
      teamGoals,
      progress: Math.round((readyItems.filter(Boolean).length / readyItems.length) * 100),
    };
  }, [state, user.email]);

  const checklist = [
    {
      tab: "people" as SetupTab,
      title: "Add employees",
      detail: "Import staff records, confirm roles, and send invite links.",
      done: metrics.peopleCount > 0,
      cta: "Open people setup",
    },
    {
      tab: "teams" as SetupTab,
      title: "Create departments and teams",
      detail: "Group employees into departments, teams, and reporting lines.",
      done: metrics.deptCount > 0 && metrics.teamCount > 0,
      cta: "Open team setup",
    },
    {
      tab: "goals" as SetupTab,
      title: "Set goals",
      detail: "Add organisation goals, team goals, owners, due dates, and supporting documents.",
      done: metrics.orgGoals > 0 || metrics.teamGoals > 0,
      cta: "Open goal setup",
    },
    {
      tab: "appraisal" as SetupTab,
      title: "Configure appraisal cycle",
      detail: "Set cadence, review period, scoring weights, and report expectations.",
      done: Boolean(state.org?.current_cycle || state.org?.cycle_start_date),
      cta: "Open appraisal setup",
    },
    {
      tab: "launch" as SetupTab,
      title: "Launch workspace",
      detail: "Review setup quality, resolve missing items, and open Pulse to employees.",
      done: metrics.progress >= 80,
      cta: "Review launch",
    },
  ];

  if (user.platformRole !== "hr_admin" && user.platformRole !== "super_admin") {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-sm rounded-lg border border-border bg-card p-5 text-center shadow-[var(--shadow-lg)]">
          <ShieldCheck className="mx-auto text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-ink">HR access is restricted.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Your profile is not configured as an HR admin.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-muted">Loading HR setup...</p>
        </div>
      </main>
    );
  }

  const copy = setupCopy[active];

  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-ink p-5 text-white md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">HR setup workspace</p>
              <h1 className="mt-2 font-syne text-3xl font-bold leading-tight">
                {state.org?.name ?? "Organisation"} is ready to build.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
                Start from a clean workspace, add the organisation structure, then open the dashboard once the real data exists.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-right">
              <p className="text-3xl font-bold">{metrics.progress}%</p>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/42">setup ready</p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-pulse transition-all" style={{ width: `${metrics.progress}%` }} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Current state</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Employees" value={metrics.peopleCount} />
            <MiniStat label="Departments" value={metrics.deptCount} />
            <MiniStat label="Teams" value={metrics.teamCount} />
            <MiniStat label="Goals" value={state.goals.length} />
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-red/20 bg-red-soft px-4 py-3 text-sm font-bold text-red">
          {error}
        </section>
      ) : null}

      <section className="flex gap-2 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={clsx(
                "inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
                selected ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted hover:text-ink",
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </section>

      {active === "overview" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {checklist.map((item) => (
              <button
                key={item.title}
                onClick={() => setActive(item.tab)}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition hover:border-pulse/40"
              >
                <span
                  className={clsx(
                    "mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full",
                    item.done ? "bg-green-soft text-green" : "bg-pulse-soft text-pulse",
                  )}
                >
                  {item.done ? <CheckCircle2 size={17} /> : <Flag size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-ink">{item.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{item.detail}</span>
                  <span className="mt-3 inline-flex text-xs font-bold text-pulse">{item.cta}</span>
                </span>
              </button>
            ))}
          </div>

          <SetupPanel copy={copy} />
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <SetupPanel copy={copy} />
          {active === "people" && <PeopleSetup employees={state.employees} hrEmail={user.email} />}
          {active === "teams" && <TeamsSetup employees={state.employees} />}
          {active === "goals" && <GoalsSetup goals={state.goals} />}
          {active === "appraisal" && <AppraisalSetup org={state.org} />}
          {active === "launch" && <LaunchSetup progress={metrics.progress} checklist={checklist} />}
        </section>
      )}
    </main>
  );
}

function SetupPanel({ copy }: { copy: { title: string; body: string; actions: string[] } }) {
  return (
    <aside className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">What to do here</p>
      <h2 className="mt-3 font-syne text-xl font-bold text-ink">{copy.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{copy.body}</p>
      <div className="mt-5 space-y-2">
        {copy.actions.map((action) => (
          <div key={action} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2">
            <CheckCircle2 size={15} className="text-pulse" />
            <span className="text-xs font-bold text-ink">{action}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PeopleSetup({ employees, hrEmail }: { employees: EmployeeRow[]; hrEmail: string }) {
  const staff = employees.filter((employee) => employee.email !== hrEmail);

  return (
    <div className="space-y-4">
      <ActionBand
        icon={Upload}
        title="Import employees"
        body="Use the existing import template to add staff records and send invite links."
        href="/onboarding"
        action="Import staff"
      />
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-black text-ink">Employee list</p>
          <p className="mt-1 text-xs text-muted">{staff.length ? `${staff.length} employees added` : "No employees added yet"}</p>
        </div>
        <div className="divide-y divide-border">
          {staff.length ? staff.slice(0, 8).map((employee) => (
            <div key={employee.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                {initials(employee.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{employee.name}</span>
                <span className="block truncate text-xs text-muted">{employee.role || "Role pending"} · {employee.department || "Department pending"}</span>
              </span>
            </div>
          )) : (
            <EmptySetup icon={Users} title="No people yet" body="Add employees first. The rest of the HR dashboard becomes meaningful after people exist." />
          )}
        </div>
      </div>
    </div>
  );
}

function TeamsSetup({ employees }: { employees: EmployeeRow[] }) {
  const teams = Array.from(
    employees.reduce((map, employee) => {
      const key = employee.team?.trim();
      if (!key) return map;
      map.set(key, {
        name: key,
        department: employee.department ?? "No department",
        count: (map.get(key)?.count ?? 0) + 1,
      });
      return map;
    }, new Map<string, { name: string; department: string; count: number }>()),
  ).map(([, value]) => value);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Team structure</p>
        <p className="mt-1 text-xs text-muted">Teams come from the employee import fields.</p>
      </div>
      {teams.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {teams.map((team) => (
            <div key={team.name} className="rounded-lg border border-border bg-paper p-3">
              <p className="text-sm font-black text-ink">{team.name}</p>
              <p className="mt-1 text-xs text-muted">{team.department}</p>
              <p className="mt-4 text-2xl font-bold text-pulse">{team.count}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptySetup icon={Network} title="No teams yet" body="Import employees with department and team columns, then assign team leads." />
      )}
    </div>
  );
}

function GoalsSetup({ goals }: { goals: GoalRow[] }) {
  return (
    <div className="space-y-4">
      <ActionBand
        icon={FileText}
        title="Goal template"
        body="Create company goals, cascade team goals, then attach policy or planning documents."
        href="/goals"
        action="Open goals"
      />
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-black text-ink">Goal library</p>
          <p className="mt-1 text-xs text-muted">{goals.length ? `${goals.length} goals created` : "No goals created yet"}</p>
        </div>
        {goals.length ? (
          <div className="divide-y divide-border">
            {goals.slice(0, 8).map((goal) => (
              <div key={goal.id} className="px-4 py-3">
                <p className="text-sm font-bold text-ink">{goal.title}</p>
                <p className="mt-1 text-xs text-muted">{goal.goal_type} · {goal.department || goal.team || "Organisation wide"}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptySetup icon={Target} title="No goals yet" body="Start with organisation goals before team and individual goals." />
        )}
      </div>
    </div>
  );
}

function AppraisalSetup({ org }: { org: OrgRow | null }) {
  const rows = [
    ["Cadence", org?.appraisal_cadence ?? "Not set"],
    ["Current cycle", org?.current_cycle ?? "Not set"],
    ["Start date", org?.cycle_start_date ?? "Not set"],
    ["End date", org?.cycle_end_date ?? "Not set"],
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Appraisal configuration</p>
        <p className="mt-1 text-xs text-muted">These settings define how performance reviews will run.</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-paper p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
            <p className="mt-2 text-sm font-black text-ink">{value}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-4">
        <ActionButton icon={Settings2} href="/settings">Configure review rules</ActionButton>
      </div>
    </div>
  );
}

function LaunchSetup({ progress, checklist }: { progress: number; checklist: Array<{ title: string; done: boolean }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-black text-ink">Launch readiness</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-pulse" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 space-y-2">
        {checklist.map((item) => (
          <div key={item.title} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
            <span className="text-xs font-bold text-ink">{item.title}</span>
            {item.done ? <CheckCircle2 size={16} className="text-green" /> : <span className="h-2 w-2 rounded-full bg-muted/40" />}
          </div>
        ))}
      </div>
      <button
        disabled={progress < 80}
        className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Open workspace
      </button>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-paper p-3">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
    </div>
  );
}

function ActionBand({
  icon: Icon,
  title,
  body,
  href,
  action,
}: {
  icon: typeof Building2;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-pulse-soft text-pulse">
          <Icon size={19} />
        </span>
        <div>
          <p className="text-sm font-black text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
        </div>
      </div>
      <ActionButton icon={MailPlus} href={href}>{action}</ActionButton>
    </div>
  );
}

function ActionButton({ icon: Icon, href, children }: { icon: typeof Building2; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-xs font-black text-white"
    >
      <Icon size={15} />
      {children}
    </Link>
  );
}

function EmptySetup({ icon: Icon, title, body }: { icon: typeof Building2; title: string; body: string }) {
  return (
    <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-paper text-muted">
          <Icon size={22} />
        </span>
        <p className="mt-3 text-sm font-black text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
