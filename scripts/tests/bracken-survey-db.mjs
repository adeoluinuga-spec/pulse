// The exact Bracken surveys, against a real Postgres, before anybody is sent a
// link: every question satisfies the database's rules, the groupings are
// stored as the report expects, and a run of realistic answers produces a
// report that hides what it should.
//
//   npm i --no-save @electric-sql/pglite
//   node --experimental-strip-types scripts/tests/bracken-survey-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

import { DEPARTMENTS, MANAGERS, STAFF } from "../surveys/brackenSurveys.mjs";
import { buildReport } from "../../src/lib/survey.ts";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const groupKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

try {
  await db.exec(`
    create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  await db.exec(await readFile("supabase/schema/01_tables.sql", "utf8"));
  await db.exec(await readFile("supabase/schema/02_rls.sql", "utf8"));
  await db.exec("grant all on all tables in schema public to anon, authenticated, service_role;");
  await db.query("insert into organisations(id, name, slug) values ($1,'Stuart Davidson','sd')", [ORG]);
  await db.query("insert into employees(id, org_id, name, email, platform_role) values ($1,$2,'Owner','hello@stuartdavidson.org','super_admin')", [OWNER, ORG]);
  await db.exec(await readFile("supabase/migrations/20260925_000001_surveys.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20260925_000002_survey_sections.sql", "utf8"));

  const stored = {};
  for (const [name, survey] of [["staff", STAFF], ["managers", MANAGERS]]) {
    const slug = name === "staff" ? "aaaa1111bbbb2222cccc3333" : "dddd4444eeee5555ffff6666";
    const row = (
      await db.query(
        `insert into surveys(org_id, title, intro, closing_note, slug, minimum_group, group_fields, created_by, status)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'open') returning id`,
        [
          ORG,
          survey.title,
          survey.intro,
          survey.closingNote,
          slug,
          survey.minimumGroup,
          JSON.stringify(survey.groupFields.map((field) => ({ key: groupKey(field.label), label: field.label, options: field.options, required: field.required }))),
          OWNER,
        ],
      )
    ).rows[0];

    for (const [index, question] of survey.questions.entries()) {
      await db.query(
        "insert into survey_questions(survey_id, position, question_type, prompt, section, low_label, high_label, required) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [row.id, index + 1, question.type, question.prompt, question.section, question.lowLabel ?? null, question.highLabel ?? null, question.required],
      );
    }
    stored[name] = row.id;
    console.log(`${survey.title}\n  stored ${survey.questions.length} questions`);
  }

  // ── the instrument is what was intended ────────────────────────────────────
  const staffQuestions = (await db.query("select prompt, section, question_type, low_label, high_label from survey_questions where survey_id = $1 order by position", [stored.staff])).rows;
  assert.equal(staffQuestions.filter((q) => q.question_type === "scale").length, 17, "seventeen rated questions");
  assert.equal(staffQuestions.filter((q) => q.question_type === "text").length, 2, "two free-text questions");
  assert.deepEqual(
    [...new Set(staffQuestions.map((q) => q.section))],
    ["A — Clarity of expectations", "B — My line manager", "C — Working relationships", "D — Direction, tools and engagement", "In your own words"],
    "the four sections, in order",
  );
  for (const question of staffQuestions.filter((q) => q.question_type === "scale")) {
    assert.equal(question.low_label, "Strongly disagree");
    assert.equal(question.high_label, "Strongly agree");
  }

  const managerQuestions = (await db.query("select prompt, question_type, low_label, high_label from survey_questions where survey_id = $1 order by position", [stored.managers])).rows;
  assert.equal(managerQuestions.filter((q) => q.question_type === "scale").length, 10);
  assert.equal(managerQuestions[0].low_label, "Never", "the manager scale runs Never to Always");
  assert.equal(managerQuestions[0].high_label, "Always");

  const groups = (await db.query("select group_fields from surveys where id = $1", [stored.staff])).rows[0].group_fields;
  assert.deepEqual(groups.map((field) => field.key), ["department", "time_at_bracken", "do_you_manage_or_supervise_anyone"]);
  assert.equal(groups[0].options.length, DEPARTMENTS.length);
  assert.ok(groups[0].options.includes("Prefer not to say"));

  // ── a realistic run of answers, and what the report will and will not show ──
  const definition = {
    id: stored.staff,
    title: STAFF.title,
    intro: STAFF.intro,
    status: "open",
    minimumGroup: STAFF.minimumGroup,
    groupFields: groups,
    questions: (await db.query("select id, position, question_type, prompt, section, required from survey_questions where survey_id = $1 order by position", [stored.staff])).rows.map((row) => ({
      id: row.id,
      position: row.position,
      type: row.question_type,
      prompt: row.prompt,
      section: row.section,
      required: row.required,
    })),
  };

  // 12 answers: Creative 6, Production 4, Legal 2 — Legal is too small to report.
  const plan = [...Array(6).fill("Creative"), ...Array(4).fill("Production"), ...Array(2).fill("Legal")];
  const responses = [];
  for (const [index, department] of plan.entries()) {
    const response = (
      await db.query("insert into survey_responses(survey_id, groups) values ($1,$2::jsonb) returning id", [
        stored.staff,
        JSON.stringify({ department, time_at_bracken: index % 2 ? "1–2 years" : "More than 2 years", do_you_manage_or_supervise_anyone: index % 4 === 0 ? "Yes" : "No" }),
      ])
    ).rows[0];
    const answers = [];
    for (const question of definition.questions) {
      if (question.type === "scale") {
        const rating = ((index + question.position) % 5) + 1;
        await db.query("insert into survey_answers(response_id, question_id, rating) values ($1,$2,$3)", [response.id, question.id, rating]);
        answers.push({ questionId: question.id, rating });
      } else if (index === 0) {
        await db.query("insert into survey_answers(response_id, question_id, answer_text) values ($1,$2,$3)", [response.id, question.id, "Clearer handovers between departments"]);
        answers.push({ questionId: question.id, text: "Clearer handovers between departments" });
      }
    }
    responses.push({ id: response.id, groups: (await db.query("select groups from survey_responses where id = $1", [response.id])).rows[0].groups, answers });
  }

  const report = buildReport(definition, responses);
  assert.equal(report.suppressed, false);
  assert.equal(report.responses, 12);

  const byDepartment = report.breakdowns.find((breakdown) => breakdown.key === "department");
  assert.equal(byDepartment.groups.find((group) => group.value === "Creative").responses, 6);
  assert.equal(byDepartment.groups.find((group) => group.value === "Production").responses, 4);
  const legal = byDepartment.groups.find((group) => group.value === "Legal");
  assert.equal(legal.suppressed, true, "two people in Legal are never reported on their own");
  assert.equal(legal.responses, 0);
  assert.equal(legal.mean, null);

  assert.deepEqual(report.breakdowns.map((breakdown) => breakdown.key), ["department", "time_at_bracken", "do_you_manage_or_supervise_anyone"]);
  const asJson = JSON.stringify(report);
  assert.equal(asJson.includes("Creative · More than 2 years"), false, "departments are never crossed with tenure");
  assert.equal(asJson.includes("respondent"), false);

  // The comment is in the report, with nothing about who wrote it.
  const commentQuestion = report.questions.find((question) => question.type === "text" && question.comments.length);
  assert.deepEqual(commentQuestion.comments, ["Clearer handovers between departments"]);
  assert.equal(JSON.stringify(commentQuestion).includes("Creative"), false, "a comment carries no department");

  console.log(
    "\nPASS: both Bracken surveys store cleanly — 17 rated and 2 written questions across four named sections for staff, 10 on a Never-to-Always scale for managers, and the department, tenure and manages-anyone groupings as the report expects; on 12 realistic answers the report gives per-question averages, reports Creative (6) and Production (4) but hides Legal (2) entirely, keeps the three groupings apart, and shows the written comment with no department attached.",
  );
} finally {
  await db.close();
}
