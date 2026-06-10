"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
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
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

type SetupTab = "overview" | "people" | "teams" | "goals" | "appraisal" | "launch";

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  department: string | null;
  team: string | null;
  role: string | null;
  cadre: string | null;
  platform_role: string | null;
  avatar_color: string | null;
  performance_score: number | null;
  badge: string | null;
  consistency_index: number | null;
  week_streak: number | null;
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

interface LeaveRow {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_taken: number | null;
  status: string;
}

interface SetupState {
  org: OrgRow | null;
  employees: EmployeeRow[];
  goals: GoalRow[];
  reportedIds: Set<string>;
  pendingLeave: LeaveRow[];
}

// ── Setup wizard config ────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function uniqueCount(values: Array<string | null>) {
  return new Set(values.map((v) => v?.trim()).filter(Boolean)).size;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "HR";
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted";
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-[#c27a00]";
  return "text-red";
}

function scoreBg(score: number | null) {
  if (score === null) return "bg-paper text-muted";
  if (score >= 80) return "bg-green-soft text-green";
  if (score >= 60) return "bg-[#fff8e1] text-[#c27a00]";
  return "bg-red-soft text-red";
}

function badgePill(badge: string | null) {
  switch (badge) {
    case "Strong Performer": return "bg-green-soft text-green";
    case "Good Standing": return "bg-pulse-soft text-pulse";
    case "Needs Improvement": return "bg-[#fff8e1] text-[#c27a00]";
    case "At Risk": return "bg-red-soft text-red";
    default: return "bg-paper text-muted";
  }
}

// ── Root component ─────────────────────────────────────────────────────────────

