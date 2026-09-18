// The team workspace migration against a real Postgres: chat and escalations
// are closed to the browser roles, task writes go through the server, and the
// chat table refuses malformed channels and empty messages.
//
//   npm i --no-save @electric-sql/pglite
//   node scripts/tests/team-workspace-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const MGR = "20000000-0000-4000-8000-000000000001";
const ADA = "20000000-0000-4000-8000-000000000002";

const refused = (sql, params, pattern, label) => assert.rejects(() => db.query(sql, params), pattern, label);

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
  await db.query("insert into organisations(id, name, slug) values ($1, 'Test Co', 'test')", [ORG]);
  await db.query(
    "insert into employees(id, org_id, name, email, line_manager_id, people_responsibility) values ($1,$3,'Mgr','m@t.co',null,'manager'), ($2,$3,'Ada','a@t.co',$1,'none')",
    [MGR, ADA, ORG],
  );
  await db.exec(await readFile("supabase/migrations/20260918_000001_team_workspace.sql", "utf8"));

  // ── the server can do everything ────────────────────────────────────────────
  await db.exec("set role service_role");
  const team = `team:${MGR}`;
  const dm = `dm:${[MGR, ADA].sort().join(":")}`;
  await db.query("insert into team_messages(org_id, channel, sender_id, body) values ($1,$2,$3,'hello team'), ($1,$4,$3,'hi'), ($1,'department:Ops & Finance',$3,'dept')", [ORG, team, ADA, dm]);
  await refused("insert into team_messages(org_id, channel, sender_id, body) values ($1,'general',$2,'x')", [ORG, ADA], /check constraint/i, "a channel that is not team, department or direct");
  await refused("insert into team_messages(org_id, channel, sender_id, body) values ($1,$2,$3,'   ')", [ORG, team, ADA], /check constraint/i, "an empty message");
  await refused("insert into team_messages(org_id, channel, sender_id, body) values ($1,$2,$3,$4)", [ORG, team, ADA, "x".repeat(4001)], /check constraint/i, "an over-long message");

  await db.query("insert into escalations(org_id, raised_by, title, escalation_type, is_anonymous, assigned_to) values ($1,$2,'Concern','people',true,null)", [ORG, ADA]);
  await db.query("update escalations set status='resolved', resolved_at=now(), resolution_note='Handled'");
  await db.query("insert into tasks(org_id, assignee_id, created_by, title) values ($1,$2,$3,'Do the thing')", [ORG, ADA, MGR]);
  await db.exec("reset role");

  // ── browsers cannot read chat or escalations at all ─────────────────────────
  await db.exec("set role authenticated");
  await refused("select * from team_messages", [], /permission denied/i, "a signed-in user reading chat directly");
  await refused("insert into team_messages(org_id, channel, sender_id, body) values ($1,$2,$3,'spoof')", [ORG, team, MGR], /permission denied/i, "posting as someone else");
  await refused("select raised_by from escalations", [], /permission denied/i, "a manager reading who raised an anonymous escalation");
  await refused("insert into escalations(org_id, raised_by, title, is_anonymous) values ($1,$2,'fake',true)", [ORG, MGR], /permission denied/i, "raising an escalation in someone else's name");

  // ── tasks: reads still governed by policy, writes only through the server ──
  await refused("insert into tasks(org_id, assignee_id, created_by, title) values ($1,$2,$2,'self-set')", [ORG, MGR], /permission denied/i, "creating a task from the browser");
  await refused("update tasks set is_complete = true", [], /permission denied/i, "ticking a task from the browser");
  await refused("delete from tasks", [], /permission denied/i, "deleting a task from the browser");
  await db.exec("reset role");

  await db.exec("set role anon");
  await refused("select * from team_messages", [], /permission denied/i, "anonymous access to chat");
  await refused("select * from escalations", [], /permission denied/i, "anonymous access to escalations");

  console.log(
    "PASS: the server stores team, department and direct messages and refuses malformed channels and empty or over-long messages; browsers can neither read nor write chat or escalations, so an anonymous raiser cannot be looked up and nobody can raise a concern in someone else's name; task writes are server-only.",
  );
} finally {
  await db.close();
}
