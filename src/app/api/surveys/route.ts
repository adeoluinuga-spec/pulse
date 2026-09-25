import { validateGroupFields, validateMinimumGroup, validateQuestions } from "@/lib/survey";
import { loadSurvey, newSlug, reply, surveyContext, SURVEY_COLUMNS } from "@/lib/surveyServer";

/**
 * Surveys an organisation has built. HR only.
 *
 * A survey can be created for an organisation that has nobody else on Pulse:
 * that is the point of it — a baseline before anyone is onboarded.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await surveyContext();
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  const { data, error } = await admin
    .from("surveys")
    .select(SURVEY_COLUMNS)
    .eq("org_id", actor.orgId)
    .order("created_at", { ascending: false });
  if (error) return reply({ error: "Could not load surveys. Please retry." }, 503);

  const surveys = data ?? [];
  const counts = new Map<string, number>();
  for (const survey of surveys) {
    const { count, error: countError } = await admin
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", (survey as { id: string }).id);
    if (countError) return reply({ error: "Could not count responses. Please retry." }, 503);
    counts.set((survey as { id: string }).id, count ?? 0);
  }

  return reply({
    surveys: surveys.map((survey) => ({ ...survey, responses: counts.get((survey as { id: string }).id) ?? 0 })),
  });
}

export async function POST(request: Request) {
  const auth = await surveyContext();
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    intro?: unknown;
    closingNote?: unknown;
    minimumGroup?: unknown;
    groupFields?: unknown;
    questions?: unknown;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3 || title.length > 200) return reply({ error: "Give the survey a title between 3 and 200 characters." }, 422);

  const minimumGroup = validateMinimumGroup(body.minimumGroup);
  if (minimumGroup === null) return reply({ error: "The smallest group that can be reported must be between 3 and 10." }, 422);

  const groups = validateGroupFields(body.groupFields ?? []);
  if (!groups.ok) return reply({ error: "These grouping questions are not complete.", errors: groups.errors }, 422);

  const questions = validateQuestions(body.questions);
  if (!questions.ok) return reply({ error: "These questions are not complete.", errors: questions.errors }, 422);

  const { data: survey, error } = await admin
    .from("surveys")
    .insert({
      org_id: actor.orgId,
      title,
      intro: typeof body.intro === "string" ? body.intro.trim().slice(0, 4000) || null : null,
      closing_note: typeof body.closingNote === "string" ? body.closingNote.trim().slice(0, 2000) || null : null,
      slug: newSlug(),
      minimum_group: minimumGroup,
      group_fields: groups.fields,
      created_by: actor.employeeId,
    })
    .select("id, slug")
    .single<{ id: string; slug: string }>();
  if (error) return reply({ error: "Could not save the survey. Please retry." }, 500);

  const { error: questionError } = await admin.from("survey_questions").insert(
    questions.questions.map((question) => ({
      survey_id: survey.id,
      position: question.position,
      question_type: question.type,
      prompt: question.prompt,
      low_label: question.lowLabel,
      high_label: question.highLabel,
      required: question.required,
    })),
  );
  if (questionError) {
    await admin.from("surveys").delete().eq("id", survey.id);
    return reply({ error: "Could not save the questions. Please retry." }, 500);
  }

  let created;
  try {
    created = await loadSurvey(admin, { id: survey.id, orgId: actor.orgId });
  } catch {
    return reply({ error: "The survey was saved but could not be read back. Reload the page." }, 503);
  }

  return reply({ survey: created?.definition, slug: survey.slug }, 201);
}
