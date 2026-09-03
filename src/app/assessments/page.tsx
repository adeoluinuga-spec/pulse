"use client";

import { useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Mail,
  MessageSquareText,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  Users,
} from "lucide-react";
import {
  active360Cycle,
  assessmentQuestions,
  assessmentReadiness,
  assessees,
  completionByGroup,
  completionForAssessee,
  levelLabel,
  results,
  reviewerGroups,
  reviewers,
  telcoCompetencies,
  weightedScore,
  type AssessmentLevel,
  type ReviewerGroup,
  type ReviewerStatus,
} from "@/lib/assessments360";
import { parseAssessmentParticipantCsv } from "@/lib/assessmentParticipants";
import { canReleaseAssessmentReport, releaseReadinessSummary } from "@/lib/assessmentRelease";

type TabKey = "command" | "participants" | "questions" | "review" | "reports";
type LevelFilter = AssessmentLevel | "all";

const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "command", label: "Command", icon: BarChart3 },
  { key: "participants", label: "Participants", icon: Users },
  { key: "questions", label: "Question bank", icon: ClipboardList },
  { key: "review", label: "Review form", icon: MessageSquareText },
  { key: "reports", label: "Reports", icon: FileText },
];

const statusMeta: Record<ReviewerStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  in_progress: { label: "In progress", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  submitted: { label: "Submitted", className: "bg-green-soft text-green ring-green/20" },
};

const groupTone: Record<ReviewerGroup, string> = {
  direct_report: "border-l-pulse",
  subordinate: "border-l-green",
  colleague: "border-l-blue-500",
  customer: "border-l-violet-500",
};

const demoQuestions = assessmentQuestions.filter((question) => question.kind === "rating");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function reviewerGroupLabel(group: ReviewerGroup) {
  return reviewerGroups.find((item) => item.key === group)?.label ?? group;
}

