export type AssessmentLevel = "director" | "assistant_director";
export type ReviewerGroup = "direct_report" | "subordinate" | "colleague" | "customer";
export type AssessmentCycleStatus = "setup" | "collecting" | "calibration" | "closed";
export type ReviewerStatus = "not_started" | "in_progress" | "submitted";

export interface Competency {
  id: string;
  name: string;
  description: string;
  weight: number;
  telcoSignals: string[];
}

export interface ReviewQuestion {
  id: string;
  competencyId: string;
  prompt: string;
  kind: "rating" | "comment";
}

export interface Assessee {
  id: string;
  name: string;
  initials: string;
  level: AssessmentLevel;
  functionName: string;
  region: string;
  portfolio: string;
  tenureYears: number;
}

export interface Reviewer {
  id: string;
  assesseeId: string;
  name: string;
  group: ReviewerGroup;
  organisation?: string;
  email: string;
  status: ReviewerStatus;
  submittedAt?: string;
}

export interface CompetencyScore {
  competencyId: string;
  score: number;
  benchmark: number;
}

export interface AssesseeResult {
  assesseeId: string;
  groupScores: Record<ReviewerGroup, number>;
  competencyScores: CompetencyScore[];
  strongestSignals: string[];
  developmentSignals: string[];
  riskNotes: string[];
}

export interface AssessmentCycle {
  id: string;
  name: string;
  clientName: string;
  status: AssessmentCycleStatus;
  startDate: string;
  closeDate: string;
  levels: AssessmentLevel[];
  reviewerWeights: Record<ReviewerGroup, number>;
}

export const reviewerGroups: Array<{
  key: ReviewerGroup;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: "direct_report",
    label: "Direct Report",
    shortLabel: "Direct",
    description: "Line manager or supervising executive feedback.",
  },
  {
    key: "subordinate",
    label: "Subordinate",
    shortLabel: "Subordinate",
    description: "Team members and employees led by the assessee.",
  },
  {
    key: "colleague",
    label: "Colleague",
    shortLabel: "Colleague",
    description: "Cross-functional peers and internal stakeholders.",
  },
  {
    key: "customer",
    label: "Customer",
    shortLabel: "Customer",
    description: "External customers, partners, regulators, or enterprise accounts.",
  },
];

export const telcoCompetencies: Competency[] = [
  {
    id: "network_execution",
    name: "Network And Service Execution",
    description: "Delivers reliable network, product, and service outcomes at executive scale.",
    weight: 18,
    telcoSignals: ["Uptime discipline", "Incident response", "Quality of service", "SLA ownership"],
  },
  {
    id: "commercial_judgement",
    name: "Commercial Judgement",
    description: "Balances subscriber growth, profitability, risk, and long-term market position.",
    weight: 16,
    telcoSignals: ["ARPU focus", "Churn reduction", "Channel performance", "Revenue protection"],
  },
  {
    id: "customer_stewardship",
    name: "Customer And Stakeholder Stewardship",
    description: "Builds trust with customers, enterprise clients, partners, and regulators.",
    weight: 16,
    telcoSignals: ["Complaint resolution", "Enterprise relationships", "Regulatory sensitivity", "Brand trust"],
  },
  {
    id: "people_leadership",
    name: "People Leadership",
    description: "Creates clarity, accountability, coaching rhythm, and succession depth.",
    weight: 18,
    telcoSignals: ["Talent bench", "Performance conversations", "Delegation", "Psychological safety"],
  },
  {
    id: "change_transformation",
    name: "Change And Transformation",
    description: "Leads transformation across digital, network, commercial, and operating teams.",
    weight: 14,
    telcoSignals: ["Digital adoption", "Process redesign", "Change adoption", "Execution cadence"],
  },
  {
    id: "governance_integrity",
    name: "Governance And Integrity",
    description: "Makes transparent, compliant, and accountable decisions under pressure.",
    weight: 18,
    telcoSignals: ["Compliance", "Procurement discipline", "Data privacy", "Ethical judgement"],
  },
];

export const assessmentQuestions: ReviewQuestion[] = telcoCompetencies.flatMap((competency) => [
  {
    id: `${competency.id}_rating`,
    competencyId: competency.id,
    kind: "rating",
    prompt: `Rate this leader on ${competency.name.toLowerCase()}.`,
  },
  {
    id: `${competency.id}_comment`,
    competencyId: competency.id,
    kind: "comment",
    prompt: `What evidence best supports your rating for ${competency.name.toLowerCase()}?`,
  },
]);

