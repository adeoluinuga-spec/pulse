"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bell,
  CalendarPlus,
  Check,
  ChevronDown,
  Plus,
  Send,
  Video,
} from "lucide-react";
import { employees, departments } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Department, Employee, LeaveRequest, Meeting, Task } from "@/types";

type TabKey = "team" | "meetings" | "tasks" | "leave" | "chat" | "escalations";
type TaskFilter = "all" | "mine" | "assigned" | "meetings" | "goals";
type EscalationStatus = "Raised" | "Acknowledged" | "In Progress" | "Resolved";

interface TeamTask extends Task {
  assigneeId?: string;
  source: "From Meeting" | "From Goal" | "Assigned";
  linkedGoal?: string;
}

interface Escalation {
  id: string;
  title: string;
  type: "Operational" | "People" | "Wellbeing" | "General";
  date: string;
  status: EscalationStatus;
  urgency: "Low" | "Medium" | "High" | "Critical";
  anonymous?: boolean;
  employee?: Employee;
}

const tabs: { key: TabKey; label: string }[] = [
  { key: "team", label: "My Team" },
  { key: "meetings", label: "Meetings" },
  { key: "tasks", label: "Tasks" },
  { key: "leave", label: "Leave" },
  { key: "chat", label: "Chat" },
  { key: "escalations", label: "Escalations" },
];

const alerts = [
  { icon: "🔴", title: "Repeated Blocker", tone: "pulse", text: "Monthly updates mention the same delivery dependency twice." },
  { icon: "📉", title: "Goal Trajectory Risk", tone: "amber", text: "One teammate is below 50% on a high-weight goal." },
  { icon: "🌟", title: "Strong Performer", tone: "green", text: "Top contributor has sustained a 4-week improvement streak." },
];

const broadcasts = [
  { sender: "Kemi Adebayo", role: "HR Director", message: "Q2 review calibration starts next week. Please acknowledge the updated timeline.", date: "May 27", type: "Action Required" },
  { sender: "Zenith Ops", role: "Operations", message: "Friday all-hands has moved to 10:00 AM.", date: "May 26", type: "Info" },
];

const chatSeed = [
  { id: "m1", name: "Adeolu Johnson", initials: "AJ", text: "I updated the pipeline notes for tomorrow.", time: "09:14", own: false },
  { id: "m2", name: "Amara Osei", initials: "AO", text: "Great. Please add the blocker summary too.", time: "09:19", own: true },
  { id: "m3", name: "Bolu Adeyemi", initials: "BA", text: "I can join the customer call if useful.", time: "09:22", own: false },
];

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function scoreColor(score: number) {
  if (score >= 75) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

function avgScore(team: Employee[]) {
  return team.length ? Math.round(team.reduce((sum, emp) => sum + emp.performanceScore, 0) / team.length) : 0;
}

function goalAvg(emp: Employee) {
  return Math.round(emp.goals.reduce((sum, goal) => sum + goal.percentComplete, 0) / Math.max(1, emp.goals.length));
}

function statusDot(score: number) {
  return score >= 75 ? "bg-green" : score >= 60 ? "bg-amber" : "bg-red";
}

function Avatar({ employee, size = "md" }: { employee: Employee; size?: "sm" | "md" }) {
  const { profileImages } = useUser();
  const imageUrl = profileImages[employee.id];
  return (
    <div className={clsx("flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white", size === "sm" ? "h-8 w-8" : "h-10 w-10")} style={{ backgroundColor: employee.avatarColor }}>
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : employee.initials}
    </div>
  );
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/45" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-h-[88vh] max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </>
  );
}

