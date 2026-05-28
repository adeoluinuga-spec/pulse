"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { employees } from "@/data/mockData";
import { useUser } from "@/context/UserContext";
import type { Mood, Training } from "@/types";

type TabKey = "coach" | "training" | "collaboration" | "wellbeing";
type Workload = "manageable" | "heavy" | "overwhelming";
type Support = "yes" | "somewhat" | "no";
type LearningStatus = "Enrolled" | "Completed";

interface LearningItem {
  id: string;
  title: string;
  status: LearningStatus;
  date: string;
}

interface WellbeingResponse {
  message: string;
  actions: string[];
}

const tabs: { key: TabKey; label: string }[] = [
  { key: "coach", label: "Performance Coach" },
  { key: "training", label: "Training" },
  { key: "collaboration", label: "Collaboration" },
  { key: "wellbeing", label: "Wellbeing" },
];

const moodOptions: { key: Mood; label: string }[] = [
  { key: "drained", label: "😓" },
  { key: "okay", label: "😕" },
  { key: "good", label: "😐" },
  { key: "energised", label: "😊" },
  { key: "energised", label: "🔥" },
];

const workloadOptions: { key: Workload; label: string }[] = [
  { key: "manageable", label: "Manageable" },
  { key: "heavy", label: "Heavy" },
  { key: "overwhelming", label: "Overwhelming" },
];

const supportOptions: { key: Support; label: string }[] = [
  { key: "yes", label: "Yes, definitely" },
  { key: "somewhat", label: "Somewhat" },
  { key: "no", label: "Not really" },
];

const peerHistory = [
  { peer: "Derek Okafor", date: "May 16, 2026", goal: "Customer NPS", status: "Completed" },
  { peer: "Yuki Tanaka", date: "Apr 28, 2026", goal: "Stakeholder Review", status: "Accepted" },
  { peer: "James Kirkland", date: "Apr 12, 2026", goal: "Process Automation", status: "Requested" },
];

function cachedCoach(name: string, score: number, cadre: string) {
  const projected = Math.min(97, score + 4);
  return `Where You Stand\n${name}, you are currently operating at ${score}% with a strong ${cadre} cadence. Your strongest signal is consistent goal delivery, and the next step is making sure every high-weight outcome has clear evidence attached.\n\nTop 2 Priorities Right Now\n1. Protect report consistency by keeping weekly updates measurable and tied to KPIs.\n2. Move the lowest-progress active goal by at least 10 points before the next manager review.\n\nYour Trajectory\nAt your current pace, your end-of-cycle score will be approximately ${projected}%.\n\nWatch Out\nThe biggest risk is letting one delayed goal dilute an otherwise strong performance story.`;
}

function parseProjected(insight: string, fallback: number) {
  const match = insight.match(/approximately\s+(\d+)%/i);
  return match ? Number(match[1]) : fallback;
}

function sectionText(text: string, heading: string) {
  const parts = text.split(/\n\n+/);
  const found = parts.find((part) => part.toLowerCase().startsWith(heading.toLowerCase()));
  return found?.replace(new RegExp(`^${heading}\\s*`, "i"), "").trim() ?? "";
}

function daysBetween(a: number, b: string) {
  return Math.floor((a - new Date(b).getTime()) / 86_400_000);
}

function nextDate(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function levelFor(training: Training) {
  if (training.priority === "high") return "Intermediate";
  if (training.priority === "medium") return "Beginner";
  return "Beginner";
}

function durationFor(training: Training) {
  if (training.durationHours >= 30) return "6 weeks";
  if (training.durationHours >= 15) return "4 weeks";
  return "2 weeks";
}

function evaluateLevel(mood: Mood | null, workload: Workload | null, support: Support | null) {
  const negative = mood === "drained" || workload === "overwhelming" || support === "no";
  const mixed = mood === "okay" || workload === "heavy" || support === "somewhat";
  if (negative) return "negative";
  if (mixed) return "mixed";
  return "positive";
}

function CoachInsightCard({
  insight,
  currentScore,
  projectedScore,
}: {
  insight: string;
  currentScore: number;
  projectedScore: number;
}) {
  const priorities = sectionText(insight, "Top 2 Priorities Right Now") || sectionText(insight, "Top 2 Priorities");
  return (
    <div className="rounded-[20px] bg-ink p-5 text-white">
      <CoachSection title="Where You Stand">{sectionText(insight, "Where You Stand")}</CoachSection>
      <CoachSection title="Top 2 Priorities Right Now">
        <div className="whitespace-pre-line">{priorities}</div>
      </CoachSection>
      <CoachSection title="Your Trajectory">
        <p>{sectionText(insight, "Your Trajectory")}</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>Current {currentScore}%</span>
            <span>Projected {projectedScore}%</span>
            <span>Target 90%</span>
          </div>
          <div className="relative h-2 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-pulse" style={{ width: `${currentScore}%` }} />
            <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-ink bg-green" style={{ left: `${projectedScore}%` }} />
            <div className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-white/50" style={{ left: "90%" }} />
          </div>
        </div>
      </CoachSection>
      <CoachSection title="Watch Out">{sectionText(insight, "Watch Out")}</CoachSection>
    </div>
  );
}

function CoachSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-pulse">✦</span>
        <p className="text-xs font-bold uppercase tracking-widest text-pulse">{title}</p>
      </div>
      <div className="text-sm leading-relaxed text-white/70">{children}</div>
    </div>
  );
}

