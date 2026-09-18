"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/Toast";
import { getSupabase } from "@/lib/supabase";

/**
 * Work reports: your own, and — if people report to you — theirs.
 *
 * This page used to hold its own report form that saved nothing and told the
 * user their manager had been notified, and a team list drawn from a demo
 * company. Writing a report now happens in one place, /reports/submit, which
 * saves it; this page lists what has actually been saved and lets a manager
 * review it. Reports feed the appraisal's report-consistency score.
 */

type ReportRow = {
  id: string;
  employee_id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  accomplishments: string | null;
  blockers: string | null;
  support_needed: string | null;
  goal_tracking: string | null;
  status: string | null;
  manager_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

const COLUMNS = "id, employee_id, report_type, period_start, period_end, accomplishments, blockers, support_needed, goal_tracking, status, manager_comment, submitted_at, reviewed_at";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const title = (value: string | null) => (value ? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Report");

export default function DashboardReportsPage() {
  const { user } = useUser();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [mine, setMine] = useState<ReportRow[] | null>(null);
  const [team, setTeam] = useState<Array<ReportRow & { name: string }> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [own, reports] = await Promise.all([
      supabase.from("reports").select(COLUMNS).eq("employee_id", user.id).order("submitted_at", { ascending: false }).limit(100),
      supabase.from("employees").select("id, name").eq("line_manager_id", user.id),
    ]);
    if (own.error || reports.error) {
      setError("Could not load reports. Please retry.");
      return;
    }
    setMine((own.data ?? []) as ReportRow[]);

    const people = (reports.data ?? []) as Array<{ id: string; name: string }>;
    if (!people.length) {
      setTeam([]);
      return;
    }
    const nameOf = new Map(people.map((person) => [person.id, person.name]));
    const theirs = await supabase
      .from("reports")
      .select(COLUMNS)
      .in("employee_id", people.map((person) => person.id))
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (theirs.error) {
      setError("Could not load your team's reports. Please retry.");
      return;
    }
    setTeam(((theirs.data ?? []) as ReportRow[]).map((row) => ({ ...row, name: nameOf.get(row.employee_id) ?? "Unknown" })));
    setError("");
  }, [user.id]);

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load, user.id]);

  const review = async (report: ReportRow, comment: string) => {
    const { error: updateError } = await getSupabase()
      .from("reports")
      .update({ status: "reviewed", reviewed_at: new Date().toISOString(), ...(comment.trim() ? { manager_comment: comment.trim() } : {}) })
      .eq("id", report.id);
    if (updateError) {
      showToast("Could not save the review. Please retry.", "error");
      return;
    }
    showToast("Report marked as reviewed.", "success");
    await load();
  };

  const awaiting = (team ?? []).filter((report) => report.status === "submitted").length;

  return (
    <div className="dashboard-page space-y-5 px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Reports" className="flex rounded-lg border border-border bg-card p-1">
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>My reports</TabButton>
          {team && team.length > 0 && <TabButton active={tab === "team"} onClick={() => setTab("team")}>Team reports{awaiting ? ` (${awaiting} to review)` : ""}</TabButton>}
        </div>
        <Link href="/reports/submit" className="ml-auto rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white">
          Write a report
        </Link>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-soft p-4 text-sm text-red">{error}</p>}

      {tab === "mine" &&
        (mine === null ? (
          <Muted>Loading your reports…</Muted>
        ) : mine.length ? (
          mine.map((report) => <ReportCard key={report.id} report={report} />)
        ) : (
          <Muted>You have not submitted a report yet. Reports you write count towards your appraisal.</Muted>
        ))}

      {tab === "team" &&
        (team ?? []).map((report) => <ReportCard key={report.id} report={report} owner={report.name} onReview={report.status === "submitted" ? (comment) => review(report, comment) : undefined} />)}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className={clsx("rounded-md px-3 py-2 text-xs font-semibold md:text-sm", active ? "bg-ink text-white" : "text-muted hover:text-ink")}>
      {children}
    </button>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-border bg-paper p-4 text-sm text-muted">{children}</p>;
}

function ReportCard({ report, owner, onReview }: { report: ReportRow; owner?: string; onReview?: (comment: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const period = report.period_start && report.period_end ? `${date(report.period_start)} – ${date(report.period_end)}` : `Submitted ${date(report.submitted_at)}`;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{owner ? `${owner} · ` : ""}{title(report.report_type)} report</p>
          <p className="text-xs text-muted">{period}</p>
        </div>
        <span className={clsx("rounded-full px-2 py-1 text-[10px] font-semibold", report.status === "submitted" ? "bg-pulse-soft text-pulse" : "bg-green-soft text-green")}>
          {report.status === "submitted" ? "Awaiting review" : title(report.status)}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4 text-sm">
          <Field label="What was done" value={report.accomplishments} />
          <Field label="Blockers" value={report.blockers} />
          <Field label="Support needed" value={report.support_needed} />
          <Field label="Goal progress" value={report.goal_tracking} />
          {report.manager_comment && <Field label="Manager's comment" value={report.manager_comment} />}
          {onReview && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted">
                Comment for {owner ?? "them"} (optional)
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-base text-ink" />
              </label>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onReview(comment);
                  setBusy(false);
                }}
                className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Mark as reviewed
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink">{value}</p>
    </div>
  );
}
