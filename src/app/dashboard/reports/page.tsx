"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Download,
  Upload,
  X,
} from "lucide-react";
import { employees } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Employee, Goal, Mood, Report } from "@/types";

type TabKey = "mine" | "submit" | "team";
type DetailTab = "digest" | "full";
type ReportKind = "weekly" | "monthly" | "quarterly" | "ad-hoc";
type ReportStatus = "Submitted" | "Reviewed" | "Acknowledged" | "Overdue";
type TeamStatus = "Submitted Today" | "Submitted Earlier" | "Overdue" | "Not Yet Due";

interface ReportView {
  id: string;
  owner: Employee;
  type: ReportKind;
  date: string;
  status: ReportStatus;
  qualitative: string;
  accomplishments: string;
  blockers: string;
  support: string;
  goalTracking: string;
  mood: Mood | null;
  metrics: Report["metrics"];
  files: string[];
  managerComment?: string;
  goalUpdates?: { goal: Goal; oldValue: number; newValue: number }[];
}

interface GoalDraft {
  goal: Goal;
  value: number;
}

interface ParsedKpi {
  name: string;
  value: string;
  target: string;
  confidence: string;
}

const reportTabs: { key: TabKey; label: string }[] = [
  { key: "mine", label: "My Reports" },
  { key: "submit", label: "Submit Report" },
];

const reportTypes: { key: ReportKind; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "ad-hoc", label: "Ad-hoc" },
];

const moods: { key: Mood; label: string }[] = [
  { key: "energised", label: "🔥 Energised" },
  { key: "good", label: "😊 Good" },
  { key: "okay", label: "😐 Okay" },
  { key: "drained", label: "😓 Drained" },
];

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace("-", " ");
}

function reportTypeLabel(type: ReportKind) {
  return type === "ad-hoc" ? "Ad-hoc" : sentenceCase(type);
}

function reportStatusClass(status: ReportStatus | TeamStatus) {
  if (status === "Reviewed" || status === "Acknowledged" || status === "Submitted Today") {
    return "bg-green-soft text-green border-green/20";
  }
  if (status === "Submitted" || status === "Submitted Earlier") {
    return "bg-border text-muted border-border";
  }
  if (status === "Overdue") return "bg-red-soft text-red border-red/20";
  return "bg-paper text-muted border-border";
}

function moodLabel(mood: Mood | null) {
  return moods.find((item) => item.key === mood)?.label ?? "Not specified";
}

function metricValue(value: string | number) {
  return typeof value === "number" ? value.toLocaleString("en-NG") : value;
}

function daysSince(date: string, todayTime: number) {
  return Math.max(0, Math.floor((todayTime - new Date(date).getTime()) / 86_400_000));
}

function makeReportView(report: Report, owner: Employee, index: number): ReportView {
  const accomplishments = report.qualitative.split(".")[0] || report.qualitative;
  const blockers = report.qualitative.toLowerCase().includes("block")
    ? "One blocker mentioned around delivery support."
    : index % 2 === 0
      ? "No major blocker identified."
      : "Stakeholder response time may slow execution.";
  return {
    id: report.id,
    owner,
    type: report.type,
    date: report.date,
    status: index === 0 ? "Submitted" : index === 1 ? "Reviewed" : "Acknowledged",
    qualitative: report.qualitative,
    accomplishments,
    blockers,
    support: "Manager check-in requested if priorities shift.",
    goalTracking: "Tracking steadily against active goals.",
    mood: report.mood,
    metrics: report.metrics,
    files: index === 0 ? ["weekly-scorecard.pdf"] : [],
    managerComment: index > 0 ? "Good update. Keep the next report focused on blockers and measurable progress." : undefined,
  };
}

