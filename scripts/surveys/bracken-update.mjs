/**
 * Bring the two live Bracken drafts in line with brackenSurveys.mjs, without
 * changing their links.
 *
 * Re-running the create script would mint new links; this patches what is
 * already there: the preamble, and the five named points on every rated
 * question. It refuses once anyone has answered, because changing the wording
 * underneath people who have already replied makes the results meaningless.
 *
 *   node scripts/surveys/bracken-update.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { MANAGERS, STAFF } from "./brackenSurveys.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: columnError } = await admin.from("survey_questions").select("scale_labels").limit(0);
if (columnError) {
  console.error("\nThe scale_labels column is not there yet.");
  console.error("Apply supabase/migrations/20260925_000003_survey_scale_labels.sql first, then run this again.\n");
  process.exit(1);
}

for (const survey of [STAFF, MANAGERS]) {
  const { data: row, error } = await admin.from("surveys").select("id, slug, status").eq("title", survey.title).maybeSingle();
  if (error) throw new Error(`Could not find "${survey.title}": ${error.message}`);
  if (!row) {
    console.log(`${survey.title}\n  not in Pulse — run scripts/surveys/bracken.mjs first\n`);
    continue;
  }

  const { count } = await admin.from("survey_responses").select("id", { count: "exact", head: true }).eq("survey_id", row.id);
  if ((count ?? 0) > 0) {
    console.log(`${survey.title}\n  ${count} people have already answered — left untouched\n`);
    continue;
  }

  const { error: introError } = await admin
    .from("surveys")
    .update({ intro: survey.intro, closing_note: survey.closingNote, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (introError) throw new Error(`Could not update the preamble: ${introError.message}`);

  const { data: questions, error: questionError } = await admin
    .from("survey_questions")
    .select("id, position, question_type")
    .eq("survey_id", row.id)
    .order("position");
  if (questionError) throw new Error(`Could not read the questions: ${questionError.message}`);

  let labelled = 0;
  for (const question of questions ?? []) {
    const intended = survey.questions[question.position - 1];
    if (!intended || question.question_type !== "scale" || !intended.scaleLabels) continue;
    const { error: labelError } = await admin
      .from("survey_questions")
      .update({ scale_labels: intended.scaleLabels, low_label: intended.lowLabel, high_label: intended.highLabel })
      .eq("id", question.id);
    if (labelError) throw new Error(`Could not label a question: ${labelError.message}`);
    labelled += 1;
  }

  console.log(`${survey.title}\n  preamble updated, ${labelled} questions now show five named points`);
  console.log(`  link unchanged: ${(env.NEXT_PUBLIC_APP_URL ?? "https://app.pulse.stuartdavidson.org").replace(/\/$/, "")}/s/${row.slug}\n`);
}
