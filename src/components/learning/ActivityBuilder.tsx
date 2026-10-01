"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import {
  liveObserverFields,
  liveParticipantFields,
  type LearningActivity,
  type LearningConfig,
  type LearningField,
} from "@/lib/learning";
import { learningStarter } from "@/lib/learningTemplate";
import s from "./learning.module.css";

/**
 * Building an activity with ordinary form controls.
 *
 * The first version of this editor asked a facilitator to write the activity's
 * configuration as JSON. That works for whoever wrote the code and for nobody
 * else: a misplaced comma loses the lot, and there is no way to see what the
 * trainee will get. The shapes underneath are unchanged — this writes the same
 * config — so activities built the old way still open here.
 */

type Kind = "material" | "video" | "questionnaire" | "reflection" | "idp" | "roleplay_live" | "roleplay_written";

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "material", label: "Reading material", hint: "Something to read before or after a session." },
  { key: "video", label: "Video or link", hint: "A recording or document held somewhere else." },
  { key: "questionnaire", label: "Questionnaire", hint: "Questions with ratings and choices." },
  { key: "reflection", label: "Reflection", hint: "Open questions after a session." },
  { key: "idp", label: "Development plan", hint: "Repeating goal rows, plus strengths and support." },
  { key: "roleplay_live", label: "Role-play — acted out", hint: "The group acts it out, then each person writes their own feedback." },
  { key: "roleplay_written", label: "Role-play — written turns", hint: "The conversation happens here, in ordered turns." },
];

const FIELD_TYPES: { key: LearningField["type"]; label: string }[] = [
  { key: "textarea", label: "Long answer" },
  { key: "text", label: "Short answer" },
  { key: "choice", label: "Choose one" },
  { key: "scale", label: "Rating 1–5" },
];

/** Which editor to open for an activity that already exists. */
export function kindOf(activity?: LearningActivity): Kind {
  if (!activity) return "material";
  if (activity.type === "roleplay") return activity.config.mode === "live" ? "roleplay_live" : "roleplay_written";
  if (activity.type === "content") return activity.config.link && !activity.config.body ? "video" : "material";
  if (activity.config.rows) return "idp";
  return (activity.config.fields ?? []).some((f) => f.type === "choice" || f.type === "scale") ? "questionnaire" : "reflection";
}

const storedType = (kind: Kind) =>
  kind === "roleplay_live" || kind === "roleplay_written" ? "roleplay" : kind === "material" || kind === "video" ? "content" : "form";

const newKey = (label: string, taken: Set<string>) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "question";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
};

