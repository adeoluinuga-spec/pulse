/**
 * Server plumbing for anonymous surveys.
 *
 * Two kinds of caller: an HR admin who builds and reads a survey, and a member
 * of staff answering a public link with no account at all. The second one is
 * why every table here is closed to browsers — the public route runs on the
 * server, checks the survey is open, and stores only answers.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import type { StoredResponse, SurveyDefinition, SurveyGroupField, SurveyQuestion } from "@/lib/survey";

export type Admin = SupabaseClient;

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE });
}

export function getAdmin(): Admin {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A public link that identifies a survey and nothing else. */
export function newSlug(): string {
  return randomBytes(16).toString("hex").slice(0, 24);
}

export type SurveyActor = { employeeId: string; orgId: string; name: string; isHr: boolean };

/** Who is asking. Surveys are an HR tool: only HR and super admins build or read them. */
export async function surveyContext(): Promise<{ ok: true; admin: Admin; actor: SurveyActor } | { ok: false; response: NextResponse }> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: reply({ error: "Sign in first." }, 401) };

  const admin = getAdmin();
  const { data: employee, error } = await admin
    .from("employees")
    .select("id, org_id, name, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; name: string | null; platform_role: string | null }>();

  if (error) return { ok: false, response: reply({ error: "Could not confirm who you are. Please retry." }, 503) };
  if (!employee?.org_id) return { ok: false, response: reply({ error: "Your account is not linked to an organisation." }, 403) };

  const isHr = employee.platform_role === "hr_admin" || employee.platform_role === "super_admin";
  if (!isHr) return { ok: false, response: reply({ error: "Only HR can work with surveys." }, 403) };

  return { ok: true, admin, actor: { employeeId: employee.id, orgId: employee.org_id, name: employee.name ?? "Someone", isHr } };
}

type SurveyRow = {
  id: string;
  org_id: string;
  title: string;
  intro: string | null;
  slug: string;
  status: "draft" | "open" | "closed";
  minimum_group: number;
  group_fields: SurveyGroupField[];
  closing_note: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

type QuestionRow = {
  id: string;
  position: number;
  question_type: "scale" | "text";
  prompt: string;
  low_label: string | null;
  high_label: string | null;
  required: boolean;
};

export const SURVEY_COLUMNS = "id, org_id, title, intro, slug, status, minimum_group, group_fields, closing_note, opened_at, closed_at, created_at";

function toQuestion(row: QuestionRow): SurveyQuestion {
  return {
    id: row.id,
    position: row.position,
    type: row.question_type,
    prompt: row.prompt,
    lowLabel: row.low_label,
    highLabel: row.high_label,
    required: row.required,
  };
}

export function toDefinition(survey: SurveyRow, questions: QuestionRow[]): SurveyDefinition & { slug: string; orgId: string; intro: string | null } {
  return {
    id: survey.id,
    orgId: survey.org_id,
    title: survey.title,
    intro: survey.intro,
    slug: survey.slug,
    status: survey.status,
    minimumGroup: survey.minimum_group,
    groupFields: Array.isArray(survey.group_fields) ? survey.group_fields : [],
    questions: [...questions].sort((a, b) => a.position - b.position).map(toQuestion),
  };
}

/** A survey with its questions, by id within an organisation, or by public slug. */
export async function loadSurvey(admin: Admin, by: { id: string; orgId: string } | { slug: string }) {
  let query = admin.from("surveys").select(SURVEY_COLUMNS);
  query = "slug" in by ? query.eq("slug", by.slug) : query.eq("id", by.id).eq("org_id", by.orgId);

  const { data: survey, error } = await query.maybeSingle<SurveyRow>();
  if (error) throw new Error("survey");
  if (!survey) return null;

  const { data: questions, error: questionError } = await admin
    .from("survey_questions")
    .select("id, position, question_type, prompt, low_label, high_label, required")
    .eq("survey_id", survey.id)
    .order("position");
  if (questionError) throw new Error("questions");

  return { row: survey, definition: toDefinition(survey, (questions ?? []) as QuestionRow[]) };
}

/** Every submission for a survey, in pages, because a report that silently drops answers is worse than none. */
export async function loadResponses(admin: Admin, surveyId: string): Promise<StoredResponse[]> {
  const rows: Array<{ id: string; groups: Record<string, string> }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("survey_responses")
      .select("id, groups")
      .eq("survey_id", surveyId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("responses");
    rows.push(...((data ?? []) as Array<{ id: string; groups: Record<string, string> }>));
    if (!data || data.length < 1000) break;
  }
  if (!rows.length) return [];

  const answers: Array<{ response_id: string; question_id: string; rating: number | null; answer_text: string | null }> = [];
  const ids = rows.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("survey_answers")
        .select("response_id, question_id, rating, answer_text")
        .in("response_id", chunk)
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error("answers");
      answers.push(...((data ?? []) as typeof answers));
      if (!data || data.length < 1000) break;
    }
  }

  const byResponse = new Map<string, StoredResponse>(rows.map((row) => [row.id, { id: row.id, groups: row.groups ?? {}, answers: [] }]));
  for (const answer of answers) {
    byResponse.get(answer.response_id)?.answers.push({
      questionId: answer.question_id,
      rating: answer.rating ?? undefined,
      text: answer.answer_text ?? undefined,
    });
  }
  return [...byResponse.values()];
}
