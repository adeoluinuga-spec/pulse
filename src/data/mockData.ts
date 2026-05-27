export type BadgeType = "Good Standing" | "Strong Performer" | "Needs Improvement" | "At Risk";
export type GoalType = "org" | "dept" | "team" | "individual";
export type GoalStatus = "on_track" | "at_risk" | "behind" | "completed";
export type ReportType = "weekly" | "monthly";
export type AIRecommendation = "promote" | "good_standing" | "pip" | "exit_risk";
export type TrendDir = "up" | "down" | "flat";

export interface Metric {
  label: string;
  value: string;
  trend: TrendDir;
}

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  percentComplete: number;
  dueDate: string;
  weight: number;
  status: GoalStatus;
}

export interface Report {
  id: string;
  type: ReportType;
  date: string;
  qualitative: string;
  metrics: Metric[];
}

export interface AIRec {
  recommendation: AIRecommendation;
  confidence: number;
  evidence: string[];
}

export interface Employee {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  avatarColor: string;
  performanceScore: number;
  consistencyIndex: number;
  peerRating: number;
  weekStreak: number;
  badge: BadgeType;
  goals: Goal[];
  reports: Report[];
  aiRec: AIRec;
}

export interface Department {
  id: string;
  name: string;
  avgScore: number;
  headCount: number;
}

export interface Org {
  name: string;
  staffCount: number;
  departmentCount: number;
}

export const org: Org = {
  name: "Zenith Corp",
  staffCount: 148,
  departmentCount: 8,
};

export const departments: Department[] = [
  { id: "d1", name: "Engineering", avgScore: 84, headCount: 24 },
  { id: "d2", name: "Sales", avgScore: 87, headCount: 18 },
  { id: "d3", name: "Human Resources", avgScore: 76, headCount: 9 },
  { id: "d4", name: "Analytics", avgScore: 81, headCount: 12 },
  { id: "d5", name: "Product", avgScore: 89, headCount: 14 },
  { id: "d6", name: "Marketing", avgScore: 75, headCount: 16 },
  { id: "d7", name: "Finance", avgScore: 72, headCount: 11 },
  { id: "d8", name: "Customer Experience", avgScore: 83, headCount: 21 },
];

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

export const notifications: AppNotification[] = [
  { id: "n1", title: "Weekly Report Submitted",    body: "Amara Osei submitted her weekly performance report.",               time: "2m ago",     read: false },
  { id: "n2", title: "Goal Milestone Reached",      body: "Q2 Product Roadmap Launch is now at 88% completion.",              time: "1h ago",     read: false },
  { id: "n3", title: "AI Promotion Signal",         body: "3 employees have crossed the promotion readiness threshold.",       time: "3h ago",     read: false },
  { id: "n4", title: "Review Pending",              body: "4 weekly reports are awaiting your review.",                       time: "Yesterday",  read: true  },
  { id: "n5", title: "Appraisal Cycle Update",      body: "Peer feedback collection is 88% complete for Q2 2026.",            time: "Yesterday",  read: true  },
  { id: "n6", title: "PIP Flag Raised",             body: "Priya Sharma (Analytics) has been flagged for formal PIP review.", time: "2 days ago", read: true  },
];