export default function AiWellbeingPage() {
  const { user } = useUser();
  const [active, setActive] = useState<TabKey>("coach");
  const [todayTime] = useState(() => new Date("2026-05-28T12:00:00").getTime());
  const [toast, setToast] = useState("");
  const [coachInsight, setCoachInsight] = useState(() => cachedCoach(user.name, user.performanceScore, user.cadre));
  const [coachUpdated, setCoachUpdated] = useState("June 1, 2026");
  const [coachLoading, setCoachLoading] = useState(false);
  const [enrolled, setEnrolled] = useState<LearningItem[]>([]);
  const [confetti, setConfetti] = useState(false);
  const [certBanner, setCertBanner] = useState("");
  const [collabHidden, setCollabHidden] = useState(false);
  const [wellbeingMood, setWellbeingMood] = useState<Mood | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [wellbeingNote, setWellbeingNote] = useState("");
  const [wellbeingLoading, setWellbeingLoading] = useState(false);
  const [wellbeingResponse, setWellbeingResponse] = useState<WellbeingResponse | null>(null);

  const projectedScore = parseProjected(coachInsight, Math.min(97, user.performanceScore + 4));
  const lastWellbeing = user.wellbeingHistory[user.wellbeingHistory.length - 1];
  const surveyDue = !lastWellbeing || daysBetween(todayTime, lastWellbeing.date) >= 7;
  const lowGoal = user.goals
    .filter((goal) => goal.status !== "completed")
    .find((goal) => goal.percentComplete < 40 || (goal.percentComplete < 60 && daysBetween(new Date(goal.dueDate).getTime(), "2026-05-28") < 14));
  const suggestedPeer = employees.find((employee) => employee.id !== user.id && employee.department !== user.department) ?? employees[1];
  const resources = [
    { title: "Employee Assistance Programme", body: "Confidential support sessions" },
    { title: "Mindfulness App", body: "Short guided resets for busy weeks" },
    { title: "HR Contact", body: "Ask about workload or support options" },
  ];

  const trainingItems = useMemo(() => user.trainingSuggestions.slice(0, 5), [user.trainingSuggestions]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  async function refreshCoach() {
    setCoachLoading(true);
    try {
      const res = await fetch("/api/ai/coaching-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: user,
          scores: { performanceScore: user.performanceScore, consistencyIndex: user.consistencyIndex, peerRating: user.peerRating },
          goals: user.goals,
          kpis: user.kpis,
          reports: user.reports,
          cadre: user.cadre,
        }),
      });
      const data = await res.json();
      setCoachInsight(data.insight ?? coachInsight);
      setCoachUpdated("Analysis updated just now");
    } catch {
      setCoachInsight(cachedCoach(user.name, user.performanceScore, user.cadre));
      setCoachUpdated("Analysis updated just now");
    } finally {
      setCoachLoading(false);
    }
  }

  function toggleEnroll(training: Training) {
    setEnrolled((prev) => {
      if (prev.some((item) => item.id === training.id)) {
        return prev.filter((item) => item.id !== training.id);
      }
      return [...prev, { id: training.id, title: training.title, status: "Enrolled", date: "May 28, 2026" }];
    });
  }

  function markComplete(id: string) {
    setEnrolled((prev) => prev.map((item) => item.id === id ? { ...item, status: "Completed", date: "May 28, 2026" } : item));
    setConfetti(true);
    setCertBanner("Add your certificate to your profile?");
    setTimeout(() => setConfetti(false), 1200);
  }

  async function submitWellbeing() {
    const escalationLevel = evaluateLevel(wellbeingMood, workload, support);
    setWellbeingLoading(true);
    try {
      const res = await fetch("/api/ai/wellbeing-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: { mood: wellbeingMood, workload, support, note: wellbeingNote },
          history: user.wellbeingHistory,
          escalationLevel,
        }),
      });
      const data = await res.json();
      setWellbeingResponse(data);
    } catch {
      setWellbeingResponse({
        message: "Thanks for checking in. Choose one small support step today and keep the week manageable.",
        actions: ["Clarify priorities", "Take a short reset break"],
      });
    } finally {
      setWellbeingLoading(false);
    }
  }

  return (
    <div className="dashboard-page space-y-5">
      {toast && <div className="fixed left-1/2 top-[118px] z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-xl md:top-20">{toast}</div>}
      {confetti && <div className="fixed inset-x-0 top-28 z-[100] text-center text-4xl">🎉</div>}

      <section className="px-4">
        <div className="flex rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActive(tab.key)} className={clsx("flex-1 rounded-md px-2 py-2 text-xs font-bold transition-colors md:text-sm", active === tab.key ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {active === "coach" && (
        <>
          <section className="px-4">
            <div className="rounded-[20px] bg-ink p-5 text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-pulse" />
                    <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-syne)" }}>Your AI Performance Coach</h1>
                  </div>
                  <p className="mt-2 text-sm text-white/55">Analysis generated monthly. Request a fresh one anytime.</p>
                  <p className="mt-2 text-xs text-white/35">Last generated: {coachUpdated}</p>
                </div>
                <button onClick={refreshCoach} disabled={coachLoading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-pulse px-4 py-2.5 text-sm font-bold text-pulse disabled:opacity-60">
                  {coachLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Refresh Analysis
                </button>
              </div>
            </div>
          </section>
          <section className="px-4">
            <CoachInsightCard insight={coachInsight} currentScore={user.performanceScore} projectedScore={projectedScore} />
          </section>
        </>
      )}

      {active === "training" && (
        <section className="space-y-4 px-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>Recommended for you</h2>
              <p className="mt-1 text-sm text-muted">Based on your goals and next cadre.</p>
            </div>
            <span className="rounded-full bg-pulse-soft px-3 py-1 text-xs font-bold text-pulse">✦ AI-curated</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {trainingItems.map((training) => {
              const isEnrolled = enrolled.some((item) => item.id === training.id);
              return (
                <div key={training.id} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>{training.title}</h3>
                  <p className="mt-1 text-xs font-semibold text-muted">{training.provider}</p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted">{training.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-bold text-muted">{durationFor(training)}</span>
                    <span className="rounded-full bg-green-soft px-2.5 py-1 text-[10px] font-bold text-green">{levelFor(training)}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a href={training.url ?? "https://coursera.org"} target="_blank" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">
                      View Course <ExternalLink size={12} />
                    </a>
                    <button onClick={() => toggleEnroll(training)} className={clsx("flex-1 rounded-lg px-3 py-2 text-xs font-bold", isEnrolled ? "bg-green-soft text-green" : "border border-border text-muted")}>
                      {isEnrolled ? "Enrolled ✓" : "Mark as Enrolled"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-bold text-ink">Learning Tracker</p>
            {certBanner && <div className="mt-3 rounded-lg bg-green-soft px-3 py-2 text-sm font-bold text-green">{certBanner}</div>}
            {enrolled.length ? (
              <div className="mt-3 space-y-2">
                {enrolled.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                      <p className="text-xs text-muted">{item.status} · {item.date}</p>
                    </div>
                    {item.status === "Enrolled" && <button onClick={() => markComplete(item.id)} className="rounded-lg bg-pulse px-3 py-1.5 text-xs font-bold text-white">Mark Complete</button>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Enroll in a course to start tracking your learning here.</p>
            )}
          </div>
        </section>
      )}

      {active === "collaboration" && (
        <section className="space-y-4 px-4">
          <div>
            <h2 className="text-xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>Peer Collaboration</h2>
            <p className="mt-1 text-sm text-muted">Private suggestions based on your goals.</p>
          </div>
          {lowGoal && !collabHidden ? (
            <div className="relative overflow-hidden rounded-[20px] bg-ink p-5 text-white transition-opacity">
              <div className="pointer-events-none absolute right-4 top-4 text-6xl opacity-10">🤝</div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-pulse">Collaboration Suggestion</p>
              <p className="mt-3 text-sm leading-relaxed text-white/70">Your {lowGoal.name} is at {lowGoal.percentComplete}% — a peer session could unlock the next steps.</p>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-white/6 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: suggestedPeer.avatarColor }}>{suggestedPeer.initials}</div>
                <div>
                  <p className="text-sm font-bold text-white">{suggestedPeer.name}</p>
                  <p className="text-xs text-white/45">{suggestedPeer.role}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/45">{suggestedPeer.name.split(" ")[0]} has strong delivery patterns in a different function and can help pressure-test your next milestone plan.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => showToast(`Session request sent to ${suggestedPeer.name}`)} className="flex-1 rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white">Request a session</button>
                <button onClick={() => setCollabHidden(true)} className="rounded-lg border border-white/10 px-4 py-3 text-sm font-bold text-white/55">Dismiss</button>
              </div>
              <p className="mt-3 text-[11px] text-white/30">Only you can see this suggestion.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <CheckCircle size={28} className="mx-auto text-green" />
              <p className="mt-3 text-sm font-bold text-ink">You&apos;re on track with all your goals.</p>
              <p className="mt-1 text-xs text-muted">Check back if you hit a roadblock.</p>
            </div>
          )}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-bold text-ink">Peer Sessions History</p>
            <div className="mt-3 space-y-2">
              {peerHistory.map((item) => (
                <div key={`${item.peer}-${item.date}`} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.peer}</p>
                    <p className="text-xs text-muted">{item.date} · {item.goal}</p>
                  </div>
                  <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-muted">{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {active === "wellbeing" && (
        <section className="space-y-4 px-4">
          <div className="rounded-[20px] bg-cream p-5">
            <h2 className="text-xl font-bold text-ink" style={{ fontFamily: "var(--font-syne)" }}>How are you doing?</h2>
            <p className="mt-1 text-sm text-muted">A quick check-in. Always private. Takes under a minute.</p>
          </div>
          {surveyDue ? (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <Question title="How are you feeling this week overall?">
                <div className="flex gap-2">
                  {moodOptions.map((item, index) => (
                    <button key={`${item.key}-${index}`} onClick={() => setWellbeingMood(item.key)} className={clsx("h-11 flex-1 rounded-lg border text-xl", wellbeingMood === item.key ? "border-pulse bg-pulse-soft" : "border-border bg-paper")}>{item.label}</button>
                  ))}
                </div>
              </Question>
              <Question title="How would you describe your current workload?">
                <Pills value={workload} items={workloadOptions} onChange={setWorkload} />
              </Question>
              <Question title="Are you getting enough support from your team?">
                <Pills value={support} items={supportOptions} onChange={setSupport} />
              </Question>
              <Question title="Anything you'd like to share? (always private)">
                <textarea value={wellbeingNote} onChange={(event) => setWellbeingNote(event.target.value)} placeholder="This is just for you..." className="min-h-20 w-full resize-none rounded-lg border border-border bg-paper px-3 py-2 text-base outline-none focus:border-pulse" />
              </Question>
              <button onClick={submitWellbeing} disabled={!wellbeingMood || !workload || !support || wellbeingLoading} className="w-full rounded-lg bg-pulse px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                {wellbeingLoading ? "Thinking..." : "Submit Check-in"}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-bold text-ink">You&apos;ve checked in this week.</p>
              <p className="mt-1 text-sm text-muted">Next survey: {nextDate(lastWellbeing.date)}</p>
              <div className="mt-4 flex gap-2 text-2xl">{user.wellbeingHistory.slice(-4).map((entry) => <span key={entry.date}>{entry.mood === "energised" ? "🔥" : entry.mood === "good" ? "😊" : entry.mood === "okay" ? "😐" : "😓"}</span>)}</div>
            </div>
          )}
          {wellbeingResponse && (
            <div className="rounded-lg border border-green/20 bg-green-soft p-4">
              <p className="text-sm leading-relaxed text-green">{wellbeingResponse.message}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {wellbeingResponse.actions.map((action) => <div key={action} className="rounded-lg bg-card px-3 py-2 text-xs font-bold text-ink">{action}</div>)}
              </div>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-3">
            {resources.map((resource) => (
              <div key={resource.title} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-bold text-ink">{resource.title}</p>
                <p className="mt-1 text-xs text-muted">{resource.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">{title}</p>
      {children}
    </div>
  );
}

function Pills<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T | null;
  items: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button key={item.key} onClick={() => onChange(item.key)} className={clsx("rounded-full border px-3 py-2 text-sm font-bold", value === item.key ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-paper text-muted")}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
