// The survey tables against a real Postgres: nothing identifying is stored,
// browsers cannot reach any of it, answers cannot be altered after the fact,
// and questions freeze once people start answering.
//
//   npm i --no-save @electric-sql/pglite
//   node scripts/tests/survey-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const HR = "20000000-0000-4000-8000-000000000001";

const refused = (sql, params, pattern, label) => assert.rejects(() => db.query(sql, params), pattern, label);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

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
  await db.query("insert into organisations(id, name, slug) values ($1, 'Bracken', 'bracken')", [ORG]);
  await db.query("insert into employees(id, org_id, name, email, platform_role) values ($1,$2,'HR','hr@t.co','hr_admin')", [HR, ORG]);
  await db.exec(await readFile("supabase/migrations/20260925_000001_surveys.sql", "utf8"));

  // ── nothing in the shape of the tables can identify a respondent ────────────
  const columns = (await db.query(
    "select column_name from information_schema.columns where table_name in ('survey_responses','survey_answers')",
  )).rows.map((row) => row.column_name);
  for (const forbidden of ["employee_id", "user_id", "email", "token", "token_hash", "ip", "ip_address", "user_agent", "created_by", "session_id"]) {
    assert.ok(!columns.includes(forbidden), `a submission must not carry ${forbidden}`);
  }

  await db.exec("set role service_role");
  const survey = await one(
    `insert into surveys(org_id, title, slug, minimum_group, group_fields, created_by, status)
     values ($1, 'Baseline staff survey', 'abc123def456abc123def456', 3, '[{"key":"department","label":"Department","options":["Sales","Studio"],"required":true}]'::jsonb, $2, 'open')
     returning id`,
    [ORG, HR],
  );
  await refused("insert into surveys(org_id, title, slug) values ($1,'Bad','NOT A SLUG')", [ORG], /check constraint/i, "a slug that is not a link-safe string");
  await refused("insert into surveys(org_id, title, slug, minimum_group) values ($1,'Bad','zzz123def456abc123def456', 2)", [ORG], /check constraint/i, "a minimum group below three");

  const q1 = await one("insert into survey_questions(survey_id, position, question_type, prompt) values ($1, 1, 'scale', 'I am clear about what is expected of me') returning id", [survey.id]);
  const q2 = await one("insert into survey_questions(survey_id, position, question_type, prompt, required) values ($1, 2, 'text', 'What should we start doing?', false) returning id", [survey.id]);

  // ── a submission keeps its answers and the hour, nothing else ───────────────
  const response = await one("insert into survey_responses(survey_id, groups) values ($1, '{\"department\":\"Sales\"}'::jsonb) returning id, submitted_at", [survey.id]);
  assert.equal(new Date(response.submitted_at).getUTCMinutes(), 0, "the time is rounded to the hour, so it cannot fingerprint a person");
  assert.equal(new Date(response.submitted_at).getUTCSeconds(), 0);

  await db.query("insert into survey_answers(response_id, question_id, rating) values ($1,$2,4)", [response.id, q1.id]);
  await db.query("insert into survey_answers(response_id, question_id, answer_text) values ($1,$2,'Clearer priorities')", [response.id, q2.id]);
  await refused("insert into survey_answers(response_id, question_id, rating, answer_text) values ($1,$2,3,'both')", [response.id, q1.id], /duplicate key|check constraint/i, "an answer that is both a rating and words");
  await refused("insert into survey_answers(response_id, question_id, rating) values ($1,$2,9)", [response.id, q2.id], /check constraint/i, "a rating off the scale");
  await refused("insert into survey_answers(response_id, question_id, rating) values ($1,$2,5)", [response.id, q1.id], /duplicate key/i, "answering the same question twice in one submission");

  // ── an answer is final ─────────────────────────────────────────────────────
  await refused("update survey_answers set rating = 1", [], /cannot be changed/i, "editing an answer after it was sent");
  await refused("delete from survey_answers", [], /cannot be changed/i, "deleting a single answer");

  // ── questions freeze once anyone has answered ──────────────────────────────
  await refused("insert into survey_questions(survey_id, position, question_type, prompt) values ($1, 3, 'scale', 'A late addition')", [survey.id], /already answered/i, "adding a question mid-survey");
  await refused("update survey_questions set prompt = 'Reworded' where id = $1", [q1.id], /already answered/i, "rewording a question people have answered");
  await refused("delete from survey_questions where id = $1", [q1.id], /already answered/i, "removing a question people have answered");

  // A survey nobody has answered is still editable.
  const draft = await one("insert into surveys(org_id, title, slug) values ($1,'Draft','def456abc123def456abc123') returning id", [ORG]);
  const draftQuestion = await one("insert into survey_questions(survey_id, position, question_type, prompt) values ($1,1,'scale','Draft question') returning id", [draft.id]);
  await db.query("update survey_questions set prompt = 'Reworded while nobody has answered' where id = $1", [draftQuestion.id]);
  await db.query("delete from survey_questions where id = $1", [draftQuestion.id]);

  // Deleting the survey takes its answers with it.
  await db.query("delete from surveys where id = $1", [draft.id]);
  await db.exec("reset role");

  // ── browsers cannot reach any of it ────────────────────────────────────────
  for (const role of ["authenticated", "anon"]) {
    await db.exec(`set role ${role}`);
    for (const table of ["surveys", "survey_questions", "survey_responses", "survey_answers"]) {
      await refused(`select * from ${table}`, [], /permission denied/i, `${role} reading ${table}`);
    }
    await refused("insert into survey_responses(survey_id) values ($1)", [survey.id], /permission denied/i, `${role} answering without going through the server`);
    await db.exec("reset role");
  }

  console.log(
    "PASS: a submission stores answers, self-chosen groups and the hour — no employee, email, token, address or device; the time is rounded so it cannot fingerprint anyone; answers cannot be edited or deleted once sent; questions freeze as soon as the first person answers but stay editable before that; a slug must be link-safe and the minimum group cannot go below three; neither signed-in nor anonymous browsers can read or write any survey table.",
  );
} finally {
  await db.close();
}
