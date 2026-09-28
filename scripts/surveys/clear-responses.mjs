/**
 * Clear the responses to a survey — for rehearsal answers, before it is sent.
 *
 * It clears every response to that survey, never a chosen one, and the survey
 * records that it happened. There is deliberately no way to remove a single
 * answer: that would let anybody drop the reply they did not like.
 *
 *   node scripts/surveys/clear-responses.mjs                     # list surveys
 *   node scripts/surveys/clear-responses.mjs <slug>              # show what would go
 *   node scripts/surveys/clear-responses.mjs <slug> --confirm    # clear them
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const [slug] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const confirmed = process.argv.includes("--confirm");

const { data: surveys, error } = await admin.from("surveys").select("id, title, slug, status, responses_cleared, responses_cleared_at");
if (error) {
  console.error(
    error.message.includes("responses_cleared")
      ? "\nApply supabase/migrations/20260928_000001_survey_clear_responses.sql first, then run this again.\n"
      : `Could not read the surveys: ${error.message}`,
  );
  process.exit(1);
}

const countFor = async (id) => {
  const { count } = await admin.from("survey_responses").select("id", { count: "exact", head: true }).eq("survey_id", id);
  return count ?? 0;
};

if (!slug) {
  console.log("\nSurveys:\n");
  for (const survey of surveys) {
    console.log(`  ${survey.slug}  ${String(await countFor(survey.id)).padStart(3)} responses  ${survey.status.padEnd(7)}  ${survey.title}`);
  }
  console.log("\nTo clear one: node scripts/surveys/clear-responses.mjs <slug> --confirm\n");
  process.exit(0);
}

const survey = surveys.find((row) => row.slug === slug);
if (!survey) {
  console.error(`\nNo survey with the link code ${slug}.\n`);
  process.exit(1);
}

const responses = await countFor(survey.id);
console.log(`\n${survey.title}`);
console.log(`  status: ${survey.status} | ${responses} responses`);
if (survey.responses_cleared) console.log(`  (${survey.responses_cleared} were cleared earlier, on ${new Date(survey.responses_cleared_at).toLocaleString("en-GB")})`);

if (!responses) {
  console.log("\nThere is nothing to clear.\n");
  process.exit(0);
}

if (!confirmed) {
  console.log(`\nThis would delete all ${responses} responses and their answers. They cannot be recovered.`);
  console.log(`Run it again with --confirm to go ahead.\n`);
  process.exit(0);
}

const { data: removed, error: clearError } = await admin.rpc("survey_clear_responses", { p_survey: survey.id });
if (clearError) {
  console.error(`\nCould not clear the responses: ${clearError.message}\n`);
  process.exit(1);
}

console.log(`\nCleared ${removed} responses. The survey now shows none, and records that ${removed} were cleared today.\n`);
