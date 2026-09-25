/**
 * Anonymous staff surveys: one set of questions, everyone answers, one aggregate.
 *
 * This is deliberately NOT the 360 module. A 360 is "who rates whom": every
 * link belongs to one named rater assessing one named subject, and that is what
 * makes its reports possible. A baseline survey is the opposite shape — there is
 * no subject, and there must be no way back to a respondent, because that is
 * what was promised when the link was sent.
 *
 * Three rules hold that promise, and they are enforced here rather than left to
 * whoever reads the report:
 *
 *   1. NOTHING IDENTIFYING IS COLLECTED. No account, no token, no email, no IP
 *      address. A submission is its answers plus, optionally, the groups the
 *      respondent chose for themselves.
 *
 *   2. GROUPS ARE NEVER CROSSED. Department and level are each reported on their
 *      own. "Sales" and "Senior" may both be safe at 6 and 5 people; "Senior in
 *      Sales" can be one person. So the breakdowns are separate lists, never a
 *      grid, and this file offers no way to ask for both at once.
 *
 *   3. SMALL GROUPS ARE HIDDEN. A group below the minimum is reported as
 *      "too few to show" — not as a number, not as a rounded number. Comments
 *      are never labelled with a group at all, because a sentence is far easier
 *      to attribute than an average.
 */

export const MINIMUM_GROUP = 3;
export const MAX_MINIMUM_GROUP = 10;
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
export const MAX_QUESTIONS = 60;
export const MAX_COMMENT = 4000;

export type QuestionType = "scale" | "text";

export type SurveyQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  /** Shown as a heading above this question. Presentation only — nothing is averaged by section. */
  section?: string | null;
  /** Five words for the five points, lowest first. Without them the question shows 1 to 5 with the ends named. */
  scaleLabels?: string[] | null;
  /** A scale question may carry its own wording for the ends of the scale. */
  lowLabel?: string | null;
  highLabel?: string | null;
  required: boolean;
};

/** A question the respondent answers about themselves, used only for breakdowns. */
export type SurveyGroupField = {
  key: string;
  label: string;
  options: string[];
  required: boolean;
};

export type SurveyDefinition = {
  id: string;
  title: string;
  intro: string | null;
  status: "draft" | "open" | "closed";
  minimumGroup: number;
  groupFields: SurveyGroupField[];
  questions: SurveyQuestion[];
};

export type SubmittedAnswer = { questionId: string; rating?: number | null; text?: string | null };

export type StoredResponse = {
  id: string;
  groups: Record<string, string>;
  answers: SubmittedAnswer[];
};

// ── authoring ────────────────────────────────────────────────────────────────

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function validateQuestions(input: unknown): { ok: true; questions: Omit<SurveyQuestion, "id">[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) errors.push("Add at least one question.");
  if (rows.length > MAX_QUESTIONS) errors.push(`A survey can hold up to ${MAX_QUESTIONS} questions.`);

  const questions = rows.map((row, index) => {
    const raw = (row ?? {}) as Record<string, unknown>;
    const prompt = text(raw.prompt);
    const type: QuestionType = raw.type === "text" ? "text" : "scale";
    if (prompt.length < 3 || prompt.length > 300) errors.push(`Question ${index + 1} needs wording between 3 and 300 characters.`);
    return {
      position: index + 1,
      type,
      prompt,
      section: text(raw.section) || null,
      scaleLabels: Array.isArray(raw.scaleLabels) && raw.scaleLabels.length === SCALE_MAX ? raw.scaleLabels.map(text) : null,
      lowLabel: type === "scale" ? text(raw.lowLabel) || null : null,
      highLabel: type === "scale" ? text(raw.highLabel) || null : null,
      // A free-text question is optional unless it is deliberately made required:
      // forcing a comment is the quickest way to get "n/a" from 36 people.
      required: raw.required === true || (type === "scale" && raw.required !== false),
    };
  });

  return errors.length ? { ok: false, errors } : { ok: true, questions };
}

export function validateGroupFields(input: unknown): { ok: true; fields: SurveyGroupField[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const rows = Array.isArray(input) ? input : [];
  const fields: SurveyGroupField[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const raw = (row ?? {}) as Record<string, unknown>;
    const label = text(raw.label);
    const key = (text(raw.key) || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const options = (Array.isArray(raw.options) ? raw.options : []).map(text).filter(Boolean);
    if (label.length < 2 || label.length > 80) errors.push(`Group ${index + 1} needs a label between 2 and 80 characters.`);
    if (!key) errors.push(`Group ${index + 1} needs a name.`);
    if (seen.has(key)) errors.push(`Two groups are both called "${label}".`);
    if (options.length < 2) errors.push(`"${label || `Group ${index + 1}`}" needs at least two options.`);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) errors.push(`"${label}" has the same option twice.`);
    seen.add(key);
    fields.push({ key, label, options, required: raw.required !== false });
  });

  return errors.length ? { ok: false, errors } : { ok: true, fields };
}