export default function ActivityBuilder({
  activity,
  busy,
  save,
  close,
}: {
  activity?: LearningActivity;
  busy: boolean;
  save: (value: Record<string, unknown>) => Promise<void>;
  close: () => void;
}) {
  const [kind, setKind] = useState<Kind>(kindOf(activity));
  const [title, setTitle] = useState(activity?.title ?? "");
  const [summary, setSummary] = useState(activity?.summary ?? "");
  const [config, setConfig] = useState<LearningConfig>(activity?.config ?? { body: "" });
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<LearningConfig>) => setConfig((current) => ({ ...current, ...patch }));

  const switchKind = (next: Kind) => {
    setKind(next);
    setConfig(
      next === "material" ? { body: config.body ?? "" }
      : next === "video" ? { link: config.link ?? "", linkLabel: config.linkLabel ?? "", body: config.body }
      : next === "idp" ? { rows: 3, fields: config.rows ? config.fields : idpRows, singleFields: config.rows ? config.singleFields : idpSingles, intro: config.intro }
      : next === "roleplay_live" ? { mode: "live", scenario: config.scenario ?? "", roles: config.roles ?? ["Manager", "Team member"], participantFields: config.participantFields ?? liveParticipantFields, observerFields: config.observerFields ?? liveObserverFields }
      : next === "roleplay_written" ? { mode: "written", scenario: config.scenario ?? "", roles: config.roles ?? ["Manager", "Team member"], rounds: config.rounds ?? 4 }
      : { fields: config.fields?.length && !config.rows ? config.fields : [{ key: "answer", label: "Your answer", type: "textarea", required: true }], intro: config.intro },
    );
  };

  const submit = () => {
    if (title.trim().length < 2) {
      setError("Give the activity a title.");
      return;
    }
    setError("");
    void save({ activityId: activity?.id, title, summary, type: storedType(kind), config });
  };

  const isRoleplay = kind === "roleplay_live" || kind === "roleplay_written";
  const formFields = kind === "idp" ? (config.fields ?? []) : (config.fields ?? []);

  return (
    <form className={s.group} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2>{activity ? "Edit activity" : "New activity"}</h2>

      <label className={s.field}>
        What kind of activity is this?
        <select value={kind} onChange={(e) => switchKind(e.target.value as Kind)} disabled={Boolean(activity)}>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </label>
      <p className={s.muted}>{KINDS.find((k) => k.key === kind)?.hint}</p>
      {activity ? <p className={s.muted}>The kind cannot change after an activity is created. Add a new activity instead.</p> : null}

      <div className={s.grid}>
        <label className={s.field}>
          Title
          <input value={title} required maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="The difficult conversation" />
        </label>
        <label className={s.field}>
          Summary shown in the list
          <input value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} />
        </label>
      </div>

      {!activity && kind !== "material" && kind !== "video" ? (
        <label className={s.field}>
          Start from a template
          <select
            defaultValue=""
            onChange={(e) => {
              const template = learningStarter.find((t) => t.title === e.target.value);
              if (template) setConfig(template.config);
            }}
          >
            <option value="">Build it myself</option>
            {learningStarter.filter((a) => a.type === storedType(kind)).map((a) => <option key={a.title}>{a.title}</option>)}
          </select>
        </label>
      ) : null}

      {(kind === "material" || kind === "video") ? (
        <>
          {kind === "video" ? (
            <div className={s.grid}>
              <label className={s.field}>
                Link (https)
                <input value={config.link ?? ""} onChange={(e) => set({ link: e.target.value })} placeholder="https://..." />
              </label>
              <label className={s.field}>
                What the link is
                <input value={config.linkLabel ?? ""} maxLength={120} onChange={(e) => set({ linkLabel: e.target.value })} placeholder="Watch the 12-minute recording" />
              </label>
            </div>
          ) : null}
          <label className={s.field}>
            {kind === "video" ? "Anything to read alongside it (optional)" : "The material"}
            <textarea value={config.body ?? ""} rows={12} onChange={(e) => set({ body: e.target.value })} placeholder={"## A heading\n\nText, **bold**, lists and tables all work."} />
          </label>
          <p className={s.muted}>Markdown: ## for headings, ** ** for bold, - for lists, | | for tables.</p>
        </>
      ) : null}

      {isRoleplay ? (
        <>
          <label className={s.field}>
            The scenario everyone reads
            <textarea value={config.scenario ?? ""} rows={6} onChange={(e) => set({ scenario: e.target.value })} placeholder="A team member has missed three deadlines this month..." />
          </label>
          <RoleList roles={config.roles ?? []} change={(roles) => set({ roles })} />
          {kind === "roleplay_written" ? (
            <label className={s.field}>
              Rounds (each person speaks once per round)
              <input type="number" min={1} max={10} value={config.rounds ?? 4} onChange={(e) => set({ rounds: Number(e.target.value) })} />
            </label>
          ) : (
            <>
              <p className={s.muted}>
                The group acts this out in the room or on a call. Afterwards each person answers their own questions, and nobody sees
                anyone else&apos;s answers.
              </p>
              <FieldList
                legend="What each person in a role answers afterwards"
                fields={config.participantFields ?? liveParticipantFields}
                change={(participantFields) => set({ participantFields })}
              />
              <FieldList
                legend="What the observer answers"
                fields={config.observerFields ?? liveObserverFields}
                change={(observerFields) => set({ observerFields })}
              />
            </>
          )}
        </>
      ) : null}

      {storedType(kind) === "form" ? (
        <>
          <label className={s.field}>
            Introduction (optional)
            <textarea value={config.intro ?? ""} rows={2} onChange={(e) => set({ intro: e.target.value })} />
          </label>
          {kind === "idp" ? (
            <label className={s.field}>
              How many goal rows?
              <input type="number" min={1} max={10} value={config.rows ?? 3} onChange={(e) => set({ rows: Number(e.target.value) })} />
            </label>
          ) : null}
          <FieldList
            legend={kind === "idp" ? "Asked for each goal row" : "Questions"}
            fields={formFields}
            change={(fields) => set({ fields })}
          />
          {kind === "idp" ? (
            <FieldList legend="Asked once, at the end" fields={config.singleFields ?? []} change={(singleFields) => set({ singleFields })} />
          ) : null}
          <label className={s.field}>
            Message after they submit (optional)
            <input value={config.confirmText ?? ""} maxLength={2000} onChange={(e) => set({ confirmText: e.target.value })} />
          </label>
        </>
      ) : null}

      {error ? <p role="alert" className={s.error}>{error}</p> : null}

      <div className={s.row}>
        <button className={s.primary} disabled={busy}><Save size={16} />Save activity</button>
        <button type="button" className={s.button} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview what trainees see"}</button>
        <button type="button" className={s.button} disabled={busy} onClick={close}>Cancel</button>
      </div>

      {preview ? <Preview kind={kind} title={title} config={config} /> : null}
    </form>
  );
}

const idpRows: LearningField[] = [
  { key: "develop", label: "What I am developing", type: "text" },
  { key: "success", label: "What good looks like", type: "text" },
  { key: "action", label: "Training, stretch work, shadowing or coaching", type: "textarea" },
  { key: "manager", label: "What my manager will do", type: "text" },
  { key: "date", label: "By when", type: "text" },
];
const idpSingles: LearningField[] = [
  { key: "strengths", label: "Strengths to build on", type: "textarea" },
  { key: "support", label: "Support or resources needed", type: "textarea" },
];

