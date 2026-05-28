"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  FileUp,
  Lock,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import { departments, employees, org } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { AppraisalRec, Cadre, Department, Employee, PeopleResponsibility } from "@/types";

type HrTab = "overview" | "employees" | "appraisals" | "wellbeing" | "configuration";
type EmpFilter = "all" | "strong" | "good" | "needs" | "risk";
type RecFilter = "all" | AppraisalRec;

interface AppraisalWeights {
  goal: number;
  report: number;
  kpi: number;
  manager: number;
  peer: number;
}

const tabs: { key: HrTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "employees", label: "Employees" },
  { key: "appraisals", label: "Appraisals" },
  { key: "wellbeing", label: "Wellbeing" },
  { key: "configuration", label: "Configuration" },
];

const defaultWeights: AppraisalWeights = { goal: 35, report: 20, kpi: 25, manager: 15, peer: 5 };

function avg(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function fmt(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

function scoreColor(score: number) {
  if (score >= 75) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green text-white";
  if (score >= 70) return "bg-green-soft text-green";
  if (score >= 60) return "bg-amber-soft text-amber";
  return "bg-red-soft text-red";
}

function recLabel(rec: AppraisalRec) {
  return rec === "promote" ? "Promote" : rec === "good_standing" ? "Good Standing" : rec === "pip" ? "PIP" : "Exit Risk";
}

function recClass(rec: AppraisalRec) {
  if (rec === "promote") return "bg-green-soft text-green border-green/20";
  if (rec === "good_standing") return "bg-border text-muted border-border";
  if (rec === "pip") return "bg-amber-soft text-amber border-amber/20";
  return "bg-red-soft text-red border-red/20";
}

function Avatar({ employee, size = "md" }: { employee: Employee; size?: "sm" | "md" }) {
  return (
    <div className={clsx("flex flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", size === "sm" ? "h-8 w-8" : "h-10 w-10")} style={{ backgroundColor: employee.avatarColor }}>
      {employee.initials}
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return <div className="fixed left-1/2 top-5 z-[220] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-xl">{message}</div>;
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[180] bg-black/45" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[190] mx-auto max-h-[88vh] max-w-3xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </>
  );
}

export default function HrPortalPage() {
  const { user } = useUser();
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [active, setActive] = useState<HrTab>("overview");
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<EmpFilter>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recFilter, setRecFilter] = useState<RecFilter>("all");
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [overrideEmployee, setOverrideEmployee] = useState<Employee | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [weights, setWeights] = useState(defaultWeights);
  const [perCadre, setPerCadre] = useState(false);
  const [cadreEdit, setCadreEdit] = useState<Employee | null>(null);
  const [leaveTypes, setLeaveTypes] = useState([
    { name: "Annual", days: 20, note: false, flow: "Manager" },
    { name: "Sick", days: 10, note: true, flow: "Manager + HR" },
    { name: "Compassionate", days: 3, note: true, flow: "HR" },
    { name: "Maternity/Paternity", days: 90, note: true, flow: "HR + Director" },
    { name: "Unpaid", days: 30, note: true, flow: "HR" },
  ]);

  useEffect(() => {
    if (user.platformRole !== "hr_admin" && user.platformRole !== "super_admin") {
      const timer = setTimeout(() => router.replace("/dashboard"), 1200);
      return () => clearTimeout(timer);
    }
  }, [router, user.platformRole]);

  const orgScore = avg(employees.map((employee) => employee.performanceScore));
  const promotionReady = employees.filter((employee) => employee.performanceScore >= 85);
  const pipCandidates = employees.filter((employee) => employee.aiRec.recommendation === "pip" || employee.aiRec.recommendation === "exit_risk");
  const compliance = Math.round((employees.filter((employee) => employee.weekStreak > 0).length / employees.length) * 100);
  const riskFlags = employees.filter((employee) => employee.badge === "At Risk" || employee.badge === "Needs Improvement");
  const daysRemaining = Math.max(0, Math.ceil((new Date("2026-06-30").getTime() - new Date("2026-05-28").getTime()) / 86_400_000));

  const visibleEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesQuery = !q || [employee.name, employee.department, employee.cadre, employee.peopleResponsibility].some((value) => value.toLowerCase().includes(q));
      const matchesFilter =
        employeeFilter === "all" ||
        (employeeFilter === "strong" && employee.badge === "Strong Performer") ||
        (employeeFilter === "good" && employee.badge === "Good Standing") ||
        (employeeFilter === "needs" && employee.badge === "Needs Improvement") ||
        (employeeFilter === "risk" && employee.badge === "At Risk");
      return matchesQuery && matchesFilter;
    });
  }, [employeeFilter, employeeQuery]);

  const recEmployees = recFilter === "all" ? employees : employees.filter((employee) => employee.aiRec.recommendation === recFilter);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (user.platformRole !== "hr_admin" && user.platformRole !== "super_admin") {
    return <div className="fixed inset-0 z-[200] bg-paper"><Toast message="Access restricted." /></div>;
  }

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-paper text-ink">
      {toast && <Toast message={toast} />}
      <header className="sticky top-0 z-[160] border-b border-white/10 bg-ink px-4 py-3 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard/profile" className="text-xs font-bold text-white/50">← Back to My Dashboard</Link>
            <h1 className="mt-1 text-lg font-bold" style={{ fontFamily: "var(--font-syne)" }}>HR Admin Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/45 sm:inline">{user.name}</span>
            <Avatar employee={user} size="sm" />
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-7xl gap-2 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActive(tab.key)} className={clsx("flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold", active === tab.key ? "bg-pulse text-white" : "border border-white/10 text-white/55")}>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {active === "overview" && (
          <>
            <section className="rounded-[20px] bg-ink p-5 text-white">
              <p className="text-sm text-white/45">Organisation Overview — {org.name}</p>
              <div className="mt-4 flex flex-wrap items-end gap-4">
                <span className="text-5xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>{orgScore}%</span>
                <span className="pb-2 text-sm text-green">Org health score</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>{org.staffCount} staff</Tag><Tag>{org.departmentCount} departments</Tag><Tag>{org.currentCycle}</Tag><Tag>{daysRemaining} days remaining</Tag>
              </div>
            </section>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Promotion-ready" value={promotionReady.length} />
              <Stat label="PIP candidates" value={pipCandidates.length} accent />
              <Stat label="Report compliance" value={`${compliance}%`} />
              <Stat label="AI risk flags" value={riskFlags.length} />
            </section>
            <section>
              <SectionTitle>Department Heatmap</SectionTitle>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {departments.map((dept) => (
                  <button key={dept.id} onClick={() => setSelectedDept(dept)} className={clsx("rounded-lg p-3 text-left", scoreBg(dept.avgScore))}>
                    <p className="text-xs font-bold">{dept.name}</p>
                    <p className="mt-2 text-2xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>{dept.avgScore}</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-border bg-card p-4">
              <SectionTitle>Org Performance Trend</SectionTitle>
              <TrendChart />
            </section>
          </>
        )}

        {active === "employees" && (
          <>
            <section className="space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search by name, dept, cadre, responsibility" className="w-full rounded-lg border border-border bg-card py-3 pl-9 pr-3 text-sm outline-none focus:border-pulse" />
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {(["all", "strong", "good", "needs", "risk"] as EmpFilter[]).map((filter) => (
                  <button key={filter} onClick={() => setEmployeeFilter(filter)} className={clsx("flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold", employeeFilter === filter ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}>{filter === "all" ? "All" : filter === "strong" ? "Strong" : filter === "good" ? "Good Standing" : filter === "needs" ? "Needs Improvement" : "At Risk"}</button>
                ))}
              </div>
              {multiMode && <BulkBar count={selectedIds.size} showToast={showToast} />}
            </section>
            <section className="space-y-2">
              {visibleEmployees.map((employee) => (
                <button key={employee.id} onContextMenu={(event) => { event.preventDefault(); setMultiMode(true); toggleSelected(employee.id); }} onClick={() => multiMode ? toggleSelected(employee.id) : setSelectedEmployee(employee)} className={clsx("flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left", selectedIds.has(employee.id) ? "border-pulse" : "border-border")}>
                  <Avatar employee={employee} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{employee.name}</p>
                    <p className="truncate text-xs text-muted">{employee.role} · {employee.department}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <MiniBadge>{employee.cadre}</MiniBadge><MiniBadge>{employee.peopleResponsibility}</MiniBadge><span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-bold", recClass(employee.aiRec.recommendation))}>{recLabel(employee.aiRec.recommendation)}</span>
                    </div>
                  </div>
                  <span className={clsx("text-lg font-bold", scoreColor(employee.performanceScore))}>{employee.performanceScore}</span>
                </button>
              ))}
            </section>
          </>
        )}

        {active === "appraisals" && (
          <>
            <section className="rounded-[20px] bg-ink p-5 text-white">
              <p className="text-sm text-white/45">Current Cycle</p>
              <h2 className="mt-1 text-xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>{org.currentCycle} Performance Review</h2>
              <div className="mt-4 space-y-3">
                <ProgressRow label="Self-assessments submitted" value={72} text="106/148" onRemind={() => showToast("Reminders sent to 42 employees")} />
                <ProgressRow label="Manager reviews done" value={60} text="89/148" onRemind={() => showToast("Reminders sent to 59 employees")} />
                <ProgressRow label="Peer feedback collected" value={88} text="88%" onRemind={() => showToast("Reminders sent to 18 employees")} />
                <ProgressRow label="AI recommendations ready" value={100} text="100%" />
                <ProgressRow label="HR sign-offs pending" value={38} text="3 pending" onRemind={() => showToast("Reminders sent to HR approvers")} />
              </div>
            </section>
            <section className="rounded-lg border border-amber/20 bg-amber-soft p-4 text-sm font-semibold text-amber">All recommendations are AI-generated and advisory only. HR and manager confirmation is required before any action is taken.</section>
            <section>
              <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-none">
                {(["all", "promote", "good_standing", "pip", "exit_risk"] as RecFilter[]).map((filter) => <button key={filter} onClick={() => setRecFilter(filter)} className={clsx("flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold", recFilter === filter ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}>{filter === "all" ? "All" : recLabel(filter as AppraisalRec)}</button>)}
              </div>
              <div className="space-y-3">
                {recEmployees.map((employee) => <RecommendationCard key={employee.id} employee={employee} confirmed={confirmed.has(employee.id)} onConfirm={() => setConfirmed((prev) => new Set(prev).add(employee.id))} onOverride={() => setOverrideEmployee(employee)} onManager={() => showToast("Line manager notified")} />)}
              </div>
            </section>
            <button onClick={() => setConfigOpen(true)} className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white"><Settings className="mr-2 inline" size={15} />Configure Current Cycle</button>
          </>
        )}

        {active === "wellbeing" && <WellbeingSection showToast={showToast} />}
        {active === "configuration" && <ConfigurationSection leaveTypes={leaveTypes} setLeaveTypes={setLeaveTypes} onEdit={setCadreEdit} showToast={showToast} />}
      </main>

      {selectedDept && <DepartmentSheet dept={selectedDept} onClose={() => setSelectedDept(null)} />}
      {selectedEmployee && <EmployeeSheet employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} showToast={showToast} />}
      {overrideEmployee && <OverrideSheet employee={overrideEmployee} onClose={() => setOverrideEmployee(null)} showToast={showToast} />}
      {configOpen && <CycleConfigSheet weights={weights} setWeights={setWeights} perCadre={perCadre} setPerCadre={setPerCadre} onClose={() => setConfigOpen(false)} showToast={showToast} />}
      {cadreEdit && <RoleEditSheet employee={cadreEdit} onClose={() => setCadreEdit(null)} showToast={showToast} />}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/55">{children}</span>;
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-muted">{children}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted">{children}</p>;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return <div className={clsx("rounded-lg border p-4", accent ? "border-transparent bg-pulse text-white" : "border-border bg-card")}><p className="text-3xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>{value}</p><p className={clsx("mt-1 text-[10px] font-bold uppercase tracking-widest", accent ? "text-white/60" : "text-muted")}>{label}</p></div>;
}

function TrendChart() {
  const values = [66, 68, 71, 73, 76, 79];
  return <svg viewBox="0 0 360 150" className="h-48 w-full">{values.map((value, index) => { const h = value * 1.2; const x = 30 + index * 52; return <g key={index}><rect x={x} y={130 - h} width="28" height={h} rx="5" fill="#e8440a" opacity={0.45 + index * 0.1} /><text x={x + 14} y={130 - h - 6} textAnchor="middle" fontSize="10" fill="#0d0d0d">{value}</text><text x={x + 14} y="145" textAnchor="middle" fontSize="9" fill="#6f747d">{["Dec","Jan","Feb","Mar","Apr","May"][index]}</text></g>; })}</svg>;
}

function DepartmentSheet({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const deptEmployees = employees.filter((employee) => employee.department === dept.name);
  const top = [...deptEmployees].sort((a, b) => b.performanceScore - a.performanceScore)[0];
  const low = [...deptEmployees].sort((a, b) => a.performanceScore - b.performanceScore)[0];
  const goalCompletion = avg(deptEmployees.map((employee) => avg(employee.goals.map((goal) => goal.percentComplete))));
  return <BottomSheet onClose={onClose}><h2 className="text-xl font-bold text-ink">{dept.name}</h2><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Avg score" value={dept.avgScore} /><Stat label="Goal completion" value={`${goalCompletion}%`} /></div><div className="mt-4 space-y-2"><p className="text-sm font-bold text-ink">Top Performer</p>{top && <p className="text-sm text-muted">{top.name} · {top.performanceScore}</p>}<p className="text-sm font-bold text-ink">Lowest Performer</p>{low && <p className="text-sm text-muted">{low.name} · {low.performanceScore}</p>}<p className="text-sm font-bold text-ink">Pending actions</p><p className="text-sm text-muted">Review risk flags, send appraisal reminders, and confirm manager calibration.</p></div></BottomSheet>;
}

function BulkBar({ count, showToast }: { count: number; showToast: (message: string) => void }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-pulse/20 bg-pulse-soft p-3"><span className="text-sm font-bold text-pulse">{count} selected</span>{["Export selected", "Send notification", "Change cycle", "Assign to review"].map((action) => <button key={action} onClick={() => showToast(`${action} queued`)} className="rounded-lg bg-card px-3 py-1.5 text-xs font-bold text-muted">{action}</button>)}</div>;
}

function EmployeeSheet({ employee, onClose, showToast }: { employee: Employee; onClose: () => void; showToast: (message: string) => void }) {
  const verified = employee.documents.filter((doc) => doc.status === "verified").length;
  return <BottomSheet onClose={onClose}><div className="flex items-start gap-3"><Avatar employee={employee} /><div><h2 className="text-lg font-bold text-ink">{employee.name}</h2><p className="text-sm text-muted">{employee.role} · {employee.department}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Score" value={employee.performanceScore} /><Stat label="AI confidence" value={`${Math.round(employee.aiRec.confidence * 100)}%`} /></div><div className="mt-4 rounded-lg border border-border p-4"><p className="text-sm font-bold text-ink">AI recommendation</p><span className={clsx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", recClass(employee.aiRec.recommendation))}>{recLabel(employee.aiRec.recommendation)}</span><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{employee.aiRec.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></div><div className="mt-4 grid gap-2 md:grid-cols-4">{["Initiate PIP", "Flag for Promotion", "Schedule Review", "Send Message"].map((action) => <button key={action} onClick={() => showToast(`${action} action saved`)} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">{action}</button>)}</div><div className="mt-4 space-y-2 text-sm text-muted"><p>Documents: {employee.documents.length} submitted, {verified} verified</p><p>Leave balance: {employee.leaveBalance.annual.remaining} annual days remaining</p><p className="font-bold text-ink">Report history</p>{employee.reports.map((report) => <p key={report.id}>{report.type} · {fmt(report.date)}</p>)}</div></BottomSheet>;
}

function ProgressRow({ label, value, text, onRemind }: { label: string; value: number; text: string; onRemind?: () => void }) {
  return <div><div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs text-white/65">{label}</span><span className="text-xs font-bold text-white/80">{text}</span></div><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-pulse" style={{ width: `${value}%` }} /></div>{onRemind && <button onClick={onRemind} className="rounded border border-white/15 px-2 py-1 text-[10px] text-white/65">Send Reminder</button>}</div></div>;
}

function RecommendationCard({ employee, confirmed, onConfirm, onOverride, onManager }: { employee: Employee; confirmed: boolean; onConfirm: () => void; onOverride: () => void; onManager: () => void }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex gap-3"><Avatar employee={employee} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{employee.name}</p><p className="text-xs text-muted">{employee.role} · {employee.performanceScore}%</p><span className={clsx("mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-bold", recClass(employee.aiRec.recommendation))}>{recLabel(employee.aiRec.recommendation)} · {Math.round(employee.aiRec.confidence * 100)}%</span></div></div><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{employee.aiRec.evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><button onClick={onConfirm} className={clsx("rounded-lg px-3 py-2 text-xs font-bold", confirmed ? "bg-green-soft text-green" : "bg-ink text-white")}>{confirmed ? "Confirmed" : "Confirm"}</button><button onClick={onOverride} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Override</button><button onClick={onManager} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Send to Manager</button></div></div>;
}

function OverrideSheet({ employee, onClose, showToast }: { employee: Employee; onClose: () => void; showToast: (message: string) => void }) {
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Override recommendation for {employee.name}</h2><select className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-base">{(["promote","good_standing","pip","exit_risk"] as AppraisalRec[]).map((rec) => <option key={rec}>{recLabel(rec)}</option>)}</select><textarea className="mt-3 min-h-28 w-full rounded-lg border border-border px-3 py-2 text-base" placeholder="Reason for override" /><button onClick={() => { showToast("Override saved"); onClose(); }} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Confirm Override</button></BottomSheet>;
}

function CycleConfigSheet({ weights, setWeights, perCadre, setPerCadre, onClose, showToast }: { weights: AppraisalWeights; setWeights: (weights: AppraisalWeights) => void; perCadre: boolean; setPerCadre: (value: boolean) => void; onClose: () => void; showToast: (message: string) => void }) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  function set(key: keyof AppraisalWeights, value: number) { setWeights({ ...weights, [key]: value }); }
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Configure Current Cycle</h2><div className="mt-4 grid gap-2 md:grid-cols-3"><input className="rounded-lg border border-border px-3 py-2" defaultValue="Q2 2026" /><input type="date" className="rounded-lg border border-border px-3 py-2" defaultValue="2026-04-01" /><input type="date" className="rounded-lg border border-border px-3 py-2" defaultValue="2026-06-30" /></div><div className="mt-4 flex gap-2"><button onClick={() => setPerCadre(false)} className={clsx("rounded-full px-3 py-1.5 text-xs font-bold", !perCadre ? "bg-pulse text-white" : "bg-paper text-muted")}>Same for all</button><button onClick={() => setPerCadre(true)} className={clsx("rounded-full px-3 py-1.5 text-xs font-bold", perCadre ? "bg-pulse text-white" : "bg-paper text-muted")}>Configure per cadre</button></div>{Object.entries(weights).map(([key, value]) => <div key={key} className="mt-4"><div className="flex justify-between text-sm"><span className="font-bold capitalize">{key}</span><span>{value}%</span></div><input type="range" min={0} max={60} value={value} onChange={(event) => set(key as keyof AppraisalWeights, Number(event.target.value))} className="w-full accent-pulse" /></div>)}<p className={clsx("mt-3 text-sm font-bold", total === 100 ? "text-green" : "text-red")}>Total: {total}%</p><button onClick={() => { showToast(total === 100 ? "Cycle weights saved" : "Weights must total 100%"); if (total === 100) onClose(); }} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Save</button></BottomSheet>;
}

function WellbeingSection({ showToast }: { showToast: (message: string) => void }) {
  return <div className="space-y-5"><section className="grid grid-cols-3 gap-3"><Stat label="Completed this week" value="72%" /><Stat label="Positive / Neutral / Low" value="58/31/11" /><Stat label="May need support" value="6" accent /></section><section className="space-y-2"><SectionTitle>Anonymous Flags</SectionTitle>{["Sales", "Support", "Operations"].map((dept, index) => <div key={dept} className="rounded-lg border border-border bg-card p-4"><p className="text-sm text-ink">A member of {dept} team has shown {index === 0 ? "low sentiment" : "sustained stress"} for {index + 2} weeks.</p><div className="mt-3 flex gap-2"><button onClick={() => showToast("Wellness message queued")} className="rounded-lg bg-pulse px-3 py-2 text-xs font-bold text-white">Send dept-wide wellness message</button><button onClick={() => showToast("Anonymous manager check-in flagged")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Flag for manager check-in</button></div></div>)}</section><section className="rounded-lg border border-border bg-card p-4"><SectionTitle>Wellbeing Configuration</SectionTitle><select className="w-full rounded-lg border border-border px-3 py-2"><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></select>{["After X consecutive low scores → send AI support resources","After Y consecutive low scores → flag to HR (anonymous)","After Z → reveal identity to HR"].map((label, i) => <div key={label} className="mt-4"><div className="mb-1 flex justify-between text-xs font-bold text-muted"><span>{label}</span><span>{i + 2}</span></div><input type="range" min={1} max={6} defaultValue={i + 2} className="w-full accent-pulse" /></div>)}<p className="mt-3 flex items-center gap-2 text-xs font-bold text-red"><Lock size={13} /> Sensitive — use carefully</p></section></div>;
}

function ConfigurationSection({ leaveTypes, setLeaveTypes, onEdit, showToast }: { leaveTypes: { name: string; days: number; note: boolean; flow: string }[]; setLeaveTypes: Dispatch<SetStateAction<{ name: string; days: number; note: boolean; flow: string }[]>>; onEdit: (employee: Employee) => void; showToast: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-lg border border-border bg-card p-4"><div className="flex justify-between gap-3"><SectionTitle>Org Chart</SectionTitle><div className="flex gap-2"><button onClick={() => showToast("Import feature coming soon")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"><FileUp size={13} className="mr-1 inline" />Import CSV</button><button onClick={() => showToast("Add employee form opened")} className="rounded-lg bg-pulse px-3 py-2 text-xs font-bold text-white"><UserPlus size={13} className="mr-1 inline" />Add Employee</button></div></div><OrgChart /></section><section className="space-y-2"><SectionTitle>Role Configuration</SectionTitle>{employees.map((employee) => <button key={employee.id} onClick={() => onEdit(employee)} className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-3 text-left"><div><p className="text-sm font-bold text-ink">{employee.name}</p><p className="text-xs text-muted">{employee.cadre} · {employee.peopleResponsibility}</p></div><SlidersHorizontal size={15} className="text-muted" /></button>)}</section><section className="rounded-lg border border-border bg-card p-4"><SectionTitle>Leave Configuration</SectionTitle>{leaveTypes.map((item, index) => <div key={item.name} className="mt-2 grid grid-cols-[1fr_70px_80px_1fr] gap-2"><input value={item.name} onChange={(e) => setLeaveTypes((prev) => prev.map((lt, i) => i === index ? { ...lt, name: e.target.value } : lt))} className="rounded border border-border px-2 py-1 text-sm" /><input type="number" value={item.days} onChange={(e) => setLeaveTypes((prev) => prev.map((lt, i) => i === index ? { ...lt, days: Number(e.target.value) } : lt))} className="rounded border border-border px-2 py-1 text-sm" /><select defaultValue={String(item.note)} className="rounded border border-border px-2 py-1 text-sm"><option value="false">No note</option><option value="true">Note</option></select><input defaultValue={item.flow} className="rounded border border-border px-2 py-1 text-sm" /></div>)}<button onClick={() => setLeaveTypes((prev) => [...prev, { name: "New Type", days: 5, note: false, flow: "Manager" }])} className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white"><Plus size={13} className="mr-1 inline" />Add Leave Type</button></section><section className="rounded-lg border border-border bg-card p-4"><SectionTitle>Notification Settings</SectionTitle>{["Report submitted","Appraisal due","Wellbeing survey","Leave request"].map((event) => <div key={event} className="grid grid-cols-[1fr_60px_60px_60px] border-b border-border py-2 text-sm"><span>{event}</span>{["in-app","email","push"].map((kind) => <label key={kind} className="text-center"><input type="checkbox" defaultChecked /></label>)}</div>)}</section></div>;
}

function OrgChart() {
  const ceo = employees.find((employee) => employee.peopleResponsibility === "director") ?? employees[0];
  const managers = employees.filter((employee) => employee.peopleResponsibility !== "none").slice(0, 4);
  return <div className="mt-4 overflow-x-auto"><div className="min-w-[680px] text-center"><Node employee={ceo} /><div className="mx-auto h-8 w-px bg-border" /><div className="grid grid-cols-4 gap-3">{managers.map((manager) => <div key={manager.id}><div className="mx-auto h-8 w-px bg-border" /><Node employee={manager} small /></div>)}</div></div></div>;
}

function Node({ employee, small }: { employee: Employee; small?: boolean }) {
  return <div className="mx-auto inline-flex items-center gap-2 rounded-lg border border-border bg-paper px-3 py-2"><Avatar employee={employee} size="sm" /><div className="text-left"><p className={clsx("font-bold text-ink", small ? "text-xs" : "text-sm")}>{employee.name}</p><p className="text-[10px] text-muted">{employee.role} · {employee.peopleResponsibility}</p></div></div>;
}

function RoleEditSheet({ employee, onClose, showToast }: { employee: Employee; onClose: () => void; showToast: (message: string) => void }) {
  const [cadre, setCadre] = useState<Cadre>(employee.cadre);
  const [resp, setResp] = useState<PeopleResponsibility>(employee.peopleResponsibility);
  const access = resp === "none" ? "standard dashboard features" : "team management, reports, leave calendar, escalations";
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Edit role access for {employee.name}</h2><select value={cadre} onChange={(e) => setCadre(e.target.value as Cadre)} className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-base">{(["entry","mid","senior","executive"] as Cadre[]).map((item) => <option key={item}>{item}</option>)}</select><select value={resp} onChange={(e) => setResp(e.target.value as PeopleResponsibility)} className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-base">{(["none","team_lead","manager","senior_manager","director"] as PeopleResponsibility[]).map((item) => <option key={item}>{item}</option>)}</select><p className="mt-3 rounded-lg bg-pulse-soft px-3 py-2 text-sm font-bold text-pulse">This will give {employee.name} access to {access}.</p><button onClick={() => { showToast("Role configuration saved"); onClose(); }} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Save</button></BottomSheet>;
}