export default function DashboardTeamPage() {
  const { user } = useUser();
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [active, setActive] = useState<TabKey>("team");
  const [selectedMember, setSelectedMember] = useState<Employee | null>(null);
  const [trainingMember, setTrainingMember] = useState<Employee | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [teamSummary, setTeamSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState<Meeting | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [tasks, setTasks] = useState<TeamTask[]>(() => user.tasks.map((task, index) => ({ ...task, source: index % 2 ? "From Goal" : "Assigned", assigneeId: index % 3 === 0 ? user.id : undefined, linkedGoal: user.goals[index % user.goals.length]?.name })));
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskForm, setTaskForm] = useState(false);
  const [leaveSheet, setLeaveSheet] = useState(false);
  const [chatMode, setChatMode] = useState<"team" | "department" | "dm">("team");
  const [messages, setMessages] = useState(chatSeed);
  const [messageDraft, setMessageDraft] = useState("");
  const [dmOpen, setDmOpen] = useState<Employee | null>(null);
  const [escalationSheet, setEscalationSheet] = useState(false);
  const [teamEscalations, setTeamEscalations] = useState<Escalation[]>([]);

  useEffect(() => {
    if (user.peopleResponsibility === "none") {
      const timer = setTimeout(() => router.replace("/dashboard/profile"), 1200);
      return () => clearTimeout(timer);
    }
  }, [router, user.peopleResponsibility]);

  const teamMembers = useMemo(() => {
    const direct = employees.filter((employee) => employee.lineManagerId === user.id);
    const peers = employees.filter((employee) => employee.department === user.department && employee.id !== user.id);
    const pool = direct.length ? direct : peers;
    return pool.slice(0, user.peopleResponsibility === "team_lead" ? 4 : 7);
  }, [user.department, user.id, user.peopleResponsibility]);

  const managersTeams = employees.filter((employee) => employee.peopleResponsibility === "manager" && employee.id !== user.id).slice(0, 3);
  const pendingReviews = teamMembers.filter((employee) => employee.reports.length > 0).slice(0, 4);
  const riskCount = teamMembers.filter((employee) => employee.performanceScore < 65).length;
  const unreviewed = Math.max(1, pendingReviews.length - 1);
  const departmentHeads = departments.slice(0, 5);
  const promotionCount = employees.filter((employee) => employee.aiRec.recommendation === "promote").length;
  const pipCount = employees.filter((employee) => employee.aiRec.recommendation === "pip" || employee.aiRec.recommendation === "exit_risk").length;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  async function getTeamSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/ai/team-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerName: user.name,
          teamMembers: teamMembers.map((member) => ({
            name: member.name,
            score: member.performanceScore,
            recentReports: member.reports.slice(0, 2),
            flags: member.aiRec.evidence.slice(0, 2),
          })),
        }),
      });
      const data = await res.json();
      setTeamSummary(data.summary);
      setSummaryOpen(true);
    } finally {
      setSummaryLoading(false);
    }
  }

  function addChat() {
    if (!messageDraft.trim()) return;
    setMessages((prev) => [...prev, { id: `msg-${Date.now()}`, name: user.name, initials: user.initials, text: messageDraft.trim(), time: "Now", own: true }]);
    setMessageDraft("");
  }

  function addTask(title: string, dueDate: string, assigneeId?: string, linkedGoal?: string) {
    setTasks((prev) => [{ id: `task-${Date.now()}`, title, dueDate, priority: "medium", status: "pending", category: "Manual", source: linkedGoal ? "From Goal" : "Assigned", assigneeId, linkedGoal }, ...prev]);
    setTaskForm(false);
    showToast("Task added");
  }

  function raiseEscalation(type: Escalation["type"]) {
    if (type === "Wellbeing") {
      router.push("/dashboard/ai-wellbeing");
      return;
    }
    setTeamEscalations((prev) => [{ id: `esc-${Date.now()}`, title: "New support request", type, urgency: "High", status: "Raised", date: "May 28, 2026", employee: user }, ...prev]);
    setEscalationSheet(false);
    showToast("Your escalation has been logged. You'll be notified of updates.");
  }

  if (user.peopleResponsibility === "none") {
    return <div className="dashboard-page px-4"><Toast message="This section is available when you manage a team." /></div>;
  }

  return (
    <div className="dashboard-page space-y-5">
      {toast && <Toast message={toast} />}
      <section className="px-4">
        <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-none">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActive(tab.key)} className={clsx("min-w-fit flex-1 rounded-md px-3 py-2 text-xs font-bold transition-colors md:text-sm", active === tab.key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {tab.label}{tab.key === "chat" && <span className="ml-1 rounded-full bg-pulse px-1.5 text-[10px] text-white">1</span>}
            </button>
          ))}
        </div>
      </section>

      {active === "team" && (
        <section className="space-y-4 px-4">
          {user.peopleResponsibility === "team_lead" && <TeamLeadView teamMembers={teamMembers} onSelect={setSelectedMember} />}
          {user.peopleResponsibility === "manager" && (
            <ManagerView
              user={user}
              teamMembers={teamMembers}
              riskCount={riskCount}
              unreviewed={unreviewed}
              pendingReviews={pendingReviews}
              expandedMember={expandedMember}
              setExpandedMember={setExpandedMember}
              getTeamSummary={getTeamSummary}
              summaryLoading={summaryLoading}
              summaryOpen={summaryOpen}
              teamSummary={teamSummary}
              showToast={showToast}
              onSuggestTraining={setTrainingMember}
            />
          )}
          {user.peopleResponsibility === "senior_manager" && (
            <>
              <ManagerView user={user} teamMembers={teamMembers} riskCount={riskCount} unreviewed={unreviewed} pendingReviews={pendingReviews} expandedMember={expandedMember} setExpandedMember={setExpandedMember} getTeamSummary={getTeamSummary} summaryLoading={summaryLoading} summaryOpen={summaryOpen} teamSummary={teamSummary} showToast={showToast} onSuggestTraining={setTrainingMember} />
              <ManagersTeams managers={managersTeams} />
            </>
          )}
          {user.peopleResponsibility === "director" && (
            <DirectorView departments={departmentHeads} promotionCount={promotionCount} pipCount={pipCount} showToast={showToast} />
          )}
        </section>
      )}

      {active === "meetings" && <MeetingsView meetings={user.meetings} showToast={showToast} onNotes={setMeetingNotes} />}
      {active === "tasks" && <TasksView tasks={tasks} setTasks={setTasks} filter={taskFilter} setFilter={setTaskFilter} showCompleted={showCompleted} setShowCompleted={setShowCompleted} onAdd={() => setTaskForm(true)} teamMembers={teamMembers} />}
      {active === "leave" && <LeaveView user={user} teamMembers={teamMembers} onSubmit={() => { setLeaveSheet(false); showToast(`Leave request submitted. ${employees.find((e) => e.id === user.lineManagerId)?.name ?? "Your manager"} will be notified.`); }} onOpen={() => setLeaveSheet(true)} showToast={showToast} />}
      {active === "chat" && <ChatView user={user} teamMembers={teamMembers} mode={chatMode} setMode={setChatMode} messages={messages} draft={messageDraft} setDraft={setMessageDraft} send={addChat} showToast={showToast} dmOpen={dmOpen} setDmOpen={setDmOpen} />}
      {active === "escalations" && <EscalationsView user={user} escalations={teamEscalations} onRaise={() => setEscalationSheet(true)} setEscalations={setTeamEscalations} />}

      {selectedMember && (
        <BottomSheet onClose={() => setSelectedMember(null)}>
          <MemberProfile member={selectedMember} onSuggestTraining={() => setTrainingMember(selectedMember)} showToast={showToast} />
        </BottomSheet>
      )}
      {trainingMember && (
        <BottomSheet onClose={() => setTrainingMember(null)}>
          <TrainingSuggestSheet member={trainingMember} onClose={() => setTrainingMember(null)} showToast={showToast} />
        </BottomSheet>
      )}
      {meetingNotes && <MeetingNotesSheet meeting={meetingNotes} teamMembers={teamMembers} onClose={() => setMeetingNotes(null)} onSave={() => { setMeetingNotes(null); showToast("Meeting notes saved"); }} />}
      {taskForm && <TaskForm teamMembers={teamMembers} goals={user.goals} onClose={() => setTaskForm(false)} onSave={addTask} />}
      {leaveSheet && <LeaveSheet user={user} teamMembers={teamMembers} onClose={() => setLeaveSheet(false)} onSubmit={() => { setLeaveSheet(false); showToast("Leave request submitted. Your manager will be notified."); }} />}
      {escalationSheet && <EscalationSheet onClose={() => setEscalationSheet(false)} onSubmit={raiseEscalation} />}
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return <div className="fixed left-1/2 top-[118px] z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-xl md:top-20">{message}</div>;
}

