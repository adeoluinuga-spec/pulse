import { buildReport, commentsFor, reportCsv } from "@/lib/survey";
import { loadResponses, loadSurvey, reply, surveyContext } from "@/lib/surveyServer";

/**
 * One survey: its definition, its report, and opening or closing it.
 *
 * The report is the only way anybody reads the answers. It is built by
 * `buildReport`, which hides groups below the minimum and never crosses one
 * group with another. There is no endpoint that returns individual submissions,
 * because there is no honest use for one.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ surveyId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { surveyId } = await params;
  const auth = await surveyContext();
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  let loaded, responses;
  try {
    loaded = await loadSurvey(admin, { id: surveyId, orgId: actor.orgId });
    if (!loaded) return reply({ error: "That survey was not found." }, 404);
    responses = await loadResponses(admin, surveyId);
  } catch {
    return reply({ error: "Could not read this survey. Please retry." }, 503);
  }

  const report = buildReport(loaded.definition, responses);

  if (new URL(request.url).searchParams.get("format") === "csv") {
    if (report.suppressed) return reply({ error: `Fewer than ${report.minimumGroup} people have answered, so there is nothing to export yet.` }, 409);
    return new Response(reportCsv(report), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${loaded.definition.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.csv"`,
      },
    });
  }

  return reply({
    survey: { ...loaded.definition, slug: loaded.row.slug, openedAt: loaded.row.opened_at, closedAt: loaded.row.closed_at, closingNote: loaded.row.closing_note },
    report,
    commentCount: commentsFor(report).length,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { surveyId } = await params;
  const auth = await surveyContext();
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = String(body.action ?? "");
  if (!["open", "close", "reopen"].includes(action)) return reply({ error: "Unknown action." }, 400);

  let loaded;
  try {
    loaded = await loadSurvey(admin, { id: surveyId, orgId: actor.orgId });
  } catch {
    return reply({ error: "Could not read this survey. Please retry." }, 503);
  }
  if (!loaded) return reply({ error: "That survey was not found." }, 404);

  const status = loaded.row.status;
  if (action === "open" && status !== "draft") return reply({ error: "This survey has already been opened." }, 409);
  if (action === "close" && status !== "open") return reply({ error: "Only an open survey can be closed." }, 409);
  if (action === "reopen" && status !== "closed") return reply({ error: "Only a closed survey can be reopened." }, 409);
  if (action === "open" && !loaded.definition.questions.length) return reply({ error: "Add a question before opening the survey." }, 422);

  const now = new Date().toISOString();
  const patch =
    action === "close"
      ? { status: "closed", closed_at: now, updated_at: now }
      : action === "reopen"
        ? { status: "open", closed_at: null, updated_at: now }
        : { status: "open", opened_at: now, updated_at: now };

  const { error } = await admin.from("surveys").update(patch).eq("id", surveyId).eq("org_id", actor.orgId);
  if (error) return reply({ error: "Could not change the survey. Please retry." }, 500);

  return reply({ status: patch.status });
}