export default function HRDashboard() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SetupState>({
    org: null,
    employees: [],
    goals: [],
    reportedIds: new Set(),
    pendingLeave: [],
  });
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const supabase = getSupabase();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError("Session not found. Sign in again."); return; }

        const { data: me, error: meError } = await supabase
          .from("employees")
          .select("org_id")
          .eq("user_id", authUser.id)
          .single();

        const myOrgId = (me as { org_id?: string } | null)?.org_id;
        if (meError || !myOrgId) { setError("Your HR profile is not linked to an organisation yet."); return; }

        setOrgId(myOrgId);

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [orgRes, empRes, goalRes, reportRes, leaveRes] = await Promise.all([
          supabase
            .from("organisations")
            .select("id, name, appraisal_cadence, current_cycle, cycle_start_date, cycle_end_date")
            .eq("id", myOrgId)
            .single(),
          supabase
            .from("employees")
            .select("id, name, email, department, team, role, cadre, platform_role, avatar_color, performance_score, badge, consistency_index, week_streak, line_manager_id")
            .eq("org_id", myOrgId)
            .order("name"),
          supabase
            .from("goals")
            .select("id, title, goal_type, department, team, owner_id, status")
            .eq("org_id", myOrgId),
          supabase
            .from("reports")
            .select("employee_id")
            .eq("org_id", myOrgId)
            .gte("submitted_at", sevenDaysAgo),
          supabase
            .from("leave_requests")
            .select("id, employee_id, leave_type, start_date, end_date, days_taken, status")
            .eq("org_id", myOrgId)
            .eq("status", "pending")
            .order("submitted_at", { ascending: false }),
        ]);

        if (!alive) return;

        setState({
          org: (orgRes.data as OrgRow | null) ?? null,
          employees: (empRes.data as EmployeeRow[] | null) ?? [],
          goals: (goalRes.data as GoalRow[] | null) ?? [],
          reportedIds: new Set(((reportRes.data ?? []) as { employee_id: string }[]).map((r) => r.employee_id)),
          pendingLeave: (leaveRes.data as LeaveRow[] | null) ?? [],
        });
      } catch {
        if (alive) setError("Could not load data. Refresh and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  if (user.platformRole !== "hr_admin" && user.platformRole !== "super_admin") {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-sm rounded-lg border border-border bg-card p-5 text-center">
          <ShieldCheck className="mx-auto text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-ink">HR access is restricted.</p>
          <p className="mt-1 text-xs text-muted">Your profile is not configured as an HR admin.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-muted" size={24} />
          <p className="mt-3 text-sm font-bold text-muted">Loading HR dashboard...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <div className="rounded-lg border border-red/20 bg-red-soft px-5 py-4 text-sm font-bold text-red">{error}</div>
      </main>
    );
  }

  // Staff = everyone except the HR admin themselves
  const staff = state.employees.filter((e) => e.platform_role !== "hr_admin" && e.platform_role !== "super_admin" && e.email !== user.email);

  // Branch: new org (no staff yet) → setup wizard; established org → live dashboard
  if (staff.length === 0) {
    return <SetupWizard state={state} userEmail={user.email} />;
  }

  return <OperationalDashboard state={state} staff={staff} orgId={orgId} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERATIONAL DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function OperationalDashboard({
  state,
  staff,
  orgId,
}: {
  state: SetupState;
  staff: EmployeeRow[];
  orgId: string;
}) {
  const [search, setSearch] = useState("");
  const [leave, setLeave] = useState<LeaveRow[]>(state.pendingLeave);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const avgScore = Math.round(
    staff.reduce((s, e) => s + (e.performance_score ?? 0), 0) / (staff.length || 1),
  );

  const reportsSubmitted = staff.filter((e) => state.reportedIds.has(e.id)).length;
  const atRisk = staff.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement");
  const goalsAtRisk = state.goals.filter((g) => g.status === "at_risk" || g.status === "behind");

  const filtered = search.trim()
    ? staff.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          (e.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (e.role ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : staff;

  async function handleLeave(id: string, action: "approved" | "declined") {
    setLeavingId(id);
    const supabase = getSupabase();
    const { error } = await supabase.from("leave_requests").update({ status: action }).eq("id", id);
    if (!error) setLeave((prev) => prev.filter((l) => l.id !== id));
    setLeavingId(null);
  }

  const cycleEnd = state.org?.cycle_end_date
    ? new Date(state.org.cycle_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="rounded-lg bg-ink p-5 text-white md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">HR Command Centre</p>
            <h1 className="mt-1 font-syne text-3xl font-bold leading-tight">{state.org?.name}</h1>
            <p className="mt-1 text-sm text-white/55">
              {state.org?.current_cycle ?? "No active cycle"}
              {cycleEnd && ` · closes ${cycleEnd}`}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-center">
              <p className="font-syne text-3xl font-bold">{avgScore}%</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Org avg score</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total staff" value={staff.length} />
        <StatTile
          label="Reports this week"
          value={`${reportsSubmitted} / ${staff.length}`}
          warn={reportsSubmitted < staff.length}
          warnLabel={`${staff.length - reportsSubmitted} missing`}
        />
        <StatTile
          label="Leave pending"
          value={leave.length}
          warn={leave.length > 0}
          warnLabel="awaiting approval"
        />
        <StatTile
          label="Goals at risk"
          value={goalsAtRisk.length}
          warn={goalsAtRisk.length > 0}
          warnLabel="need attention"
        />
      </section>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">

        {/* Staff roster */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-black text-ink">Staff Performance</p>
              <p className="text-[11px] text-muted">{staff.length} employees · {state.org?.appraisal_cadence ?? "quarterly"} appraisal</p>
            </div>
            <input
              type="text"
              placeholder="Search name, role, dept…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 rounded-xl border border-border bg-paper px-3 text-xs outline-none transition focus:border-pulse focus:shadow-[0_0_0_3px_var(--pulse-soft)]"
            />
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-border bg-paper px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted md:grid-cols-[1fr_100px_80px_70px]">
            <span>Employee</span>
            <span className="hidden md:block">Badge</span>
            <span>Score</span>
            <span>Report</span>
          </div>

          <div className="divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No employees match your search.</p>
            ) : (
              filtered.map((emp) => {
                const reported = state.reportedIds.has(emp.id);
                return (
                  <div
                    key={emp.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-3 md:grid-cols-[1fr_100px_80px_70px]"
                  >
                    {/* Name + role */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: emp.avatar_color ?? "#e8440a" }}
                      >
                        {initials(emp.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{emp.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {emp.role ?? "Role pending"}{emp.department ? ` · ${emp.department}` : ""}
                        </span>
                      </span>
                    </div>

                    {/* Badge */}
                    <span
                      className={clsx(
                        "hidden rounded-full px-2 py-1 text-[10px] font-bold md:inline-block",
                        badgePill(emp.badge),
                      )}
                    >
                      {emp.badge ?? "–"}
                    </span>

                    {/* Score */}
                    <span
                      className={clsx(
                        "w-fit rounded-full px-2.5 py-1 text-xs font-bold",
                        scoreBg(emp.performance_score),
                      )}
                    >
                      {emp.performance_score !== null ? `${emp.performance_score}%` : "–"}
                    </span>

                    {/* Report submitted */}
                    <span
                      className={clsx(
                        "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                        reported ? "bg-green-soft text-green" : "bg-red-soft text-red",
                      )}
                    >
                      {reported ? <Check size={13} /> : <X size={13} />}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Pending leave */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-black text-ink">Leave Requests</p>
              <p className="text-[11px] text-muted">
                {leave.length ? `${leave.length} pending approval` : "No pending requests"}
              </p>
            </div>
            {leave.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">All clear.</p>
            ) : (
              <div className="divide-y divide-border">
                {leave.map((req) => {
                  const emp = state.employees.find((e) => e.id === req.employee_id);
                  const isActing = leavingId === req.id;
                  return (
                    <div key={req.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-ink">{emp?.name ?? "Employee"}</p>
                          <p className="mt-0.5 text-[11px] text-muted capitalize">
                            {req.leave_type} · {req.start_date} → {req.end_date}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 gap-1.5">
                          <button
                            onClick={() => handleLeave(req.id, "approved")}
                            disabled={isActing}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-green-soft text-green transition hover:bg-green hover:text-white disabled:opacity-40"
                          >
                            {isActing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button
                            onClick={() => handleLeave(req.id, "declined")}
                            disabled={isActing}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-red-soft text-red transition hover:bg-red hover:text-white disabled:opacity-40"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Needs attention */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-black text-ink">Needs Attention</p>
              <p className="text-[11px] text-muted">
                {atRisk.length ? `${atRisk.length} employee${atRisk.length !== 1 ? "s" : ""} flagged` : "No flags"}
              </p>
            </div>
            {atRisk.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">All employees are on track.</p>
            ) : (
              <div className="divide-y divide-border">
                {atRisk.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-3 px-4 py-3">
                    <AlertTriangle size={14} className="flex-shrink-0 text-red" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">{emp.name}</p>
                      <p className="text-[11px] text-muted">{emp.badge} · {emp.performance_score ?? "–"}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Goal health */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-black text-ink">Goal Health</p>
              <p className="text-[11px] text-muted">{state.goals.length} goals total</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {[
                { label: "On track", status: "on_track", cls: "text-green" },
                { label: "At risk", status: "at_risk", cls: "text-[#c27a00]" },
                { label: "Behind", status: "behind", cls: "text-red" },
                { label: "Completed", status: "completed", cls: "text-pulse" },
              ].map(({ label, status, cls }) => (
                <div key={status} className="rounded-lg bg-paper p-3">
                  <p className={clsx("font-syne text-xl font-bold", cls)}>
                    {state.goals.filter((g) => g.status === status).length}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}

// ── Operational sub-components ─────────────────────────────────────────────────

function StatTile({
  label,
  value,
  warn,
  warnLabel,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
  warnLabel?: string;
}) {
  return (
    <div className={clsx("rounded-lg border bg-card p-4", warn ? "border-red/20" : "border-border")}>
      <p className={clsx("font-syne text-2xl font-bold", warn ? "text-red" : "text-ink")}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
      {warn && warnLabel && (
        <p className="mt-1 text-[10px] font-bold text-red">{warnLabel}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SETUP WIZARD  (shown only for new orgs with no staff yet)
// ══════════════════════════════════════════════════════════════════════════════

function SetupWizard({ state, userEmail }: { state: SetupState; userEmail: string }) {
  const [active, setActive] = useState<SetupTab>("overview");

  const metrics = useMemo(() => {
    const employees = state.employees;
    const nonHr = employees.filter((e) => e.email !== userEmail);
    const deptCount = uniqueCount(employees.map((e) => e.department));
    const teamCount = uniqueCount(employees.map((e) => e.team));
    const managerLinks = employees.filter((e) => e.line_manager_id).length;
    const orgGoals = state.goals.filter((g) => g.goal_type === "org").length;
    const teamGoals = state.goals.filter((g) => g.goal_type === "team").length;
    const items = [
      Boolean(state.org?.name),
      nonHr.length > 0,
      deptCount > 0,
      teamCount > 0,
      managerLinks > 0,
      orgGoals > 0,
      teamGoals > 0,
      Boolean(state.org?.current_cycle || state.org?.cycle_start_date),
    ];
    return {
      peopleCount: nonHr.length,
      deptCount,
      teamCount,
      managerLinks,
      orgGoals,
      teamGoals,
      progress: Math.round((items.filter(Boolean).length / items.length) * 100),
    };
  }, [state, userEmail]);

  const checklist = [
    { tab: "people" as SetupTab, title: "Add employees", detail: "Import staff records, confirm roles, and send invite links.", done: metrics.peopleCount > 0, cta: "Open people setup" },
    { tab: "teams" as SetupTab, title: "Create departments and teams", detail: "Group employees into departments, teams, and reporting lines.", done: metrics.deptCount > 0 && metrics.teamCount > 0, cta: "Open team setup" },
    { tab: "goals" as SetupTab, title: "Set goals", detail: "Add organisation goals, team goals, owners, due dates, and supporting documents.", done: metrics.orgGoals > 0 || metrics.teamGoals > 0, cta: "Open goal setup" },
    { tab: "appraisal" as SetupTab, title: "Configure appraisal cycle", detail: "Set cadence, review period, scoring weights, and report expectations.", done: Boolean(state.org?.current_cycle || state.org?.cycle_start_date), cta: "Open appraisal setup" },
    { tab: "launch" as SetupTab, title: "Launch workspace", detail: "Review setup quality, resolve missing items, and open Pulse to employees.", done: metrics.progress >= 80, cta: "Review launch" },
  ];

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
                <span className={clsx("mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full", item.done ? "bg-green-soft text-green" : "bg-pulse-soft text-pulse")}>
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
          {active === "people" && <PeopleSetup employees={state.employees} hrEmail={userEmail} />}
          {active === "teams" && <TeamsSetup employees={state.employees} />}
          {active === "goals" && <GoalsSetup goals={state.goals} />}
          {active === "appraisal" && <AppraisalSetup org={state.org} />}
          {active === "launch" && <LaunchSetup progress={metrics.progress} checklist={checklist} />}
        </section>
      )}
    </main>
  );
}

// ── Setup sub-components ───────────────────────────────────────────────────────

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
  const staff = employees.filter((e) => e.email !== hrEmail);
  return (
    <div className="space-y-4">
      <ActionBand icon={Upload} title="Import employees" body="Use the import flow to add staff records and send invite links." href="/onboarding" action="Import staff" />
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-black text-ink">Employee list</p>
          <p className="mt-1 text-xs text-muted">{staff.length ? `${staff.length} employees added` : "No employees added yet"}</p>
        </div>
        <div className="divide-y divide-border">
          {staff.length ? staff.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">{initials(e.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{e.name}</span>
                <span className="block truncate text-xs text-muted">{e.role || "Role pending"} · {e.department || "Department pending"}</span>
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
    employees.reduce((map, e) => {
      const key = e.team?.trim();
      if (!key) return map;
      map.set(key, { name: key, department: e.department ?? "No department", count: (map.get(key)?.count ?? 0) + 1 });
      return map;
    }, new Map<string, { name: string; department: string; count: number }>()),
  ).map(([, v]) => v);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Team structure</p>
        <p className="mt-1 text-xs text-muted">Teams come from the employee import fields.</p>
      </div>
      {teams.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {teams.map((t) => (
            <div key={t.name} className="rounded-lg border border-border bg-paper p-3">
              <p className="text-sm font-black text-ink">{t.name}</p>
              <p className="mt-1 text-xs text-muted">{t.department}</p>
              <p className="mt-4 font-syne text-2xl font-bold text-pulse">{t.count}</p>
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
      <ActionBand icon={FileText} title="Goal template" body="Create company goals, cascade team goals, then attach policy or planning documents." href="/goals" action="Open goals" />
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-black text-ink">Goal library</p>
          <p className="mt-1 text-xs text-muted">{goals.length ? `${goals.length} goals created` : "No goals created yet"}</p>
        </div>
        {goals.length ? (
          <div className="divide-y divide-border">
            {goals.slice(0, 8).map((g) => (
              <div key={g.id} className="px-4 py-3">
                <p className="text-sm font-bold text-ink">{g.title}</p>
                <p className="mt-1 text-xs text-muted">{g.goal_type} · {g.department || g.team || "Organisation wide"}</p>
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
      <p className="font-syne text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
    </div>
  );
}

function ActionBand({ icon: Icon, title, body, href, action }: { icon: typeof Building2; title: string; body: string; href: string; action: string }) {
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
    <Link href={href} className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-xs font-black text-white">
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