function TeamLeadView({ teamMembers, onSelect }: { teamMembers: Employee[]; onSelect: (member: Employee) => void }) {
  return (
    <div className="space-y-3">
      {teamMembers.map((member) => (
        <button key={member.id} onClick={() => onSelect(member)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left">
          <Avatar employee={member} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-ink">{member.name}</p>
              <span className={clsx("h-2 w-2 rounded-full", statusDot(goalAvg(member)))} />
            </div>
            <p className="text-xs text-muted">{member.role} · {goalAvg(member)}% tasks · Last check-in {fmt(member.reports[0]?.date ?? "2026-05-19")}</p>
          </div>
          <span className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">View profile</span>
        </button>
      ))}
    </div>
  );
}

function recognitionBadges(member: Employee) {
  const badges = [];
  if (member.performanceScore >= 85) badges.push("Top Contributor");
  if (member.weekStreak >= 4) badges.push("Consistency Streak");
  if (member.aiRec.recommendation === "promote") badges.push("Promotion Ready");
  if (member.peerRating >= 4.4) badges.push("Collaboration Champion");
  return badges.length ? badges : ["Strong Alignment"];
}

function MemberProfile({ member, onSuggestTraining, showToast }: { member: Employee; onSuggestTraining: () => void; showToast: (message: string) => void }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Avatar employee={member} />
        <div className="min-w-0 flex-1">
          <h2 className="font-syne text-lg font-bold text-ink">{member.name}</h2>
          <p className="text-sm text-muted">{member.role} · {member.department}</p>
        </div>
        <span className={clsx("font-syne text-2xl font-bold", scoreColor(member.performanceScore))}>{member.performanceScore}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat small label="Goal completion" value={`${goalAvg(member)}%`} />
        <Stat small label="Consistency" value={member.consistencyIndex} />
        <Stat small label="Peer energy" value={member.peerRating.toFixed(1)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {recognitionBadges(member).map((badge) => <span key={badge} className="rounded-full bg-green-soft px-3 py-1 text-[10px] font-bold text-green">{badge}</span>)}
      </div>
      <div className="mt-4 rounded-xl border border-border bg-paper p-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Pulse noticed</p>
        <p className="mt-2 text-sm text-ink">Trajectory suggests {member.name.split(" ")[0]} would benefit most from focused support on {member.goals.find((goal) => goal.status === "at_risk" || goal.status === "behind")?.name ?? "their highest-weight goal"}.</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onSuggestTraining} className="flex-1 rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Suggest Training</button>
        <button onClick={() => showToast(`Collaboration request sent to ${member.name}`)} className="flex-1 rounded-lg border border-border px-4 py-3 text-sm font-bold text-muted">Request Collaboration</button>
      </div>
    </div>
  );
}