function RoleList({ roles, change }: { roles: string[]; change: (roles: string[]) => void }) {
  return (
    <fieldset className={s.group}>
      <legend>Roles</legend>
      <p className={s.muted}>Two to six. Each one is given to a different person; an observer is optional and added when you make the groups.</p>
      {roles.map((role, index) => (
        <div className={s.row} key={index}>
          <input
            aria-label={`Role ${index + 1}`}
            value={role}
            maxLength={80}
            onChange={(e) => change(roles.map((r, i) => (i === index ? e.target.value : r)))}
          />
          <button type="button" className={s.button} aria-label={`Remove role ${index + 1}`} disabled={roles.length <= 2} onClick={() => change(roles.filter((_, i) => i !== index))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {roles.length < 6 ? (
        <button type="button" className={s.button} onClick={() => change([...roles, `Role ${roles.length + 1}`])}><Plus size={15} />Add a role</button>
      ) : null}
    </fieldset>
  );
}

function FieldList({ legend, fields, change }: { legend: string; fields: LearningField[]; change: (fields: LearningField[]) => void }) {
  const update = (index: number, patch: Partial<LearningField>) => change(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  return (
    <fieldset className={s.group}>
      <legend>{legend}</legend>
      {fields.map((field, index) => (
        <div className={s.group} key={index}>
          <div className={s.grid}>
            <label className={s.field}>
              Question
              <input
                value={field.label}
                maxLength={300}
                onChange={(e) => {
                  const taken = new Set(fields.filter((_, i) => i !== index).map((f) => f.key));
                  update(index, { label: e.target.value, key: field.key || newKey(e.target.value, taken) });
                }}
              />
            </label>
            <label className={s.field}>
              Answer type
              <select value={field.type} onChange={(e) => update(index, { type: e.target.value as LearningField["type"], options: e.target.value === "choice" ? (field.options ?? ["Option one", "Option two"]) : undefined })}>
                {FIELD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
          </div>
          {field.type === "choice" ? (
            <label className={s.field}>
              Options, one per line
              <textarea
                rows={3}
                value={(field.options ?? []).join("\n")}
                onChange={(e) => update(index, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
              />
            </label>
          ) : null}
          {field.type === "scale" ? (
            <div className={s.grid}>
              <label className={s.field}>Label for 1<input value={field.lowLabel ?? ""} maxLength={100} onChange={(e) => update(index, { lowLabel: e.target.value || undefined })} /></label>
              <label className={s.field}>Label for 5<input value={field.highLabel ?? ""} maxLength={100} onChange={(e) => update(index, { highLabel: e.target.value || undefined })} /></label>
            </div>
          ) : null}
          <div className={s.row}>
            <label className={s.choice}>
              <input type="checkbox" checked={field.required === true} onChange={(e) => update(index, { required: e.target.checked })} />
              Must be answered
            </label>
            <button type="button" className={s.button} disabled={fields.length <= 1} onClick={() => change(fields.filter((_, i) => i !== index))}>
              <Trash2 size={15} />Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className={s.button}
        onClick={() => change([...fields, { key: newKey(`question ${fields.length + 1}`, new Set(fields.map((f) => f.key))), label: "", type: "textarea" }])}
      >
        <Plus size={15} />Add a question
      </button>
    </fieldset>
  );
}

/** What the trainee will be looking at, without having to release it to find out. */
function Preview({ kind, title, config }: { kind: Kind; title: string; config: LearningConfig }) {
  const fields =
    kind === "roleplay_live" ? (config.participantFields ?? liveParticipantFields)
    : storedType(kind) === "form" ? [...(config.fields ?? []), ...(config.singleFields ?? [])]
    : [];
  return (
    <section className={s.group} aria-label="Preview">
      <h3>{title || "Untitled activity"}</h3>
      {config.scenario ? <p>{config.scenario}</p> : null}
      {config.link ? <p className={s.muted}>{config.linkLabel || config.link}</p> : null}
      {config.body ? <p className={s.muted}>{config.body.slice(0, 400)}{config.body.length > 400 ? "..." : ""}</p> : null}
      {config.intro ? <p className={s.muted}>{config.intro}</p> : null}
      {kind === "roleplay_live" ? <p className={s.muted}>Acted out by the group, then each person answers:</p> : null}
      {kind === "roleplay_written" ? <p className={s.muted}>{config.rounds ?? 4} rounds of written turns between {(config.roles ?? []).join(" and ")}.</p> : null}
      <ol className={s.plain}>
        {fields.map((f, index) => (
          <li key={index}>
            {index + 1}. {f.label || "(no question yet)"}
            {f.required ? " *" : ""} — {FIELD_TYPES.find((t) => t.key === f.type)?.label}
            {f.type === "choice" ? `: ${(f.options ?? []).join(", ")}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