export const employees: Employee[] = [
  {
    id: "e1",
    name: "Amara Osei",
    initials: "AO",
    role: "Senior Product Manager",
    department: "Product",
    avatarColor: "#3b5bdb",
    performanceScore: 91,
    consistencyIndex: 88,
    peerRating: 4.6,
    weekStreak: 7,
    badge: "Strong Performer",
    goals: [
      { id: "g1", name: "Q2 Product Roadmap Launch", type: "org", percentComplete: 88, dueDate: "2026-06-30", weight: 25, status: "on_track" },
      { id: "g2", name: "User Retention Initiative", type: "dept", percentComplete: 65, dueDate: "2026-07-15", weight: 20, status: "at_risk" },
      { id: "g3", name: "Feature Velocity +25%", type: "team", percentComplete: 100, dueDate: "2026-05-31", weight: 20, status: "completed" },
      { id: "g4", name: "Stakeholder NPS +20pts", type: "individual", percentComplete: 45, dueDate: "2026-08-31", weight: 20, status: "behind" },
      { id: "g5", name: "Product Documentation Overhaul", type: "individual", percentComplete: 78, dueDate: "2026-06-15", weight: 15, status: "on_track" },
    ],
    reports: [
      {
        id: "r1", type: "weekly", date: "2026-05-19",
        qualitative: "Strong sprint delivery with 3 of 4 planned features shipped. Stakeholder sync went well — roadmap alignment is improving. One blocker around API integration is being escalated to Engineering.",
        metrics: [
          { label: "Features Shipped", value: "3/4", trend: "flat" },
          { label: "Sprint Velocity", value: "89%", trend: "up" },
          { label: "Blockers Raised", value: "1", trend: "flat" },
        ],
      },
      {
        id: "r2", type: "weekly", date: "2026-05-12",
        qualitative: "Exceptional week — facilitated a cross-functional roadmap review with 94% stakeholder approval. Team velocity hit a 6-week high. NPS tracking is slightly behind schedule but recovery plan is in motion.",
        metrics: [
          { label: "Stakeholder Approval", value: "94%", trend: "up" },
          { label: "Team Velocity", value: "95%", trend: "up" },
          { label: "NPS Score", value: "62", trend: "up" },
        ],
      },
      {
        id: "r3", type: "monthly", date: "2026-04-30",
        qualitative: "April was Amara's strongest month to date. She led the Product team through a major roadmap pivot with minimal disruption, closed 2 enterprise feature requests ahead of schedule, and received top-quartile peer feedback.",
        metrics: [
          { label: "Goals On Track", value: "4/5", trend: "up" },
          { label: "Peer Feedback", value: "4.6/5", trend: "up" },
          { label: "Dept Rank", value: "#1", trend: "flat" },
        ],
      },
    ],
    aiRec: {
      recommendation: "promote",
      confidence: 0.91,
      evidence: [
        "Top performer in Product dept for 2 consecutive quarters",
        "88% consistency index — 15pts above department average",
        "Peer rating of 4.6/5 across all 360 reviewers",
        "7-week improvement streak with zero regression weeks",
        "Successfully led 2 major product pivots with minimal disruption",
      ],
    },
  },
  {
    id: "e2",
    name: "James Kirkland",
    initials: "JK",
    role: "Software Engineer",
    department: "Engineering",
    avatarColor: "#7048ae",
    performanceScore: 85,
    consistencyIndex: 82,
    peerRating: 4.2,
    weekStreak: 5,
    badge: "Strong Performer",
    goals: [
      { id: "g6", name: "Migrate Auth Service to OAuth 2.0", type: "dept", percentComplete: 72, dueDate: "2026-06-30", weight: 30, status: "on_track" },
      { id: "g7", name: "Reduce API Latency by 40%", type: "team", percentComplete: 55, dueDate: "2026-07-31", weight: 25, status: "at_risk" },
      { id: "g8", name: "Test Coverage to 80%", type: "individual", percentComplete: 91, dueDate: "2026-05-31", weight: 20, status: "on_track" },
      { id: "g9", name: "Complete System Design Certification", type: "individual", percentComplete: 40, dueDate: "2026-08-15", weight: 15, status: "on_track" },
      { id: "g10", name: "Onboard 2 Junior Engineers", type: "team", percentComplete: 100, dueDate: "2026-04-30", weight: 10, status: "completed" },
    ],
    reports: [
      {
        id: "r4", type: "weekly", date: "2026-05-19",
        qualitative: "Good week overall — closed 8 of 9 assigned tickets, with the remaining blocked on design specs. Auth migration is progressing well. Flagged a potential performance issue in the data pipeline that could affect Q3 delivery.",
        metrics: [
          { label: "Tickets Closed", value: "8/9", trend: "up" },
          { label: "Code Review Score", value: "4.1/5", trend: "flat" },
          { label: "Bugs Introduced", value: "0", trend: "up" },
        ],
      },
      {
        id: "r5", type: "weekly", date: "2026-05-12",
        qualitative: "Delivered the first milestone of the auth migration ahead of schedule. Led 2 code review sessions for junior engineers. API latency optimization is behind — need more dedicated time or additional resources next sprint.",
        metrics: [
          { label: "Sprint Points", value: "34", trend: "up" },
          { label: "Latency Reduction", value: "18%", trend: "up" },
          { label: "Review Sessions", value: "2", trend: "flat" },
        ],
      },
      {
        id: "r6", type: "monthly", date: "2026-04-30",
        qualitative: "James demonstrated technical leadership throughout April, completing the junior onboarding milestone and driving test coverage from 71% to 82%. His ticket throughput is consistently in the top 20% of Engineering.",
        metrics: [
          { label: "Test Coverage", value: "82%", trend: "up" },
          { label: "Throughput Rank", value: "Top 20%", trend: "up" },
          { label: "Mentor Score", value: "4.4/5", trend: "up" },
        ],
      },
    ],
    aiRec: {
      recommendation: "promote",
      confidence: 0.82,
      evidence: [
        "Consistent top-20% throughput over past 3 months",
        "Test coverage improved from 67% to 91% on individual goal",
        "Proactively mentored 2 junior engineers ahead of schedule",
        "Zero critical bugs shipped in past 6 weeks",
        "82% consistency index with clear upward trajectory",
      ],
    },
  },
  {
    id: "e3",
    name: "Fatima Al-Rashid",
    initials: "FA",
    role: "HR Business Partner",
    department: "Human Resources",
    avatarColor: "#0c8599",
    performanceScore: 73,
    consistencyIndex: 71,
    peerRating: 4.0,
    weekStreak: 3,
    badge: "Good Standing",
    goals: [
      { id: "g11", name: "Annual Performance Review Cycle", type: "org", percentComplete: 95, dueDate: "2026-05-31", weight: 30, status: "on_track" },
      { id: "g12", name: "Reduce Attrition by 5%", type: "dept", percentComplete: 38, dueDate: "2026-12-31", weight: 25, status: "at_risk" },
      { id: "g13", name: "HR Policy Handbook v3 Launch", type: "dept", percentComplete: 60, dueDate: "2026-07-01", weight: 20, status: "on_track" },
      { id: "g14", name: "Complete HR Analytics Certification", type: "individual", percentComplete: 55, dueDate: "2026-09-30", weight: 15, status: "on_track" },
      { id: "g15", name: "Implement 360 Feedback Platform", type: "org", percentComplete: 82, dueDate: "2026-06-15", weight: 10, status: "on_track" },
    ],
    reports: [
      {
        id: "r7", type: "weekly", date: "2026-05-19",
        qualitative: "Performance review cycle is in final stages — 94% of forms submitted. Conducted 4 manager coaching sessions this week. Attrition concern in Engineering flagged and escalated to leadership.",
        metrics: [
          { label: "Review Completion", value: "94%", trend: "up" },
          { label: "Coaching Sessions", value: "4", trend: "up" },
          { label: "Open Grievances", value: "2", trend: "flat" },
        ],
      },
      {
        id: "r8", type: "weekly", date: "2026-05-12",
        qualitative: "Focused on 360 feedback platform rollout — training sessions with 6 departments completed. Good adoption so far. HR policy handbook at 60%, slight delay due to extended legal review.",
        metrics: [
          { label: "Depts Trained", value: "6/8", trend: "up" },
          { label: "Platform Adoption", value: "71%", trend: "up" },
          { label: "Policy Completion", value: "60%", trend: "flat" },
        ],
      },
      {
        id: "r9", type: "monthly", date: "2026-04-30",
        qualitative: "Fatima had a solid month driving the performance review cycle and policy documentation. Her coaching uptake scores improved by 12%. The attrition reduction goal needs more targeted interventions.",
        metrics: [
          { label: "Coaching Score", value: "+12%", trend: "up" },
          { label: "Attrition Rate", value: "8.2%", trend: "down" },
          { label: "HR CSAT", value: "3.9/5", trend: "flat" },
        ],
      },
    ],
    aiRec: {
      recommendation: "good_standing",
      confidence: 0.79,
      evidence: [
        "Consistent performance in the 70–80th percentile range",
        "High stakeholder CSAT for HR services (3.9/5)",
        "On track for 4 of 5 goals including high-priority review cycle",
        "Attrition goal requires stronger intervention strategy",
        "Coaching effectiveness improving — 12% uptick last month",
      ],
    },
  },
  {
    id: "e4",
    name: "Marcus Chen",
    initials: "MC",
    role: "Sales Director",
    department: "Sales",
    avatarColor: "#d9480f",
    performanceScore: 88,
    consistencyIndex: 84,
    peerRating: 4.4,
    weekStreak: 6,
    badge: "Strong Performer",
    goals: [
      { id: "g16", name: "Q2 Revenue Target $2.4M", type: "org", percentComplete: 78, dueDate: "2026-06-30", weight: 40, status: "on_track" },
      { id: "g17", name: "Enterprise Pipeline Expansion", type: "dept", percentComplete: 85, dueDate: "2026-07-31", weight: 25, status: "on_track" },
      { id: "g18", name: "New Logo Acquisitions ×8", type: "team", percentComplete: 50, dueDate: "2026-09-30", weight: 20, status: "at_risk" },
      { id: "g19", name: "Sales Playbook Refresh", type: "individual", percentComplete: 100, dueDate: "2026-04-30", weight: 10, status: "completed" },
      { id: "g20", name: "Win Rate Improvement to 38%", type: "individual", percentComplete: 62, dueDate: "2026-08-31", weight: 5, status: "on_track" },
    ],
    reports: [
      {
        id: "r10", type: "weekly", date: "2026-05-19",
        qualitative: "Strong week — closed 3 enterprise deals totaling $380K. Pipeline is healthy at $4.2M. Two new logo prospects advanced to POC stage. Win rate tracking at 34%, trending toward 38% target.",
        metrics: [
          { label: "Revenue Closed", value: "$380K", trend: "up" },
          { label: "Pipeline Value", value: "$4.2M", trend: "up" },
          { label: "Win Rate", value: "34%", trend: "up" },
        ],
      },
      {
        id: "r11", type: "weekly", date: "2026-05-12",
        qualitative: "Conducted 8 discovery calls, 3 advanced to proposal stage. Launched the refreshed sales playbook — early rep feedback is positive. Q2 revenue at 78% to target with 6 weeks remaining.",
        metrics: [
          { label: "Discovery Calls", value: "8", trend: "up" },
          { label: "Proposals Sent", value: "3", trend: "flat" },
          { label: "Q2 Achievement", value: "78%", trend: "up" },
        ],
      },
      {
        id: "r12", type: "monthly", date: "2026-04-30",
        qualitative: "Marcus had an outstanding April — best revenue month of the year at $1.2M contributed. Enterprise pipeline grew 22% through targeted outreach. New logo acquisition at 4 of 8 target needs a push.",
        metrics: [
          { label: "Monthly Revenue", value: "$1.2M", trend: "up" },
          { label: "Pipeline Growth", value: "+22%", trend: "up" },
          { label: "New Logos", value: "4/8", trend: "flat" },
        ],
      },
    ],
    aiRec: {
      recommendation: "promote",
      confidence: 0.85,
      evidence: [
        "Revenue contribution 22% above quota in trailing 90 days",
        "84% consistency index — second highest in Sales department",
        "Proactively built and distributed refreshed sales playbook",
        "Enterprise pipeline grew 22% under direct influence",
        "Peer-rated 4.4/5 on collaboration and leadership behaviors",
      ],
    },
  },
  {
    id: "e5",
    name: "Priya Sharma",
    initials: "PS",
    role: "Data Analyst",
    department: "Analytics",
    avatarColor: "#a61e4d",
    performanceScore: 67,
    consistencyIndex: 58,
    peerRating: 3.2,
    weekStreak: 1,
    badge: "Needs Improvement",
    goals: [
      { id: "g21", name: "Q2 Analytics Dashboard Launch", type: "dept", percentComplete: 35, dueDate: "2026-06-15", weight: 30, status: "behind" },
      { id: "g22", name: "Data Quality Score to 95%", type: "team", percentComplete: 48, dueDate: "2026-07-31", weight: 25, status: "at_risk" },
      { id: "g23", name: "Automate 3 Weekly Reports", type: "individual", percentComplete: 20, dueDate: "2026-06-30", weight: 20, status: "behind" },
      { id: "g24", name: "Complete SQL Advanced Certification", type: "individual", percentComplete: 70, dueDate: "2026-07-15", weight: 15, status: "on_track" },
      { id: "g25", name: "Cross-Dept Data Partnerships ×3", type: "dept", percentComplete: 33, dueDate: "2026-09-30", weight: 10, status: "at_risk" },
    ],
    reports: [
      {
        id: "r13", type: "weekly", date: "2026-05-19",
        qualitative: "Dashboard project is significantly behind — only 35% complete with 4 weeks to deadline. Output affected this month. Manager check-in scheduled for Friday to discuss support options.",
        metrics: [
          { label: "Dashboard Progress", value: "35%", trend: "down" },
          { label: "Tasks Completed", value: "3/8", trend: "down" },
          { label: "Data Quality", value: "81%", trend: "flat" },
        ],
      },
      {
        id: "r14", type: "weekly", date: "2026-05-12",
        qualitative: "Attended SQL certification training for 2 days which affected delivery output. Dashboard design phase completed but development is stalled. Flagged to manager that additional support may be needed.",
        metrics: [
          { label: "Dashboard Phase", value: "Dev Stalled", trend: "down" },
          { label: "Training Hours", value: "16hrs", trend: "up" },
          { label: "Peer Requests Served", value: "2/5", trend: "down" },
        ],
      },
      {
        id: "r15", type: "monthly", date: "2026-04-30",
        qualitative: "April was a difficult month for Priya. Goal progress slipped across 3 of 5 goals. SQL certification remains the bright spot at 70%. Manager has initiated a support conversation focused on workload planning.",
        metrics: [
          { label: "Goals On Track", value: "1/5", trend: "down" },
          { label: "SQL Progress", value: "70%", trend: "up" },
          { label: "Output vs Plan", value: "58%", trend: "down" },
        ],
      },
    ],
    aiRec: {
      recommendation: "pip",
      confidence: 0.74,
      evidence: [
        "3 of 5 goals tracking behind or at risk",
        "Performance declined 14pts over 2 months (81→67)",
        "Consistency index of 58 — lowest in Analytics department",
        "Peer rating dropped from 3.8 to 3.2 in recent cycle",
        "Manager has flagged workload and support concerns",
      ],
    },
  },
  {
    id: "e6",
    name: "Derek Okafor",
    initials: "DO",
    role: "Customer Success Lead",
    department: "Customer Experience",
    avatarColor: "#2f9e44",
    performanceScore: 82,
    consistencyIndex: 79,
    peerRating: 4.1,
    weekStreak: 4,
    badge: "Good Standing",
    goals: [
      { id: "g26", name: "Customer Health Score Avg 85+", type: "dept", percentComplete: 72, dueDate: "2026-07-31", weight: 30, status: "on_track" },
      { id: "g27", name: "Churn Rate Below 3%", type: "org", percentComplete: 68, dueDate: "2026-12-31", weight: 25, status: "on_track" },
      { id: "g28", name: "QBR Completion Rate 90%", type: "team", percentComplete: 84, dueDate: "2026-06-30", weight: 20, status: "on_track" },
      { id: "g29", name: "CS Playbook Documentation", type: "individual", percentComplete: 45, dueDate: "2026-07-15", weight: 15, status: "at_risk" },
      { id: "g30", name: "Upsell Revenue $180K", type: "individual", percentComplete: 58, dueDate: "2026-09-30", weight: 10, status: "on_track" },
    ],
    reports: [
      {
        id: "r16", type: "weekly", date: "2026-05-19",
        qualitative: "Completed 5 QBRs this week — all rated 'very satisfied' by customers. A churn-risk account was de-escalated after an emergency intervention call. CS playbook is falling behind due to QBR volume.",
        metrics: [
          { label: "QBRs Completed", value: "5", trend: "up" },
          { label: "CSAT Score", value: "4.7/5", trend: "up" },
          { label: "Churn Risks", value: "1 Resolved", trend: "up" },
        ],
      },
      {
        id: "r17", type: "weekly", date: "2026-05-12",
        qualitative: "Health score reviews completed for top 20 accounts. Identified 3 expansion opportunities worth ~$60K. Documentation backlog growing — need to carve out dedicated time next week.",
        metrics: [
          { label: "Accounts Reviewed", value: "20", trend: "up" },
          { label: "Expansion Pipeline", value: "$60K", trend: "up" },
          { label: "Doc Backlog", value: "8 items", trend: "down" },
        ],
      },
      {
        id: "r18", type: "monthly", date: "2026-04-30",
        qualitative: "Derek maintained strong account health throughout April with a 92% QBR completion rate. His customer CSAT of 4.7 is the highest in the CX team. Playbook documentation is the key area to address.",
        metrics: [
          { label: "QBR Rate", value: "92%", trend: "up" },
          { label: "Customer CSAT", value: "4.7/5", trend: "up" },
          { label: "Playbook Progress", value: "45%", trend: "flat" },
        ],
      },
    ],
    aiRec: {
      recommendation: "good_standing",
      confidence: 0.81,
      evidence: [
        "Consistent 4.7/5 CSAT — highest score in CX team",
        "92% QBR completion rate, above 85% team target",
        "Successfully de-escalated 3 churn risks in Q2",
        "79% consistency index with stable upward trend",
        "CS playbook goal at risk — needs dedicated focus",
      ],
    },
  },
  {
    id: "e7",
    name: "Yuki Tanaka",
    initials: "YT",
    role: "Brand Designer",
    department: "Marketing",
    avatarColor: "#364fc7",
    performanceScore: 79,
    consistencyIndex: 75,
    peerRating: 4.3,
    weekStreak: 3,
    badge: "Good Standing",
    goals: [
      { id: "g31", name: "Brand Refresh Campaign Launch", type: "org", percentComplete: 90, dueDate: "2026-06-01", weight: 35, status: "on_track" },
      { id: "g32", name: "Design System v2.0 Completion", type: "dept", percentComplete: 68, dueDate: "2026-07-31", weight: 25, status: "on_track" },
      { id: "g33", name: "Social Media Asset Velocity ×2", type: "team", percentComplete: 55, dueDate: "2026-08-31", weight: 20, status: "at_risk" },
      { id: "g34", name: "Figma Advanced Certification", type: "individual", percentComplete: 100, dueDate: "2026-04-15", weight: 10, status: "completed" },
      { id: "g35", name: "Agency Partnership Review", type: "dept", percentComplete: 30, dueDate: "2026-07-01", weight: 10, status: "behind" },
    ],
    reports: [
      {
        id: "r19", type: "weekly", date: "2026-05-19",
        qualitative: "Final visual assets for brand refresh delivered to stakeholders — received exceptional feedback. Design system documentation at 68%. Social media asset volume still below target; exploring template automation.",
        metrics: [
          { label: "Brand Assets Delivered", value: "12", trend: "up" },
          { label: "Design System Docs", value: "68%", trend: "up" },
          { label: "Social Templates", value: "4/8", trend: "flat" },
        ],
      },
      {
        id: "r20", type: "weekly", date: "2026-05-12",
        qualitative: "Brand campaign visual direction approved by CMO. Running 2 design sprints in parallel — stretching capacity. Agency review delayed due to stakeholder availability, rescheduled to June.",
        metrics: [
          { label: "Sprints Running", value: "2", trend: "up" },
          { label: "CMO Approval", value: "Approved", trend: "up" },
          { label: "Agency Review", value: "Delayed", trend: "down" },
        ],
      },
      {
        id: "r21", type: "monthly", date: "2026-04-30",
        qualitative: "April was productive — brand refresh is in excellent shape and Yuki completed her Figma certification early. Agency partnership goal and social velocity targets need attention going into May.",
        metrics: [
          { label: "Quality Rating", value: "Top in Dept", trend: "up" },
          { label: "Cert Completed", value: "1 early", trend: "up" },
          { label: "Peer Design Score", value: "4.5/5", trend: "up" },
        ],
      },
    ],
    aiRec: {
      recommendation: "good_standing",
      confidence: 0.77,
      evidence: [
        "Brand refresh delivery quality rated top in Marketing dept",
        "Proactively completed Figma certification 2 weeks early",
        "75% consistency index with steady improvement trend",
        "Managing dual design sprints — capacity risk flagged",
        "Agency review and social velocity goals need monitoring",
      ],
    },
  },
  {
    id: "e8",
    name: "Sofia Reyes",
    initials: "SR",
    role: "Finance Analyst",
    department: "Finance",
    avatarColor: "#e67700",
    performanceScore: 45,
    consistencyIndex: 41,
    peerRating: 2.8,
    weekStreak: 0,
    badge: "At Risk",
    goals: [
      { id: "g36", name: "Q2 Financial Reporting Accuracy", type: "org", percentComplete: 55, dueDate: "2026-06-30", weight: 35, status: "at_risk" },
      { id: "g37", name: "Monthly Close Process -20% Time", type: "dept", percentComplete: 10, dueDate: "2026-08-31", weight: 25, status: "behind" },
      { id: "g38", name: "Budget Variance Reduction", type: "team", percentComplete: 30, dueDate: "2026-07-31", weight: 20, status: "behind" },
      { id: "g39", name: "Complete IFRS Training Module", type: "individual", percentComplete: 45, dueDate: "2026-07-15", weight: 15, status: "at_risk" },
      { id: "g40", name: "Automate Expense Reconciliation", type: "individual", percentComplete: 5, dueDate: "2026-06-15", weight: 5, status: "behind" },
    ],
    reports: [
      {
        id: "r22", type: "weekly", date: "2026-05-19",
        qualitative: "Q2 reporting is behind schedule due to data reconciliation issues in 3 cost centers. Errors found in April reports require correction. Manager is involved and working with Finance Director to prioritize.",
        metrics: [
          { label: "Reporting Progress", value: "55%", trend: "down" },
          { label: "Errors Found", value: "3", trend: "down" },
          { label: "Corrections Pending", value: "7", trend: "down" },
        ],
      },
      {
        id: "r23", type: "weekly", date: "2026-05-12",
        qualitative: "Missed the monthly close deadline by 2 days — third consecutive delay. Root causes discussed with manager: competing priorities, limited ERP proficiency, and insufficient handover documentation from previous analyst.",
        metrics: [
          { label: "Close Delay", value: "2 days", trend: "down" },
          { label: "ERP Proficiency", value: "42%", trend: "flat" },
          { label: "Errors Corrected", value: "5/9", trend: "flat" },
        ],
      },
      {
        id: "r24", type: "monthly", date: "2026-04-30",
        qualitative: "April exposed significant performance gaps. Three consecutive missed deadlines and a 41% consistency index have placed Sofia in the 'At Risk' category. HR and Finance Director are aligned on initiating a formal support plan.",
        metrics: [
          { label: "Deadlines Missed", value: "3", trend: "down" },
          { label: "Consistency Index", value: "41", trend: "down" },
          { label: "Peer Rating", value: "2.8/5", trend: "down" },
        ],
      },
    ],
    aiRec: {
      recommendation: "exit_risk",
      confidence: 0.68,
      evidence: [
        "Performance score declined 22pts over 90 days (67→45)",
        "3 consecutive missed deadlines in monthly close process",
        "Consistency index of 41 — 30pts below Finance dept average",
        "Peer rating of 2.8 flagged in 360 feedback for reliability issues",
        "Formal support plan discussion in progress with HR and Finance Director",
      ],
    },
  },
];
