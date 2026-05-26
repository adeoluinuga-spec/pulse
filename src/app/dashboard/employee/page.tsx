import { employees } from "@/data/mockData";
import { HeroCard, StatCard, GoalItem, AIInsight, SectionLabel } from "@/components/ui";

const me = employees[0]; // Amara Osei

export default function EmployeeDashboard() {
  const recentReports = me.reports.slice(0, 2);

  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <HeroCard employee={me} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Performance"
          value={me.performanceScore}
          trend="up"
          trendLabel="+4 this month"
        />
        <StatCard
          label="Consistency"
          value={`${me.consistencyIndex}%`}
          trend="up"
          trendLabel="15pts above avg"
        />
        <StatCard
          label="Peer Rating"
          value={`${me.peerRating}/5`}
          trend="flat"
          trendLabel="Stable"
        />
        <StatCard
          label="Week Streak"
          value={`${me.weekStreak}w`}
          accent
          trend="up"
          trendLabel="Personal best"
        />
      </div>

      <div>
        <SectionLabel right={`${me.goals.length} goals`}>Your Goals</SectionLabel>
        <div className="bg-card rounded-2xl border border-border divide-y divide-border px-4">
          {me.goals.map((goal) => (
            <GoalItem key={goal.id} goal={goal} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>AI Assessment</SectionLabel>
        <AIInsight aiRec={me.aiRec} />
      </div>

      <div>
        <SectionLabel right="View all">Recent Reports</SectionLabel>
        <div className="space-y-3">
          {recentReports.map((report) => (
            <div key={report.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {report.type === "weekly" ? "Weekly Report" : "Monthly Report"}
                </span>
                <span className="text-[11px] text-muted">
                  {new Date(report.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-sm text-ink/80 leading-relaxed mb-3">{report.qualitative}</p>
              <div className="grid grid-cols-3 gap-2">
                {report.metrics.map((metric) => (
                  <div key={metric.label} className="bg-paper rounded-xl p-2.5 text-center">
                    <p
                      className="text-base font-bold text-ink leading-none"
                      style={{ fontFamily: "var(--font-syne)" }}
                    >
                      {metric.value}
                    </p>
                    <p className="text-[10px] text-muted mt-1">{metric.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
