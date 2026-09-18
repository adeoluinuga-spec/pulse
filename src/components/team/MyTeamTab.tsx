"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import { Avatar, Notice, SectionTitle } from "./teamUi";
import { api, formatDate, label, type Member, type Person, type TeamResponse } from "./teamClient";

/**
 * The people the org chart says you look after, and what Pulse actually knows
 * about their work. Where Pulse knows nothing yet — no goals set, no report
 * sent — it says so rather than filling the gap.
 */

function attentionFor(member: Member): string[] {
  const reasons: string[] = [];
  if (member.goals.atRisk) reasons.push(`${member.goals.atRisk} goal${member.goals.atRisk === 1 ? "" : "s"} behind or at risk`);
  if (member.tasks.overdue) reasons.push(`${member.tasks.overdue} overdue task${member.tasks.overdue === 1 ? "" : "s"}`);
  if (member.reports.awaitingReview) reasons.push(`${member.reports.awaitingReview} report${member.reports.awaitingReview === 1 ? "" : "s"} waiting for review`);
  if (!member.goals.count) reasons.push("No goals set yet");
  if (!member.reports.count) reasons.push("No work reports submitted yet");
  return reasons;
}

export default function MyTeamTab({
  data,
  error,
  onMessage,
  onGiveTask,
}: {
  data: TeamResponse | null;
  error: string;
  onMessage: (channel: string) => void;
  onGiveTask: (person: Person) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ loading: boolean; text: string }>({ loading: false, text: "" });

  if (error) return <section className="px-4"><Notice tone="error">{error}</Notice></section>;
  if (!data) return <section className="px-4"><Notice>Loading your team…</Notice></section>;

  if (!data.members.length) {
    return (
      <section className="px-4">
        <Notice>
          Nobody reports to you on your organisation&apos;s published org chart, so there is no team to show. If that is wrong, ask HR to
          update the org chart — this page follows it automatically.
        </Notice>
      </section>
    );
  }

  const { members } = data;
  const needsAttention = members.map((member) => ({ member, reasons: attentionFor(member) })).filter((item) => item.reasons.length);
  const totals = {
    atRisk: members.reduce((sum, member) => sum + member.goals.atRisk, 0),
    awaitingReview: members.reduce((sum, member) => sum + member.reports.awaitingReview, 0),
    overdue: members.reduce((sum, member) => sum + member.tasks.overdue, 0),
  };

  // A director's view is grouped by the manager each person reports to.
  const groups = data.wholeLine
    ? [...new Map(members.map((member) => [member.lineManagerId ?? "", member.lineManagerName ?? "No manager"])).entries()].map(([id, name]) => ({
        id,
        name: id === data.viewer.id ? "Reporting to you" : `Reporting to ${name}`,
        people: members.filter((member) => (member.lineManagerId ?? "") === id),
      }))
    : [{ id: "direct", name: "Your direct reports", people: members }];

  const askForSummary = async () => {
    setSummary({ loading: true, text: "" });
    try {
      const body = await api<{ summary: string }>("/api/ai/team-summary", {
        method: "POST",
        body: JSON.stringify({
          managerName: data.viewer.name,
          teamMembers: members.map((member) => ({
            name: member.name,
            role: member.role,
            goals: member.goals,
            lastReport: member.reports.last,
            reportsAwaitingReview: member.reports.awaitingReview,
            openTasks: member.tasks.open,
            overdueTasks: member.tasks.overdue,
          })),
        }),
      });
      setSummary({ loading: false, text: body.summary });
    } catch (thrown) {
      setSummary({ loading: false, text: (thrown as Error).message });
    }
  };

  return (
    <section className="space-y-4 px-4">
      <div className="rounded-lg bg-ink p-5 text-white">
        <p className="text-sm text-white/65">{data.wholeLine ? "Your reporting line" : "Your team"}</p>
        <p className="mt-2 text-4xl font-semibold" style={{ fontFamily: "var(--font-syne)" }}>
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
        <p className="mt-2 text-xs text-white/65">
          {data.directCount} direct report{data.directCount === 1 ? "" : "s"}
          {data.wholeLine && members.length > data.directCount ? ` · ${members.length - data.directCount} further down your line` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Goals at risk" value={totals.atRisk} accent={totals.atRisk > 0} />
        <Stat label="Reports to review" value={totals.awaitingReview} />
        <Stat label="Overdue tasks" value={totals.overdue} />
      </div>

      {needsAttention.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Needs attention</SectionTitle>
          {needsAttention.slice(0, 6).map(({ member, reasons }) => (
            <div key={member.id} className="flex gap-3 rounded-lg border border-amber/20 bg-amber-soft p-3">
              <Avatar person={member} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{member.name}</p>
                <p className="text-xs text-muted">{reasons.join(" · ")}</p>
              </div>
            </div>
          ))}
          {totals.awaitingReview > 0 && (
            <Link href="/dashboard/manager" className="inline-block text-xs font-semibold text-pulse">
              Review waiting reports →
            </Link>
          )}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <SectionTitle>{group.name}</SectionTitle>
          {group.people.map((member) => {
            const expanded = open === member.id;
            return (
              <div key={member.id} className="rounded-lg border border-border bg-card">
                <button onClick={() => setOpen(expanded ? null : member.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <Avatar person={member} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{member.name}</p>
                    <p className="truncate text-xs text-muted">{[member.role, member.department].filter(Boolean).join(" · ") || "No role set"}</p>
                  </div>
                  <span className="text-right text-xs text-muted">
                    {member.goals.averageProgress === null ? "No goals" : <><span className="text-sm font-semibold text-ink">{member.goals.averageProgress}%</span><br />goal progress</>}
                  </span>
                  <ChevronDown size={15} className={clsx("text-muted transition-transform", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="border-t border-border p-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Stat small label="Goals" value={member.goals.count ? `${member.goals.completed}/${member.goals.count} done` : "None"} />
                      <Stat small label="Last report" value={member.reports.last ? formatDate(member.reports.last.submittedAt) : "None yet"} />
                      <Stat small label="Open tasks" value={member.tasks.open} />
                    </div>
                    {member.reports.last && (
                      <p className="mt-2 text-xs text-muted">
                        Last report: {label(member.reports.last.type)}, {label(member.reports.last.status)}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                      <button onClick={() => onMessage(dmChannel(data.viewer.id, member.id))} className="rounded-lg border border-border px-2 py-2 text-xs font-semibold text-muted">
                        Message
                      </button>
                      <button onClick={() => onGiveTask(member)} className="rounded-lg border border-border px-2 py-2 text-xs font-semibold text-muted">
                        Give a task
                      </button>
                      <Link href="/goals" className="rounded-lg border border-border px-2 py-2 text-center text-xs font-semibold text-muted">
                        Goals
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div>
        <button onClick={askForSummary} disabled={summary.loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {summary.loading ? "Summarising…" : "✦ Summarise my team with AI"}
        </button>
        {summary.text && <div className="mt-3 rounded-lg bg-ink p-5 text-sm leading-relaxed text-white/80">{summary.text}</div>}
        <p className="mt-2 text-[11px] text-muted">The summary uses only the goals, reports and tasks shown on this page.</p>
      </div>
    </section>
  );
}

function dmChannel(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

function Stat({ label: title, value, accent, small }: { label: string; value: string | number; accent?: boolean; small?: boolean }) {
  return (
    <div className={clsx("rounded-lg border p-3", accent ? "border-transparent bg-pulse text-white" : "border-border bg-card text-ink")}>
      <p className={clsx("font-semibold leading-none", small ? "text-sm" : "text-2xl")} style={{ fontFamily: "var(--font-syne)" }}>
        {value}
      </p>
      <p className={clsx("mt-1 text-[10px] font-semibold uppercase tracking-widest", accent ? "text-white/70" : "text-muted")}>{title}</p>
    </div>
  );
}