export const active360Cycle: AssessmentCycle = {
  id: "telco-directors-2026",
  name: "Directorate 360 Leadership Assessment",
  clientName: "Telco Leadership Group",
  status: "collecting",
  startDate: "2026-09-03",
  closeDate: "2026-09-24",
  levels: ["director", "assistant_director"],
  reviewerWeights: {
    direct_report: 30,
    subordinate: 25,
    colleague: 25,
    customer: 20,
  },
};

export const assessees: Assessee[] = [
  {
    id: "ad-001",
    name: "Amina Lawal",
    initials: "AL",
    level: "director",
    functionName: "Network Operations",
    region: "North Central",
    portfolio: "Radio access network, field operations, outage governance",
    tenureYears: 9,
  },
  {
    id: "ad-002",
    name: "Chinedu Okoye",
    initials: "CO",
    level: "director",
    functionName: "Enterprise Business",
    region: "National",
    portfolio: "B2B growth, key accounts, solution delivery",
    tenureYears: 7,
  },
  {
    id: "ad-003",
    name: "Mariam Bello",
    initials: "MB",
    level: "assistant_director",
    functionName: "Customer Experience",
    region: "South West",
    portfolio: "Contact centers, service recovery, digital care",
    tenureYears: 5,
  },
  {
    id: "ad-004",
    name: "Tunde Adeyemi",
    initials: "TA",
    level: "assistant_director",
    functionName: "Digital Products",
    region: "National",
    portfolio: "Self-care app, value added services, product analytics",
    tenureYears: 4,
  },
];

export const reviewers: Reviewer[] = [
  { id: "r-001", assesseeId: "ad-001", name: "Group CTO", group: "direct_report", email: "cto@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-002", assesseeId: "ad-001", name: "Regional Field Lead", group: "subordinate", email: "fieldlead@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-003", assesseeId: "ad-001", name: "Commercial Planning Director", group: "colleague", email: "planning@exampletelco.com", status: "in_progress" },
  { id: "r-004", assesseeId: "ad-001", name: "Tower Partner Executive", group: "customer", organisation: "TowerCo Partner", email: "partner@towerco.example", status: "not_started" },
  { id: "r-005", assesseeId: "ad-002", name: "Chief Commercial Officer", group: "direct_report", email: "cco@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-006", assesseeId: "ad-002", name: "Enterprise Sales Manager", group: "subordinate", email: "enterprise@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-007", assesseeId: "ad-002", name: "Finance Business Partner", group: "colleague", email: "finance@exampletelco.com", status: "submitted", submittedAt: "2026-09-04" },
  { id: "r-008", assesseeId: "ad-002", name: "Banking Sector Client", group: "customer", organisation: "Tier 1 Bank", email: "itdirector@bank.example", status: "in_progress" },
  { id: "r-009", assesseeId: "ad-003", name: "Customer Operations Director", group: "direct_report", email: "custops@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-010", assesseeId: "ad-003", name: "Digital Care Lead", group: "subordinate", email: "digitalcare@exampletelco.com", status: "in_progress" },
  { id: "r-011", assesseeId: "ad-003", name: "Brand Communications Lead", group: "colleague", email: "brand@exampletelco.com", status: "submitted", submittedAt: "2026-09-04" },
  { id: "r-012", assesseeId: "ad-003", name: "Enterprise Customer", group: "customer", organisation: "Public Sector Account", email: "customer@gov.example", status: "not_started" },
  { id: "r-013", assesseeId: "ad-004", name: "Chief Digital Officer", group: "direct_report", email: "cdo@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-014", assesseeId: "ad-004", name: "Product Analytics Lead", group: "subordinate", email: "analytics@exampletelco.com", status: "submitted", submittedAt: "2026-09-03" },
  { id: "r-015", assesseeId: "ad-004", name: "Network Product Lead", group: "colleague", email: "networkproduct@exampletelco.com", status: "not_started" },
  { id: "r-016", assesseeId: "ad-004", name: "Fintech Partner", group: "customer", organisation: "Payments Partner", email: "ops@fintech.example", status: "submitted", submittedAt: "2026-09-04" },
];

