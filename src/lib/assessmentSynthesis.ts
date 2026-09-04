/**
 * Verbatim synthesis — identity safety and theme gating.
 *
 * Pure functions only; the API routes under src/app/api/ai/assessment-synthesis
 * own the model calls and persistence. Everything here is testable without a
 * network or a database, which matters because this module is the part that
 * keeps a rater anonymous.
 *
 * A senior cohort is small and writing style is identifying. Four defences,
 * layered so that no single one has to be perfect:
 *
 *   1. The model never receives a rater's identity. Names, emails and job
 *      titles are stripped before the request is built; raters reach the model
 *      as "Colleague 2".
 *   2. The model is instructed to synthesise in its own words and quote nothing.
 *   3. Output is scanned afterwards for runs of more than MAX_QUOTED_WORDS
 *      consecutive words shared with any input comment, and regenerated if any
 *      are found. Instruction alone is not a control.
 *   4. A theme drawn from fewer than MINIMUM_COMMENTS_PER_THEME comments inside a
 *      single rater category is suppressed, matching the n<3 rule in the scoring
 *      service.
 */

/** More than this many consecutive shared words counts as a quotation. */
export const MAX_QUOTED_WORDS = 8;

/**
 * Minimum comments behind a theme before it may be reported. Mirrors
 * MINIMUM_RESPONSES_PER_GROUP in the scoring service — a theme traceable to one
 * or two people in a category identifies them as surely as a thin score does.
 */
export const MINIMUM_COMMENTS_PER_THEME = 3;

const GROUP_LABELS: Record<string, string> = {
  self: "Self",
  line_manager: "Line manager",
  colleague: "Colleague",
  direct_report: "Direct report",
  customer: "Customer",
};

export type RawVerbatim = {
  reviewerId: string;
  raterGroup: string;
  competencyId: string | null;
  itemId: string;
  comment: string;
};

/** What actually reaches the model. Note the absence of any identity field. */
export type PseudonymisedComment = {
  /** e.g. "Colleague 2". The only handle the model ever sees. */
  label: string;
  raterGroup: string;
  competencyId: string | null;
  text: string;
};

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Seven or more digits, allowing spaces, dashes and a leading +.
const PHONE = /\+?\d[\d\s-]{6,}\d/g;
const URL = /https?:\/\/\S+/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes direct identifiers from free text before it reaches the model.
 *
 * `names` should carry every person named in the cycle — the subject and the
 * raters — because a comment that names a third party identifies them just as
 * well as a signature would.
 */
export function redactIdentifiers(text: string, names: string[] = []): string {
  let output = String(text ?? "")
    .replace(EMAIL, "[email removed]")
    .replace(URL, "[link removed]")
    .replace(PHONE, "[number removed]");

  // Longest first, so "Ada Obi" is replaced before "Ada".
  const ordered = [...new Set(names.map((name) => name?.trim()).filter(Boolean))].sort(
    (a, b) => b!.length - a!.length,
  );

  for (const name of ordered) {
    for (const part of [name!, ...name!.split(/\s+/)]) {
      if (part.length < 3) continue;
      output = output.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi"), "[name removed]");
    }
  }

  return output.replace(/\s+/g, " ").trim();
}

/**
 * Replaces rater identity with stable per-category pseudonyms.
 *
 * Numbering is assigned over sorted reviewer ids so the same rater keeps the
 * same label across a re-run, which makes a regenerated draft comparable to the
 * one before it. The reviewer id itself never leaves this function.
 */
export function pseudonymiseVerbatims(
  verbatims: RawVerbatim[],
  names: string[] = [],
): PseudonymisedComment[] {
  const byGroup = new Map<string, string[]>();

  for (const verbatim of verbatims ?? []) {
    const group = verbatim.raterGroup;
    const list = byGroup.get(group);
    if (list) {
      if (!list.includes(verbatim.reviewerId)) list.push(verbatim.reviewerId);
    } else {
      byGroup.set(group, [verbatim.reviewerId]);
    }
  }

  const labels = new Map<string, string>();
  for (const [group, reviewerIds] of byGroup) {
    const groupLabel = GROUP_LABELS[group] ?? "Reviewer";
    [...reviewerIds].sort().forEach((reviewerId, index) => {
      labels.set(`${group}:${reviewerId}`, `${groupLabel} ${index + 1}`);
    });
  }

  return (verbatims ?? [])
    .map((verbatim) => ({
      label: labels.get(`${verbatim.raterGroup}:${verbatim.reviewerId}`) ?? "Reviewer",
      raterGroup: verbatim.raterGroup,
      competencyId: verbatim.competencyId,
      text: redactIdentifiers(verbatim.comment, names),
    }))
    .filter((comment) => comment.text.length > 0);
}

// ── anti-quotation ─────────────────────────────────────────────────────────

function tokenise(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(tokens: string[], size: number): string[] {
  if (tokens.length < size) return [];
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    result.push(tokens.slice(i, i + size).join(" "));
  }
  return result;
}