function TrainingSuggestSheet({ member, onClose, showToast }: { member: Employee; onClose: () => void; showToast: (message: string) => void }) {
  const [course, setCourse] = useState(member.trainingSuggestions[0]?.title ?? "Goal Delivery Essentials");
  const [note, setNote] = useState("");
  return (
    <div>
      <h2 className="font-syne text-lg font-bold text-ink">Suggest training for {member.name}</h2>
      <p className="mt-2 text-sm text-muted">Developmental recommendations help people grow without making support feel punitive.</p>
      <select value={course} onChange={(event) => setCourse(event.target.value)} className="mt-4 w-full rounded-lg border border-border px-3 py-3 text-base">
        {member.trainingSuggestions.map((item) => <option key={item.id}>{item.title}</option>)}
        <option>Report Consistency Masterclass</option>
        <option>Data-Driven Decision Making</option>
      </select>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for the employee" className="mt-3 min-h-24 w-full rounded-lg border border-border px-3 py-2 text-base" />
      <button onClick={() => { showToast(`${course} suggested to ${member.name}`); onClose(); }} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Send Recommendation</button>
    </div>
  );
}

function ManagerView({
  user,
  teamMembers,
  riskCount,
  unreviewed,
  pendingReviews,
  expandedMember,
  setExpandedMember,
  getTeamSummary,
  summaryLoading,
  summaryOpen,
  teamSummary,
  showToast,
  onSuggestTraining,
}: {
  user: Employee;
  teamMembers: Employee[];
  riskCount: number;
  unreviewed: number;
  pendingReviews: Employee[];
  expandedMember: string | null;
  setExpandedMember: (id: string | null) => void;
  getTeamSummary: () => void;
  summaryLoading: boolean;
  summaryOpen: boolean;
  teamSummary: string;
  showToast: (message: string) => void;
  onSuggestTraining: (member: Employee) => void;
}) {
  const score = avgScore(teamMembers);
  return (
    <>
      <div className="rounded-[20px] bg-ink p-5 text-white">
        <p className="text-sm text-white/40">{user.team}</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-5xl font-bold" style={{ fontFamily: "var(--font-syne)" }}>{score}%</span>
          <span className="pb-2 text-sm font-bold text-green">↑ +3 pts</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/55">{teamMembers.length} direct reports</span>
          <span className="rounded-full bg-pulse/20 px-2.5 py-1 text-xs font-bold text-pulse">{unreviewed} pending reports</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Reports reviewed" value={Math.max(1, teamMembers.length - unreviewed)} />
        <Stat label="Risk flags" value={riskCount} accent />
        <Stat label="Goal completion" value={`${Math.round(teamMembers.reduce((s, e) => s + goalAvg(e), 0) / Math.max(1, teamMembers.length))}%`} />
        <Stat label="Unreviewed" value={unreviewed} />
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">AI Alerts</p>
        {alerts.map((alert, index) => <AlertCard key={alert.title} alert={alert} employee={teamMembers[index % Math.max(1, teamMembers.length)]} />)}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Team Performance</p>
        {teamMembers.map((member) => {
          const open = expandedMember === member.id;
          return (
            <div key={member.id} className="rounded-lg border border-border bg-card">
              <button onClick={() => setExpandedMember(open ? null : member.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <Avatar employee={member} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{member.name} {member.badge === "Strong Performer" ? "🌟" : member.badge === "At Risk" ? "🔴" : ""}</p>
                  <p className="truncate text-xs text-muted">{member.role}</p>
                </div>
                <span className={clsx("text-sm font-bold", scoreColor(member.performanceScore))}>{member.performanceScore}%</span>
                <ChevronDown size={15} className={clsx("text-muted transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="border-t border-border p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat small label="Goal %" value={`${goalAvg(member)}%`} />
                    <Stat small label="Last report" value={fmt(member.reports[0]?.date ?? "2026-05-19").slice(0, 6)} />
                    <Stat small label="Consistency" value={member.consistencyIndex} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {["View Report", "Schedule 1:1", "Message"].map((action) => <button key={action} onClick={() => showToast(`${action} opened`)} className="rounded-lg border border-border px-2 py-2 text-xs font-bold text-muted">{action}</button>)}
                    <button onClick={() => onSuggestTraining(member)} className="rounded-lg bg-pulse px-2 py-2 text-xs font-bold text-white">Suggest Training</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Pending Reviews</p>
        {pendingReviews.map((member) => (
          <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Avatar employee={member} size="sm" />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{member.name}</p><p className="text-xs text-muted">{member.reports[0]?.type ?? "weekly"} · {fmt(member.reports[0]?.date ?? "2026-05-19")}</p></div>
            <button onClick={() => showToast("Review opened")} className="rounded-lg bg-pulse px-3 py-2 text-xs font-bold text-white">Review</button>
          </div>
        ))}
      </div>
      <div>
        <button onClick={getTeamSummary} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white">
          {summaryLoading ? "Loading..." : "✦ Get AI Team Summary"}
        </button>
        {summaryOpen && <div className="mt-3 rounded-[20px] bg-ink p-5 text-sm leading-relaxed text-white/70">{teamSummary}</div>}
      </div>
    </>
  );
}

function DirectorView({ departments, promotionCount, pipCount, showToast }: { departments: Department[]; promotionCount: number; pipCount: number; showToast: (message: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Promotion pipeline" value={promotionCount} />
        <Stat label="PIP count" value={pipCount} accent />
        <button onClick={() => showToast("Executive briefing requested")} className="rounded-[20px] bg-ink p-4 text-left text-white"><p className="text-sm font-bold">Get Executive Briefing</p><p className="mt-1 text-xs text-white/45">AI summary for department health</p></button>
      </div>
      {departments.map((dept) => <div key={dept.id} className="rounded-lg border border-border bg-card p-4"><div className="flex justify-between"><p className="font-bold text-ink">{dept.name}</p><p className="font-bold text-pulse">{dept.avgScore}</p></div><p className="mt-1 text-xs text-muted">{dept.headCount} staff · {dept.head ?? "No head assigned"}</p></div>)}
      <div className="rounded-lg border border-amber/20 bg-amber-soft p-4 text-sm text-amber">Cross-department alert: Finance and Support have the lowest report compliance this week.</div>
    </div>
  );
}

function ManagersTeams({ managers }: { managers: Employee[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Your Managers&apos; Teams</p>
      {managers.map((manager) => {
        const team = employees.filter((employee) => employee.lineManagerId === manager.id);
        return <details key={manager.id} className="rounded-lg border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-bold text-ink">{manager.name} · {team.length || 3} people</summary><div className="mt-3 grid gap-2"><Stat small label="Team avg" value={`${avgScore(team.length ? team : employees.slice(0, 3))}%`} /><Stat small label="Flags" value={team.filter((e) => e.performanceScore < 65).length} /><p className="text-xs text-muted">Manager Performance: reviews mostly on time, team goals tracking steadily.</p></div></details>;
      })}
    </div>
  );
}

function MeetingsView({ meetings, showToast, onNotes }: { meetings: Meeting[]; showToast: (message: string) => void; onNotes: (meeting: Meeting) => void }) {
  return <section className="space-y-4 px-4">{["Today", "This Week", "Later"].map((group, groupIndex) => <div key={group} className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-widest text-muted">{group}</p>{meetings.slice(groupIndex, groupIndex + 2).map((meeting) => <MeetingCard key={`${group}-${meeting.id}`} meeting={meeting} showToast={showToast} onNotes={onNotes} />)}</div>)}</section>;
}

function MeetingCard({ meeting, showToast, onNotes }: { meeting: Meeting; showToast: (message: string) => void; onNotes: (meeting: Meeting) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-lg border border-border bg-card p-4"><h3 className="font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>{meeting.title}</h3><p className="mt-1 text-xs text-muted">{fmt(meeting.date)} · {meeting.time}</p><div className="mt-3 flex items-center gap-2"><div className="flex -space-x-2">{meeting.attendees.slice(0, 3).map((name) => <div key={name} className="flex h-7 w-7 items-center justify-center rounded-full border border-card bg-ink text-[10px] font-bold text-white">{name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>)}</div>{meeting.attendees.length > 3 && <span className="text-xs text-muted">+{meeting.attendees.length - 3}</span>}<span className="ml-auto flex items-center gap-1 text-xs text-muted">{meeting.location?.includes("Meet") ? <Video size={13} /> : null}{meeting.location ?? "Video call"}</span></div><button onClick={() => setOpen(!open)} className="mt-3 text-left text-sm text-muted line-clamp-2">Agenda: review progress, blockers, and next actions for the cycle.</button>{open && <p className="mt-2 text-sm text-muted">Prepare updates on active goals and any help needed before the next checkpoint.</p>}<div className="mt-3 flex gap-2"><button onClick={() => showToast("Calendar event added")} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted"><CalendarPlus size={13} /> Add to Calendar</button><button onClick={() => onNotes(meeting)} className="rounded-lg bg-pulse px-3 py-2 text-xs font-bold text-white">Add Notes</button></div><p className="mt-3 flex items-center gap-1 text-[11px] text-muted"><Bell size={12} /> Reminder set: 1 hour before</p></div>;
}

function TasksView({ tasks, setTasks, filter, setFilter, showCompleted, setShowCompleted, onAdd, teamMembers }: { tasks: TeamTask[]; setTasks: React.Dispatch<React.SetStateAction<TeamTask[]>>; filter: TaskFilter; setFilter: (filter: TaskFilter) => void; showCompleted: boolean; setShowCompleted: (value: boolean) => void; onAdd: () => void; teamMembers: Employee[] }) {
  const filtered = tasks.filter((task) => filter === "all" || (filter === "mine" && !task.assigneeId) || (filter === "assigned" && task.assigneeId) || (filter === "meetings" && task.source === "From Meeting") || (filter === "goals" && task.source === "From Goal"));
  const active = filtered.filter((task) => task.status !== "complete").sort((a) => a.status === "overdue" ? -1 : 1);
  const completed = filtered.filter((task) => task.status === "complete");
  const toggle = (id: string) => setTasks((prev) => prev.map((task) => task.id === id ? { ...task, status: task.status === "complete" ? "pending" : "complete" } : task));
  return <section className="space-y-4 px-4"><div className="flex gap-2 overflow-x-auto scrollbar-none">{(["all", "mine", "assigned", "meetings", "goals"] as TaskFilter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={clsx("min-w-fit rounded-full border px-3 py-1.5 text-xs font-bold", filter === item ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-card text-muted")}>{item === "all" ? "All" : item === "mine" ? "My Tasks" : item === "assigned" ? "Assigned by Me" : item === "meetings" ? "From Meetings" : "Linked to Goals"}</button>)}</div>{active.map((task) => <TaskCard key={task.id} task={task} toggle={toggle} teamMembers={teamMembers} />)}<button onClick={() => setShowCompleted(!showCompleted)} className="text-sm font-bold text-muted">Completed tasks ({completed.length})</button>{showCompleted && completed.map((task) => <TaskCard key={task.id} task={task} toggle={toggle} teamMembers={teamMembers} />)}<button onClick={onAdd} className="fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-pulse text-white shadow-xl"><Plus /></button></section>;
}

function TaskCard({ task, toggle, teamMembers }: { task: TeamTask; toggle: (id: string) => void; teamMembers: Employee[] }) {
  const assignee = teamMembers.find((member) => member.id === task.assigneeId);
  const overdue = new Date(task.dueDate) < new Date("2026-05-28") && task.status !== "complete";
  return <div className={clsx("rounded-lg border bg-card p-4", overdue ? "border-red border-l-4" : "border-border")}><div className="flex items-start gap-3"><button onClick={() => toggle(task.id)} className={clsx("mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border", task.status === "complete" ? "border-green bg-green text-white" : "border-border")}>{task.status === "complete" && <Check size={12} />}</button><div className="min-w-0 flex-1"><p className={clsx("text-sm font-bold text-ink", task.status === "complete" && "line-through opacity-50")}>{task.title}</p><p className={clsx("mt-1 text-xs", overdue ? "text-red" : "text-muted")}>Due {fmt(task.dueDate)} · {task.source}</p>{task.linkedGoal && <button className="mt-2 rounded-full bg-pulse-soft px-2 py-1 text-[10px] font-bold text-pulse">{task.linkedGoal}</button>}</div>{assignee && <Avatar employee={assignee} size="sm" />}</div></div>;
}

function LeaveView({ user, teamMembers, onOpen, showToast }: { user: Employee; teamMembers: Employee[]; onSubmit: () => void; onOpen: () => void; showToast: (message: string) => void }) {
  const balances = Object.entries(user.leaveBalance);
  return <section className="space-y-4 px-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{balances.map(([type, value]) => <div key={type} className="rounded-lg border border-border bg-card p-4"><p className="text-xs font-bold uppercase text-muted">{type}</p><p className="mt-2 text-3xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>{value.remaining}</p><p className="text-xs text-muted">{value.used}/{value.total} used</p></div>)}</div><button onClick={onOpen} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Submit Leave</button><div className="rounded-lg border border-border bg-card p-4"><p className="text-sm font-bold text-ink">Leave History</p>{user.leaveHistory.map((leave) => <LeaveRow key={leave.id} leave={leave} showToast={showToast} />)}</div><div className="rounded-lg border border-border bg-card p-4"><p className="text-sm font-bold text-ink">Team Leave Calendar</p><div className="mt-3 grid grid-cols-7 gap-1">{Array.from({ length: 30 }, (_, i) => <button key={i} onClick={() => i % 6 === 0 && showToast(`${teamMembers[0]?.name ?? "A teammate"} is off on this day`)} className="h-10 rounded bg-paper text-xs text-muted">{i + 1}{i % 6 === 0 && <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-pulse" />}</button>)}</div></div></section>;
}

function LeaveRow({ leave, showToast }: { leave: LeaveRequest; showToast: (message: string) => void }) {
  return <button onClick={() => leave.status === "rejected" && showToast(leave.reason)} className="mt-3 flex w-full justify-between rounded-lg bg-paper px-3 py-2 text-left"><span className="text-sm font-semibold text-ink">{leave.type} · {leave.days} days</span><span className="text-xs font-bold text-muted">{leave.status}</span></button>;
}

function ChatView({ user, teamMembers, mode, setMode, messages, draft, setDraft, send, showToast, dmOpen, setDmOpen }: { user: Employee; teamMembers: Employee[]; mode: "team" | "department" | "dm"; setMode: (mode: "team" | "department" | "dm") => void; messages: typeof chatSeed; draft: string; setDraft: (value: string) => void; send: () => void; showToast: (message: string) => void; dmOpen: Employee | null; setDmOpen: (employee: Employee | null) => void }) {
  return <section className="space-y-4 px-4"><div className="space-y-2">{broadcasts.map((item) => <div key={item.message} className="rounded-lg border border-border bg-card p-3"><div className="flex justify-between"><p className="text-sm font-bold text-ink">{item.sender} · {item.role}</p><span className={clsx("rounded-full px-2 py-1 text-[10px] font-bold", item.type === "Action Required" ? "bg-pulse-soft text-pulse" : "bg-border text-muted")}>{item.type}</span></div><p className="mt-2 text-sm text-muted">{item.message}</p>{item.type === "Action Required" && <button onClick={() => showToast("Broadcast acknowledged")} className="mt-2 rounded-lg bg-pulse px-3 py-1.5 text-xs font-bold text-white">Acknowledge</button>}</div>)}</div><div className="flex rounded-lg border border-border bg-card p-1">{(["team", "department", "dm"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={clsx("flex-1 rounded-md py-2 text-xs font-bold", mode === item ? "bg-ink text-white" : "text-muted")}>{item === "team" ? "Team" : item === "department" ? "Department" : "Direct Messages"}</button>)}</div>{mode === "dm" && !dmOpen ? <div className="space-y-2"><button onClick={() => showToast("Employee search ready")} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">New Message</button>{teamMembers.map((member) => <button key={member.id} onClick={() => setDmOpen(member)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left"><Avatar employee={member} /><div><p className="text-sm font-bold text-ink">{member.name}</p><p className="text-xs text-muted">Last message preview...</p></div></button>)}</div> : <ChatThread user={user} messages={messages} draft={draft} setDraft={setDraft} send={send} showToast={showToast} readOnly={mode === "department" && user.cadre === "entry"} title={dmOpen ? dmOpen.name : mode === "department" ? `${user.department} Channel` : `${user.team} Chat`} />}</section>;
}

function ChatThread({ messages, draft, setDraft, send, showToast, readOnly, title }: { user: Employee; messages: typeof chatSeed; draft: string; setDraft: (value: string) => void; send: () => void; showToast: (message: string) => void; readOnly?: boolean; title: string }) {
  return <div className="rounded-lg border border-border bg-paper p-3"><p className="mb-3 text-sm font-bold text-ink">{title}</p><div className="space-y-2">{messages.map((msg) => <div key={msg.id} className={clsx("flex", msg.own ? "justify-end" : "justify-start")}><div className={clsx("max-w-[78%] rounded-2xl px-3 py-2 text-sm", msg.own ? "bg-pulse text-white" : "bg-card text-ink")}><p className="text-[10px] font-bold opacity-70">{msg.name} · {msg.time}</p><p>{msg.text}</p></div></div>)}</div>{readOnly ? <p className="mt-3 text-xs text-muted">Department channel is read-only for entry cadre.</p> : <div className="mt-3 flex gap-2"><button onClick={() => showToast("File sharing coming soon")} className="rounded-lg border border-border px-3 text-muted">+</button><input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-pulse" /><button onClick={send} className="rounded-lg bg-pulse px-3 text-white"><Send size={16} /></button></div>}</div>;
}

function EscalationsView({ user, escalations, onRaise, setEscalations }: { user: Employee; escalations: Escalation[]; onRaise: () => void; setEscalations: React.Dispatch<React.SetStateAction<Escalation[]>> }) {
  const mine: Escalation[] = [{ id: "e1", title: "CRM access delay", type: "Operational", urgency: "Medium", date: "May 12, 2026", status: "In Progress", employee: user }, { id: "e2", title: "Workload support", type: "General", urgency: "Low", date: "Apr 22, 2026", status: "Resolved", employee: user }];
  return <section className="space-y-4 px-4"><button onClick={onRaise} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Raise Escalation</button><div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-widest text-muted">My Escalations</p>{mine.map((item) => <EscalationCard key={item.id} item={item} />)}</div>{user.peopleResponsibility !== "team_lead" && <div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-widest text-muted">Team Escalations</p>{escalations.concat([{ id: "te1", title: "Critical client dependency", type: "Operational", urgency: "Critical", date: "May 27, 2026", status: "Raised", employee: employees[1] }]).map((item) => <EscalationCard key={item.id} item={item} manager setEscalations={setEscalations} />)}</div>}</section>;
}

function EscalationCard({ item, manager, setEscalations }: { item: Escalation; manager?: boolean; setEscalations?: React.Dispatch<React.SetStateAction<Escalation[]>> }) {
  return <div className={clsx("rounded-lg border bg-card p-4", item.urgency === "Critical" ? "animate-pulse border-red" : "border-border")}><div className="flex items-start gap-3">{manager && !item.anonymous && item.employee && <Avatar employee={item.employee} size="sm" />}<div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{item.title}</p><p className="text-xs text-muted">{item.type} · {item.date} · {item.urgency}</p><Timeline status={item.status} /></div></div>{manager && <div className="mt-3 flex gap-2"><button onClick={() => setEscalations?.((prev) => prev.map((esc) => esc.id === item.id ? { ...esc, status: "Acknowledged" } : esc))} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">Acknowledge</button><button onClick={() => setEscalations?.((prev) => prev.map((esc) => esc.id === item.id ? { ...esc, status: "In Progress" } : esc))} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Update Status</button></div>}</div>;
}

function Timeline({ status }: { status: EscalationStatus }) {
  const steps: EscalationStatus[] = ["Raised", "Acknowledged", "In Progress", "Resolved"];
  const index = steps.indexOf(status);
  return <div className="mt-3 flex gap-1">{steps.map((step, i) => <div key={step} className={clsx("h-1.5 flex-1 rounded-full", i <= index ? "bg-pulse" : "bg-border")} />)}</div>;
}

function Stat({ label, value, accent, small }: { label: string; value: string | number; accent?: boolean; small?: boolean }) {
  return <div className={clsx("rounded-lg border p-3", accent ? "border-transparent bg-pulse text-white" : "border-border bg-card")}><p className={clsx("font-bold leading-none", small ? "text-lg" : "text-2xl")} style={{ fontFamily: "var(--font-syne)" }}>{value}</p><p className={clsx("mt-1 text-[10px] font-bold uppercase tracking-widest", accent ? "text-white/60" : "text-muted")}>{label}</p></div>;
}

function AlertCard({ alert, employee }: { alert: { icon: string; title: string; tone: string; text: string }; employee?: Employee }) {
  const cls = alert.tone === "green" ? "border-green/20 bg-green-soft" : alert.tone === "amber" ? "border-amber/20 bg-amber-soft" : "border-pulse/20 bg-pulse-soft";
  return <div className={clsx("flex gap-3 rounded-lg border p-3", cls)}><span>{alert.icon}</span><div><p className="text-sm font-bold text-ink">{employee?.name ?? "Team"} · {alert.title}</p><p className="line-clamp-1 text-xs text-muted">{alert.text}</p></div></div>;
}

function MeetingNotesSheet({ meeting, teamMembers, onClose, onSave }: { meeting: Meeting; teamMembers: Employee[]; onClose: () => void; onSave: () => void }) {
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">{meeting.title}</h2><textarea className="mt-4 min-h-28 w-full rounded-lg border border-border bg-paper px-3 py-2 text-base outline-none focus:border-pulse" placeholder="Meeting notes" /><div className="mt-3 rounded-lg border border-border p-3"><p className="text-sm font-bold">Add action item</p><input className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm" placeholder="Title" /><select className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm">{teamMembers.map((m) => <option key={m.id}>{m.name}</option>)}</select></div><button onClick={onSave} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Save</button></BottomSheet>;
}

function TaskForm({ teamMembers, goals, onClose, onSave }: { teamMembers: Employee[]; goals: Employee["goals"]; onClose: () => void; onSave: (title: string, dueDate: string, assigneeId?: string, linkedGoal?: string) => void }) {
  const [title, setTitle] = useState(""); const [due, setDue] = useState("2026-06-05"); const [assignee, setAssignee] = useState(""); const [goal, setGoal] = useState("");
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Add Task</h2><input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-base" placeholder="Task title" /><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-base" /><select value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-base"><option value="">Link to goal optional</option>{goals.map((g) => <option key={g.id}>{g.name}</option>)}</select><select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-base"><option value="">Assign to me</option>{teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button disabled={!title.trim()} onClick={() => onSave(title, due, assignee || undefined, goal || undefined)} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Save Task</button></BottomSheet>;
}

function LeaveSheet({ user, teamMembers, onClose, onSubmit }: { user: Employee; teamMembers: Employee[]; onClose: () => void; onSubmit: () => void }) {
  const [type, setType] = useState("annual"); const [handover, setHandover] = useState(true);
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Submit Leave</h2><div className="mt-4 flex gap-2">{Object.keys(user.leaveBalance).map((item) => <button key={item} onClick={() => setType(item)} className={clsx("rounded-full border px-3 py-2 text-xs font-bold", type === item ? "border-pulse bg-pulse-soft text-pulse" : "border-border text-muted")}>{item}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><input type="date" className="rounded-lg border border-border px-3 py-2 text-base" /><input type="date" className="rounded-lg border border-border px-3 py-2 text-base" /></div><p className="mt-3 text-xs text-muted">Team members already on leave: {teamMembers.slice(0, 2).map((m) => m.name).join(", ") || "None"}</p><textarea placeholder="Note" className="mt-3 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-base" /><label className="mt-3 flex items-center gap-2 text-sm font-bold text-ink"><input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} /> Create handover?</label>{handover && <div className="mt-3 space-y-2">{user.tasks.slice(0, 3).map((task) => <div key={task.id} className="rounded-lg bg-paper p-3"><p className="text-sm font-semibold">{task.title}</p><select className="mt-2 w-full rounded border border-border px-2 py-1 text-sm">{teamMembers.map((m) => <option key={m.id}>{m.name}</option>)}</select></div>)}</div>}<button onClick={onSubmit} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Submit Leave</button></BottomSheet>;
}

function EscalationSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (type: Escalation["type"]) => void }) {
  const [type, setType] = useState<Escalation["type"]>("Operational");
  return <BottomSheet onClose={onClose}><h2 className="text-lg font-bold text-ink">Raise Escalation</h2><input className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-base" placeholder="Title" /><div className="mt-3 flex flex-wrap gap-2">{(["Operational", "People", "Wellbeing", "General"] as Escalation["type"][]).map((item) => <button key={item} onClick={() => setType(item)} className={clsx("rounded-full border px-3 py-2 text-xs font-bold", type === item ? "border-pulse bg-pulse-soft text-pulse" : "border-border text-muted")}>{item}</button>)}</div><textarea className="mt-3 min-h-28 w-full rounded-lg border border-border px-3 py-2 text-base" placeholder="Description" /><select className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-base"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select>{type === "People" && <label className="mt-3 flex items-center gap-2 text-sm text-muted"><input type="checkbox" /> Raise anonymously — your name won&apos;t be shown to your manager</label>}<button onClick={() => onSubmit(type)} className="mt-4 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Submit</button></BottomSheet>;
}
