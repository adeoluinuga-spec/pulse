/**
 * Bracken Media Solutions — the two baseline surveys, created in Pulse.
 *
 * The same instrument as the Google Forms script, with two differences that
 * come from Pulse rather than from a choice:
 *
 *   * A rated question is 1 to 5 with the ends named ("Strongly disagree" to
 *     "Strongly agree"), so answers average into a number you can compare
 *     against January. A Google Form gives you five labels and no arithmetic.
 *
 *   * "Do you manage anyone?" and tenure are grouping questions. Pulse reports
 *     each grouping on its own and never crosses two, so nobody can be found by
 *     narrowing department and tenure together.
 *
 * HOW TO USE
 *   1. Apply the two survey migrations first (20260925_000001, 20260925_000002).
 *   2. Check DEPARTMENTS in ./brackenSurveys.mjs against Bracken's real ones.
 *   3. node scripts/surveys/bracken.mjs
 *      It prints both links. Nothing is sent to anyone; you send the links.
 *
 * It refuses to run twice: a survey with the same title in the same
 * organisation stops it, so a second run cannot split responses across two
 * copies. Pass --replace to delete the existing drafts and rebuild them (it
 * will refuse if anybody has already answered).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { MANAGERS, STAFF } from "./brackenSurveys.mjs";

// Whose workspace the surveys belong to. Yours, not the client's: Bracken is
// not on Pulse, and does not need to be for a baseline.
const OWNER_EMAIL = process.env.PULSE_SURVEY_OWNER ?? "hello@stuartdavidson.org";

// ── plumbing ─────────────────────────────────────────────────────────────────

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

const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "https://app.pulse.stuartdavidson.org").replace(/\/$/, "");
const replace = process.argv.includes("--replace");
const slug = () => randomBytes(16).toString("hex").slice(0, 24);
const groupKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function create(survey, owner) {
  const { data: existing, error: lookupError } = await admin
    .from("surveys")
    .select("id, slug, status")
    .eq("org_id", owner.org_id)
    .eq("title", survey.title)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not check for an existing survey: ${lookupError.message}`);

  if (existing) {
    const { count, error: countError } = await admin
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", existing.id);
    if (countError) throw new Error(`Could not count responses: ${countError.message}`);

    if (!replace) {
      console.log(`  already exists (${count ?? 0} responses) — left alone. Use --replace to rebuild it.`);
      return `${appUrl}/s/${existing.slug}`;
    }
    if ((count ?? 0) > 0) throw new Error(`"${survey.title}" already has ${count} responses. Refusing to replace it.`);
    const { error: deleteError } = await admin.from("surveys").delete().eq("id", existing.id);
    if (deleteError) throw new Error(`Could not remove the old draft: ${deleteError.message}`);
    console.log("  removed the previous draft");
  }

  const link = slug();
  const { data: row, error } = await admin
    .from("surveys")
    .insert({
      org_id: owner.org_id,
      title: survey.title,
      intro: survey.intro,
      closing_note: survey.closingNote,
      slug: link,
      minimum_group: survey.minimumGroup,
      group_fields: survey.groupFields.map((field) => ({ key: groupKey(field.label), label: field.label, options: field.options, required: field.required })),
      created_by: owner.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the survey: ${error.message}`);

  const { error: questionError } = await admin.from("survey_questions").insert(
    survey.questions.map((question, index) => ({
      survey_id: row.id,
      position: index + 1,
      question_type: question.type,
      prompt: question.prompt,
      section: question.section,
      low_label: question.lowLabel ?? null,
      high_label: question.highLabel ?? null,
      required: question.required,
    })),
  );
  if (questionError) {
    await admin.from("surveys").delete().eq("id", row.id);
    throw new Error(`Could not add the questions: ${questionError.message}`);
  }

  console.log(`  created with ${survey.questions.length} questions and ${survey.groupFields.length} grouping questions`);
  return `${appUrl}/s/${link}`;
}

const { data: owner, error: ownerError } = await admin
  .from("employees")
  .select("id, org_id, name, platform_role")
  .eq("email", OWNER_EMAIL)
  .maybeSingle();
if (ownerError) throw new Error(`Could not find the owner: ${ownerError.message}`);

// The owner has to be an account that can actually open Surveys in Pulse, or
// the links would exist with nobody able to read the results.
if (!owner?.org_id || !["hr_admin", "super_admin"].includes(owner.platform_role)) {
  const { data: eligible } = await admin
    .from("employees")
    .select("email, platform_role, organisations(name)")
    .in("platform_role", ["hr_admin", "super_admin"])
    .order("email");
  console.error(
    owner?.org_id
      ? `\n${OWNER_EMAIL} is "${owner.platform_role}", and only HR admins and super admins can open Surveys.`
      : `\nThere is no Pulse account with the email ${OWNER_EMAIL}.`,
  );
  console.error("\nAccounts that can own these surveys today:\n");
  for (const row of eligible ?? []) console.error(`  ${row.email}  (${row.platform_role}, ${row.organisations?.name ?? "no organisation"})`);
  console.error("\nRun it with one of them, for example:\n  PULSE_SURVEY_OWNER=hr@stuartdavidson.org node scripts/surveys/bracken.mjs\n");
  process.exit(1);
}

console.log(`Owner: ${owner.name} (${OWNER_EMAIL})\n`);
console.log(STAFF.title);
const staffLink = await create(STAFF, owner);
console.log("\n" + MANAGERS.title);
const managerLink = await create(MANAGERS, owner);

console.log(`
=====================================================================
STAFF SURVEY — send to all staff
  ${staffLink}

MANAGER SELF-ASSESSMENT — managers and team leads
  ${managerLink}
=====================================================================

Both are DRAFTS. The links do nothing until you open each survey in Pulse
(Staff surveys → the survey → "Open survey"). Open them only when you are
ready for answers, and answer each one yourself first to check it reads well.

Results stay hidden until 3 people have answered, and any department with
fewer than 3 answers is never reported on its own.
`);
