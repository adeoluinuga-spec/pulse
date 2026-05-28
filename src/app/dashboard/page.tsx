"use client";

import clsx from "clsx";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { employees, departments } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Employee } from "@/types";
import { momentumLanguage } from "@/lib/pulseLanguage";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ViewKey = "employee" | "manager" | "hr" | "executive";
const REFERENCE_NOW = new Date("2026-05-28").getTime();

function deriveView(user: Employee): ViewKey {
  if (user.platformRole === "hr_admin" || user.platformRole === "super_admin") return "hr";
  if (user.platformRole === "executive_view" || user.cadre === "executive") return "executive";
  if (user.peopleResponsibility !== "none") return "manager";
  return "employee";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDateLong(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function bonusEligible(emp: Employee): number | null {
  const tier = emp.compensation.bonusStructure
    .filter((b) => emp.performanceScore >= b.scoreThreshold)
    .sort((a, b) => b.scoreThreshold - a.scoreThreshold)[0];
  return tier ? tier.bonusAmount : null;
}

function barColor(pct: number) {
  if (pct >= 75) return "bg-green";
  if (pct >= 50) return "bg-amber";
  return "bg-pulse";
}

// ── AI Pulse Brief ────────────────────────────────────────────────────────────

function PulseBrief({ user }: { user: Employee }) {
  const bonus = bonusEligible(user);
  const atRiskGoals = user.goals.filter((g) => g.status === "at_risk" || g.status === "behind");
  const daysSince = user.reports.length
    ? Math.floor((REFERENCE_NOW - new Date(user.reports[0].date).getTime()) / 86_400_000)
    : 99;

  const lines: string[] = [];

  if (user.performanceScore >= 85) {
    lines.push(`Your Q2 score of ${user.performanceScore} places you in the top tier this cycle.`);
  } else if (user.performanceScore >= 70) {
    lines.push(`Your score of ${user.performanceScore} shows steady progress through Q2.`);
  } else {
    lines.push(`Your current score of ${user.performanceScore} has room to strengthen before Q2 closes.`);
  }

  if (bonus !== null) {
    lines.push(`You are currently eligible for a ₦${bonus.toLocaleString("en-NG")} quarterly bonus.`);
  }
  if (atRiskGoals.length > 0) {
    lines.push(`${atRiskGoals.length} goal${atRiskGoals.length > 1 ? "s are" : " is"} at risk — focused effort here will protect your Q2 close.`);
  }
  if (daysSince >= 5) {
    lines.push("Your weekly report is overdue. Submitting it strengthens your consistency score.");
  }

  return (
    <div className="insight-card mx-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-dot flex-shrink-0" />
        <span className="type-label text-white/40">Pulse Intelligence</span>
      </div>
      <div className="space-y-2.5">
        {lines.map((text, i) => (
          <p key={i} className={clsx(
            "leading-relaxed",
            i === 0
              ? "text-[15px] font-semibold text-white"
              : "text-sm text-white/60",
          )}>
            {text}
          </p>
        ))}
      </div>
      <Link href="/appraisal" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse/90 hover:text-pulse transition-colors">
        View your appraisal <ArrowRight size={11} />
      </Link>
    </div>
  );
}

// ── Performance Pulse ─────────────────────────────────────────────────────────

function PerformancePulse({ user }: { user: Employee }) {
  const score = user.performanceScore;
  const bandLabel =
    momentumLanguage(score);
  const bandColor =
    score >= 85 ? "text-green" :
    score >= 70 ? "text-ink" :
    score >= 50 ? "text-amber" : "text-red";

  return (
    <div className="px-5 animate-fade-up delay-75">
      <p className="type-label mb-3">Performance · Q2 2026</p>
      <div className="flex items-end gap-3">
        <span className="metric-hero">{score}</span>
        <div className="pb-1.5">
          <p className={clsx("text-sm font-bold", bandColor)}>{bandLabel}</p>
          <p className="text-xs text-muted mt-0.5">↑ 4 pts this month</p>
        </div>
      </div>
      <div className="mt-4 h-[3px] bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: "linear-gradient(90deg, #e8440a, #ff8c57)",
            transformOrigin: "left center",
            animation: "score-bar-fill 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
            animationDelay: "0.4s",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-muted/50">0</span>
        <span className="text-[10px] text-muted/50">100</span>
      </div>
    </div>
  );
}

// ── Attention Feed ────────────────────────────────────────────────────────────

interface AttentionItem {
  id: string;
  dot: string;
  title: string;
  subtitle?: string;
  href: string;
}

function AttentionFeed({ user }: { user: Employee }) {
  const daysSince = user.reports.length
    ? Math.floor((REFERENCE_NOW - new Date(user.reports[0].date).getTime()) / 86_400_000)
    : 99;
  const atRiskGoals = user.goals.filter((g) => g.status === "at_risk" || g.status === "behind");
  const bonus = bonusEligible(user);

  const items: AttentionItem[] = [];

  atRiskGoals.forEach((g) =>
    items.push({
      id: `g-${g.id}`,
      dot: "bg-amber",
      title: g.name,
      subtitle: `${g.percentComplete}% complete · ${g.status === "behind" ? "behind target" : "at risk"}`,
      href: "/goals",
    })
  );

  if (daysSince >= 5) {
    items.push({
      id: "report",
      dot: "bg-pulse",
      title: "Weekly report overdue",
      subtitle: `Last submitted ${daysSince} days ago`,
      href: "/reports/submit",
    });
  }

  items.push({
    id: "self-assess",
    dot: "bg-ink",
    title: "Self-assessment due May 31",
    subtitle: "Required for Q2 appraisal",
    href: "/appraisal",
  });

  if (bonus !== null) {
    items.push({
      id: "bonus",
      dot: "bg-green",
      title: `₦${bonus.toLocaleString("en-NG")} quarterly bonus`,
      subtitle: "Eligible based on current score",
      href: "/dashboard/profile",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="px-5 animate-fade-up delay-150">
      <p className="type-label mb-3">Needs Your Attention</p>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper transition-colors active:scale-[0.99]"
          >
            <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", item.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              {item.subtitle && (
                <p className="text-xs text-muted mt-0.5">{item.subtitle}</p>
              )}
            </div>
            <ChevronRight size={13} className="text-muted/40 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Goals Spotlight ───────────────────────────────────────────────────────────

function GoalsSpotlight({ user }: { user: Employee }) {
  const sorted = [...user.goals].sort((a, b) => {
    const rank = { behind: 0, at_risk: 1, on_track: 2, completed: 3 } as const;
    return (rank[a.status as keyof typeof rank] ?? 2) - (rank[b.status as keyof typeof rank] ?? 2);
  });
  const top3 = sorted.slice(0, 3);
  const onTrack = user.goals.filter((g) => g.status === "on_track" || g.status === "completed").length;

  function statusDot(status: string) {
    if (status === "completed" || status === "on_track") return "bg-green";
    if (status === "at_risk") return "bg-amber";
    return "bg-pulse";
  }

  return (
    <div className="px-5 animate-fade-up delay-225">
      <div className="flex items-center justify-between mb-3">
        <p className="type-label">My Goals</p>
        <span className="text-xs text-muted">{onTrack}/{user.goals.length} on track</span>
      </div>
      <div className="space-y-4">
        {top3.map((goal) => (
          <div key={goal.id}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", statusDot(goal.status))} />
                <span className="text-sm text-ink truncate">{goal.name}</span>
              </div>
              <span className="text-sm font-bold text-ink ml-2 flex-shrink-0">{goal.percentComplete}%</span>
            </div>
            <div className="h-[3px] bg-border rounded-full overflow-hidden">
              <div
                className={clsx("h-full rounded-full transition-all duration-700", barColor(goal.percentComplete))}
                style={{ width: `${goal.percentComplete}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <Link href="/goals" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse hover:text-pulse/80 transition-colors">
        View all {user.goals.length} goals <ArrowRight size={11} />
      </Link>
    </div>
  );
}

// ── Upcoming ──────────────────────────────────────────────────────────────────

function UpcomingSection({ user }: { user: Employee }) {
  const upcoming = user.meetings.slice(0, 3);
  if (!upcoming.length) return null;

  return (
    <div className="px-5 animate-fade-up delay-300">
      <p className="type-label mb-3">Upcoming</p>
      <div className="space-y-3">
        {upcoming.map((m) => {
          const day = new Date(m.date).toLocaleDateString("en-GB", { weekday: "short" });
          return (
            <div key={m.id} className="flex items-center gap-3">
              <div className="w-8 text-center flex-shrink-0">
                <p className="text-[10px] font-semibold uppercase text-muted">{day}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{m.title}</p>
                <p className="text-xs text-muted">{m.time} · {m.duration}min</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Manager Brief ─────────────────────────────────────────────────────────────

function ManagerBrief() {
  const teamAvg = Math.round(
    employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
  );
  const atRisk = employees.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement");
  const overdueReports = employees.filter((e) => {
    if (!e.reports.length) return true;
    return Math.floor((REFERENCE_NOW - new Date(e.reports[0].date).getTime()) / 86_400_000) >= 5;
  });

  const lines: string[] = [];
  lines.push(`Your team's average score is ${teamAvg}/100 this cycle.`);
  if (atRisk.length > 0) {
    lines.push(`${atRisk.length} team member${atRisk.length > 1 ? "s need" : " needs"} focused support before Q2 closes.`);
  }
  if (overdueReports.length > 0) {
    lines.push(`${overdueReports.length} weekly report${overdueReports.length > 1 ? "s are" : " is"} pending review.`);
  }

  return (
    <div className="insight-card mx-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-dot flex-shrink-0" />
        <span className="type-label text-white/40">Team Intelligence</span>
      </div>
      <div className="space-y-2.5">
        {lines.map((text, i) => (
          <p key={i} className={clsx("leading-relaxed", i === 0 ? "text-[15px] font-semibold text-white" : "text-sm text-white/60")}>
            {text}
          </p>
        ))}
      </div>
      <Link href="/team" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse/90 hover:text-pulse transition-colors">
        View team <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function TeamSnapshot() {
  const atRisk = employees.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement");
  const strong = employees.filter((e) => e.badge === "Strong Performer");

  return (
    <div className="px-5 animate-fade-up delay-150 space-y-4">
      <p className="type-label">Team Snapshot</p>

      {atRisk.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-amber mb-2.5">Needs attention</p>
          <div className="space-y-0 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
            {atRisk.slice(0, 3).map((emp) => (
              <div key={emp.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: emp.avatarColor }}
                >
                  {emp.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{emp.name}</p>
                  <p className="text-xs text-muted truncate">{emp.role}</p>
                </div>
                <span className={clsx("text-sm font-bold", emp.performanceScore < 50 ? "text-red" : "text-amber")}>
                  {emp.performanceScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {strong.length > 0 && (
        <div className="bg-green-soft rounded-2xl px-4 py-3.5 border border-green/15">
          <p className="text-xs font-semibold text-green">
            {strong.length} strong performer{strong.length > 1 ? "s" : ""} this cycle
          </p>
          <p className="text-xs text-muted mt-1">
            {strong.map((e) => e.name.split(" ")[0]).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Executive Brief ───────────────────────────────────────────────────────────

function ExecutiveBrief() {
  const orgAvg = Math.round(
    employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
  );
  const atRiskOKRs = employees
    .flatMap((e) => e.goals.filter((g) => g.type === "org"))
    .filter((g) => g.status === "at_risk" || g.status === "behind");
  const promotions = employees.filter((e) => e.aiRec.recommendation === "promote");
  const pipList = employees.filter(
    (e) => e.aiRec.recommendation === "pip" || e.aiRec.recommendation === "exit_risk"
  );

  const lines: string[] = [
    `Organisation performance is at ${orgAvg}/100, trending upward this cycle.`,
  ];
  if (atRiskOKRs.length > 0) {
    lines.push(`${atRiskOKRs.length} strategic objective${atRiskOKRs.length > 1 ? "s require" : " requires"} leadership attention before Q2 closes.`);
  }
  if (promotions.length > 0) {
    lines.push(`${promotions.length} employee${promotions.length > 1 ? "s are" : " is"} ready for promotion this cycle.`);
  }
  if (pipList.length > 0) {
    lines.push(`${pipList.length} employee${pipList.length > 1 ? "s require" : " requires"} intervention.`);
  }

  return (
    <div className="insight-card mx-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-dot flex-shrink-0" />
        <span className="type-label text-white/40">Strategic Intelligence · Q2 2026</span>
      </div>
      <div className="space-y-2.5">
        {lines.map((text, i) => (
          <p key={i} className={clsx("leading-relaxed", i === 0 ? "text-[15px] font-semibold text-white" : "text-sm text-white/60")}>
            {text}
          </p>
        ))}
      </div>
      <Link href="/dashboard/executive" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse/90 hover:text-pulse transition-colors">
        Full executive view <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function OrgHealthStrip() {
  const orgAvg = Math.round(
    employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
  );
  const high = employees.filter((e) => e.performanceScore >= 85).length;
  const good = employees.filter((e) => e.performanceScore >= 60 && e.performanceScore < 85).length;
  const atRisk = employees.filter((e) => e.performanceScore < 60).length;
  const promote = employees.filter((e) => e.aiRec.recommendation === "promote").length;
  const pip = employees.filter(
    (e) => e.aiRec.recommendation === "pip" || e.aiRec.recommendation === "exit_risk"
  ).length;

  const stats = [
    { label: "Org Score", value: `${orgAvg}`, sub: "/100", accent: true },
    { label: "High Performers", value: `${high}` },
    { label: "Good Standing", value: `${good}` },
    { label: "Needs Support", value: `${atRisk}`, warn: atRisk > 0 },
    { label: "For Promotion", value: `${promote}`, positive: true },
    { label: "PIP Pipeline", value: `${pip}`, warn: pip > 0 },
  ];

  return (
    <div className="px-5 animate-fade-up delay-75">
      <p className="type-label mb-3">Org Health · {employees.length} People</p>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className={clsx(
            "rounded-xl p-3 text-center border",
            s.accent ? "bg-ink border-transparent" : "bg-card border-border"
          )}>
            <p
              className={clsx(
                "text-2xl font-bold leading-none",
                s.accent ? "text-white" : s.warn ? "text-pulse" : s.positive ? "text-green" : "text-ink"
              )}
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {s.value}<span className={clsx("text-sm font-medium", s.accent ? "text-white/50" : "text-muted")}>{s.sub}</span>
            </p>
            <p className={clsx("text-[10px] mt-1.5 font-medium", s.accent ? "text-white/50" : "text-muted")}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OKRTracker() {
  const orgGoals = employees
    .flatMap((e) => e.goals.filter((g) => g.type === "org"))
    .filter((g, i, arr) => arr.findIndex((x) => x.name === g.name) === i)
    .slice(0, 4);

  return (
    <div className="px-5 animate-fade-up delay-150">
      <p className="type-label mb-3">Strategic OKRs</p>
      <div className="space-y-4">
        {orgGoals.map((goal) => (
          <div key={goal.id}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {(goal.status === "at_risk" || goal.status === "behind") && (
                  <span className="text-pulse text-[11px] flex-shrink-0">⚠</span>
                )}
                <span className="text-sm text-ink truncate">{goal.name}</span>
              </div>
              <span className="text-sm font-bold text-ink ml-2 flex-shrink-0">{goal.percentComplete}%</span>
            </div>
            <div className="h-[3px] bg-border rounded-full overflow-hidden">
              <div
                className={clsx("h-full rounded-full", barColor(goal.percentComplete))}
                style={{ width: `${goal.percentComplete}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <Link href="/goals" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse hover:text-pulse/80 transition-colors">
        View all OKRs <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function DeptRanking() {
  const sorted = [...departments].sort((a, b) => b.avgScore - a.avgScore);
  const max = Math.max(...sorted.map((d) => d.avgScore));

  return (
    <div className="px-5 animate-fade-up delay-225">
      <p className="type-label mb-3">Department Performance</p>
      <div className="space-y-3">
        {sorted.map((dept, i) => (
          <div key={dept.id} className="flex items-center gap-3">
            <span className="text-[10px] text-muted w-3.5 text-right flex-shrink-0">{i + 1}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-ink truncate">{dept.name}</span>
                <span className={clsx(
                  "text-xs font-bold ml-2 flex-shrink-0",
                  dept.avgScore >= 75 ? "text-green" : dept.avgScore >= 65 ? "text-amber" : "text-red"
                )}>
                  {dept.avgScore}
                </span>
              </div>
              <div className="h-[2px] bg-border rounded-full overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    dept.avgScore >= 75 ? "bg-green" : dept.avgScore >= 65 ? "bg-amber" : "bg-red"
                  )}
                  style={{ width: `${(dept.avgScore / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HR Brief ──────────────────────────────────────────────────────────────────

function HRBrief() {
  const orgAvg = Math.round(
    employees.reduce((s, e) => s + e.performanceScore, 0) / employees.length
  );
  const riskCount = employees.filter((e) => e.badge === "At Risk" || e.badge === "Needs Improvement").length;
  const promotionReady = employees.filter((e) => e.aiRec.recommendation === "promote").length;
  const compliance = Math.round((employees.filter((e) => e.weekStreak >= 1).length / employees.length) * 100);

  const lines = [
    `Organisation health score is ${orgAvg}/100 across ${employees.length} employees.`,
    `${promotionReady} employee${promotionReady > 1 ? "s are" : " is"} promotion-ready. ${riskCount} require intervention.`,
    `Report compliance is at ${compliance}% this cycle.`,
  ];

  return (
    <div className="insight-card mx-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-dot flex-shrink-0" />
        <span className="type-label text-white/40">Workforce Intelligence</span>
      </div>
      <div className="space-y-2.5">
        {lines.map((text, i) => (
          <p key={i} className={clsx("leading-relaxed", i === 0 ? "text-[15px] font-semibold text-white" : "text-sm text-white/60")}>
            {text}
          </p>
        ))}
      </div>
      <Link href="/hr" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-pulse/90 hover:text-pulse transition-colors">
        Open HR portal <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function AppraisalCycleStatus() {
  const total = employees.length;
  const milestones = [
    { label: "Self-assessments submitted", done: Math.floor(total * 0.72) },
    { label: "Manager reviews complete",   done: Math.floor(total * 0.60) },
    { label: "Peer feedback collected",    done: Math.floor(total * 0.88) },
    { label: "HR sign-offs",               done: Math.floor(total * 0.20) },
  ];

  return (
    <div className="px-5 animate-fade-up delay-75">
      <p className="type-label mb-3">Appraisal Cycle · Q2 2026</p>
      <div className="space-y-3.5">
        {milestones.map((m) => {
          const pct = Math.round((m.done / total) * 100);
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-ink">{m.label}</span>
                <span className="text-xs font-semibold text-ink">{m.done}/{total}</span>
              </div>
              <div className="h-[3px] bg-border rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full", pct === 100 ? "bg-green" : "bg-pulse")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HRPendingSignoffs() {
  const pending = employees.filter(
    (e) => e.aiRec.recommendation === "promote" || e.aiRec.recommendation === "pip"
  );

  return (
    <div className="px-5 animate-fade-up delay-150">
      <div className="flex items-center justify-between mb-3">
        <p className="type-label">Pending Sign-offs</p>
        <span className="text-xs text-muted">{pending.length} employees</span>
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        {pending.slice(0, 5).map((emp) => (
          <Link key={emp.id} href="/appraisal" className="flex items-center gap-3 px-4 py-3 hover:bg-paper transition-colors active:scale-[0.99]">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: emp.avatarColor }}
            >
              {emp.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{emp.name}</p>
              <p className="text-xs text-muted truncate">{emp.department}</p>
            </div>
            <span className={clsx(
              "text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0",
              emp.aiRec.recommendation === "promote"
                ? "bg-green-soft text-green"
                : "bg-amber-soft text-amber"
            )}>
              {emp.aiRec.recommendation === "promote" ? "Promote" : "PIP"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const { user } = useUser();
  const view = deriveView(user);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-7 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}>

      {/* Greeting */}
      <div className="px-5 pt-5 animate-fade-up">
        <p className="text-xs text-muted">{getGreeting()}</p>
        <h1 className="text-[26px] font-bold text-ink mt-0.5 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
          {firstName}
        </h1>
        <p className="text-[11px] text-muted/70 mt-0.5">{formatDateLong()}</p>
      </div>

      {/* AI Brief */}
      {view === "employee" && <PulseBrief user={user} />}
      {view === "manager" && <ManagerBrief />}
      {view === "executive" && <ExecutiveBrief />}
      {view === "hr" && <HRBrief />}

      {/* Employee view */}
      {view === "employee" && (
        <>
          <PerformancePulse user={user} />
          <AttentionFeed user={user} />
          <GoalsSpotlight user={user} />
          <UpcomingSection user={user} />
        </>
      )}

      {/* Manager view — own performance + team */}
      {view === "manager" && (
        <>
          <PerformancePulse user={user} />
          <TeamSnapshot />
          <AttentionFeed user={user} />
          <GoalsSpotlight user={user} />
        </>
      )}

      {/* Executive view */}
      {view === "executive" && (
        <>
          <OrgHealthStrip />
          <OKRTracker />
          <DeptRanking />
        </>
      )}

      {/* HR view */}
      {view === "hr" && (
        <>
          <AppraisalCycleStatus />
          <HRPendingSignoffs />
          <OrgHealthStrip />
        </>
      )}
    </div>
  );
}
