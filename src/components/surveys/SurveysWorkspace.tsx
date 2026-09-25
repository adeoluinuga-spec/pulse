"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";

const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base text-ink outline-none focus:border-pulse";
import SurveyReportView from "./SurveyReportView";

/**
 * Building and running an anonymous survey.
 *
 * Aimed at a baseline before anyone is onboarded: you can run one for an
 * organisation whose staff have no Pulse accounts at all. Nothing here asks for
 * a staff list, because a survey with no named respondents does not need one.
 */

export type SurveySummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "open" | "closed";
  minimum_group: number;
  responses: number;
  created_at: string;
};

type QuestionDraft = { prompt: string; type: "scale" | "text"; required: boolean };
type GroupDraft = { label: string; options: string; required: boolean };

const STARTER_QUESTIONS: QuestionDraft[] = [
  { prompt: "I am clear about what is expected of me in my role", type: "scale", required: true },
  { prompt: "Decisions here are made quickly enough", type: "scale", required: true },
  { prompt: "What should we start doing?", type: "text", required: false },
];

const STARTER_GROUPS: GroupDraft[] = [
  { label: "Department", options: "", required: true },
  { label: "Level", options: "", required: false },
];

export default function SurveysWorkspace() {
  const { showToast } = useToast();
  const [surveys, setSurveys] = useState<SurveySummary[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/surveys", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load surveys.");
      setSurveys(body.surveys);
      setError("");
    } catch (thrown) {
      setError((thrown as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) return <Wrap><Alert>{error}</Alert></Wrap>;
  if (!surveys) return <Wrap><Muted>Loading surveys…</Muted></Wrap>;

  if (open) {
    return (
      <Wrap>
        <button onClick={() => { setOpen(null); void load(); }} className="text-sm font-semibold text-pulse">← All surveys</button>
        <SurveyReportView surveyId={open} onChanged={load} />
      </Wrap>
    );
  }

  return (
    <Wrap>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Surveys</h1>
          <p className="mt-1 text-sm text-muted">Anonymous staff surveys. One link, no accounts, results as averages only.</p>
        </div>
        {!building && (
          <button onClick={() => setBuilding(true)} className="flex items-center gap-2 rounded-lg bg-pulse px-4 py-2.5 text-sm font-semibold text-white">
            <Plus size={16} /> New survey
          </button>
        )}
      </header>

      {building && (
        <Builder
          onCancel={() => setBuilding(false)}
          onCreated={async (id) => {
            setBuilding(false);
            showToast("Survey created. Open it when you are ready to send the link.", "success");
            await load();
            setOpen(id);
          }}
        />
      )}

      {!surveys.length && !building && <Muted>No surveys yet. A baseline survey is a good first one.</Muted>}

      <div className="grid gap-3">
        {surveys.map((survey) => (
          <button key={survey.id} onClick={() => setOpen(survey.id)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-pulse">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{survey.title}</p>
              <p className="mt-1 text-xs text-muted">
                {new Date(survey.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·
                {" "}{survey.responses} {survey.responses === 1 ? "response" : "responses"} · groups under {survey.minimum_group} hidden
              </p>
            </div>
            <StatusPill status={survey.status} />
          </button>
        ))}
      </div>
    </Wrap>
  );
}

export function StatusPill({ status }: { status: "draft" | "open" | "closed" }) {
  const look = status === "open" ? "bg-green-soft text-green" : status === "draft" ? "bg-pulse-soft text-pulse" : "bg-paper text-muted";
  return <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize", look)}>{status}</span>;
}

function Builder({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [minimumGroup, setMinimumGroup] = useState(3);
  const [groups, setGroups] = useState<GroupDraft[]>(STARTER_GROUPS);
  const [questions, setQuestions] = useState<QuestionDraft[]>(STARTER_QUESTIONS);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          intro,
          closingNote,
          minimumGroup,
          groupFields: groups
            .filter((group) => group.label.trim() && group.options.trim())
            .map((group) => ({ label: group.label, required: group.required, options: group.options.split(/[\n,]/).map((option) => option.trim()).filter(Boolean) })),
          questions,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.errors?.length ? body.errors : [body.error ?? "The survey could not be saved."]);
        return;
      }
      onCreated(body.survey.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-ink">New survey</h2>

      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Baseline staff survey" className={INPUT} />
      </Field>
      <Field label="Opening words" hint="Shown above the questions. Say who is asking, why, and when it closes.">
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} className={INPUT} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Smallest group that can be reported" hint="A group with fewer answers than this is never named — it is combined with other small groups, or counted only in the totals. Three is the lowest allowed.">
          <select value={minimumGroup} onChange={(e) => setMinimumGroup(Number(e.target.value))} className={INPUT}>
            {[3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value} people</option>)}
          </select>
        </Field>
        <Field label="Closing words" hint="Shown after someone sends their answers.">
          <input value={closingNote} onChange={(e) => setClosingNote(e.target.value)} className={INPUT} />
        </Field>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Grouping questions</p>
        <p className="mt-1 text-xs text-muted">
          Each is reported on its own — never crossed with another, because “Senior in Sales” can be one person.
          Leave the options blank to drop a grouping question.
        </p>
        <div className="mt-3 space-y-3">
          {groups.map((group, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[180px_1fr_auto]">
              <input value={group.label} onChange={(e) => setGroups(groups.map((g, i) => (i === index ? { ...g, label: e.target.value } : g)))} placeholder="Department" className={INPUT} aria-label={`Grouping question ${index + 1} label`} />
              <input value={group.options} onChange={(e) => setGroups(groups.map((g, i) => (i === index ? { ...g, options: e.target.value } : g)))} placeholder="Sales, Studio, Operations, Admin" className={INPUT} aria-label={`Grouping question ${index + 1} options`} />
              <button onClick={() => setGroups(groups.filter((_, i) => i !== index))} aria-label={`Remove grouping question ${index + 1}`} className="rounded-lg border border-border px-3 text-muted">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button onClick={() => setGroups([...groups, { label: "", options: "", required: false }])} className="text-sm font-semibold text-pulse">+ Add a grouping question</button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Questions</p>
        <div className="mt-3 space-y-3">
          {questions.map((question, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_150px_auto]">
              <input
                value={question.prompt}
                onChange={(e) => setQuestions(questions.map((q, i) => (i === index ? { ...q, prompt: e.target.value } : q)))}
                className={INPUT}
                aria-label={`Question ${index + 1}`}
              />
              <select
                value={question.type}
                onChange={(e) => setQuestions(questions.map((q, i) => (i === index ? { ...q, type: e.target.value as "scale" | "text", required: e.target.value === "scale" } : q)))}
                className={INPUT}
                aria-label={`Question ${index + 1} type`}
              >
                <option value="scale">Rated 1–5</option>
                <option value="text">Free text</option>
              </select>
              <button onClick={() => setQuestions(questions.filter((_, i) => i !== index))} aria-label={`Remove question ${index + 1}`} className="rounded-lg border border-border px-3 text-muted">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setQuestions([...questions, { prompt: "", type: "scale", required: true }])} className="text-sm font-semibold text-pulse">+ Rated question</button>
            <button onClick={() => setQuestions([...questions, { prompt: "", type: "text", required: false }])} className="text-sm font-semibold text-pulse">+ Free text</button>
          </div>
        </div>
      </div>

      {errors.length > 0 && <Alert>{errors.join(" ")}</Alert>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg bg-pulse px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Saving…" : "Create survey"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted">Cancel</button>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">{children}</div>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-border bg-paper p-4 text-sm text-muted">{children}</p>;
}

export function Alert({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-lg border border-red/30 bg-red-soft p-4 text-sm text-red">{children}</p>;
}
