import { getAnthropicClient, extractText } from "@/lib/anthropic";
import { buildReport, commentsFor } from "@/lib/survey";
import { loadResponses, loadSurvey, reply, surveyContext } from "@/lib/surveyServer";

/**
 * Themes across the free-text answers.
 *
 * The model sees the comments and nothing else — no department, no level, and
 * nothing that says which answers came from the same person. It is told not to
 * quote anything identifying, because a distinctive sentence gives someone away
 * as surely as a name in a company of thirty-six.
 */

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const auth = await surveyContext();
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  let comments: string[];
  try {
    const loaded = await loadSurvey(admin, { id: surveyId, orgId: actor.orgId });
    if (!loaded) return reply({ error: "That survey was not found." }, 404);
    const report = buildReport(loaded.definition, await loadResponses(admin, surveyId));
    if (report.suppressed) return reply({ error: "Too few answers so far to read themes." }, 409);
    comments = commentsFor(report);
  } catch {
    return reply({ error: "Could not read the survey. Please retry." }, 503);
  }

  if (comments.length < 3) return reply({ error: "There are fewer than three comments, which is too few to theme safely." }, 409);

  try {
    const response = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system:
        "You are reading anonymous staff survey comments for an HR consultant. Identify the themes that recur, how strongly each is felt, and anything that reads as a single voice rather than a pattern. Rules: never quote a sentence in full, never repeat a distinctive detail (a project name, a job title, an incident) that would identify who wrote it, and never guess at who or which team wrote anything. Say how many comments support each theme. If the comments disagree, say so rather than forcing a consensus. Plain text, short paragraphs, no preamble.",
      messages: [{ role: "user", content: JSON.stringify({ commentCount: comments.length, comments }) }],
    });
    const text = extractText(response);
    return reply({ themes: text || "No themes could be drawn from these comments." });
  } catch (error) {
    console.error("survey themes failed:", error);
    return reply({ error: "The themes could not be produced right now. The comments above are unchanged." }, 503);
  }
}