/**
 * Returns the first span of more than `maxWords` consecutive words that the
 * output shares with any source comment, or null when the output is clean.
 *
 * Word-level rather than character-level so that punctuation and capitalisation
 * changes cannot smuggle a quotation past the check.
 */
export function findQuotedSpan(
  output: string,
  sources: string[],
  maxWords: number = MAX_QUOTED_WORDS,
): string | null {
  const size = maxWords + 1;
  const sourceGrams = new Set<string>();

  for (const source of sources ?? []) {
    for (const gram of ngrams(tokenise(source), size)) sourceGrams.add(gram);
  }

  if (!sourceGrams.size) return null;

  for (const gram of ngrams(tokenise(output), size)) {
    if (sourceGrams.has(gram)) return gram;
  }

  return null;
}

/** Every string in a synthesis that a rater's words could have leaked into. */
export function collectSynthesisText(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectSynthesisText(entry, acc));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) =>
      collectSynthesisText(entry, acc),
    );
  }
  return acc;
}

/** Scans an entire synthesis object, not just its top-level prose. */
export function findQuotationInSynthesis(
  synthesis: unknown,
  sources: string[],
  maxWords: number = MAX_QUOTED_WORDS,
): string | null {
  for (const text of collectSynthesisText(synthesis)) {
    const quoted = findQuotedSpan(text, sources, maxWords);
    if (quoted) return quoted;
  }
  return null;
}

// ── theme gating ───────────────────────────────────────────────────────────

export type SynthesisTheme = {
  title: string;
  description: string;
  /**
   * The pseudonymous labels the model drew this theme from. Support is counted
   * from these rather than taken from a number the model reports, so the
   * threshold cannot be talked past.
   */
  supportingLabels: string[];
};

export type GatedTheme = SynthesisTheme & {
  supportCount: number;
  raterGroups: string[];
  suppressed: boolean;
  suppressionReason?: string;
};

function groupOfLabel(label: string): string {
  const base = String(label ?? "").replace(/\s+\d+$/, "").trim().toLowerCase();
  const match = Object.entries(GROUP_LABELS).find(
    ([, value]) => value.toLowerCase() === base,
  );
  return match?.[0] ?? "unknown";
}

export function countThemeSupport(labels: string[]): {
  total: number;
  byGroup: Record<string, number>;
} {
  const unique = [...new Set((labels ?? []).map((label) => String(label ?? "").trim()).filter(Boolean))];
  const byGroup: Record<string, number> = {};

  for (const label of unique) {
    const group = groupOfLabel(label);
    byGroup[group] = (byGroup[group] ?? 0) + 1;
  }

  return { total: unique.length, byGroup };
}

/**
 * Applies the n<3 rule to themes.
 *
 * A theme is suppressed when it rests on fewer than the minimum number of
 * comments overall, or when it comes from a single rater category that has
 * fewer than the minimum. A theme spanning categories survives, but any
 * individual category contributing fewer than the minimum is dropped from its
 * attribution — the pattern can be reported without pointing at the one
 * customer who raised it.
 */
export function gateThemes(
  themes: SynthesisTheme[],
  minimum: number = MINIMUM_COMMENTS_PER_THEME,
): GatedTheme[] {
  return (themes ?? []).map((theme) => {
    const { total, byGroup } = countThemeSupport(theme.supportingLabels);
    const groups = Object.keys(byGroup);

    let suppressed = false;
    let suppressionReason: string | undefined;

    if (total < minimum) {
      suppressed = true;
      suppressionReason = `Drawn from ${total} comment(s); ${minimum} are required.`;
    } else if (groups.length === 1 && byGroup[groups[0]] < minimum) {
      suppressed = true;
      suppressionReason = `Drawn only from ${groups[0]}, with ${byGroup[groups[0]]} comment(s).`;
    }

    // Attribute only to categories that clear the threshold on their own.
    const attributable = groups.filter((group) => byGroup[group] >= minimum);

    return {
      ...theme,
      supportCount: total,
      raterGroups: suppressed ? [] : attributable,
      suppressed,
      suppressionReason,
    };
  });
}

// ── token accounting ───────────────────────────────────────────────────────

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  requests: number;
};

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };

export function addUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    requests: a.requests + (b.requests ?? 0),
  };
}

export function sumUsage(entries: Array<Partial<TokenUsage> | null | undefined>): TokenUsage {
  return (entries ?? []).reduce<TokenUsage>(
    (total, entry) => (entry ? addUsage(total, entry) : total),
    EMPTY_USAGE,
  );
}

/**
 * Groups comments per subject for batching. Around 30-60 comments per subject is
 * a few thousand input tokens — well inside one request, so a subject is never
 * split across calls and the model always sees the whole picture for one person.
 */
export function batchBySubject<T extends { subjectId: string }>(rows: T[]): Map<string, T[]> {
  const batches = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const batch = batches.get(row.subjectId);
    if (batch) batch.push(row);
    else batches.set(row.subjectId, [row]);
  }
  return batches;
}
