import { employees, departments, org } from "@/data/mockData";
import { StatCard, SectionLabel, AIInsight, ProgressBar, Alert } from "@/components/ui";

const orgAvgScore = Math.round(
  employees.reduce((sum, e) => sum + e.performanceScore, 0) / employees.length
);
const topDept = [...departments].sort((a, b) => b.avgScore - a.avgScore)[0];
const atRiskCount = employees.filter(
  (e) => e.badge === "At Risk" || e.badge === "Needs Improvement"
).length;
const strongPerformers = employees.filter((e) => e.badge === "Strong Performer");

export default function ExecutiveDashboard() {
  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <div className="bg-ink rounded-2xl p-5 text-white">
        <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest mb-1">
          Executive View
        </p>
        <h1
          className="text-white text-2xl font-bold mb-1"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Org Performance
        </h1>
        <p className="text-white/50 text-sm">
          {org.name} · Q2 2026 · {org.staffCount} employees
        </p>

        <div className="mt-6 flex items-end gap-3">
          <span
            className="font-bold text-white leading-none"
            style={{ fontFamily: "var(--font-syne)", fontSize: "5rem" }}
          >
            {orgAvgScore}
          </span>
          <div className="pb-2">
            <p className="text-white/40 text-sm">/100 org avg</p>
            <p className="text-white/30 text-xs mt-0.5">+3.2pts vs last quarter</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Org Score" value={orgAvgScore} trend="up" trendLabel="+3.2 QoQ" />
        <StatCard label="Top Dept" value={topDept.name} trend="up" trendLabel={`Avg ${topDept.avgScore}`} />
        <StatCard label="Strong Performers" value={strongPerformers.length} trend="up" trendLabel={`of ${employees.length} sampled`} />
        <StatCard label="Needs Attention" value={atRiskCount} accent trend="down" trendLabel="Active flags" />
      </div>

      {atRiskCount >= 2 && (
        <Alert
          variant="warning"
          title="Workforce Risk Signal"
          message={`${atRiskCount} employees are flagged At Risk or Needs Improvement. Finance and Analytics departments are the primary concern areas this cycle.`}
        />
      )}

      <div>
        <SectionLabel right="8 departments">Department Performance</SectionLabel>
        <div className="bg-card rounded-2xl border border-border divide-y divide-border px-4">
          {[...departments]
            .sort((a, b) => b.avgScore - a.avgScore)
            .map((dept, i) => {
              const isTop = i === 0;
              const isLow = dept.avgScore < 75;
              return (
                <div key={dept.id} className="py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted w-4">{i + 1}</span>
                      <span className="text-sm font-semibold text-ink">{dept.name}</span>
                      {isTop && (
                        <span className="text-[10px] bg-green-soft text-green px-1.5 py-0.5 rounded font-semibold">
                          Top
                        </span>
                      )}
                      {isLow && (
                        <span className="text-[10px] bg-red-soft text-red px-1.5 py-0.5 rounded font-semibold">
                          Flag
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">{dept.headCount} staff</span>
                      <span
                        className="text-base font-bold text-ink w-7 text-right"
                        style={{ fontFamily: "var(--font-syne)" }}
                      >
                        {dept.avgScore}
                      </span>
                    </div>
                  </div>
                  <ProgressBar
                    value={dept.avgScore}
                    status={dept.avgScore >= 82 ? "on_track" : dept.avgScore >= 74 ? "at_risk" : "behind"}
                    height="thin"
                  />
                </div>
              );
            })}
        </div>
      </div>

      <div>
        <SectionLabel right={`${strongPerformers.length} flagged`}>Promotion Pipeline</SectionLabel>
        <div className="space-y-3">
          {strongPerformers.map((emp) => (
            <div key={emp.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{emp.name}</p>
                  <p className="text-[11px] text-muted">
                    {emp.role} · {emp.department}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="text-xl font-bold text-ink leading-none"
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {emp.performanceScore}
                  </p>
                  <p className="text-[10px] text-muted">score</p>
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed">{emp.aiRec.evidence[0]}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Highest Confidence AI Signal</SectionLabel>
        <AIInsight aiRec={employees[0].aiRec} />
      </div>
    </div>
  );
}
