import { employees, departments, org } from "@/data/mockData";
import { StatCard, SectionLabel, Alert, AIInsight, ProgressBar } from "@/components/ui";

const atRiskCount = employees.filter((e) => e.badge === "At Risk").length;
const needsImpCount = employees.filter((e) => e.badge === "Needs Improvement").length;
const onTrackCount = employees.filter(
  (e) => e.badge === "Good Standing" || e.badge === "Strong Performer"
).length;
const onTrackPct = Math.round((onTrackCount / employees.length) * 100);

const sortedDepts = [...departments].sort((a, b) => b.avgScore - a.avgScore);

const flaggedEmployees = employees.filter(
  (e) => e.badge === "At Risk" || e.badge === "Needs Improvement"
);

export default function HRDashboard() {
  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <div className="bg-ink rounded-2xl p-5 text-white">
        <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest mb-1">
          HR View
        </p>
        <h1
          className="text-white text-2xl font-bold mb-1"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          {org.name}
        </h1>
        <p className="text-white/50 text-sm">
          {org.staffCount} employees · {org.departmentCount} departments · May 2026
        </p>
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-3 gap-3">
          {[
            { label: "At Risk", value: atRiskCount },
            { label: "Need Support", value: needsImpCount },
            { label: "On Track", value: `${onTrackPct}%` },
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
        <StatCard label="Total Employees" value={org.staffCount} trend="up" trendLabel="+3 this quarter" />
        <StatCard label="Departments" value={org.departmentCount} trend="flat" trendLabel="No changes" />
        <StatCard label="At Risk" value={`${atRiskCount + needsImpCount}`} trend="down" trendLabel="Needs action" />
        <StatCard label="On Track" value={`${onTrackPct}%`} accent trend="up" trendLabel="of workforce" />
      </div>

      {flaggedEmployees.length > 0 && (
        <div>
          <SectionLabel>Active AI Flags</SectionLabel>
          <div className="space-y-3">
            {flaggedEmployees.map((emp) => (
              <Alert
                key={emp.id}
                variant={emp.badge === "At Risk" ? "error" : "warning"}
                title={`${emp.name} — ${emp.badge}`}
                message={`${emp.role}, ${emp.department}. AI confidence: ${Math.round(emp.aiRec.confidence * 100)}%. ${emp.aiRec.evidence[0]}`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel right="By avg score">Department Health</SectionLabel>
        <div className="bg-card rounded-2xl border border-border divide-y divide-border px-4">
          {sortedDepts.map((dept, i) => (
            <div key={dept.id} className="py-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted w-4">{i + 1}</span>
                  <span className="text-sm font-semibold text-ink">{dept.name}</span>
                  <span className="text-[10px] text-muted">· {dept.headCount} people</span>
                </div>
                <span
                  className="text-base font-bold text-ink"
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {dept.avgScore}
                </span>
              </div>
              <ProgressBar
                value={dept.avgScore}
                status={dept.avgScore >= 85 ? "on_track" : dept.avgScore >= 75 ? "on_track" : "at_risk"}
                height="thin"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Exit Risk Assessment</SectionLabel>
        <AIInsight aiRec={employees[7].aiRec} />
      </div>
    </div>
  );
}
