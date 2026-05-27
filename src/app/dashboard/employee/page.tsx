import clsx from "clsx";
import Link from "next/link";
import { CheckCircle, ChevronRight, Clock, ArrowUpRight } from "lucide-react";
import { employees } from "@/data/mockData";
import { SectionLabel } from "@/components/ui";
import CollaborationCard from "./CollaborationCard";

const me = employees[0]; // Amara Osei
const firstName = me.name.split(" ")[0];

const hour = new Date().getHours();
const greeting =
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

const onTrackGoals = me.goals.filter(
  (g) => g.status === "on_track" || g.status === "completed"
);

const lastReportDate = new Date(me.reports[0].date);
const daysSinceReport = Math.floor(
  (Date.now() - lastReportDate.getTime()) / 86_400_000
);
const reportDue = daysSinceReport >= 5;

// Show collaboration card if any non-completed goal is below 50%
const lowProgressGoal = me.goals.find(
  (g) => g.percentComplete < 50 && g.status !== "completed"
);

// Sort: behind → at_risk → on_track → completed
const sortedGoals = [...me.goals].sort((a, b) => {
  const rank = { behind: 0, at_risk: 1, on_track: 2, completed: 3 } as const;
  return rank[a.status] - rank[b.status];
});

const suggestedPeer = employees[5]; // Derek Okafor — CS Lead

const typeLabel: Record<string, string> = {
  org: "Org",
  dept: "Dept",
  team: "Team",
  individual: "Individual",
};

const typePill: Record<string, string> = {
  org: "bg-ink text-white border border-white/10",
  dept: "bg-pulse-soft text-pulse",
  team: "bg-green-soft text-green",
  individual: "bg-border text-muted",
};