export function validateMinimumGroup(value: unknown): number | null {
  const minimum = Number(value ?? MINIMUM_GROUP);
  if (!Number.isInteger(minimum) || minimum < MINIMUM_GROUP || minimum > MAX_MINIMUM_GROUP) return null;
  return minimum;
}

// ── answering ────────────────────────────────────────────────────────────────

/**
 * Checks one submission against the survey.
 *
 * Unknown questions and unknown group options are refused rather than stored,
 * so a hand-edited request cannot add a group of one to the report.
 */
export function validateSubmission(
  survey: Pick<SurveyDefinition, "status" | "questions" | "groupFields">,
  body: { answers?: unknown; groups?: unknown },
): { ok: true; answers: SubmittedAnswer[]; groups: Record<string, string> } | { ok: false; errors: string[] } {
  if (survey.status !== "open") return { ok: false, errors: ["This survey is closed."] };

  const errors: string[] = [];
  const byId = new Map(survey.questions.map((question) => [question.id, question]));
  const supplied = new Map<string, SubmittedAnswer>();

  for (const row of Array.isArray(body.answers) ? body.answers : []) {
    const raw = (row ?? {}) as Record<string, unknown>;
    const question = byId.get(text(raw.questionId));
    if (!question) continue;

    if (question.type === "scale") {
      const rating = Number(raw.rating);
      if (raw.rating === null || raw.rating === undefined || raw.rating === "") continue;
      if (!Number.isFinite(rating) || rating < SCALE_MIN || rating > SCALE_MAX) {
        errors.push(`Choose a rating between ${SCALE_MIN} and ${SCALE_MAX} for "${question.prompt}".`);
        continue;
      }
      supplied.set(question.id, { questionId: question.id, rating: Math.round(rating) });
    } else {
      const comment = text(raw.text).slice(0, MAX_COMMENT);
      if (comment) supplied.set(question.id, { questionId: question.id, text: comment });
    }
  }

  for (const question of survey.questions) {
    if (question.required && !supplied.has(question.id)) errors.push(`"${question.prompt}" needs an answer.`);
  }

  const groups: Record<string, string> = {};
  const suppliedGroups = (body.groups ?? {}) as Record<string, unknown>;
  for (const field of survey.groupFields) {
    const chosen = text(suppliedGroups[field.key]);
    if (!chosen) {
      if (field.required) errors.push(`Choose your ${field.label.toLowerCase()}.`);
      continue;
    }
    if (!field.options.includes(chosen)) {
      errors.push(`"${chosen}" is not one of the ${field.label.toLowerCase()} options.`);
      continue;
    }
    groups[field.key] = chosen;
  }

  if (!supplied.size) errors.push("Answer at least one question before sending.");
  return errors.length ? { ok: false, errors } : { ok: true, answers: [...supplied.values()], groups };
}

// ── reading ──────────────────────────────────────────────────────────────────

export type QuestionResult = {
  questionId: string;
  prompt: string;
  section: string | null;
  scaleLabels: string[] | null;
  /**
   * The share who chose one of the top two points, as a percentage.
   *
   * This is the figure to compare across questions measured on different
   * scales. "68% of managers say usually or always" and "34% of staff agree or
   * strongly agree" can sit side by side; a mean of 3.8 on frequency and 3.2 on
   * agreement cannot, because they are not the same quantity.
   */
  topTwoBox: number | null;
  type: QuestionType;
  answered: number;
  mean: number | null;
  /** How many people chose each point on the scale, 1 to 5. */
  distribution: number[];
  /** Free-text answers, never carrying who said them or which group they were in. */
  comments: string[];
};

export type GroupResult = {
  key: string;
  label: string;
  groups: Array<{
    value: string;
    responses: number;
    suppressed: boolean;
    /** True for the pooled row holding every group too small to name. */
    pooled: boolean;
    /** How many named groups were folded into this row. Only set on the pooled row. */
    pooledFrom: number;
    /** Per-question means, or null where the row is too small to report. */
    questions: Array<{ questionId: string; mean: number | null; answered: number }>;
    mean: number | null;
  }>;
  /** Named groups that are not shown on their own, whether pooled or withheld. */
  hiddenGroups: number;
  /** True when even the pooled row was too small to show, so those answers appear only in the totals. */
  pooledWithheld: boolean;
};

export const OTHER_LABEL = "Other (too small to name)";

export type SurveyReport = {
  responses: number;
  minimumGroup: number;
  /** True when the survey as a whole is still below the minimum: nothing is shown. */
  suppressed: boolean;
  overallMean: number | null;
  questions: QuestionResult[];
  breakdowns: GroupResult[];
};

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null);

/**
 * Turns submissions into the only numbers anybody should see.
 *
 * Below the minimum, the whole report is withheld rather than shown with gaps:
 * with four responses, "3 people answered this question" and one absent answer
 * is enough to work backwards in a small team.
 */
