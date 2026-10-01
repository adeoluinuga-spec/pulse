export class LearningError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function learningText(value: unknown, label: string, max = 200) {
  if (
    typeof value !== "string" ||
    value.trim().length < 2 ||
    value.length > max
  ) {
    throw new LearningError(`${label} must contain 2 to ${max} characters.`);
  }
  return value.trim();
}

export type LearningField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "choice" | "scale";
  required?: boolean;
  options?: string[];
  lowLabel?: string;
  highLabel?: string;
};
export type LearningConfig = {
  body?: string;
  intro?: string;
  fields?: LearningField[];
  rows?: number | null;
  singleFields?: LearningField[];
  confirmText?: string;
  scenario?: string;
  roles?: string[];
  rounds?: number;
};
export type LearningActivity = {
  id: string;
  cohort_id: string;
  title: string;
  summary: string | null;
  type: "content" | "form" | "roleplay";
  config: LearningConfig;
  position: number;
  released: boolean;
};
export type LearningPayload = Record<string, unknown>;

export function validateLearningConfig(
  type: string,
  value: unknown,
): LearningConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Activity config must be a JSON object.");
  const c = value as LearningConfig;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (type === "content") {
    if (!text(c.body, 40000))
      throw new Error("Add material text, up to 40,000 characters.");
    return { body: c.body };
  }
  if (type === "roleplay") {
    if (
      !text(c.scenario, 12000) ||
      !Array.isArray(c.roles) ||
      c.roles.length < 2 ||
      c.roles.length > 6 ||
      c.roles.some((r) => !text(r, 80)) ||
      new Set(c.roles).size !== c.roles.length
    )
      throw new Error(
        "A role-play needs a scenario and 2 to 6 different role names.",
      );
    if (!Number.isInteger(c.rounds) || c.rounds! < 1 || c.rounds! > 10)
      throw new Error("Choose between 1 and 10 rounds.");
    return { scenario: c.scenario, roles: c.roles, rounds: c.rounds };
  }
  if (type !== "form") throw new Error("Choose material, form or role-play.");
  if (
    !Array.isArray(c.fields) ||
    !c.fields.length ||
    c.fields.length > 30 ||
    (c.singleFields !== undefined &&
      (!Array.isArray(c.singleFields) || c.singleFields.length > 20))
  )
    throw new Error("Add 1 to 30 form fields.");
  const keys = new Set<string>();
  const fields = [...c.fields, ...(c.singleFields ?? [])];
  for (const f of fields) {
    if (
      !f ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) ||
      keys.has(f.key) ||
      !text(f.label, 300) ||
      !["text", "textarea", "choice", "scale"].includes(f.type)
    )
      throw new Error(
        "Each field needs a unique key, label and supported type.",
      );
    keys.add(f.key);
    if (f.required !== undefined && typeof f.required !== "boolean")
      throw new Error("Required must be true or false.");
    if (
      f.type === "choice" &&
      (!Array.isArray(f.options) ||
        f.options.length < 2 ||
        f.options.length > 20 ||
        f.options.some((o) => !text(o, 300)) ||
        new Set(f.options).size !== f.options.length)
    )
      throw new Error("Choice fields need 2 to 20 different options.");
    if ([f.lowLabel, f.highLabel].some((v) => v !== undefined && !text(v, 100)))
      throw new Error("Scale labels must be short text.");
  }
  if (
    c.rows != null &&
    (!Number.isInteger(c.rows) || c.rows < 1 || c.rows > 10)
  )
    throw new Error("Repeating rows must be between 1 and 10.");
  if ([c.intro, c.confirmText].some((v) => v !== undefined && !text(v, 2000)))
    throw new Error(
      "Intro and confirmation must be text of at most 2,000 characters.",
    );
  return {
    fields: c.fields,
    rows: c.rows ?? null,
    singleFields: c.singleFields ?? [],
    intro: c.intro,
    confirmText: c.confirmText,
  };
}

export function validateLearningAnswers(
  config: LearningConfig,
  value: unknown,
  draft = false,
): LearningPayload {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Answers must be an object.");
  const source = value as LearningPayload;
  function clean(
    fields: LearningField[],
    input: LearningPayload,
  ): LearningPayload {
    const out: LearningPayload = {};
    for (const f of fields) {
      const v = input[f.key];
      if (v === undefined || v === null || v === "") {
        if (f.required && !draft) throw new Error(`Please answer: ${f.label}`);
        continue;
      }
      if (f.type === "scale") {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5)
          throw new Error(`Choose 1 to 5 for ${f.label}.`);
      } else {
        if (
          typeof v !== "string" ||
          v.length > (f.type === "textarea" ? 6000 : 1000)
        )
          throw new Error(`Check the answer for ${f.label}.`);
        if (f.required && !draft && !v.trim())
          throw new Error(`Please answer: ${f.label}`);
        if (f.type === "choice" && !f.options?.includes(v))
          throw new Error(`Choose an available option for ${f.label}.`);
      }
      out[f.key] = typeof v === "string" ? v.trim() : v;
    }
    return out;
  }
  if (config.rows) {
    if (
      !Array.isArray(source.rows) ||
      source.rows.length !== config.rows ||
      source.rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw new Error(`Complete the ${config.rows} goal rows.`);
    return {
      ...clean(config.singleFields ?? [], source),
      rows: source.rows.map((r) =>
        clean(config.fields ?? [], r as LearningPayload),
      ),
    };
  }
  return clean(
    [...(config.fields ?? []), ...(config.singleFields ?? [])],
    source,
  );
}

export function parseLearningTrainees(
  value: string,
): { display_name: string; email: string | null }[] {
  const lines = value.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines.length > 300)
    throw new Error("Paste between 1 and 300 trainees.");
  const emails = new Set<string>();
  return lines.map((line, i) => {
    const parts = line.split(",");
    const name = parts[0]?.trim();
    const email = parts[1]?.trim().toLowerCase() || null;
    if (
      parts.length > 2 ||
      !name ||
      name.length > 150 ||
      (email &&
        (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254))
    )
      throw new Error(`Line ${i + 1}: use Name, email (email is optional).`);
    if (email && emails.has(email))
      throw new Error(`Line ${i + 1}: email appears twice.`);
    if (email) emails.add(email);
    return { display_name: name, email };
  });
}

export function learningCsv(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s =
              typeof v === "object" && v !== null
                ? JSON.stringify(v)
                : String(v ?? "");
            if (/^[\s]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}

export function learningEmailHtml(
  name: string,
  title: string,
  url: string,
): string {
  const escape = (v: string) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  return `<div style="font-family:Arial,sans-serif;max-width:600px"><p>Pulse Learning</p><h2>${escape(title)}</h2><p>${escape(name)}, your submission is saved. You can review it in your learning area.</p><p><a href="${escape(url)}">Return to your learning area</a></p><p>This is your personal link. Please keep it private.</p></div>`;
}