function Digest({ report, managerView = false, onToast }: { report: ReportView; managerView?: boolean; onToast?: (message: string) => void }) {
  const goalsReferenced = report.owner.goals.slice(0, 3);
  const tone = report.mood === "drained" ? "Stressed" : report.mood === "okay" ? "Neutral" : "Positive";
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-ink p-5 text-white">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-pulse">✦</span>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-pulse">AI Digest</p>
        </div>
        <Section title="Key Accomplishments">
          <li>{report.accomplishments}</li>
          <li>{report.goalTracking}</li>
        </Section>
        <div className="mt-4 rounded-lg border border-amber/20 bg-amber/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber">Blockers Identified</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="text-sm text-white/70">{report.blockers}</p>
            <button className="text-xs font-semibold text-amber">Escalate?</button>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/65">Goals Referenced</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {goalsReferenced.map((goal) => (
              <span key={goal.id} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/65">
                {goal.name}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green/15 px-2.5 py-1 text-xs font-semibold text-green">Tone: {tone}</span>
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/60">
            Supports: {report.owner.goals.find((goal) => goal.type === "org")?.name ?? "Current company OKR"}
          </span>
        </div>
      </div>
      {managerView && (
        <div className="rounded-lg border border-border bg-card p-4">
          <button onClick={() => onToast?.("Report flagged for follow-up")} className="w-full rounded-lg border border-pulse px-4 py-2.5 text-sm font-semibold text-pulse">
            Flag for follow-up
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/65">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/70">{children}</ul>
    </div>
  );
}

function FullReport({ report }: { report: ReportView }) {
  return (
    <div className="space-y-4">
      <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-paper p-4">
        <p className="text-sm leading-relaxed text-ink">{report.qualitative}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-2 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
          <span>KPI</span>
          <span>Value</span>
        </div>
        {report.metrics.map((metric) => (
          <div key={metric.metric} className="grid grid-cols-2 border-b border-border px-4 py-3 text-sm last:border-b-0">
            <span className="font-semibold text-ink">{metric.metric}</span>
            <span className="text-muted">{metricValue(metric.value)} {metric.unit ?? ""}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Files Attached</p>
        {report.files.length ? report.files.map((file) => (
          <div key={file} className="mt-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2">
            <span className="text-sm font-semibold text-ink">{file}</span>
            <Download size={15} className="text-muted" />
          </div>
        )) : <p className="mt-2 text-sm text-muted">No files attached.</p>}
      </div>
    </div>
  );
}

function ReportDetailSheet({
  report,
  managerView = false,
  onClose,
  onToast,
}: {
  report: ReportView;
  managerView?: boolean;
  onClose: () => void;
  onToast?: (message: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("digest");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/45" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-h-[88vh] max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-ink">{reportTypeLabel(report.type)} Report</p>
            <p className="text-sm text-muted">{report.owner.name} · {formatDate(report.date)}</p>
          </div>
          <button onClick={onClose} className="text-muted"><X size={18} /></button>
        </div>
        <div className="mb-4 flex rounded-lg border border-border bg-paper p-1">
          {(["digest", "full"] as DetailTab[]).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={clsx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", tab === item ? "bg-ink text-white" : "text-muted")}>
              {item === "digest" ? "AI Digest" : "Full Report"}
            </button>
          ))}
        </div>
        {tab === "digest" ? <Digest report={report} managerView={managerView} onToast={onToast} /> : <FullReport report={report} />}
        {managerView && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={`Add a note for ${report.owner.name}`}
              className="min-h-20 w-full resize-none rounded-lg border border-border bg-paper px-3 py-2 text-base outline-none focus:border-pulse"
            />
            <button
              onClick={() => { setAcknowledged(true); onToast?.("Report acknowledged"); }}
              className={clsx("mt-3 w-full rounded-lg px-4 py-3 text-sm font-semibold text-white", acknowledged ? "bg-green" : "bg-pulse")}
            >
              {acknowledged ? "Acknowledged" : "Acknowledge"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ReportCard({ report, onView }: { report: ReportView; onView: (report: ReportView) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-pulse-soft px-2.5 py-1 text-[10px] font-semibold text-pulse">{reportTypeLabel(report.type)}</span>
            <span className={clsx("rounded-full border px-2.5 py-1 text-[10px] font-semibold", reportStatusClass(report.status))}>{report.status}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">{formatDate(report.date)}</p>
        </div>
        <button onClick={() => onView(report)} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">View</button>
      </div>
      {report.managerComment && (
        <button onClick={() => setExpanded((value) => !value)} className="mt-3 w-full text-left">
          <p className={clsx("text-xs text-muted", !expanded && "line-clamp-1")}>
            <span className="font-semibold text-ink">Manager:</span> {report.managerComment}
          </p>
        </button>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((item) => (
        <div key={item} className={clsx("rounded-full px-4 py-1.5 text-xs font-semibold", step === item ? "bg-pulse text-white" : step > item ? "bg-green-soft text-green" : "bg-border text-muted")}>
          {step > item ? "✓" : item}
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-green" : value >= 50 ? "bg-amber" : "bg-pulse";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-border">
      <div className={clsx("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function TeamRow({
  employee,
  report,
  status,
  onReview,
  onReminder,
}: {
  employee: Employee;
  report: ReportView;
  status: TeamStatus;
  onReview: () => void;
  onReminder: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: employee.avatarColor }}>
        {employee.initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{employee.name}</p>
        <p className="text-xs text-muted">{reportTypeLabel(report.type)} · {formatDate(report.date)}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={clsx("rounded-full border px-2 py-1 text-[10px] font-semibold", reportStatusClass(status))}>{status}</span>
        {status === "Overdue" && <button onClick={onReminder} className="text-[11px] font-semibold text-pulse">Send reminder</button>}
      </div>
      <button onClick={onReview} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">Review</button>
    </div>
  );
}

export default function DashboardReportsPage() {
  const { user } = useUser();
  const [todayTime] = useState(() => Date.now());
  const canSeeTeam = user.peopleResponsibility !== "none";
  const tabs = canSeeTeam ? [...reportTabs, { key: "team" as const, label: "Team Reports" }] : reportTabs;
  const [active, setActive] = useState<TabKey>("mine");
  const [detail, setDetail] = useState<{ report: ReportView; managerView?: boolean } | null>(null);
  const [toast, setToast] = useState("");
  const [step, setStep] = useState(1);
  const [reportType, setReportType] = useState<ReportKind>("weekly");
  const [accomplishments, setAccomplishments] = useState("");
  const [blockers, setBlockers] = useState("");
  const [support, setSupport] = useState("");
  const [tracking, setTracking] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [goals, setGoals] = useState<GoalDraft[]>(() => user.goals.filter((goal) => goal.status !== "completed").map((goal) => ({ goal, value: goal.percentComplete })));
  const [files, setFiles] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedKpi[] | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "processing" | "done">("idle");
  const [newReports, setNewReports] = useState<ReportView[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reports = useMemo(
    () => [...newReports, ...user.reports.map((report, index) => makeReportView(report, user, index))]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [newReports, user],
  );
  const lastReport = reports[0];
  const lastDays = lastReport ? daysSince(lastReport.date, todayTime) : 999;
  const due = lastDays >= 7;

  const teamReports = useMemo(() => {
    const directReports = employees.filter((employee) => employee.lineManagerId === user.id);
    const fallback = directReports.length ? directReports : employees.filter((employee) => employee.department === user.department && employee.id !== user.id).slice(0, 5);
    return fallback.map((employee, index) => {
      const report = makeReportView(employee.reports[0], employee, 0);
      const age = daysSince(report.date, todayTime);
      const status: TeamStatus = index === 0 ? "Submitted Today" : age > 8 ? "Overdue" : index % 3 === 0 ? "Not Yet Due" : "Submitted Earlier";
      return { employee, report, status };
    });
  }, [todayTime, user.department, user.id]);

  const deptCompliance = teamReports.length
    ? Math.round((teamReports.filter((item) => item.status !== "Overdue").length / teamReports.length) * 100)
    : 0;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File is too large. Maximum upload size is 10MB.");
      return;
    }
    setFiles((prev) => [...prev, file.name]);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".xlsx")) {
      setParsed(user.kpis.slice(0, 3).map((kpi, index) => ({
        name: kpi.name,
        value: String(Math.round(kpi.current + index + 2)),
        target: String(kpi.target),
        confidence: `${92 - index * 6}%`,
      })));
    }
  }

  function confirmParsed() {
    setGoals((prev) => prev.map((item, index) => ({ ...item, value: Math.min(100, item.value + 5 + index) })));
    showToast("KPI values applied to goal updates");
  }

  function submitReport() {
    setSubmitState("processing");
    setTimeout(() => {
      setSubmitState("done");
      const report: ReportView = {
        id: `local-${Date.now()}`,
        owner: user,
        type: reportType,
        date: new Date(todayTime).toISOString(),
        status: "Submitted",
        qualitative: [accomplishments, blockers, support, tracking].filter(Boolean).join("\n\n"),
        accomplishments,
        blockers: blockers || "No blockers mentioned.",
        support,
        goalTracking: tracking,
        mood,
        metrics: user.kpis.map((kpi) => ({ metric: kpi.name, value: kpi.current, unit: kpi.unit })),
        files,
        goalUpdates: goals.map((item) => ({ goal: item.goal, oldValue: item.goal.percentComplete, newValue: item.value })),
      };
      setNewReports((prev) => [report, ...prev]);
      showToast("Report submitted. Your manager has been notified.");
      setTimeout(() => {
        setActive("mine");
        setStep(1);
        setSubmitState("idle");
      }, 1200);
    }, 1800);
  }

  return (
    <div className="dashboard-page space-y-5">
      {toast && <div className="fixed left-1/2 top-[118px] z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-xl md:top-20">{toast}</div>}

      <section className="px-4">
        <div className="flex rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActive(tab.key)} className={clsx("flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors md:text-sm", active === tab.key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {active === "mine" && (
        <>
          {due && (
            <section className="px-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber/20 bg-amber-soft p-4">
                <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Your weekly check-in is overdue.</p>
                  <p className="mt-1 text-xs text-muted">Last submitted {lastDays} days ago.</p>
                </div>
                <button onClick={() => setActive("submit")} className="flex-shrink-0 text-xs font-semibold text-pulse">Submit Now →</button>
              </div>
            </section>
          )}
          <section className="space-y-3 px-4">
            {reports.map((report) => <ReportCard key={report.id} report={report} onView={(next) => setDetail({ report: next })} />)}
          </section>
        </>
      )}

      {active === "submit" && (
        <section className="space-y-5 px-4">
          <StepIndicator step={step} />
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-ink px-4 py-2">
            <span className="text-pulse">✦</span>
            <span className="text-xs font-semibold text-white">AI will extract key insights from your text</span>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {reportTypes.map((type) => (
                  <button key={type.key} onClick={() => setReportType(type.key)} className={clsx("rounded-lg border px-2 py-2 text-xs font-semibold", reportType === type.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}>
                    {type.label}
                  </button>
                ))}
              </div>
              <Textarea label="What did you accomplish this period?" value={accomplishments} onChange={setAccomplishments} minHeight={100} />
              <Textarea label="What blockers or challenges did you face?" value={blockers} onChange={setBlockers} minHeight={80} />
              <Textarea label="What support do you need from your manager?" value={support} onChange={setSupport} minHeight={60} />
              <Textarea label="How are you tracking against your goals overall?" value={tracking} onChange={setTracking} minHeight={60} />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {moods.map((item) => (
                  <button key={item.key} onClick={() => setMood(item.key)} className={clsx("flex-shrink-0 rounded-full border px-3 py-2 text-sm font-semibold", mood === item.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button disabled={!accomplishments.trim()} onClick={() => setStep(2)} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Next →</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>Update your goal progress</h2>
                <p className="text-sm text-muted">These numbers feed directly into your live appraisal score.</p>
              </div>
              {goals.map((item, index) => (
                <div key={item.goal.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{item.goal.name}</p>
                      <p className="mt-1 text-xs text-muted">Previous: {item.goal.percentComplete}%</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={item.value}
                      onChange={(event) => {
                        const value = Math.max(0, Math.min(100, Number(event.target.value)));
                        setGoals((prev) => prev.map((goal, i) => i === index ? { ...goal, value } : goal));
                      }}
                      className="w-20 rounded-lg border border-border bg-paper px-2 py-2 text-right text-base font-semibold outline-none focus:border-pulse"
                    />
                  </div>
                  <div className="mt-3"><ProgressBar value={item.value} /></div>
                  {item.value !== item.goal.percentComplete && (
                    <p className={clsx("mt-2 text-xs font-semibold", item.value > item.goal.percentComplete ? "text-green" : "text-red")}>
                      {item.value > item.goal.percentComplete ? "↑" : "↓"} {Math.abs(item.value - item.goal.percentComplete)} pts
                    </p>
                  )}
                </div>
              ))}

              <div
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => { event.preventDefault(); setDragOver(false); handleFile(event.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                className={clsx("cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors", dragOver ? "border-pulse bg-pulse-soft" : "border-border bg-card")}
              >
                <Upload size={22} className="mx-auto text-pulse" />
                <p className="mt-2 text-sm font-semibold text-ink">Drop your report file here or tap to upload</p>
                <p className="mt-1 text-xs text-muted">CSV, XLSX, PDF, DOCX · max 10MB</p>
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.pdf,.docx" onChange={(event) => handleFile(event.target.files?.[0])} />
              {uploadError && <p className="rounded-lg bg-red-soft px-3 py-2 text-xs font-semibold text-red">{uploadError}</p>}
              {files.length > 0 && <p className="text-xs font-semibold text-green">{files.length} file attached</p>}
              {parsed && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-ink">We found data for {parsed.length} of your KPIs:</p>
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    {parsed.map((row) => (
                      <div key={row.name} className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0">
                        <span className="font-semibold text-ink">{row.name}</span>
                        <span>{row.value}</span>
                        <span>{row.target}</span>
                        <span>{row.confidence}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={confirmParsed} className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">Confirm & use these values</button>
                </div>
              )}
              <a href={`data:text/plain,Mock Excel template for ${user.name}`} download={`${user.initials}-prefilled-report-template.xlsx`} className="block text-sm font-semibold text-pulse">
                Download your pre-filled template →
              </a>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-muted">← Back</button>
                <button disabled={goals.some((goal) => Number.isNaN(goal.value))} onClick={() => setStep(3)} className="flex-1 rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>Review before submitting</h2>
              <div className="rounded-lg bg-ink p-5 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-pulse">{reportTypeLabel(reportType)} · Current period</p>
                <p className="mt-3 line-clamp-2 text-sm text-white/70">{accomplishments}</p>
                <p className="mt-3 text-sm text-white/60">{blockers ? blockers.split(".").filter(Boolean).length : 0} blockers mentioned</p>
                <div className="mt-3 space-y-1">
                  {goals.map((item) => (
                    <p key={item.goal.id} className="text-xs text-white/65">{item.goal.name}: {item.goal.percentComplete}% → {item.value}% {item.value >= item.goal.percentComplete ? "↑" : "↓"}</p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-pulse/20 px-2.5 py-1 text-xs text-pulse">{moodLabel(mood)}</span>
                  {files.map((file) => <span key={file} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/65">{file}</span>)}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} disabled={submitState !== "idle"} className="flex-1 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-muted disabled:opacity-40">← Back</button>
                <button onClick={submitReport} disabled={submitState !== "idle"} className={clsx("flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed", submitState === "idle" && "bg-pulse", submitState === "processing" && "bg-ink", submitState === "done" && "bg-green")}>
                  {submitState === "idle" && "Submit Report"}
                  {submitState === "processing" && "✦ AI Processing..."}
                  {submitState === "done" && "✅ Submitted!"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {active === "team" && canSeeTeam && (
        <section className="space-y-4 px-4">
          {(user.peopleResponsibility === "senior_manager" || user.peopleResponsibility === "director") && (
            <div className="rounded-lg bg-ink p-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/65">Department Summary</p>
              <p className="mt-2 text-4xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>{deptCompliance}%</p>
              <p className="mt-1 text-sm text-white/65">Report compliance across visible teams</p>
            </div>
          )}
          {teamReports.map((item) => (
            <TeamRow
              key={item.employee.id}
              employee={item.employee}
              report={item.report}
              status={item.status}
              onReview={() => setDetail({ report: item.report, managerView: true })}
              onReminder={() => showToast("Reminder sent")}
            />
          ))}
        </section>
      )}

      {detail && <ReportDetailSheet report={detail.report} managerView={detail.managerView} onClose={() => setDetail(null)} onToast={showToast} />}
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  minHeight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-lg border border-border bg-card px-3.5 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-pulse focus:ring-2 focus:ring-pulse/10"
        style={{ minHeight }}
      />
    </label>
  );
}