export function buildReport(survey: SurveyDefinition, responses: StoredResponse[]): SurveyReport {
  const minimum = survey.minimumGroup;
  const total = responses.length;

  if (total < minimum) {
    return { responses: total, minimumGroup: minimum, suppressed: true, overallMean: null, questions: [], breakdowns: [] };
  }

  const ordered = [...survey.questions].sort((a, b) => a.position - b.position);
  const ratingsFor = (questionId: string, from: StoredResponse[]) =>
    from
      .map((response) => response.answers.find((answer) => answer.questionId === questionId)?.rating)
      .filter((rating): rating is number => typeof rating === "number");

  const questions: QuestionResult[] = ordered.map((question) => {
    if (question.type === "text") {
      const comments = responses
        .map((response) => response.answers.find((answer) => answer.questionId === question.id)?.text)
        .filter((comment): comment is string => Boolean(comment && comment.trim()));
      return { questionId: question.id, prompt: question.prompt, section: question.section ?? null, scaleLabels: null, topTwoBox: null, type: "text", answered: comments.length, mean: null, distribution: [], comments };
    }
    const ratings = ratingsFor(question.id, responses);
    const distribution = Array.from({ length: SCALE_MAX }, (_, index) => ratings.filter((rating) => rating === index + 1).length);
    const topTwo = ratings.filter((rating) => rating >= SCALE_MAX - 1).length;
    return {
      questionId: question.id,
      prompt: question.prompt,
      section: question.section ?? null,
      scaleLabels: question.scaleLabels ?? null,
      type: "scale",
      answered: ratings.length,
      mean: mean(ratings),
      topTwoBox: ratings.length ? Math.round((topTwo / ratings.length) * 100) : null,
      distribution,
      comments: [],
    };
  });

  const scaleMeans = questions.filter((question) => question.type === "scale" && question.mean !== null).map((question) => question.mean as number);

  // One breakdown per group field. Never both at once — see the rules at the top.
  const breakdowns: GroupResult[] = survey.groupFields.map((field) => {
    const buckets = new Map<string, StoredResponse[]>();
    for (const response of responses) {
      const value = response.groups?.[field.key];
      if (!value) continue;
      const bucket = buckets.get(value);
      if (bucket) bucket.push(response);
      else buckets.set(value, [response]);
    }

    const summarise = (value: string, members: StoredResponse[], pooled: boolean, pooledFrom: number) => {
      const perQuestion = ordered
        .filter((question) => question.type === "scale")
        .map((question) => {
          const ratings = ratingsFor(question.id, members);
          return { questionId: question.id, mean: mean(ratings), answered: ratings.length };
        });
      return {
        value,
        responses: members.length,
        suppressed: false,
        pooled,
        pooledFrom,
        questions: perQuestion,
        mean: mean(perQuestion.map((row) => row.mean).filter((value): value is number => value !== null)),
      };
    };

    const named = field.options.filter((option) => buckets.has(option));
    const bigEnough = named.filter((option) => (buckets.get(option) as StoredResponse[]).length >= minimum);
    const tooSmall = named.filter((option) => !bigEnough.includes(option));

    const groups = bigEnough.map((option) => summarise(option, buckets.get(option) as StoredResponse[], false, 0));

    // Everyone in a group too small to name is pooled, so their answers still
    // count somewhere visible. Because each pooled group holds fewer than the
    // minimum, a pooled row that is big enough to show always mixes at least
    // two of them — which is what keeps it from naming anybody.
    const pooledMembers = tooSmall.flatMap((option) => buckets.get(option) as StoredResponse[]);
    const pooledWithheld = pooledMembers.length > 0 && pooledMembers.length < minimum;
    if (pooledMembers.length >= minimum) {
      groups.push(summarise(OTHER_LABEL, pooledMembers, true, tooSmall.length));
    }

    return { key: field.key, label: field.label, groups, hiddenGroups: tooSmall.length, pooledWithheld };
  });

  return {
    responses: total,
    minimumGroup: minimum,
    suppressed: false,
    overallMean: mean(scaleMeans),
    questions,
    breakdowns,
  };
}

/** Every comment in the survey, stripped of anything about who wrote it — the input for AI themes. */
export function commentsFor(report: SurveyReport): string[] {
  return report.questions.filter((question) => question.type === "text").flatMap((question) => question.comments);
}

/** A spreadsheet of the aggregate. Individual submissions are never exported. */
export function reportCsv(report: SurveyReport): string {
  const cell = (value: string | number | null) => {
    const raw = value === null ? "" : String(value);
    // A leading =, +, - or @ makes Excel treat text as a formula.
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [["Question", "Answers", "Average", "Top two (%)"].map(cell).join(",")];
  for (const question of report.questions) {
    if (question.type !== "scale") continue;
    lines.push([question.prompt, question.answered, question.mean, question.topTwoBox].map(cell).join(","));
  }
  for (const breakdown of report.breakdowns) {
    lines.push("");
    lines.push([breakdown.label, "Responses", "Average"].map(cell).join(","));
    for (const group of breakdown.groups) {
      lines.push([group.value, group.responses, group.mean].map(cell).join(","));
    }
    if (breakdown.pooledWithheld) lines.push(["Too small to report, counted in the totals only", "", ""].map(cell).join(","));
  }
  return lines.join("\n");
}
