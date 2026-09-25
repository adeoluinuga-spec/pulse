import { NextResponse } from "next/server";

import { validateSubmission } from "@/lib/survey";
import { getAdmin, loadSurvey } from "@/lib/surveyServer";

/**
 * Answering a survey. No account, no token, no sign-in.
 *
 * This is the only route in Pulse that accepts data from someone it cannot
 * identify, and that is deliberate: the link was sent with a promise of
 * anonymity, so there is nothing to identify them with.
 *
 * What it therefore does not do: it does not read or set a cookie, does not
 * record where the request came from, and does not keep anything that could be
 * matched to a person later. The database stores the answers and the groups the
 * respondent chose for themselves, and the time rounded to the hour.
 *
 * The cost of that promise is that duplicate submissions cannot be prevented,
 * only discouraged (the page remembers, in the browser, that it has been sent).
 * For a survey sent to a known group of people over a few days, that is a fair
 * trade. It is not a voting system.
 */

export const dynamic = "force-dynamic";

const PUBLIC_HEADERS = { "Cache-Control": "no-store" } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PUBLIC_HEADERS });

type Params = { params: Promise<{ slug: string }> };

/** Nothing here says which organisation it belongs to, or who built it. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  if (!/^[a-z0-9]{16,40}$/.test(slug)) return json({ error: "That link is not valid." }, 404);

  let loaded;
  try {
    loaded = await loadSurvey(getAdmin(), { slug });
  } catch {
    return json({ error: "The survey could not be loaded. Please try again shortly." }, 503);
  }
  if (!loaded) return json({ error: "That link is not valid." }, 404);

  const { definition, row } = loaded;
  if (definition.status === "draft") return json({ error: "This survey is not open yet." }, 409);

  return json({
    survey: {
      title: definition.title,
      intro: definition.intro,
      status: definition.status,
      closingNote: row.closing_note,
      groupFields: definition.groupFields,
      questions: definition.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        lowLabel: question.lowLabel,
        highLabel: question.highLabel,
        required: question.required,
      })),
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  if (!/^[a-z0-9]{16,40}$/.test(slug)) return json({ error: "That link is not valid." }, 404);

  const body = (await request.json().catch(() => ({}))) as { answers?: unknown; groups?: unknown };
  const admin = getAdmin();

  let loaded;
  try {
    loaded = await loadSurvey(admin, { slug });
  } catch {
    return json({ error: "Your answers could not be sent. Please try again shortly." }, 503);
  }
  if (!loaded) return json({ error: "That link is not valid." }, 404);

  const checked = validateSubmission(loaded.definition, body);
  if (!checked.ok) return json({ error: "Some answers are missing.", errors: checked.errors }, 422);

  const { data: response, error } = await admin
    .from("survey_responses")
    .insert({ survey_id: loaded.definition.id, groups: checked.groups })
    .select("id")
    .single<{ id: string }>();
  if (error) return json({ error: "Your answers could not be sent. Please try again shortly." }, 500);

  const { error: answerError } = await admin.from("survey_answers").insert(
    checked.answers.map((answer) => ({
      response_id: response.id,
      question_id: answer.questionId,
      rating: answer.rating ?? null,
      answer_text: answer.text ?? null,
    })),
  );
  if (answerError) {
    // Half a submission is worse than none: it would count as a response while
    // holding no answers, and quietly drag every average around.
    await admin.from("survey_responses").delete().eq("id", response.id);
    return json({ error: "Your answers could not be sent. Please try again shortly." }, 500);
  }

  return json({ received: true, closingNote: loaded.row.closing_note }, 201);
}
