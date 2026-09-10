export const APPRAISAL_WEIGHTS = { goal_achievement: 35, report_consistency: 20, kpi_performance: 25, manager_assessment: 10, peer_feedback: 10 };
export type ComponentKey = keyof typeof APPRAISAL_WEIGHTS;
export const COMPONENT_LABELS: Record<ComponentKey, string> = { goal_achievement: "Goal achievement", report_consistency: "Report consistency", kpi_performance: "KPI performance", manager_assessment: "Manager assessment", peer_feedback: "Peer feedback" };
export const MANAGER_CRITERIA = ["Delivery quality", "Collaboration and leadership", "Initiative and problem solving", "Communication and stakeholders", "Growth and development"];
export const RATING_LABELS = ["Needs improvement", "Partially meets expectations", "Meets expectations", "Exceeds expectations", "Exceptional contribution"];
export type AppraisalWeights = Record<ComponentKey, number>;
export type AppraisalStage = "self_review" | "manager_review" | "calibration" | "released" | "acknowledged";
export type AppraisalCycleRow = { id: string; name: string; start_date: string; end_date: string; status: string; weights: AppraisalWeights | null; review_due_date: string | null; report_frequency: "weekly" | "monthly" | "none"; revision: number };
export type AppraisalEmployee = { id: string; name: string; email: string; department: string | null; role: string | null; line_manager_id: string | null; join_date: string | null };
export type GoalEvidence = { id: string; title: string; percent_complete: number | null; weight: number | null; cycle: string | null; appraisal_cycle_id: string | null; updated_at?: string };
export type KpiEvidence = { id: string; name: string; target_value: number | null; current_value: number | null; weight: number | null; unit: string | null; measure_direction: "higher" | "lower"; cycle: string | null; appraisal_cycle_id: string | null };
export type ReportEvidence = { id: string; report_type: string; submitted_at: string; period_start: string | null; period_end: string | null; status: string; accomplishments?: string; blockers?: string; support_needed?: string };
export type AppraisalSnapshot = {
  version: 1; capturedAt: string; cycleId: string; coverage: number; total: number | null; provisional: number | null; ready: boolean;
  components: Array<{ key: ComponentKey; label: string; weight: number; score: number | null; detail: string }>;
  blockers: string[]; goals: GoalEvidence[]; kpis: KpiEvidence[]; reports: ReportEvidence[];
  reporting: { expected: number; submitted: number; excused: number }; peerCount: number;
};
export type DevelopmentAction = { title: string; dueDate: string; owner: "employee" | "manager"; status: "planned" | "in_progress" | "complete" };
export type ManagerReview = { ratings: number[]; notes: string; development: DevelopmentAction[] };
export type SelfReview = { achievements: string; challenges: string; support: string };
export type AppraisalRecord = {
  id: string; employee_id: string; reviewer_id: string | null; cycle_id: string; workflow_status: AppraisalStage; revision: number;
  self_assessment: SelfReview | null; manager_assessment: ManagerReview | null; evidence_snapshot: AppraisalSnapshot | null;
  development_plan: DevelopmentAction[]; calibration: { rating: number; rationale: string } | null;
  employee_response: string | null; self_submitted_at: string | null; manager_submitted_at: string | null;
  released_at: string | null; acknowledged_at: string | null; total_score: number | null;
};
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateWeights(value: unknown): value is AppraisalWeights {
  if (!value || typeof value !== "object") return false;
  const weights = value as Record<string, unknown>;
  return Object.keys(APPRAISAL_WEIGHTS).every(key => typeof weights[key] === "number" && Number.isInteger(weights[key]) && Number(weights[key]) >= 0 && Number(weights[key]) <= 100)
    && Object.keys(APPRAISAL_WEIGHTS).reduce((sum, key) => sum + Number(weights[key]), 0) === 100;
}
const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const numeric = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
function weighted(values: Array<{ score: number; weight: number }>): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  return round(total > 0 ? values.reduce((sum, v) => sum + v.score * Math.max(0, v.weight), 0) / total : values.reduce((sum, v) => sum + v.score, 0) / values.length);
}
export function kpiAttainment(kpi: KpiEvidence): number | null {
  const target = kpi.target_value, actual = kpi.current_value;
  if (!numeric(target) || !numeric(actual) || target < 0 || actual < 0) return null;
  if (kpi.measure_direction === "lower") return round(actual === 0 ? 100 : clamp(target / actual * 100));
  return target > 0 ? round(clamp(actual / target * 100)) : null;
}
export function managerScore(review: ManagerReview | null): number | null {
  return review?.ratings.length === MANAGER_CRITERIA.length && review.ratings.every(n => Number.isInteger(n) && n >= 1 && n <= 5)
    ? round(review.ratings.reduce((sum, n) => sum + n, 0) / review.ratings.length * 20) : null;
}
const day = 86400000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
export function reportingCoverage(cycle: AppraisalCycleRow, reports: ReportEvidence[], joinDate: string | null,
  leave: Array<{ start_date: string; end_date: string }>, asOf: string) {
  if (cycle.report_frequency === "none") return { expected: 0, submitted: 0, excused: 0 };
  const start = Math.max(Date.parse(cycle.start_date), validDate(joinDate) ? Date.parse(joinDate) : 0);
  const end = Date.parse(cycle.end_date), today = Date.parse(asOf.slice(0, 10));
  if (![start, end, today].every(Number.isFinite) || start > end) return { expected: 0, submitted: 0, excused: 0 };
  let cursor = start, expected = 0, submitted = 0, excused = 0;
  while (cursor <= end) {
    const date = new Date(cursor);
    const periodEnd = Math.min(end, cycle.report_frequency === "monthly"
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
      : cursor + ((7 - date.getUTCDay()) % 7) * day);
    if (periodEnd > today) break; // In-progress periods do not count as missed reports.
    const workdays: string[] = [];
    for (let d = cursor; d <= periodEnd; d += day) if (![0, 6].includes(new Date(d).getUTCDay())) workdays.push(iso(d));
    const onLeave = workdays.length > 0 && workdays.every(d => leave.some(l => l.start_date <= d && l.end_date >= d));
    if (onLeave || !workdays.length) excused++;
    else {
      expected++;
      if (reports.some(r => {
        const reportingDate = r.period_end || r.period_start || r.submitted_at.slice(0, 10);
        return r.report_type === cycle.report_frequency && ["submitted", "reviewed", "acknowledged"].includes(r.status)
          && reportingDate >= iso(cursor) && reportingDate <= iso(periodEnd) && r.submitted_at <= asOf;
      })) submitted++;
    }
    cursor = periodEnd + day;
  }
  return { expected, submitted, excused };
}
export function buildAppraisalSnapshot(input: {
  cycle: AppraisalCycleRow; goals: GoalEvidence[]; kpis: KpiEvidence[]; reports: ReportEvidence[];
  peers: Array<{ reviewer_id: string; rating: number; submitted_at: string }>;
  manager: ManagerReview | null; joinDate: string | null; leave: Array<{ start_date: string; end_date: string }>; asOf: string;
}): AppraisalSnapshot {
  const { cycle, goals, kpis, reports } = input;
  const weights = cycle.weights ?? APPRAISAL_WEIGHTS;
  const reporting = reportingCoverage(cycle, reports, input.joinDate, input.leave, input.asOf);
  const goalsValid = goals.every(g => numeric(g.percent_complete) && g.percent_complete >= 0 && g.percent_complete <= 100);
  const kpisValid = kpis.every(k => kpiAttainment(k) !== null);
  const peers = new Map<string, { rating: number; submitted_at: string }>();
  for (const p of input.peers) if (Number.isInteger(p.rating) && p.rating >= 1 && p.rating <= 5 && p.submitted_at <= input.asOf) {
    if (!peers.has(p.reviewer_id) || peers.get(p.reviewer_id)!.submitted_at < p.submitted_at) peers.set(p.reviewer_id, p);
  }
  const scores: Record<ComponentKey, number | null> = {
    goal_achievement: goalsValid ? weighted(goals.map(g => ({ score: g.percent_complete!, weight: g.weight ?? 0 }))) : null,
    kpi_performance: kpisValid ? weighted(kpis.map(k => ({ score: kpiAttainment(k)!, weight: k.weight ?? 0 }))) : null,
    report_consistency: reporting.expected ? round(reporting.submitted / reporting.expected * 100) : null,
    manager_assessment: managerScore(input.manager),
    peer_feedback: peers.size >= 3 ? round([...peers.values()].reduce((sum, p) => sum + p.rating * 20, 0) / peers.size) : null,
  };
  const detail: Record<ComponentKey, string> = {
    goal_achievement: `${goals.length} linked objectives; ${goalsValid ? "weighted completion" : "invalid progress needs correction"}. All-zero item weights use equal weighting.`,
    kpi_performance: `${kpis.length} linked KPIs; ${kpisValid ? "target attainment, capped at 100%" : "invalid target or actual needs correction"}. Higher/lower direction respected.`,
    report_consistency: `${reporting.submitted}/${reporting.expected} completed reporting periods; ${reporting.excused} excused. Duplicate reports count once.`,
    manager_assessment: "Five behaviour-anchored ratings, 1–5; mean multiplied by 20.",
    peer_feedback: peers.size >= 3 ? `${peers.size} distinct peers; ratings aggregated without names or comments.` : "At least three distinct peer responses required. Small groups are withheld.",
  };
  const components = (Object.keys(APPRAISAL_WEIGHTS) as ComponentKey[]).map(key => ({ key, label: COMPONENT_LABELS[key], weight: weights[key], score: scores[key], detail: detail[key] }));
  const blockers = components.filter(c => c.weight > 0 && c.score === null).map(c => `${c.label}: evidence is missing, invalid or below the privacy threshold.`);
  if (!validateWeights(weights)) blockers.push("Cycle weights must total 100%.");
  const available = components.filter(c => c.weight > 0 && c.score !== null);
  const coverage = available.reduce((sum, c) => sum + c.weight, 0);
  const provisional = weighted(available.map(c => ({ score: c.score!, weight: c.weight })));
  return { version: 1, capturedAt: input.asOf, cycleId: cycle.id, coverage, total: blockers.length ? null : provisional, provisional,
    ready: blockers.length === 0, components, blockers, goals, kpis, reports, reporting, peerCount: peers.size >= 3 ? peers.size : 0 };
}
export function canReviewAppraisal(actorId: string, row: Pick<AppraisalRecord, "employee_id" | "reviewer_id">) { return actorId !== row.employee_id && actorId === row.reviewer_id; }
export function visibleAppraisal(row: AppraisalRecord, actorId: string): AppraisalRecord {
  if (row.employee_id !== actorId || ["released", "acknowledged"].includes(row.workflow_status)) return row;
  return { ...row, manager_assessment: null, evidence_snapshot: null, total_score: null, calibration: null, development_plan: [] };
}
export function validateManagerReview(value: unknown): value is ManagerReview {
  if (!value || typeof value !== "object") return false;
  const review = value as ManagerReview;
  return Array.isArray(review.ratings) && managerScore(review) !== null && typeof review.notes === "string" && review.notes.trim().length >= 20 && review.notes.length <= 8000
    && Array.isArray(review.development) && review.development.length > 0 && review.development.length <= 10
    && review.development.every(a => typeof a.title === "string" && a.title.trim().length >= 3 && a.title.length <= 500 && validDate(a.dueDate)
      && ["employee", "manager"].includes(a.owner) && ["planned", "in_progress", "complete"].includes(a.status));
}
