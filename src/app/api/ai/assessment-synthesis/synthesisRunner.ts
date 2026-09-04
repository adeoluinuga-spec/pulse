/**
 * Shared machinery for verbatim synthesis. Not a route — App Router only serves
 * route.ts / page.tsx, so this file sits alongside them as a module.
 *
 * PERSISTENCE NOTE. Requirement 5 wants generated and edited versions stored
 * with an editor recorded, and requirement 6 wants a resumable pass with token
 * accounting. This branch is not allowed to write migrations, and there is no
 * table for AI output, so both ride on assessment_audit_events: an append-only
 * log with a jsonb metadata column. That gives version history and an editor
 * trail for free, and resumability falls out of "which subjects already have a
 * generated event". It is the right shape for an audit trail and the wrong
 * shape for a document store — reading the current draft means fetching the
 * latest event per subject. A dedicated assessment_ai_syntheses table belongs on
 * the contract branch.
 */

import { createHash } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import { getAnthropicClient } from "@/lib/anthropic";
import {
  addUsage,
  findQuotationInSynthesis,
  gateThemes,
  pseudonymiseVerbatims,
  type GatedTheme,
  type PseudonymisedComment,
  type RawVerbatim,
  type TokenUsage,
} from "@/lib/assessmentSynthesis";
import { canManageReportState } from "@/lib/assessmentReportAccess";

export const SYNTHESIS_MODEL = "claude-opus-5";

/**
 * The existing ai routes cap at 1000 tokens, which cannot hold five themes with
 * descriptions plus strengths, development areas and divergence — it truncates
 * mid-object and the structured parse fails. 16000 is the SDK's recommended
 * non-streaming default and leaves headroom; the cohort pass streams because it
 * writes considerably more.
 */
export const SUBJECT_MAX_TOKENS = 16000;
export const COHORT_MAX_TOKENS = 32000;

/** Attempts at a clean, unquoted synthesis before a subject is failed. */
export const MAX_QUOTATION_RETRIES = 2;

export const ACTION_GENERATED = "ai_synthesis_generated";
export const ACTION_EDITED = "ai_synthesis_edited";
export const ACTION_RELEASED = "ai_synthesis_released";
export const ACTION_FAILED = "ai_synthesis_failed";
export const ACTION_COHORT = "ai_cohort_synthesis_generated";

export type Admin = SupabaseClient;

export function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type Caller = { userId: string; orgId: string; role: string };

/**
 * Consultant-facing endpoints only. Individual synthesis reads verbatims and
 * therefore stays super-admin only until an aggregate-only synthesis surface is
 * split out.
 */
export async function authoriseCaller(): Promise<
  { caller: Caller; error: null } | { caller: null; error: { message: string; status: number } }
> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { caller: null, error: { message: "Unauthorized", status: 401 } };

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ org_id: string; platform_role: string }>();

  const orgId = employee?.org_id;
  const role = employee?.platform_role;

  if (!orgId || !role || !canManageReportState(role)) {
    return { caller: null, error: { message: "Forbidden", status: 403 } };
  }

  return { caller: { userId: user.id, orgId, role }, error: null };
}

export async function cycleBelongsToOrg(admin: Admin, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

// ── schemas ────────────────────────────────────────────────────────────────

const SUBJECT_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          supportingLabels: {
            type: "array",
            items: { type: "string" },
            description:
              "The reviewer labels this theme draws on, exactly as given, e.g. 'Colleague 2'.",
          },
        },
        required: ["title", "description", "supportingLabels"],
        additionalProperties: false,
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    developmentAreas: { type: "array", items: { type: "string" } },
    divergence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          observation: { type: "string" },
          higherCategory: { type: "string" },
          lowerCategory: { type: "string" },
        },
        required: ["observation", "higherCategory", "lowerCategory"],
        additionalProperties: false,
      },
    },
  },
  required: ["themes", "strengths", "developmentAreas", "divergence"],
  additionalProperties: false,
} as const;