function scoreTone(score: number) {
  if (score >= 85) return "bg-green text-white";
  if (score >= 75) return "bg-pulse text-white";
  if (score >= 65) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function AssessmentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("command");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [selectedAssesseeId, setSelectedAssesseeId] = useState(assessees[0]?.id ?? "");
  const [reviewerGroup, setReviewerGroup] = useState<ReviewerGroup>("colleague");
  const [ratings, setRatings] = useState<Record<string, number>>(
    () => Object.fromEntries(telcoCompetencies.map((competency) => [competency.id, 4])) as Record<string, number>,
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [cycleName, setCycleName] = useState(active360Cycle.name);
  const [cycleClient, setCycleClient] = useState(active360Cycle.clientName);
  const [cycleStartsOn, setCycleStartsOn] = useState(active360Cycle.startDate);
  const [cycleClosesOn, setCycleClosesOn] = useState(active360Cycle.closeDate);
  const [cycleNotice, setCycleNotice] = useState("");
  const [participantCsv, setParticipantCsv] = useState(
    "name,email,level,function_name,region,portfolio\nAmina Lawal,amina.lawal@example.com,director,Network Operations,North Central,Radio access network and field operations",
  );
  const [participantNotice, setParticipantNotice] = useState("");
  const [assessmentSubjects, setAssessmentSubjects] = useState(assessees);

  const visibleAssessees = useMemo(
    () => assessmentSubjects.filter((assessee) => levelFilter === "all" || assessee.level === levelFilter),
    [assessmentSubjects, levelFilter],
  );
  const selectedAssessee = assessmentSubjects.find((assessee) => assessee.id === selectedAssesseeId) ?? assessmentSubjects[0] ?? assessees[0];
  const selectedResult = results.find((result) => result.assesseeId === selectedAssessee.id) ?? results[0];
  const selectedAssesseeReviewers = reviewers.filter((reviewer) => reviewer.assesseeId === selectedAssessee.id);
  const selectedScore = weightedScore(selectedResult);
  const readiness = assessmentReadiness();
  const completion = average(assessmentSubjects.map((assessee) => completionForAssessee(assessee.id)));
  const portfolioScore = average(results.map((result) => weightedScore(result)));
  const riskCount = results.reduce((sum, result) => sum + result.riskNotes.length, 0);
  const submittedCount = reviewers.filter((reviewer) => reviewer.status === "submitted").length;
  const releaseSummary = releaseReadinessSummary(selectedAssesseeReviewers);
  const canReleaseSelectedReport = canReleaseAssessmentReport(selectedAssesseeReviewers);

  async function handleDemoSubmit() {
    setNotice("Demo review captured. In production this writes to the encrypted 360 response table.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function handleCreateCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await fetch("/api/assessments/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cycleName,
          clientContext: cycleClient,
          startsOn: cycleStartsOn,
          closesOn: cycleClosesOn,
          levels: ["director", "assistant_director"],
          reviewerWeights: active360Cycle.reviewerWeights,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to create assessment cycle");
      }

      setCycleNotice(`Assessment cycle created: ${payload.cycle?.name ?? cycleName}`);
      setTimeout(() => setCycleNotice(""), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create assessment cycle";
      setCycleNotice(message);
      setTimeout(() => setCycleNotice(""), 4000);
    }
  }

  function handleImportParticipants() {
    const parsed = parseAssessmentParticipantCsv(participantCsv);
    if (!parsed.length) {
      setParticipantNotice("No valid participant rows found. Please use a CSV with name and email columns.");
      setTimeout(() => setParticipantNotice(""), 4000);
      return;
    }

    const imported = parsed.map((row, index) => {
      const level: AssessmentLevel = row.level === "director" ? "director" : "assistant_director";
      return {
        id: `imported-${Date.now()}-${index}`,
        name: row.name,
        initials: row.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() || "NP",
        level,
        functionName: row.functionName || "New function",
        region: row.region || "Not specified",
        portfolio: row.portfolio || "Review participant",
        tenureYears: 1,
      };
    });

    setAssessmentSubjects((current) => [...imported, ...current]);
    setSelectedAssesseeId(imported[0]?.id ?? selectedAssesseeId);
    setParticipantCsv("");
    setParticipantNotice(`${imported.length} participant${imported.length === 1 ? "" : "s"} imported into the assessment cycle.`);
    setTimeout(() => setParticipantNotice(""), 4000);
  }

  return (
    <main className="min-h-screen bg-paper pb-28 text-ink">
      <section className="border-b border-ink/8 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-pulse-soft px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-pulse">
                  <ShieldCheck size={14} />
                  Telco 360
                </span>
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
                  {active360Cycle.clientName}
                </span>
              </div>
              <h1 className="mt-4 font-syne text-3xl font-black leading-tight sm:text-4xl">
                Directorate 360 assessment command center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Multi-rater assessment for Directors and Assistant Directors across direct reports, subordinates, colleagues, and customers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 text-sm font-black shadow-sm transition hover:border-pulse/40">
                <Mail size={16} />
                Send reminders
              </button>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white shadow-sm transition hover:bg-ink/90">
                <Download size={16} />
                Export pack
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Assessees", assessees.length.toString(), "Directors and Assistant Directors"],
              ["Completion", `${completion}%`, `${submittedCount}/${reviewers.length} reviewers submitted`],
              ["Portfolio score", `${portfolioScore}`, "Weighted by reviewer group"],
              ["Readiness", `${readiness}%`, "Coverage, response rate, report quality"],
              ["Close date", formatDate(active360Cycle.closeDate), "Collection window"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-[18px] border border-ink/8 bg-paper px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
                <p className="mt-2 text-2xl font-black">{value}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-[18px] border border-ink/8 bg-paper p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-black transition",
                    selected ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-white hover:text-ink",
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "director", "assistant_director"] as LevelFilter[]).map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={clsx(
                  "min-h-10 rounded-2xl px-4 text-sm font-black transition",
                  levelFilter === level ? "bg-pulse text-white" : "border border-ink/10 bg-white text-muted hover:text-ink",
                )}
              >
                {level === "all" ? "All levels" : levelLabel(level)}
              </button>
            ))}
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-ink/10 bg-white px-3">
            <SlidersHorizontal size={16} className="text-muted" />
            <select
              value={selectedAssesseeId}
              onChange={(event) => setSelectedAssesseeId(event.target.value)}
              className="min-h-9 bg-transparent text-sm font-black outline-none"
              aria-label="Selected assessee"
            >
              {visibleAssessees.map((assessee) => (
                <option key={assessee.id} value={assessee.id}>
                  {assessee.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === "command" && (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Selected leader</p>
                    <h2 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {levelLabel(selectedAssessee.level)} - {selectedAssessee.functionName} - {selectedAssessee.region}
                    </p>
                  </div>
                  <div className={clsx("grid h-20 w-20 place-items-center rounded-[20px] text-2xl font-black", scoreTone(selectedScore))}>
                    {selectedScore}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{selectedAssessee.portfolio}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {reviewerGroups.map((group) => (
                    <div key={group.key} className={clsx("border-l-4 bg-paper p-3", groupTone[group.key])}>
                      <p className="text-xs font-bold text-muted">{group.shortLabel}</p>
                      <p className="mt-1 text-xl font-black">{selectedResult.groupScores[group.key]}</p>
                      <p className="text-[11px] text-muted">Weight {active360Cycle.reviewerWeights[group.key]}%</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Competency heatmap</p>
                    <h3 className="mt-1 text-lg font-black">Telco leadership signals</h3>
                  </div>
                  <Target className="text-pulse" size={20} />
                </div>
                <div className="mt-5 space-y-4">
                  {selectedResult.competencyScores.map((item) => {
                    const competency = telcoCompetencies.find((entry) => entry.id === item.competencyId);
                    const delta = item.score - item.benchmark;
                    return (
                      <div key={item.competencyId}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black">{competency?.name}</p>
                          <p className={clsx("text-sm font-black", delta >= 0 ? "text-green" : "text-pulse")}>
                            {item.score} / {delta >= 0 ? "+" : ""}
                            {delta}
                          </p>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/8">
                          <div className="h-full rounded-full bg-pulse" style={{ width: `${item.score}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">Benchmark {item.benchmark}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Cycle health</p>
                    <h3 className="mt-1 text-lg font-black">{active360Cycle.name}</h3>
                  </div>
                  <div className={clsx("rounded-2xl px-3 py-2 text-sm font-black", releaseSummary.ready ? "bg-green-soft text-green" : "bg-amber-50 text-amber-700") }>
                    {releaseSummary.ready ? "Ready" : "Blocked"}
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {reviewerGroups.map((group) => {
                    const value = completionByGroup(group.key);
                    return (
                      <div key={group.key}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-black">{group.label}</span>
                          <span className="font-black text-muted">{value}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/8">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-2xl bg-paper p-3 text-sm text-muted">
                  <span className="font-black text-ink">
                    {releaseSummary.remaining === 0 ? "All reviewers submitted" : `${releaseSummary.remaining} reviewer${releaseSummary.remaining === 1 ? "" : "s"} outstanding`}
                  </span>
                  {releaseSummary.missingGroups.length > 0 && (
                    <span className="mt-1 block text-amber-700">
                      Missing groups: {releaseSummary.missingGroups.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Cycle setup</p>
                <h3 className="mt-2 text-lg font-black">Create a new assessment cycle</h3>
                {cycleNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{cycleNotice}</div>}
                <form onSubmit={handleCreateCycle} className="mt-4 space-y-3">
                  <label className="block text-sm font-black text-muted">
                    Cycle name
                    <input
                      value={cycleName}
                      onChange={(event) => setCycleName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Directorate 360 Leadership Assessment"
                    />
                  </label>
                  <label className="block text-sm font-black text-muted">
                    Client / organisation
                    <input
                      value={cycleClient}
                      onChange={(event) => setCycleClient(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      placeholder="Telco Leadership Group"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-black text-muted">
                      Start date
                      <input
                        type="date"
                        value={cycleStartsOn}
                        onChange={(event) => setCycleStartsOn(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      />
                    </label>
                    <label className="block text-sm font-black text-muted">
                      Close date
                      <input
                        type="date"
                        value={cycleClosesOn}
                        onChange={(event) => setCycleClosesOn(event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-ink/8 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pulse/50"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white shadow-sm transition hover:bg-ink/90"
                  >
                    <SlidersHorizontal size={16} />
                    Create cycle
                  </button>
                </form>
              </div>

              <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">AI calibration notes</p>
                <div className="mt-4 space-y-3">
                  {selectedResult.strongestSignals.map((signal) => (
                    <div key={signal} className="flex gap-3 rounded-2xl bg-green-soft p-3 text-sm text-green">
                      <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
                      <span className="font-semibold">{signal}</span>
                    </div>
                  ))}
                  {selectedResult.developmentSignals.map((signal) => (
                    <div key={signal} className="flex gap-3 rounded-2xl bg-pulse-soft p-3 text-sm text-pulse">
                      <Star className="mt-0.5 shrink-0" size={16} />
                      <span className="font-semibold">{signal}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-ink/8 bg-paper p-3 text-sm text-muted">
                  <span className="font-black text-ink">{riskCount} portfolio risk notes</span> need HR calibration before reports are released.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "participants" && (
          <div className="space-y-5">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Participant import</p>
              <h3 className="mt-2 text-xl font-black">Add leaders to the assessment cycle</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Upload a CSV with the columns name, email, level, function_name, region, and portfolio. The platform will prepare subjects for the reviewer matrix.
              </p>
              {participantNotice && <div className="mt-3 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{participantNotice}</div>}
              <div className="mt-4 space-y-3">
                <textarea
                  value={participantCsv}
                  onChange={(event) => setParticipantCsv(event.target.value)}
                  className="min-h-32 w-full resize-y rounded-2xl border border-ink/8 bg-paper p-3 text-sm outline-none transition placeholder:text-muted focus:border-pulse/50"
                  placeholder="name,email,level,function_name,region,portfolio"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleImportParticipants}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white"
                  >
                    <Users size={16} />
                    Import participants
                  </button>
                  <button
                    type="button"
                    onClick={() => setParticipantCsv("name,email,level,function_name,region,portfolio\nAmina Lawal,amina.lawal@example.com,director,Network Operations,North Central,Radio access network and field operations")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 text-sm font-black text-ink"
                  >
                    Use sample CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {visibleAssessees.map((assessee) => {
                const result = results.find((entry) => entry.assesseeId === assessee.id);
                const assesseeReviewers = reviewers.filter((reviewer) => reviewer.assesseeId === assessee.id);
                return (
                  <div key={assessee.id} className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-sm font-black text-white">
                          {assessee.initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black">{assessee.name}</h3>
                          <p className="truncate text-sm text-muted">
                            {levelLabel(assessee.level)} - {assessee.functionName}
                          </p>
                        </div>
                      </div>
                      <span className={clsx("rounded-2xl px-3 py-2 text-sm font-black", scoreTone(result ? weightedScore(result) : 0))}>
                        {result ? weightedScore(result) : 0}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/8">
                        <div className="h-full rounded-full bg-green" style={{ width: `${completionForAssessee(assessee.id)}%` }} />
                      </div>
                      <span className="text-sm font-black">{completionForAssessee(assessee.id)}%</span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {assesseeReviewers.map((reviewer) => (
                        <div key={reviewer.id} className="rounded-2xl border border-ink/8 bg-paper p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-black">{reviewer.name}</p>
                            <span className={clsx("shrink-0 rounded-full px-2 py-1 text-[10px] font-black ring-1", statusMeta[reviewer.status].className)}>
                              {statusMeta[reviewer.status].label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{reviewerGroupLabel(reviewer.group)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "questions" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {telcoCompetencies.map((competency) => (
              <div key={competency.id} className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Weight {competency.weight}%</p>
                    <h3 className="mt-2 text-lg font-black">{competency.name}</h3>
                  </div>
                  <Building2 className="shrink-0 text-pulse" size={20} />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{competency.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {competency.telcoSignals.map((signal) => (
                    <span key={signal} className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-muted">
                      {signal}
                    </span>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-pulse-soft p-3 text-sm font-semibold text-pulse">
                  {assessmentQuestions.find((question) => question.competencyId === competency.id && question.kind === "comment")?.prompt}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "review" && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Reviewer context</p>
              <h3 className="mt-2 text-xl font-black">Adaptive 360 form</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                The same competency model can render differently for internal leaders and external customers while keeping scores comparable.
              </p>
              <div className="mt-5 grid gap-2">
                {reviewerGroups.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => setReviewerGroup(group.key)}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      reviewerGroup === group.key ? "border-pulse bg-pulse-soft" : "border-ink/8 bg-paper hover:border-pulse/40",
                    )}
                  >
                    <p className="text-sm font-black">{group.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{group.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Preview response</p>
                  <h3 className="mt-2 text-xl font-black">{reviewerGroupLabel(reviewerGroup)} reviewer</h3>
                </div>
                <button
                  onClick={handleDemoSubmit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white"
                >
                  <Send size={16} />
                  Submit demo
                </button>
              </div>
              {notice && <div className="mt-4 rounded-2xl bg-green-soft p-3 text-sm font-black text-green">{notice}</div>}
              <div className="mt-5 space-y-5">
                {demoQuestions.map((question) => {
                  const competency = telcoCompetencies.find((item) => item.id === question.competencyId);
                  return (
                    <div key={question.id} className="rounded-[18px] border border-ink/8 bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{competency?.name}</p>
                          <p className="mt-1 text-sm leading-6 text-muted">{question.prompt}</p>
                        </div>
                        <span className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-pulse">
                          {ratings[question.competencyId]}/5
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={ratings[question.competencyId]}
                        onChange={(event) =>
                          setRatings((current) => ({ ...current, [question.competencyId]: Number(event.target.value) }))
                        }
                        className="mt-4 w-full accent-pulse"
                        aria-label={`Rating for ${competency?.name}`}
                      />
                      <textarea
                        value={comments[question.competencyId] ?? ""}
                        onChange={(event) =>
                          setComments((current) => ({ ...current, [question.competencyId]: event.target.value }))
                        }
                        placeholder="Evidence, example, or coaching note"
                        className="mt-3 min-h-20 w-full resize-none rounded-2xl border border-ink/8 bg-white p-3 text-sm outline-none transition placeholder:text-muted focus:border-pulse/50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Leadership profile</p>
              <h3 className="mt-2 font-syne text-2xl font-black">{selectedAssessee.name}</h3>
              <p className="mt-2 text-sm text-muted">{selectedAssessee.portfolio}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-ink p-4 text-white">
                  <p className="text-xs font-bold text-white/50">Weighted score</p>
                  <p className="mt-2 text-3xl font-black">{selectedScore}</p>
                </div>
                <div className="rounded-2xl bg-pulse-soft p-4 text-pulse">
                  <p className="text-xs font-bold">Customer gap</p>
                  <p className="mt-2 text-3xl font-black">{selectedResult.groupScores.customer - selectedResult.groupScores.direct_report}</p>
                </div>
                <div className="rounded-2xl bg-green-soft p-4 text-green">
                  <p className="text-xs font-bold">Completion</p>
                  <p className="mt-2 text-3xl font-black">{completionForAssessee(selectedAssessee.id)}%</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <h4 className="text-sm font-black">Strengths</h4>
                {selectedResult.strongestSignals.map((signal) => (
                  <p key={signal} className="rounded-2xl bg-paper p-3 text-sm font-semibold text-muted">
                    {signal}
                  </p>
                ))}
                <h4 className="pt-2 text-sm font-black">Development plan</h4>
                {selectedResult.developmentSignals.map((signal) => (
                  <p key={signal} className="rounded-2xl bg-pulse-soft p-3 text-sm font-semibold text-pulse">
                    {signal}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-ink/8 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Board-ready report</p>
                  <h3 className="mt-2 text-xl font-black">Release controls</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-ink/10 px-3 text-sm font-black">
                    <FileText size={16} />
                    PDF
                  </button>
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-ink/10 px-3 text-sm font-black">
                    <Download size={16} />
                    CSV
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {reviewerGroups.map((group) => (
                  <div key={group.key} className={clsx("border-l-4 bg-paper p-4", groupTone[group.key])}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black">{group.label}</p>
                        <p className="mt-1 text-xs text-muted">{group.description}</p>
                      </div>
                      <p className="text-2xl font-black">{selectedResult.groupScores[group.key]}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-ink/8 bg-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black">Release checklist</p>
                  <button
                    disabled={!canReleaseSelectedReport}
                    className={clsx(
                      "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3 text-sm font-black transition",
                      canReleaseSelectedReport ? "bg-ink text-white" : "cursor-not-allowed border border-ink/10 bg-white text-muted",
                    )}
                  >
                    <FileText size={16} />
                    {canReleaseSelectedReport ? "Release report" : "Release blocked"}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    { label: "All reviewer groups represented", ok: releaseSummary.missingGroups.length === 0 },
                    { label: "All submissions complete", ok: releaseSummary.remaining === 0 },
                    { label: "HR calibration completed", ok: selectedResult.riskNotes.length === 0 },
                    { label: "Customer comments redacted", ok: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm font-semibold text-muted">
                      <CheckCircle2 className={item.ok ? "text-green" : "text-muted/50"} size={16} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
