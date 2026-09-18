/** Shapes returned by /api/team/* and a small fetch helper that surfaces the server's message. */

export type Person = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  team: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  initials: string;
};

export type Member = Person & {
  lineManagerId: string | null;
  lineManagerName: string | null;
  isDirect: boolean;
  peopleResponsibility: string | null;
  goals: { count: number; averageProgress: number | null; atRisk: number; completed: number };
  reports: { count: number; last: { submittedAt: string | null; status: string | null; type: string | null } | null; awaitingReview: number };
  tasks: { open: number; overdue: number };
};

export type TeamResponse = { viewer: Person; wholeLine: boolean; members: Member[]; directCount: number };

export type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  complete: boolean;
  completedAt: string | null;
  source: string | null;
  linkedGoal: { id: string; title: string | null } | null;
  assignee: Person | null;
  setBy: Person | null;
  mine: boolean;
};

export type TasksResponse = { tasks: Task[]; goals: Array<{ id: string; title: string }>; assignable: Person[] };

export type Escalation = {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  urgency: string | null;
  status: string;
  anonymous: boolean;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  raisedBy: Person | null;
  assignedTo: Person | null;
  routedToHr: boolean;
  mine: boolean;
  canProgress: boolean;
};

export type EscalationsResponse = { raised: Escalation[]; toHandle: Escalation[]; viewerIsHr: boolean };

export type Channel = { id: string; kind: "team" | "department" | "direct"; label: string };
export type ChatIndex = {
  viewerId: string;
  channels: Channel[];
  direct: Array<{ id: string; with: Person | null; last: { body: string; at: string; mine: boolean } }>;
  people: Array<Person & { channel: string }>;
};
export type Message = { id: string; body: string; at: string; mine: boolean; sender: Pick<Person, "id" | "name" | "initials"> & Partial<Person> };

export class ApiError extends Error {
  errors: string[];
  constructor(message: string, errors: string[] = []) {
    super(message);
    this.errors = errors;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong. Please retry.", body.errors ?? []);
  return body as T;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const label = (value: string | null | undefined) => (value ? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