const COHORT_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          prevalence: { type: "string" },
        },
        required: ["title", "description", "prevalence"],
        additionalProperties: false,
      },
    },
    capabilityGaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          affectedSegments: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "affectedSegments"],
        additionalProperties: false,
      },
    },
    interventions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
        },
        required: ["title", "description", "priority", "rationale"],
        additionalProperties: false,
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["level", "function", "region"] },
          value: { type: "string" },
          observation: { type: "string" },
        },
        required: ["dimension", "value", "observation"],
        additionalProperties: false,
      },
    },
  },
  required: ["themes", "capabilityGaps", "interventions", "segments"],
  additionalProperties: false,
} as const;

export type SubjectSynthesis = {
  themes: Array<{ title: string; description: string; supportingLabels: string[] }>;
  strengths: string[];
  developmentAreas: string[];
  divergence: Array<{ observation: string; higherCategory: string; lowerCategory: string }>;
};

export type GatedSubjectSynthesis = Omit<SubjectSynthesis, "themes"> & {
  themes: GatedTheme[];
  suppressedThemeCount: number;
};

const SYSTEM_PROMPT = `You are synthesising 360-degree feedback for an executive development programme.

You will receive anonymised comments about one leader. Each is labelled only by rater category and a number, such as "Colleague 2". You will never be told who wrote anything, and you must not speculate about it.

Absolute rules:
- Write every word in your own words. Never quote, and never reuse a distinctive phrase, image or turn of phrase from a comment. Writing style identifies people in a small cohort.
- Never name a person, a team, a place, a project or a date that appears in a comment. Describe the substance at a level of generality that could not be traced back.
- Never attribute anything to an individual rater. Speak of a category only when several people in it said something similar.
- If you cannot support a theme from at least three separate raters, do not raise it.
- Ground every theme in what the comments actually say. Do not infer, extrapolate or supply plausible-sounding leadership commentary.

For each theme, list in supportingLabels the exact labels of the raters whose comments it draws on. These are checked; a theme without enough distinct support is discarded.`;

// ── model calls ────────────────────────────────────────────────────────────

export class SynthesisError extends Error {
  constructor(
    message: string,
    readonly code: "truncated" | "refused" | "quotation" | "empty" | "api",
  ) {
    super(message);
    this.name = "SynthesisError";
  }
}

function usageOf(message: { usage?: Anthropic.Usage }): Partial<TokenUsage> {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    requests: 1,
  };
}

/**
 * Truncation is treated as a hard failure rather than salvaged. A synthesis cut
 * off mid-object is not partially useful — the structured parse fails, and a
 * half-written theme is exactly the kind of thing a consultant would skim past.
 * One retry at double the ceiling, then the subject is recorded as failed and
 * the pass moves on.
 */
