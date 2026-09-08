// ─── Scalar unions ────────────────────────────────────────────────────────────

export type Cadre = "entry" | "mid" | "senior" | "executive";
export type PeopleResponsibility =
  | "none"
  | "team_lead"
  | "manager"
  | "senior_manager"
  | "director";
export type PlatformRole =
  | "standard"
  | "hr_admin"
  | "executive_view"
  | "super_admin";
export type Badge =
  | "Strong Performer"
  | "Good Standing"
  | "Needs Improvement"
  | "At Risk";
export type AppraisalRec = "promote" | "good_standing" | "pip" | "exit_risk";
export type GoalType = "org" | "dept" | "team" | "individual";
export type GoalStatus = "on_track" | "at_risk" | "behind" | "completed";
export type Mood = "energised" | "good" | "okay" | "drained";
export type DocStatus = "submitted" | "verified" | "pending";
export type TaskStatus = "complete" | "pending" | "overdue";
export type MeetingType =
  | "1:1"
  | "team"
  | "performance_review"
  | "all_hands";
export type NotificationType =
  | "info"
  | "warning"
  | "success"
  | "action_required"
  | "assessment_cycle_launched"
  | "assessment_participant"
  | "assessment_reminder";
export type Priority = "high" | "medium" | "low";
export type TrendDir = "up" | "down" | "flat";
export type EmploymentType = "full_time" | "contract" | "part_time";
export type RequestStatus = "approved" | "pending" | "rejected";

// ─── Goal ─────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  description?: string;
  type: GoalType;
  status: GoalStatus;
  percentComplete: number;
  dueDate: string;
  weight: number;
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

export interface KPI {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  weight: number;
  trend: TrendDir;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface ReportMetric {
  metric: string;
  value: string | number;
  unit?: string;
}

export interface Report {
  id: string;
  date: string;
  type: "weekly" | "monthly";
  qualitative: string;
  metrics: ReportMetric[];
  mood: Mood;
  aiSummary: string;
}

// ─── Appraisal ────────────────────────────────────────────────────────────────

export interface AppraisalComponent {
  id: string;
  name: string;
  weight: number;
  score: number;
  status: "completed" | "pending";
}

// ─── Training ─────────────────────────────────────────────────────────────────

export interface Training {
  id: string;
  title: string;
  provider: string;
  reason: string;
  durationHours: number;
  priority: Priority;
  url?: string;
}

// ─── Wellbeing ────────────────────────────────────────────────────────────────

export interface WellbeingEntry {
  date: string;
  mood: Mood;
  note?: string;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  name: string;
  type: string;
  status: DocStatus;
  uploadDate: string;
  size?: string;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export interface LeaveAllowance {
  total: number;
  used: number;
  remaining: number;
}

export interface LeaveBalance {
  annual: LeaveAllowance;
  sick: LeaveAllowance;
  compassionate: LeaveAllowance;
  maternity?: LeaveAllowance;
  paternity?: LeaveAllowance;
}

export interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: RequestStatus;
  reason: string;
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number; // minutes
  type: MeetingType;
  attendees: string[];
  location?: string;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  category: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

// ─── Compensation ─────────────────────────────────────────────────────────────

export interface Allowance {
  name: string;
  amount: number;
}

export interface BonusTier {
  scoreThreshold: number;
  bonusAmount: number;
}

export interface Compensation {
  basic: number;
  housing: number;
  transport: number;
  medical: number;
  otherAllowances: Allowance[];
  totalGross: number;
  bonusStructure: BonusTier[];
}

// ─── Band ─────────────────────────────────────────────────────────────────────

export interface Band {
  current: string;
  next: string;
  requirements: string[];
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  homeAddress: string;
  department: string;
  team: string;
  lineManagerId: string | null;
  cadre: Cadre;
  peopleResponsibility: PeopleResponsibility;
  platformRole: PlatformRole;
  avatarColor: string;
  joinDate: string;
  employmentType: EmploymentType;
  band: Band;
  compensation: Compensation;
  role: string;
  performanceScore: number;
  consistencyIndex: number;
  peerRating: number;
  weekStreak: number;
  badge: Badge;
  aiRec: {
    recommendation: AppraisalRec;
    confidence: number;
    evidence: string[];
  };
  goals: Goal[];
  kpis: KPI[];
  reports: Report[];
  appraisalComponents: AppraisalComponent[];
  trainingSuggestions: Training[];
  wellbeingHistory: WellbeingEntry[];
  documents: Document[];
  leaveBalance: LeaveBalance;
  leaveHistory: LeaveRequest[];
  meetings: Meeting[];
  tasks: Task[];
  notifications: Notification[];
}

// ─── Department ───────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  headCount: number;
  avgScore: number;
  head?: string;
}

// ─── Organisation ─────────────────────────────────────────────────────────────

export interface Organisation {
  id: string;
  name: string;
  staffCount: number;
  currency: string;
  currencySymbol: string;
  appraisalCadence: string;
  currentCycle: string;
  departmentCount: number;
}