function barColorClass(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

function barTextClass(pct: number) {
  if (pct >= 75) return "text-green";
  if (pct >= 50) return "text-amber";
  return "text-pulse";
}

const timelineSteps: Array<{
  label: string;
  sublabel: string;
  status: "done" | "current" | "upcoming";
}> = [
  { label: "Cycle Opened", sublabel: "Jan 2026", status: "done" },
  { label: "Peer Feedback", sublabel: "Mar 2026", status: "done" },
  { label: "Self-Assessment", sublabel: "Due May 31", status: "current" },
  { label: "Manager Review", sublabel: "Jun 2026", status: "upcoming" },
  { label: "Final Results", sublabel: "Jun 30, 2026", status: "upcoming" },
];

export default function EmployeeDashboard() {
  return (
    <div className="dashboard-page space-y-5">

      {/* ── 1. HERO CARD ─────────────────────────────────────────── */}
      <section
        className="animate-fade-up px-4"
        style={{ animationDelay: "0ms" }}
      >
        <div className="bg-ink rounded-[20px] p-5">
          <p className="text-white/40 text-sm">{greeting},</p>
          <h1
            className="text-white text-xl font-bold mt-0.5"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {firstName}
          </h1>

          {/* Score */}
          <div className="mt-5 flex items-end gap-1">
            <span
              className="text-white font-bold leading-none"
              style={{ fontSize: "52px", fontFamily: "var(--font-syne)" }}
            >
              {me.performanceScore}
            </span>
            <span
              className="text-pulse font-bold pb-1.5 text-2xl"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              %
            </span>
            <span className="text-green text-sm font-semibold pb-2 ml-2">
              ↑ +4 pts this month
            </span>
          </div>

          {/* Animated score bar */}
          <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${me.performanceScore}%`,
                background: "linear-gradient(90deg, #e8440a, #ff9046)",
                transformOrigin: "left center",
                animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
                animationDelay: "0.35s",
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-white/25">0</span>
            <span className="text-[10px] text-white/25">100</span>
          </div>

          {/* Tags */}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="px-2.5 py-1 bg-pulse/20 text-pulse text-[11px] font-semibold rounded-full">
              {me.badge}
            </span>
            <span className="px-2.5 py-1 bg-white/8 text-white/50 text-[11px] rounded-full">
              Q2 2026 Cycle
            </span>
            <span className="px-2.5 py-1 bg-white/8 text-white/50 text-[11px] rounded-full">
              Appraisal: Jun 30
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. STAT GRID ─────────────────────────────────────────── */}
      <section
        className="animate-fade-up grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3"
        style={{ animationDelay: "80ms" }}
      >
        {/* Goals on track */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Goals On Track
          </p>
          <p
            className="text-[2rem] font-bold text-ink leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {onTrackGoals.length}
            <span className="text-base text-muted font-medium">
              /{me.goals.length}
            </span>
          </p>
          <p className="text-[11px] text-green mt-1.5">↑ 1 completed this cycle</p>
        </div>

        {/* Reports due */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Reports Due
          </p>
          <p
            className={clsx(
              "text-[2rem] font-bold leading-none",
              reportDue ? "text-pulse" : "text-ink"
            )}
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {reportDue ? "1" : "0"}
          </p>
          <p
            className={clsx(
              "text-[11px] mt-1.5",
              reportDue ? "text-pulse" : "text-muted"
            )}
          >
            {reportDue ? "Weekly overdue" : "All submitted"}
          </p>
        </div>

        {/* Week streak — pulse accent */}
        <div className="bg-pulse rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
            Week Streak
          </p>
          <p
            className="text-[2rem] font-bold text-white leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {me.weekStreak}
            <span className="text-base font-medium text-white/60">w</span>
          </p>
          <p className="text-[11px] text-white/60 mt-1.5">Personal best</p>
        </div>

        {/* Peer rating */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Peer Rating
          </p>
          <p
            className="text-[2rem] font-bold text-ink leading-none"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {me.peerRating}
            <span className="text-base text-muted font-medium">/5</span>
          </p>
          <p className="text-[11px] text-muted mt-1.5">Across 12 reviewers</p>
        </div>
      </section>

      {/* ── 3. COLLABORATION SUGGESTION ──────────────────────────── */}
      {lowProgressGoal && (
        <section
          className="animate-fade-up px-4"
          style={{ animationDelay: "160ms" }}
        >
          <CollaborationCard
            goalName={lowProgressGoal.name}
            goalPct={lowProgressGoal.percentComplete}
            peer={{
              name: suggestedPeer.name,
              initials: suggestedPeer.initials,
              avatarColor: suggestedPeer.avatarColor,
              role: suggestedPeer.role,
            }}
            reason={`Derek's 4.7/5 CSAT and customer engagement track record directly aligns with improving stakeholder satisfaction scores. A 30-min session could unlock new tactics for your NPS goal.`}
          />
        </section>
      )}

      {/* ── 4. MY GOALS ──────────────────────────────────────────── */}
      <section
        className="animate-fade-up px-4"
        style={{ animationDelay: "240ms" }}
      >
        <SectionLabel right={`${me.goals.length} total`}>My Goals</SectionLabel>

        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {sortedGoals.slice(0, 3).map((goal) => {
            const pct = goal.percentComplete;
            const formatted = new Date(goal.dueDate).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            });
            return (
              <div key={goal.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={clsx(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0",
                        typePill[goal.type]
                      )}
                    >
                      {typeLabel[goal.type]}
                    </span>
                    <span className="text-sm font-medium text-ink truncate">
                      {goal.name}
                    </span>
                  </div>
                  <span
                    className={clsx(
                      "text-sm font-bold flex-shrink-0",
                      barTextClass(pct)
                    )}
                  >
                    {pct}%
                  </span>
                </div>

                {/* Color-coded progress bar */}
                <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2.5">
                  <div
                    className={clsx("h-full rounded-full transition-all duration-700", barColorClass(pct))}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span>Due {formatted}</span>
                  <span>·</span>
                  <span>{goal.weight}% weight</span>
                </div>
              </div>
            );
          })}
        </div>

        <button className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-sm text-muted font-medium hover:border-pulse hover:text-pulse transition-colors">
          View all {me.goals.length} goals
          <ChevronRight size={14} />
        </button>
      </section>

      {/* ── 5. REPORTS ───────────────────────────────────────────── */}
      <section
        className="animate-fade-up px-4"
        style={{ animationDelay: "320ms" }}
      >
        <SectionLabel>Reports</SectionLabel>

        {reportDue && (
          <div className="mb-3 bg-card rounded-2xl border border-border overflow-hidden flex">
            <div className="w-1 bg-pulse flex-shrink-0" />
            <div className="p-4 flex items-start gap-3">
              <Clock size={14} className="text-pulse flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Weekly report due
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Last submitted{" "}
                  {new Date(me.reports[0].date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {daysSinceReport} days ago
                </p>
              </div>
            </div>
          </div>
        )}

        <Link
          href="/reports/submit"
          className="flex items-center justify-center gap-2 w-full bg-pulse text-white font-semibold text-sm py-3 rounded-xl hover:bg-pulse/90 transition-colors"
        >
          Submit Weekly Report
          <ArrowUpRight size={15} />
        </Link>
      </section>

      {/* ── 6. APPRAISAL TIMELINE ────────────────────────────────── */}
      <section
        className="animate-fade-up px-4 pb-2"
        style={{ animationDelay: "400ms" }}
      >
        <SectionLabel>Appraisal Timeline</SectionLabel>

        <div className="bg-card rounded-2xl border border-border p-5">
          {timelineSteps.map((step, i) => {
            const isLast = i === timelineSteps.length - 1;
            const isDone = step.status === "done";
            const isCurrent = step.status === "current";

            return (
              <div key={step.label} className="flex gap-4">
                {/* Dot + connector line */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={clsx(
                      "w-5 h-5 rounded-full flex items-center justify-center",
                      isDone
                        ? "bg-green"
                        : isCurrent
                        ? "bg-pulse"
                        : "border-2 border-border bg-paper"
                    )}
                  >
                    {isDone && (
                      <CheckCircle size={11} className="text-white" strokeWidth={2.5} />
                    )}
                    {isCurrent && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={clsx(
                        "w-px my-1 rounded-full",
                        isDone ? "bg-green/25 h-9" : "bg-border h-9"
                      )}
                    />
                  )}
                </div>

                {/* Step content */}
                <div className={clsx("pt-0.5", !isLast && "pb-2")}>
                  <p
                    className={clsx(
                      "text-sm font-semibold leading-5",
                      isDone
                        ? "text-green"
                        : isCurrent
                        ? "text-ink"
                        : "text-muted"
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={clsx(
                      "text-[11px] mt-0.5",
                      isCurrent ? "text-pulse font-medium" : "text-muted"
                    )}
                  >
                    {step.sublabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