async function callSubjectModel(
  client: Anthropic,
  userPrompt: string,
  maxTokens: number,
): Promise<{ synthesis: SubjectSynthesis; usage: Partial<TokenUsage> }> {
  const message = await client.messages.parse({
    model: SYNTHESIS_MODEL,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: jsonSchemaOutputFormat(SUBJECT_SCHEMA),
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  if (message.stop_reason === "refusal") {
    throw new SynthesisError("The model declined to synthesise this subject.", "refused");
  }

  if (message.stop_reason === "max_tokens") {
    throw new SynthesisError(`Output truncated at ${maxTokens} tokens.`, "truncated");
  }

  const parsed = message.parsed_output as SubjectSynthesis | null;
  if (!parsed) throw new SynthesisError("The model returned no parseable synthesis.", "empty");

  return { synthesis: parsed, usage: usageOf(message) };
}

/**
 * Runs the synthesis, then checks the output against the source comments for any
 * run of more than eight consecutive shared words. A hit is regenerated with an
 * explicit correction rather than patched, because a paraphrase stitched over a
 * quotation tends to keep the distinctive part.
 */
export async function synthesiseSubject(
  client: Anthropic,
  comments: PseudonymisedComment[],
): Promise<{ synthesis: GatedSubjectSynthesis; usage: TokenUsage; retries: number }> {
  const sources = comments.map((comment) => comment.text);
  const basePrompt = [
    "Anonymised feedback comments about one leader:",
    "",
    ...comments.map(
      (comment) =>
        `[${comment.label}] ${comment.text}`,
    ),
    "",
    "Produce 3 to 5 themes with a short description each, plus strengths, development areas, and any notable divergence between rater categories.",
  ].join("\n");

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };
  let maxTokens = SUBJECT_MAX_TOKENS;
  let correction = "";

  for (let attempt = 0; attempt <= MAX_QUOTATION_RETRIES; attempt += 1) {
    let result;
    try {
      result = await callSubjectModel(client, basePrompt + correction, maxTokens);
    } catch (error) {
      if (error instanceof SynthesisError && error.code === "truncated" && maxTokens === SUBJECT_MAX_TOKENS) {
        maxTokens = SUBJECT_MAX_TOKENS * 2;
        result = await callSubjectModel(client, basePrompt + correction, maxTokens);
      } else {
        throw error;
      }
    }

    usage = addUsage(usage, result.usage);

    const quoted = findQuotationInSynthesis(result.synthesis, sources);
    if (!quoted) {
      const themes = gateThemes(result.synthesis.themes);
      return {
        synthesis: {
          ...result.synthesis,
          themes: themes.filter((theme) => !theme.suppressed),
          suppressedThemeCount: themes.filter((theme) => theme.suppressed).length,
        },
        usage,
        retries: attempt,
      };
    }

    correction =
      "\n\nYour previous attempt reused wording from a comment verbatim, which can identify its author. Rewrite the entire synthesis from scratch in your own words. Do not reuse any phrase from the comments.";
  }

  throw new SynthesisError(
    `Output still reused source wording after ${MAX_QUOTATION_RETRIES} regeneration attempts.`,
    "quotation",
  );
}

export async function synthesiseCohort(
  client: Anthropic,
  digest: string,
): Promise<{ synthesis: unknown; usage: Partial<TokenUsage> }> {
  const stream = client.messages.stream({
    model: SYNTHESIS_MODEL,
    max_tokens: COHORT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: jsonSchemaOutputFormat(COHORT_SCHEMA),
    },
    messages: [{ role: "user", content: digest }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new SynthesisError("The model declined to synthesise the cohort.", "refused");
  }
  if (message.stop_reason === "max_tokens") {
    throw new SynthesisError(`Cohort output truncated at ${COHORT_MAX_TOKENS} tokens.`, "truncated");
  }

  const text = message.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new SynthesisError("The model returned no cohort synthesis.", "empty");
  }

  try {
    return { synthesis: JSON.parse(text.text), usage: usageOf(message) };
  } catch {
    throw new SynthesisError("The cohort synthesis was not valid JSON.", "empty");
  }
}

// ── data loading ───────────────────────────────────────────────────────────

type VerbatimRow = {
  subject_id: string;
  rater_key: string;
  competency_id: string | null;
  item_id: string;
  reviewer_group: string;
  comment: string | null;
};

/**
 * Loads comments for a cycle. Only submitted reviewers are read: a draft is a
 * rater's private working copy and must not reach the model.
 *
 * Reads from assessment_response_verbatims_pseudonymized so no non-super read
 * path ever joins a comment back to reviewer_name or reviewer_email.
 */
export async function loadVerbatims(
  admin: Admin,
  cycleId: string,
  subjectId?: string,
): Promise<Map<string, { verbatims: RawVerbatim[]; names: string[] }>> {
  let query = admin
    .from("assessment_response_verbatims_pseudonymized")
    .select(
      "subject_id, rater_key, competency_id, item_id, reviewer_group, comment",
    )
    .eq("cycle_id", cycleId)
    .not("comment", "is", null);

  if (subjectId) query = query.eq("subject_id", subjectId);

  const { data, error } = await query.returns<VerbatimRow[]>();
  if (error) throw new Error(`Failed to load verbatims: ${error.message}`);

  const { data: subjects } = await admin
    .from("assessment_subjects")
    .select("id, name")
    .eq("cycle_id", cycleId)
    .returns<Array<{ id: string; name: string | null }>>();

  const subjectNames = new Map((subjects ?? []).map((row) => [row.id, row.name ?? ""]));
  const grouped = new Map<string, { verbatims: RawVerbatim[]; names: string[] }>();

  for (const row of data ?? []) {
    if (!row.comment?.trim()) continue;
    const bucket = grouped.get(row.subject_id) ?? {
      verbatims: [],
      names: [subjectNames.get(row.subject_id) ?? ""].filter(Boolean),
    };

    bucket.verbatims.push({
      reviewerId: row.rater_key,
      raterGroup: row.reviewer_group ?? "colleague",
      competencyId: row.competency_id,
      itemId: row.item_id,
      comment: row.comment,
    });

    grouped.set(row.subject_id, bucket);
  }

  return grouped;
}

export function buildComments(
  verbatims: RawVerbatim[],
  names: string[],
): PseudonymisedComment[] {
  return pseudonymiseVerbatims(verbatims, names);
}

/** Stable fingerprint of the inputs, so a re-run can tell whether they changed. */
export function inputFingerprint(comments: PseudonymisedComment[]): string {
  return createHash("sha256")
    .update(comments.map((comment) => `${comment.label}:${comment.text}`).sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
}

// ── draft store, on assessment_audit_events ────────────────────────────────

export type SynthesisEvent = {
  subject_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function loadSynthesisEvents(
  admin: Admin,
  cycleId: string,
): Promise<SynthesisEvent[]> {
  const { data, error } = await admin
    .from("assessment_audit_events")
    .select("subject_id, action, metadata, created_at")
    .eq("cycle_id", cycleId)
    .in("action", [ACTION_GENERATED, ACTION_EDITED, ACTION_RELEASED, ACTION_FAILED, ACTION_COHORT])
    .order("created_at", { ascending: true })
    .returns<SynthesisEvent[]>();

  if (error) throw new Error(`Failed to load synthesis events: ${error.message}`);
  return data ?? [];
}

export type SynthesisDraft = {
  subjectId: string | null;
  status: "draft" | "edited" | "released";
  generated: unknown;
  edited: unknown | null;
  current: unknown;
  editedBy: string | null;
  editedAt: string | null;
  releasedBy: string | null;
  releasedAt: string | null;
  generatedAt: string | null;
  usage: Partial<TokenUsage> | null;
};

/**
 * Folds the event log into the current state per subject. Both the generated and
 * the edited version are kept — "AI-generated, consultant-reviewed" has to be
 * demonstrable from the data, not just asserted in a method statement.
 */
export function foldDrafts(events: SynthesisEvent[]): Map<string, SynthesisDraft> {
  const drafts = new Map<string, SynthesisDraft>();

  for (const event of events) {
    const key = event.subject_id ?? "__cohort__";
    const existing =
      drafts.get(key) ??
      ({
        subjectId: event.subject_id,
        status: "draft",
        generated: null,
        edited: null,
        current: null,
        editedBy: null,
        editedAt: null,
        releasedBy: null,
        releasedAt: null,
        generatedAt: null,
        usage: null,
      } satisfies SynthesisDraft);

    if (event.action === ACTION_GENERATED || event.action === ACTION_COHORT) {
      existing.generated = event.metadata.synthesis ?? null;
      existing.current = existing.edited ?? existing.generated;
      existing.generatedAt = event.created_at;
      existing.usage = (event.metadata.usage as Partial<TokenUsage>) ?? null;
    } else if (event.action === ACTION_EDITED) {
      existing.edited = event.metadata.synthesis ?? null;
      existing.current = existing.edited;
      existing.editedBy = (event.metadata.editedBy as string) ?? null;
      existing.editedAt = event.created_at;
      existing.status = "edited";
    } else if (event.action === ACTION_RELEASED) {
      existing.releasedBy = (event.metadata.releasedBy as string) ?? null;
      existing.releasedAt = event.created_at;
      existing.status = "released";
    }

    drafts.set(key, existing);
  }

  return drafts;
}
