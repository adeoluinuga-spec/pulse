import { employees, departments } from "@/data/mockData";
import { StatCard, PersonRow, SectionLabel, Alert, AIInsight } from "@/components/ui";

const teamAvgScore = Math.round(
  employees.reduce((sum, e) => sum + e.performanceScore, 0) / employees.length
);
const strongPerformers = employees.filter((e) => e.badge === "Strong Performer").length;
const atRisk = employees.filter((e) => e.badge === "At Risk").length;
const needsImprovement = employees.filter((e) => e.badge === "Needs Improvement").length;

const myDept = departments.find((d) => d.name === "Product");

export default function ManagerDashboard() {
  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <div className="bg-ink rounded-2xl p-5 text-white">
        <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest mb-1">
          Manager View
        </p>
        <h1
          className="text-white text-2xl font-bold mb-1"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Team Overview
        </h1>
        <p className="text-white/50 text-sm">Zenith Corp · All Departments · May 2026</p>
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-4 gap-3">
          {[
            { label: "Members", value: employees.length },
            { label: "Avg Score", value: teamAvgScore },
            { label: "Strong", value: strongPerformers },
            { label: "At Risk", value: atRisk + needsImprovement },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p
                className="text-white font-bold text-xl leading-none"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                {s.value}
              </p>
              <p className="text-white/40 text-[10px] mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Team Avg Score" value={teamAvgScore} trend="up" trendLabel="+2.1 this cycle" />
        <StatCard label="Strong Performers" value={strongPerformers} trend="up" trendLabel={`of ${employees.length} total`} />
        <StatCard label="Needs Attention" value={atRisk + needsImprovement} trend="down" trendLabel="Requires action" />
        <StatCard label="Dept Score" value={myDept?.avgScore ?? "—"} accent trend="up" trendLabel="Product dept" />
      </div>

      {atRisk > 0 && (
        <Alert
          variant="error"
          title={`${atRisk} employee${atRisk > 1 ? "s" : ""} flagged At Risk`}
          message="Sofia Reyes in Finance has missed 3 consecutive deadlines. An AI-initiated exit risk assessment is active. Manager review recommended."
        />
      )}

      {needsImprovement > 0 && (
        <Alert
          variant="warning"
          title={`${needsImprovement} employee${needsImprovement > 1 ? "s" : ""} Needs Improvement`}
          message="Priya Sharma in Analytics has 3 of 5 goals behind schedule. A Performance Improvement Plan discussion is recommended."
        />
      )}

      <div>
        <SectionLabel right={`${employees.length} people`}>Team Members</SectionLabel>
        <div className="bg-card rounded-2xl border border-border divide-y divide-border px-4">
          {employees.map((emp) => (
            <PersonRow key={emp.id} employee={emp} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Top Performer AI Assessment</SectionLabel>
        <AIInsight aiRec={employees[0].aiRec} />
      </div>
    </div>
  );
}
