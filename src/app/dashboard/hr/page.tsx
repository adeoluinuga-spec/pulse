"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Flag,
  Loader2,
  MailPlus,
  Network,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
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
  employment_type: string | null;
  join_date: string | null;
  band_current: string | null;
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

interface DashState {
  org: OrgRow | null;
  employees: EmployeeRow[];
  goals: GoalRow[];
  reportedIds: Set<string>;
  pendingLeave: LeaveRow[];
}

// ── Setup wizard config ────────────────────────────────────────────────────────

const TABS: Array<{ key: SetupTab; label: string; icon: typeof Building2 }> = [
  { key: "overview", label: "Setup", icon: ClipboardList },
  { key: "people", label: "People", icon: Users },
  { key: "teams", label: "Teams", icon: Network },
  { key: "goals", label: "Goals", icon: Target },
  { key: "appraisal", label: "Appraisal", icon: BarChart3 },
  { key: "launch", label: "Launch", icon: ShieldCheck },
];

const SETUP_COPY: Record<SetupTab, { title: string; body: string; actions: string[] }> = {
  overview: { title: "Build the workspace foundation", body: "Start with the core structure. Pulse will stay quiet until people, teams, goals, and appraisal rules exist.", actions: ["Confirm organisation profile", "Import the first employee list", "Decide the first appraisal cycle"] },
  people: { title: "Add employees and reporting lines", body: "Upload or enter employees, then assign roles, departments, managers, and access levels before invitations go out.", actions: ["Import staff list", "Assign line managers", "Send invite emails"] },
  teams: { title: "Create departments and teams", body: "Use departments for broad ownership and teams for day-to-day execution groups like Sales, Finance, Ops, or Product.", actions: ["Group employees by department", "Create team names", "Assign team leads"] },
  goals: { title: "Set organisation and team goals", body: "Create company goals first, then cascade them into department, team, and individual goals with owners and due dates.", actions: ["Create company OKRs", "Add team goals", "Attach supporting documents"] },
  appraisal: { title: "Configure performance rules", body: "Choose the appraisal cadence, scoring weights, report expectations, review windows, and approval flow.", actions: ["Set appraisal cycle", "Confirm score weights", "Define report rhythm"] },
  launch: { title: "Review and open the workspace", body: "Check that employees, teams, goals, and review settings are ready before asking everyone to start using Pulse.", actions: ["Preview employee experience", "Send pending invites", "Open Pulse for the organisation"] },
};

// ── CSV template ───────────────────────────────────────────────────────────────

const CSV_HEADERS = ["email", "name", "role", "department", "team", "cadre", "people_responsibility", "band_current", "employment_type", "join_date"];
const CSV_TEMPLATE = [
  CSV_HEADERS.join(","),
  "jane.doe@company.com,Jane Doe,Senior Engineer,Engineering,Platform,senior,manager,L4 – Senior Engineer,full_time,2022-03-01",
  "john.smith@company.com,John Smith,Sales Executive,Sales,Enterprise,mid,none,L2 – Mid-level,full_time,2023-06-15",
].join("\n");

function downloadCSVTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pulse-employee-update-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseUpdateCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uniqueCount(values: Array<string | null>) {
  return new Set(values.map((v) => v?.trim()).filter(Boolean)).size;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "??";
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

// ── Root (Suspense boundary required for useSearchParams) ─────────────────────

export default function HRDashboardPage() {
  return (
    <Suspense fallback={
      <main className="dashboard-page grid min-h-[60vh] place-items-center px-4">
        <Loader2 className="animate-spin text-muted" size={24} />
      </main>
    }>
      <HRDashboard />
    </Suspense>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function HRDashboard() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceSetup = searchParams.get("mode") === "setup";
  const urlTab = (searchParams.get("tab") as SetupTab) ?? "overview";

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DashState>({ org: null, employees: [], goals: [], reportedIds: new Set(), pendingLeave: [] });
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");
  const [showSetup, setShowSetup] = useState(forceSetup);
  const [setupTab, setSetupTab] = useState<SetupTab>(urlTab);

  // Keep showSetup in sync with URL param
  useEffect(() => { setShowSetup(forceSetup); }, [forceSetup]);
  useEffect(() => { setSetupTab(urlTab); }, [urlTab]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const supabase = getSupabase();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError("Session not found. Sign in again."); return; }

        const { data: me, error: meError } = await supabase.from("employees").select("org_id").eq("user_id", authUser.id).single();
        const myOrgId = (me as { org_id?: string } | null)?.org_id;
        if (meError || !myOrgId) { setError("Your HR profile is not linked to an organisation yet."); return; }
        setOrgId(myOrgId);

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [orgRes, empRes, goalRes, reportRes, leaveRes] = await Promise.all([
          supabase.from("organisations").select("id, name, appraisal_cadence, current_cycle, cycle_start_date, cycle_end_date").eq("id", myOrgId).single(),
          supabase.from("employees").select("id, name, email, department, team, role, cadre, platform_role, avatar_color, performance_score, badge, consistency_index, week_streak, line_manager_id, employment_type, join_date, band_current").eq("org_id", myOrgId).order("name"),
          supabase.from("goals").select("id, title, goal_type, department, team, owner_id, status").eq("org_id", myOrgId),
          supabase.from("reports").select("employee_id").eq("org_id", myOrgId).gte("submitted_at", sevenDaysAgo),
          supabase.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, days_taken, status").eq("org_id", myOrgId).eq("status", "pending").order("submitted_at", { ascending: false }),
        ]);
        if (!alive) return;
        setState({
          org: (orgRes.data as OrgRow | null) ?? null,
          employees: (empRes.data as EmployeeRow[] | null) ?? [],
          goals: (goalRes.data as GoalRow[] | null) ?? [],
          reportedIds: new Set(((reportRes.data ?? []) as { employee_id: string }[]).map((r) => r.employee_id)),
          pendingLeave: (leaveRes.data as LeaveRow[] | null) ?? [],
        });
      } catch { if (alive) setError("Could not load data. Refresh and try again."); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  function goToSetupTab(tab: SetupTab) {
    setShowSetup(true);
    setSetupTab(tab);
    router.push(`/dashboard/hr?mode=setup&tab=${tab}`, { scroll: false });
  }

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

  const staff = state.employees.filter((e) => e.platform_role !== "hr_admin" && e.platform_role !== "super_admin" && e.email !== user.email);

  if (showSetup || staff.length === 0) {
    return (
      <SetupWizard
        state={state}
        orgId={orgId}
        userEmail={user.email}
        activeTab={setupTab}
        onTabChange={setSetupTab}
        isOverlay={staff.length > 0}
        onExitSetup={() => {
          setShowSetup(false);
          router.push("/dashboard/hr", { scroll: false });
        }}
        onUpdateEmployees={(employees) => setState((prev) => ({ ...prev, employees }))}
      />
    );
  }

  return (
    <OperationalDashboard
      state={state}
      staff={staff}
      orgId={orgId}
      onGoToSetup={goToSetupTab}
      onUpdateLeave={(leave) => setState((prev) => ({ ...prev, pendingLeave: leave }))}
      onUpdateEmployee={(updated) => setState((prev) => ({ ...prev, employees: prev.employees.map((e) => e.id === updated.id ? updated : e) }))}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERATIONAL DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function OperationalDashboard({
  state, staff, orgId, onGoToSetup, onUpdateLeave, onUpdateEmployee,
}: {
  state: DashState;
  staff: EmployeeRow[];
  orgId: string;
  onGoToSetup: (tab: SetupTab) => void;
  onUpdateLeave: (leave: LeaveRow[]) => void;
  onUpdateEmployee: (emp: EmployeeRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [leave, setLeave] = useState<LeaveRow[]>(state.pendingLeave);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeRow | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const setupBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync leave state from parent
  useEffect(() => { setLeave(state.pendingLeave); }, [state.pendingLeave]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        setupBtnRef.current && !setupBtnRef.current.contains(e.target as Node)
      ) setSetupOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleSetup() {
    if (!setupOpen && setupBtnRef.current) {
      const rect = setupBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setSetupOpen((o) => !o);
  }

  const avgScore = Math.round(staff.reduce((s, e) => s + (e.performance_score ?? 0), 0) / (staff.length || 1));
  const reportsSubmitted = staff.filter((e) => state.reportedIds.has(e.id)).length;
  const atRisk = staff.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement");
  const goalsAtRisk = state.goals.filter((g) => g.status === "at_risk" || g.status === "behind");

  // Checklist for Continue Setup dropdown (incomplete items only)
  const setupItems: Array<{ label: string; tab: SetupTab }> = [
    ...(!state.org?.current_cycle ? [{ label: "Appraisal cycle not configured", tab: "appraisal" as SetupTab }] : []),
    ...(state.goals.length === 0 ? [{ label: "No goals created yet", tab: "goals" as SetupTab }] : []),
    ...(uniqueCount(staff.map((e) => e.team)) === 0 ? [{ label: "No teams defined", tab: "teams" as SetupTab }] : []),
  ];

  const filtered = search.trim()
    ? staff.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (e.role ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : staff;

  async function handleLeave(id: string, action: "approved" | "declined") {
    setLeavingId(id);
    const supabase = getSupabase();
    const { error } = await supabase.from("leave_requests").update({ status: action }).eq("id", id);
    if (!error) {
      const next = leave.filter((l) => l.id !== id);
      setLeave(next);
      onUpdateLeave(next);
    }
    setLeavingId(null);
  }

  const cycleEnd = state.org?.cycle_end_date
    ? new Date(state.org.cycle_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">

      {/* Hero */}
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
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-center">
              <p className="font-syne text-3xl font-bold">{avgScore}%</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Org avg score</p>
            </div>

            {/* Continue Setup button */}
            <button
              ref={setupBtnRef}
              onClick={toggleSetup}
              className="flex h-full items-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"
            >
              <Settings2 size={14} />
              Continue Setup
              <ChevronDown size={13} className={clsx("transition-transform", setupOpen && "rotate-180")} />
            </button>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total staff" value={staff.length} />
        <StatTile label="Reports this week" value={`${reportsSubmitted} / ${staff.length}`} warn={reportsSubmitted < staff.length} warnLabel={`${staff.length - reportsSubmitted} missing`} />
        <StatTile label="Leave pending" value={leave.length} warn={leave.length > 0} warnLabel="awaiting approval" />
        <StatTile label="Goals at risk" value={goalsAtRisk.length} warn={goalsAtRisk.length > 0} warnLabel="need attention" />
      </section>

      {/* Main grid */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">

        {/* Staff roster */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-black text-ink">Staff Performance</p>
              <p className="text-[11px] text-muted">Click an employee to view or edit their profile</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-40 rounded-xl border border-border bg-paper px-3 text-xs outline-none transition focus:border-pulse"
              />
              <button
                onClick={downloadCSVTemplate}
                title="Download update template"
                className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-paper text-muted transition hover:border-pulse hover:text-pulse"
              >
                <Download size={14} />
              </button>
            </div>
          </div>

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
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmp(emp)}
                    className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-3 text-left transition hover:bg-paper md:grid-cols-[1fr_100px_80px_70px]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: emp.avatar_color ?? "#e8440a" }}>
                        {initials(emp.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{emp.name}</span>
                        <span className="block truncate text-[11px] text-muted">{emp.role ?? "Role pending"}{emp.department ? ` · ${emp.department}` : ""}</span>
                      </span>
                    </div>
                    <span className={clsx("hidden rounded-full px-2 py-1 text-[10px] font-bold md:inline-block", badgePill(emp.badge))}>
                      {emp.badge ?? "–"}
                    </span>
                    <span className={clsx("w-fit rounded-full px-2.5 py-1 text-xs font-bold", scoreBg(emp.performance_score))}>
                      {emp.performance_score !== null ? `${emp.performance_score}%` : "–"}
                    </span>
                    <span className={clsx("grid h-7 w-7 place-items-center rounded-full text-xs", reported ? "bg-green-soft text-green" : "bg-red-soft text-red")}>
                      {reported ? <Check size={13} /> : <X size={13} />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <LeavePanel leave={leave} employees={state.employees} leavingId={leavingId} onAction={handleLeave} />
          <AtRiskPanel employees={atRisk} />
          <GoalHealthPanel goals={state.goals} />
        </div>
      </section>

      {/* Employee edit slide-over */}
      {selectedEmp && (
        <EmployeeEditPanel
          employee={selectedEmp}
          employees={state.employees}
          orgId={orgId}
          onClose={() => setSelectedEmp(null)}
          onSaved={(updated) => { onUpdateEmployee(updated); setSelectedEmp(updated); }}
        />
      )}

      {/* Continue Setup dropdown — fixed to escape any stacking context */}
      {setupOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-64 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-bold text-ink">Setup items</p>
            <p className="text-[11px] text-muted">
              {setupItems.length === 0 ? "All setup steps complete" : `${setupItems.length} item${setupItems.length !== 1 ? "s" : ""} remaining`}
            </p>
          </div>
          <div className="divide-y divide-border">
            {setupItems.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <CheckCircle2 size={15} className="text-green" />
                <span className="text-xs font-bold text-green">Setup complete</span>
              </div>
            ) : (
              setupItems.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => { setSetupOpen(false); onGoToSetup(item.tab); }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-bold text-ink transition hover:bg-paper"
                >
                  <Flag size={13} className="flex-shrink-0 text-pulse" />
                  {item.label}
                </button>
              ))
            )}
            <button
              onClick={() => { setSetupOpen(false); onGoToSetup("overview"); }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[11px] font-bold text-pulse transition hover:bg-pulse-soft"
            >
              View full setup checklist →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Employee edit panel ────────────────────────────────────────────────────────

interface EmpEdits {
  name: string;
  role: string;
  department: string;
  team: string;
  cadre: string;
  band_current: string;
  employment_type: string;
  join_date: string;
  line_manager_id: string;
}

function EmployeeEditPanel({ employee, employees, orgId, onClose, onSaved }: {
  employee: EmployeeRow;
  employees: EmployeeRow[];
  orgId: string;
  onClose: () => void;
  onSaved: (emp: EmployeeRow) => void;
}) {
  const [edits, setEdits] = useState<EmpEdits>({
    name: employee.name,
    role: employee.role ?? "",
    department: employee.department ?? "",
    team: employee.team ?? "",
    cadre: employee.cadre ?? "entry",
    band_current: employee.band_current ?? "",
    employment_type: employee.employment_type ?? "full_time",
    join_date: employee.join_date ?? "",
    line_manager_id: employee.line_manager_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResults, setCsvResults] = useState<Array<{ email: string; status: string }>>([]);
  const csvRef = useRef<HTMLInputElement>(null);
  const field = <T extends keyof EmpEdits>(key: T) => ({
    value: edits[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEdits((prev) => ({ ...prev, [key]: e.target.value })),
  });

  async function handleSave() {
    setSaving(true);
    const supabase = getSupabase();
    const { error } = await supabase.from("employees").update({
      name: edits.name,
      role: edits.role || null,
      department: edits.department || null,
      team: edits.team || null,
      cadre: edits.cadre,
      band_current: edits.band_current || null,
      employment_type: edits.employment_type,
      join_date: edits.join_date || null,
      line_manager_id: edits.line_manager_id || null,
    }).eq("id", employee.id);
    setSaving(false);
    if (!error) {
      onSaved({ ...employee, ...edits, role: edits.role || null, department: edits.department || null, team: edits.team || null, band_current: edits.band_current || null, join_date: edits.join_date || null, line_manager_id: edits.line_manager_id || null });
    }
  }

  async function handleCSV(file: File) {
    setCsvUploading(true);
    setCsvResults([]);
    const text = await file.text();
    const rows = parseUpdateCSV(text);
    const supabase = getSupabase();
    const results: Array<{ email: string; status: string }> = [];
    for (const row of rows) {
      if (!row.email) continue;
      const { error } = await supabase.from("employees").update({
        name: row.name || undefined,
        role: row.role || undefined,
        department: row.department || undefined,
        team: row.team || undefined,
        cadre: row.cadre || undefined,
        band_current: row.band_current || undefined,
        employment_type: row.employment_type || undefined,
        join_date: row.join_date || undefined,
      }).eq("email", row.email).eq("org_id", orgId);
      results.push({ email: row.email, status: error ? "error" : "updated" });
    }
    setCsvResults(results);
    setCsvUploading(false);
  }

  const managers = employees.filter((e) => e.id !== employee.id && (e.cadre === "senior" || e.cadre === "executive" || e.platform_role === "hr_admin"));

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col bg-card shadow-[−8px_0_40px_rgba(0,0,0,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: employee.avatar_color ?? "#e8440a" }}>
              {initials(employee.name)}
            </span>
            <div>
              <p className="font-bold text-ink">{employee.name}</p>
              <p className="text-xs text-muted">{employee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadCSVTemplate} title="Download CSV template" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-pulse">
              <Download size={14} />
            </button>
            <label title="Bulk update from CSV" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border text-muted hover:text-pulse">
              <Upload size={14} />
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSV(f); }} />
            </label>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-ink">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Managed by HR</p>

          <PanelField label="Full Name"><input className={panelInput} {...field("name")} /></PanelField>
          <PanelField label="Job Title / Role"><input className={panelInput} placeholder="e.g. Senior Engineer" {...field("role")} /></PanelField>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Department"><input className={panelInput} placeholder="e.g. Engineering" {...field("department")} /></PanelField>
            <PanelField label="Team"><input className={panelInput} placeholder="e.g. Platform" {...field("team")} /></PanelField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Cadre">
              <select className={panelInput} {...field("cadre")}>
                {["entry", "mid", "senior", "executive"].map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </PanelField>
            <PanelField label="Employment Type">
              <select className={panelInput} {...field("employment_type")}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </PanelField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Band / Level"><input className={panelInput} placeholder="e.g. L3 – Senior" {...field("band_current")} /></PanelField>
            <PanelField label="Join Date"><input type="date" className={panelInput} {...field("join_date")} /></PanelField>
          </div>

          <PanelField label="Line Manager">
            <select className={panelInput} {...field("line_manager_id")}>
              <option value="">Not assigned</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </PanelField>

          {csvResults.length > 0 && (
            <div className="rounded-lg border border-border bg-paper p-3">
              <p className="mb-2 text-xs font-bold text-ink">CSV update results</p>
              {csvResults.map((r) => (
                <div key={r.email} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-muted">{r.email}</span>
                  <span className={r.status === "updated" ? "font-bold text-green" : "font-bold text-red"}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4">
          <button
            onClick={handleSave}
            disabled={saving || csvUploading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-pulse text-sm font-black text-white disabled:opacity-40"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}

const panelInput = "mt-1 h-10 w-full rounded-xl border border-border bg-paper px-3 text-sm text-ink outline-none transition focus:border-pulse focus:shadow-[0_0_0_3px_var(--pulse-soft)]";

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}

// ── Right sidebar panels ───────────────────────────────────────────────────────

function LeavePanel({ leave, employees, leavingId, onAction }: {
  leave: LeaveRow[];
  employees: EmployeeRow[];
  leavingId: string | null;
  onAction: (id: string, action: "approved" | "declined") => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Leave Requests</p>
        <p className="text-[11px] text-muted">{leave.length ? `${leave.length} pending approval` : "No pending requests"}</p>
      </div>
      {leave.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">All clear.</p>
      ) : (
        <div className="divide-y divide-border">
          {leave.map((req) => {
            const emp = employees.find((e) => e.id === req.employee_id);
            const isActing = leavingId === req.id;
            return (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{emp?.name ?? "Employee"}</p>
                    <p className="mt-0.5 text-[11px] text-muted capitalize">{req.leave_type} · {req.start_date} → {req.end_date}</p>
                  </div>
                  <div className="flex flex-shrink-0 gap-1.5">
                    <button onClick={() => onAction(req.id, "approved")} disabled={isActing} className="grid h-7 w-7 place-items-center rounded-lg bg-green-soft text-green hover:bg-green hover:text-white disabled:opacity-40">
                      {isActing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                    <button onClick={() => onAction(req.id, "declined")} disabled={isActing} className="grid h-7 w-7 place-items-center rounded-lg bg-red-soft text-red hover:bg-red hover:text-white disabled:opacity-40">
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
  );
}

function AtRiskPanel({ employees }: { employees: EmployeeRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Needs Attention</p>
        <p className="text-[11px] text-muted">{employees.length ? `${employees.length} flagged` : "No flags"}</p>
      </div>
      {employees.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">All employees are on track.</p>
      ) : (
        <div className="divide-y divide-border">
          {employees.map((emp) => (
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
  );
}

function GoalHealthPanel({ goals }: { goals: GoalRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Goal Health</p>
        <p className="text-[11px] text-muted">{goals.length} goals total</p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        {[
          { label: "On track", status: "on_track", cls: "text-green" },
          { label: "At risk", status: "at_risk", cls: "text-[#c27a00]" },
          { label: "Behind", status: "behind", cls: "text-red" },
          { label: "Completed", status: "completed", cls: "text-pulse" },
        ].map(({ label, status, cls }) => (
          <div key={status} className="rounded-lg bg-paper p-3">
            <p className={clsx("font-syne text-xl font-bold", cls)}>{goals.filter((g) => g.status === status).length}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, warn, warnLabel }: { label: string; value: string | number; warn?: boolean; warnLabel?: string }) {
  return (
    <div className={clsx("rounded-lg border bg-card p-4", warn ? "border-red/20" : "border-border")}>
      <p className={clsx("font-syne text-2xl font-bold", warn ? "text-red" : "text-ink")}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
      {warn && warnLabel && <p className="mt-1 text-[10px] font-bold text-red">{warnLabel}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SETUP WIZARD
// ══════════════════════════════════════════════════════════════════════════════

function SetupWizard({ state, orgId, userEmail, activeTab, onTabChange, isOverlay, onExitSetup, onUpdateEmployees }: {
  state: DashState;
  orgId: string;
  userEmail: string;
  activeTab: SetupTab;
  onTabChange: (tab: SetupTab) => void;
  isOverlay: boolean;
  onExitSetup: () => void;
  onUpdateEmployees: (employees: EmployeeRow[]) => void;
}) {
  const metrics = useMemo(() => {
    const nonHr = state.employees.filter((e) => e.email !== userEmail);
    const deptCount = uniqueCount(state.employees.map((e) => e.department));
    const teamCount = uniqueCount(state.employees.map((e) => e.team));
    const managerLinks = state.employees.filter((e) => e.line_manager_id).length;
    const orgGoals = state.goals.filter((g) => g.goal_type === "org").length;
    const teamGoals = state.goals.filter((g) => g.goal_type === "team").length;
    const items = [Boolean(state.org?.name), nonHr.length > 0, deptCount > 0, teamCount > 0, managerLinks > 0, orgGoals > 0, teamGoals > 0, Boolean(state.org?.current_cycle || state.org?.cycle_start_date)];
    return { peopleCount: nonHr.length, deptCount, teamCount, progress: Math.round((items.filter(Boolean).length / items.length) * 100), totalGoals: state.goals.length };
  }, [state, userEmail]);

  const checklist = [
    { tab: "people" as SetupTab, title: "Add employees", detail: "Import staff records, confirm roles, and send invite links.", done: metrics.peopleCount > 0, cta: "Open people setup" },
    { tab: "teams" as SetupTab, title: "Create departments and teams", detail: "Group employees into departments, teams, and reporting lines.", done: metrics.deptCount > 0 && metrics.teamCount > 0, cta: "Open team setup" },
    { tab: "goals" as SetupTab, title: "Set goals", detail: "Add organisation goals, team goals, owners, due dates, and supporting documents.", done: metrics.totalGoals > 0, cta: "Open goal setup" },
    { tab: "appraisal" as SetupTab, title: "Configure appraisal cycle", detail: "Set cadence, review period, scoring weights, and report expectations.", done: Boolean(state.org?.current_cycle || state.org?.cycle_start_date), cta: "Open appraisal setup" },
    { tab: "launch" as SetupTab, title: "Launch workspace", detail: "Review setup quality, resolve missing items, and open Pulse to employees.", done: metrics.progress >= 80, cta: "Review launch" },
  ];

  const copy = SETUP_COPY[activeTab];

  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">
      {/* If coming from operational, show a back button */}
      {isOverlay && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Organisation Setup</p>
          <button onClick={onExitSetup} className="flex items-center gap-1.5 text-xs font-bold text-pulse hover:underline">
            ← Back to live dashboard
          </button>
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-ink p-5 text-white md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">HR setup workspace</p>
              <h1 className="mt-2 font-syne text-3xl font-bold leading-tight">{state.org?.name ?? "Organisation"}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">Configure the workspace structure before employees start using Pulse.</p>
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
            {[["Employees", metrics.peopleCount], ["Departments", metrics.deptCount], ["Teams", metrics.teamCount], ["Goals", metrics.totalGoals]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-paper p-3">
                <p className="font-syne text-2xl font-bold text-ink">{value}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex gap-2 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => onTabChange(tab.key)} className={clsx("inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition", selected ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted hover:text-ink")}>
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </section>

      {activeTab === "overview" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {checklist.map((item) => (
              <button key={item.title} onClick={() => onTabChange(item.tab)} className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition hover:border-pulse/40">
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
          <SetupGuidePanel copy={copy} />
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <SetupGuidePanel copy={copy} />
          {activeTab === "people" && (
        <PeopleSetup
          employees={state.employees}
          orgId={orgId}
          hrEmail={userEmail}
          onEmployeesChange={(updated) => onUpdateEmployees([...state.employees.filter((e) => e.email === userEmail), ...updated])}
        />
      )}
          {activeTab === "teams" && <TeamsSetup employees={state.employees} />}
          {activeTab === "goals" && <GoalsSetup goals={state.goals} />}
          {activeTab === "appraisal" && <AppraisalSetup org={state.org} />}
          {activeTab === "launch" && <LaunchSetup progress={metrics.progress} checklist={checklist} />}
        </section>
      )}
    </main>
  );
}

// ── Setup sub-components ───────────────────────────────────────────────────────

function SetupGuidePanel({ copy }: { copy: { title: string; body: string; actions: string[] } }) {
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
      <div className="mt-5 border-t border-border pt-4">
        <button onClick={downloadCSVTemplate} className="flex items-center gap-2 text-xs font-bold text-pulse hover:underline">
          <Download size={13} />
          Download employee CSV template
        </button>
      </div>
    </aside>
  );
}

function PeopleSetup({ employees, orgId, hrEmail, onEmployeesChange }: {
  employees: EmployeeRow[];
  orgId: string;
  hrEmail: string;
  onEmployeesChange: (employees: EmployeeRow[]) => void;
}) {
  const [localStaff, setLocalStaff] = useState(() => employees.filter((e) => e.email !== hrEmail));
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResults, setCsvResults] = useState<Array<{ email: string; status: string }>>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  // Keep in sync if parent re-fetches
  useEffect(() => {
    setLocalStaff(employees.filter((e) => e.email !== hrEmail));
  }, [employees, hrEmail]);

  async function handleCSV(file: File) {
    setCsvUploading(true);
    setCsvResults([]);
    const text = await file.text();
    const rows = parseUpdateCSV(text);
    const supabase = getSupabase();
    const results: Array<{ email: string; status: string }> = [];
    for (const row of rows) {
      if (!row.email) continue;
      const { error } = await supabase.from("employees").update({
        name: row.name || undefined, role: row.role || undefined, department: row.department || undefined,
        team: row.team || undefined, cadre: row.cadre || undefined, band_current: row.band_current || undefined,
        employment_type: row.employment_type || undefined, join_date: row.join_date || undefined,
      }).eq("email", row.email).eq("org_id", orgId);
      results.push({ email: row.email, status: error ? "error" : "updated" });
    }
    setCsvResults(results);
    setCsvUploading(false);
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setDeletingId(id);
    setConfirmDeleteId(null);
    const supabase = getSupabase();
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (!error) {
      const next = localStaff.filter((e) => e.id !== id);
      setLocalStaff(next);
      onEmployeesChange(next);
    }
    setDeletingId(null);
  }

  function handleAdded(emp: EmployeeRow) {
    const next = [...localStaff, emp];
    setLocalStaff(next);
    onEmployeesChange(next);
    setShowAdd(false);
  }

  return (
    <div className="space-y-4">
      {/* Bulk CSV */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-pulse-soft text-pulse"><Upload size={19} /></span>
            <div>
              <p className="text-sm font-black text-ink">Bulk import via CSV</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Download the template, fill in employee data, then upload to update all records at once.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadCSVTemplate} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-paper px-3 text-xs font-bold text-muted hover:text-pulse">
              <Download size={13} />
              Template
            </button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-black text-white">
              {csvUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {csvUploading ? "Uploading…" : "Upload CSV"}
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSV(f); }} />
            </label>
          </div>
        </div>
        {csvResults.length > 0 && (
          <div className="mt-4 rounded-lg bg-paper p-3">
            <p className="mb-2 text-xs font-bold text-ink">Results</p>
            {csvResults.map((r) => (
              <div key={r.email} className="flex items-center justify-between py-0.5 text-xs">
                <span className="text-muted">{r.email}</span>
                <span className={r.status === "updated" ? "font-bold text-green" : "font-bold text-red"}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Employee list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-black text-ink">Employee list</p>
            <p className="mt-0.5 text-xs text-muted">{localStaff.length ? `${localStaff.length} employees` : "No employees yet"}</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-pulse px-3 text-xs font-black text-white"
          >
            <Plus size={13} />
            Add Employee
          </button>
        </div>
        <div className="divide-y divide-border">
          {localStaff.length === 0 ? (
            <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
              <div>
                <Users size={22} className="mx-auto text-muted" />
                <p className="mt-3 text-sm font-black text-ink">No employees yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
                  Add employees one by one using the button above, or bulk import with the CSV template.
                </p>
              </div>
            </div>
          ) : (
            localStaff.map((e) => {
              const isConfirm = confirmDeleteId === e.id;
              const isDeleting = deletingId === e.id;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                    {initials(e.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{e.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {e.email} · {e.role || "Role pending"}{e.department ? ` · ${e.department}` : ""}
                    </span>
                  </span>
                  {isConfirm ? (
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button onClick={() => handleDelete(e.id)} disabled={isDeleting} className="rounded-lg bg-red px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">
                        {isDeleting ? <Loader2 size={11} className="animate-spin" /> : "Confirm"}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="flex-shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-red-soft hover:text-red"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add employee slide-over */}
      {showAdd && (
        <AddEmployeePanel
          orgId={orgId}
          employees={localStaff}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}

// ── Add Employee Panel ─────────────────────────────────────────────────────────

interface NewEmpForm {
  name: string;
  email: string;
  role: string;
  department: string;
  team: string;
  cadre: string;
  people_responsibility: string;
  band: string;
  employment_type: string;
  join_date: string;
  line_manager_email: string;
}

const EMPTY_FORM: NewEmpForm = {
  name: "", email: "", role: "", department: "", team: "",
  cadre: "entry", people_responsibility: "none",
  band: "", employment_type: "full_time", join_date: "", line_manager_email: "",
};

function AddEmployeePanel({ orgId, employees, onClose, onAdded }: {
  orgId: string;
  employees: EmployeeRow[];
  onClose: () => void;
  onAdded: (emp: EmployeeRow) => void;
}) {
  const [form, setForm] = useState<NewEmpForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = <K extends keyof NewEmpForm>(key: K) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setError("Name and email are required."); return; }
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/send-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          employees: [{
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            department: form.department,
            team: form.team,
            cadre: form.cadre,
            peopleResponsibility: form.people_responsibility,
            lineManagerEmail: form.line_manager_email,
            band: form.band,
            joinDate: form.join_date,
          }],
        }),
      });

      const json = (await res.json()) as { results?: Array<{ email: string; status: string; error?: string }> };
      const result = json.results?.[0];

      if (!res.ok || result?.status === "error") {
        setError(result?.error ?? "Failed to add employee. Try again.");
        setSaving(false);
        return;
      }

      // Fetch the newly created employee record
      const supabase = getSupabase();
      const { data: newEmp } = await supabase
        .from("employees")
        .select("id, name, email, department, team, role, cadre, platform_role, avatar_color, performance_score, badge, consistency_index, week_streak, line_manager_id, employment_type, join_date, band_current")
        .eq("email", form.email.trim().toLowerCase())
        .eq("org_id", orgId)
        .maybeSingle();

      if (newEmp) {
        onAdded(newEmp as EmployeeRow);
      } else {
        // Fallback: create a local placeholder
        onAdded({
          id: crypto.randomUUID(),
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role || null,
          department: form.department || null,
          team: form.team || null,
          cadre: form.cadre,
          platform_role: "standard",
          avatar_color: "#e8440a",
          performance_score: 0,
          badge: "Good Standing",
          consistency_index: 0,
          week_streak: 0,
          line_manager_id: null,
          employment_type: form.employment_type,
          join_date: form.join_date || null,
          band_current: form.band || null,
        });
      }
    } catch {
      setError("Network error. Try again.");
      setSaving(false);
    }
  }

  const managers = employees.filter((e) => e.cadre === "senior" || e.cadre === "executive" || e.platform_role === "hr_admin");

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col bg-card shadow-[-8px_0_40px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-bold text-ink">Add Employee</p>
            <p className="text-xs text-muted">An invite will be sent to their email automatically</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-ink">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {error && (
              <div className="rounded-xl bg-red-soft px-3 py-2 text-xs font-bold text-red">{error}</div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <PanelField label="Full Name *">
                <input className={panelInput} placeholder="Jane Doe" required {...f("name")} />
              </PanelField>
              <PanelField label="Work Email *">
                <input type="email" className={panelInput} placeholder="jane@company.com" required {...f("email")} />
              </PanelField>
            </div>

            <PanelField label="Job Title / Role">
              <input className={panelInput} placeholder="e.g. Senior Engineer" {...f("role")} />
            </PanelField>

            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Department">
                <input className={panelInput} placeholder="e.g. Engineering" {...f("department")} />
              </PanelField>
              <PanelField label="Team">
                <input className={panelInput} placeholder="e.g. Platform" {...f("team")} />
              </PanelField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Cadre">
                <select className={panelInput} {...f("cadre")}>
                  {["entry", "mid", "senior", "executive"].map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </PanelField>
              <PanelField label="People Responsibility">
                <select className={panelInput} {...f("people_responsibility")}>
                  {["none", "team_lead", "manager", "senior_manager", "director"].map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </PanelField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Band / Level">
                <input className={panelInput} placeholder="e.g. L2 – Mid-level" {...f("band")} />
              </PanelField>
              <PanelField label="Join Date">
                <input type="date" className={panelInput} {...f("join_date")} />
              </PanelField>
            </div>

            <PanelField label="Employment Type">
              <select className={panelInput} {...f("employment_type")}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </PanelField>

            {managers.length > 0 && (
              <PanelField label="Line Manager">
                <select className={panelInput} {...f("line_manager_email")}>
                  <option value="">Not assigned</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </PanelField>
            )}

            <div className="rounded-xl border border-border bg-paper p-3 text-xs text-muted leading-relaxed">
              An invite email will be sent to <strong className="text-ink">{form.email || "their address"}</strong> as soon as you submit. They'll click the link, verify with OTP, and complete their profile.
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.email.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-pulse text-sm font-black text-white disabled:opacity-40"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <MailPlus size={15} />}
              {saving ? "Adding & sending invite…" : "Add Employee & Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function TeamsSetup({ employees }: { employees: EmployeeRow[] }) {
  const teams = Array.from(employees.reduce((map, e) => {
    const key = e.team?.trim(); if (!key) return map;
    map.set(key, { name: key, department: e.department ?? "No department", count: (map.get(key)?.count ?? 0) + 1 });
    return map;
  }, new Map<string, { name: string; department: string; count: number }>())).map(([, v]) => v);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-black text-ink">Team structure</p>
        <p className="mt-1 text-xs text-muted">Teams are derived from employee department and team fields.</p>
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
        <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
          <div><Network size={22} className="mx-auto text-muted" /><p className="mt-3 text-sm font-black text-ink">No teams yet</p><p className="mt-1 text-xs text-muted">Update employees with department and team fields via CSV upload.</p></div>
        </div>
      )}
    </div>
  );
}

function GoalsSetup({ goals }: { goals: GoalRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-pulse-soft text-pulse"><FileText size={19} /></span>
          <div><p className="text-sm font-black text-ink">Goal template</p><p className="mt-1 text-xs leading-relaxed text-muted">Create company goals, cascade team goals, then attach planning documents.</p></div>
        </div>
        <Link href="/goals" className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-xs font-black text-white"><Target size={15} />Open goals</Link>
      </div>
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3"><p className="text-sm font-black text-ink">Goal library</p><p className="mt-1 text-xs text-muted">{goals.length ? `${goals.length} goals` : "No goals yet"}</p></div>
        {goals.length ? (
          <div className="divide-y divide-border">{goals.slice(0, 8).map((g) => (<div key={g.id} className="px-4 py-3"><p className="text-sm font-bold text-ink">{g.title}</p><p className="mt-1 text-xs text-muted capitalize">{g.goal_type} · {g.department || g.team || "Organisation wide"} · {g.status}</p></div>))}</div>
        ) : (
          <div className="grid min-h-44 place-items-center px-4 py-8 text-center"><div><Target size={22} className="mx-auto text-muted" /><p className="mt-3 text-sm font-black text-ink">No goals yet</p><p className="mt-1 text-xs text-muted">Start with organisation goals before team and individual goals.</p></div></div>
        )}
      </div>
    </div>
  );
}

function AppraisalSetup({ org }: { org: OrgRow | null }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><p className="text-sm font-black text-ink">Appraisal configuration</p><p className="mt-1 text-xs text-muted">These settings define how performance reviews will run.</p></div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {[["Cadence", org?.appraisal_cadence ?? "Not set"], ["Current cycle", org?.current_cycle ?? "Not set"], ["Start date", org?.cycle_start_date ?? "Not set"], ["End date", org?.cycle_end_date ?? "Not set"]].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-paper p-3"><p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-sm font-black text-ink">{value}</p></div>
        ))}
      </div>
      <div className="border-t border-border p-4">
        <Link href="/settings" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-xs font-black text-white"><Settings2 size={15} />Configure review rules</Link>
      </div>
    </div>
  );
}

function LaunchSetup({ progress, checklist }: { progress: number; checklist: Array<{ title: string; done: boolean }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-black text-ink">Launch readiness</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-pulse" style={{ width: `${progress}%` }} /></div>
      <div className="mt-4 space-y-2">
        {checklist.map((item) => (
          <div key={item.title} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
            <span className="text-xs font-bold text-ink">{item.title}</span>
            {item.done ? <CheckCircle2 size={16} className="text-green" /> : <span className="h-2 w-2 rounded-full bg-muted/40" />}
          </div>
        ))}
      </div>
      <button disabled={progress < 80} className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
        Open workspace
      </button>
    </div>
  );
}