export const results: AssesseeResult[] = [
  {
    assesseeId: "ad-001",
    groupScores: { direct_report: 86, subordinate: 78, colleague: 74, customer: 69 },
    competencyScores: [
      { competencyId: "network_execution", score: 91, benchmark: 82 },
      { competencyId: "commercial_judgement", score: 76, benchmark: 78 },
      { competencyId: "customer_stewardship", score: 70, benchmark: 80 },
      { competencyId: "people_leadership", score: 79, benchmark: 81 },
      { competencyId: "change_transformation", score: 75, benchmark: 77 },
      { competencyId: "governance_integrity", score: 84, benchmark: 83 },
    ],
    strongestSignals: ["Incident command is decisive and respected", "Network outage governance is clear"],
    developmentSignals: ["External partner communication needs more proactive cadence", "Commercial trade-offs should be explained earlier"],
    riskNotes: ["Customer reviewers are below internal reviewers by 11 points"],
  },
  {
    assesseeId: "ad-002",
    groupScores: { direct_report: 89, subordinate: 84, colleague: 82, customer: 86 },
    competencyScores: [
      { competencyId: "network_execution", score: 77, benchmark: 82 },
      { competencyId: "commercial_judgement", score: 92, benchmark: 78 },
      { competencyId: "customer_stewardship", score: 88, benchmark: 80 },
      { competencyId: "people_leadership", score: 81, benchmark: 81 },
      { competencyId: "change_transformation", score: 84, benchmark: 77 },
      { competencyId: "governance_integrity", score: 86, benchmark: 83 },
    ],
    strongestSignals: ["Enterprise customers describe high trust", "Commercial priorities are translated into action"],
    developmentSignals: ["Could deepen technical fluency during complex solution escalations"],
    riskNotes: [],
  },
  {
    assesseeId: "ad-003",
    groupScores: { direct_report: 80, subordinate: 73, colleague: 79, customer: 65 },
    competencyScores: [
      { competencyId: "network_execution", score: 68, benchmark: 82 },
      { competencyId: "commercial_judgement", score: 74, benchmark: 78 },
      { competencyId: "customer_stewardship", score: 82, benchmark: 80 },
      { competencyId: "people_leadership", score: 76, benchmark: 81 },
      { competencyId: "change_transformation", score: 71, benchmark: 77 },
      { competencyId: "governance_integrity", score: 78, benchmark: 83 },
    ],
    strongestSignals: ["Service recovery tone is empathetic", "Cross-functional partners value responsiveness"],
    developmentSignals: ["Needs stronger operating metrics in service recovery reviews", "Customer closings need clearer ownership"],
    riskNotes: ["Customer score is below launch benchmark"],
  },
  {
    assesseeId: "ad-004",
    groupScores: { direct_report: 77, subordinate: 81, colleague: 72, customer: 83 },
    competencyScores: [
      { competencyId: "network_execution", score: 72, benchmark: 82 },
      { competencyId: "commercial_judgement", score: 79, benchmark: 78 },
      { competencyId: "customer_stewardship", score: 80, benchmark: 80 },
      { competencyId: "people_leadership", score: 83, benchmark: 81 },
      { competencyId: "change_transformation", score: 87, benchmark: 77 },
      { competencyId: "governance_integrity", score: 75, benchmark: 83 },
    ],
    strongestSignals: ["Digital adoption initiatives are gaining trust", "Subordinates cite strong coaching rhythm"],
    developmentSignals: ["Peer alignment before launches needs more discipline", "Governance evidence should be documented earlier"],
    riskNotes: ["Colleague score is the lowest group signal"],
  },
];

export function levelLabel(level: AssessmentLevel): string {
  return level === "director" ? "Director" : "Assistant Director";
}

export function statusLabel(status: AssessmentCycleStatus): string {
  if (status === "setup") return "Setup";
  if (status === "collecting") return "Collecting feedback";
  if (status === "calibration") return "Calibration";
  return "Closed";
}

export function weightedScore(result: AssesseeResult, weights = active360Cycle.reviewerWeights): number {
  const total = Object.entries(weights).reduce(
    (sum, [group, weight]) => sum + result.groupScores[group as ReviewerGroup] * weight,
    0,
  );
  return Math.round(total / 100);
}

export function completionForAssessee(assesseeId: string, source = reviewers): number {
  const assigned = source.filter((reviewer) => reviewer.assesseeId === assesseeId);
  if (!assigned.length) return 0;
  const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
  return Math.round((submitted / assigned.length) * 100);
}

export function completionByGroup(group: ReviewerGroup, source = reviewers): number {
  const assigned = source.filter((reviewer) => reviewer.group === group);
  if (!assigned.length) return 0;
  const submitted = assigned.filter((reviewer) => reviewer.status === "submitted").length;
  return Math.round((submitted / assigned.length) * 100);
}

export function assessmentReadiness(): number {
  const submitted = reviewers.filter((reviewer) => reviewer.status === "submitted").length;
  const completion = Math.round((submitted / reviewers.length) * 100);
  const coverage = reviewerGroups.filter((group) =>
    assessees.every((assessee) =>
      reviewers.some((reviewer) => reviewer.assesseeId === assessee.id && reviewer.group === group.key),
    ),
  ).length;
  return Math.round(completion * 0.7 + (coverage / reviewerGroups.length) * 30);
}
