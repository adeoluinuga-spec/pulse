// Isolated PostgreSQL execution; never connects to a tenant database.
// npm install --prefix <temporary-tools-directory> @electric-sql/pglite
// PULSE_TEST_TOOLS=<temporary-tools-directory> node scripts/tests/organisation-structure-db.mjs
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.env.PULSE_TEST_TOOLS ?? ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const org = "10000000-0000-4000-8000-000000000001";
const otherOrg = "10000000-0000-4000-8000-000000000002";
const hr = "20000000-0000-4000-8000-000000000001";
const member = "20000000-0000-4000-8000-000000000002";
const ids = [1, 2, 3, 4].map(n => `30000000-0000-4000-8000-00000000000${n}`);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;`);
  await db.exec(await readFile("supabase/schema/01_tables.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20260909_000001_organisation_structure.sql", "utf8"));
  await db.exec(`grant select, update, insert, delete on public.employees to service_role;
    grant select on public.employees to authenticated;
    insert into auth.users values ('${hr}'), ('${member}');
    insert into organisations(id,name,slug) values ('${org}','Test Advisory','test-advisory'),('${otherOrg}','Other Tenant','other');
    insert into employees(id,user_id,org_id,name,email,role,department,platform_role) values
      ('${ids[0]}','${hr}','${org}','HR Director','hr@example.test','Director','Leadership','hr_admin'),
      ('${ids[1]}','${member}','${org}','Consultant','member@example.test','Consultant','Advisory','standard'),
      ('${ids[2]}',null,'${org}','Associate','associate@example.test','Associate','Advisory','standard'),
      ('${ids[3]}',null,'${otherOrg}','Other tenant staff','other@example.test','Lead','Other','hr_admin');`);
  const roster = () => db.query("select organisation_structure_roster($1) as roster", [org]).then(r => r.rows[0].roster);
  const baseline = await roster();
  const doc = { schemaVersion: 1, theme: "cobalt", layout: "vertical", positions: baseline.map((e, i) => ({
    id: `p${i}`, employeeId: e.id, parentId: i ? `p${i - 1}` : null,
    title: e.role, department: e.department, team: i ? "Delivery" : "", responsibility: i === 1 ? "team_lead" : "none",
  })) };
  const write = (revision, document, publish = false, user = hr, rosterBaseline = baseline) => db.query(
    "select save_organisation_structure($1,$2,$3,$4,$5,$6) as result",
    [org, user, revision, JSON.stringify(document), JSON.stringify(rosterBaseline), publish]);
  await db.exec("set role service_role");
  await write(0, doc);
  assert.deepEqual(await roster(), baseline, "saving a draft must not change staff");
  await assert.rejects(write(0, doc), /Another HR user/);
  await assert.rejects(write(1, doc, false, member), /Only this organisation/);
  const cycle = structuredClone(doc); cycle.positions[0].parentId = "p2";
  await assert.rejects(write(1, cycle), /loop/);
  const foreign = structuredClone(doc); foreign.positions[2].employeeId = ids[3];
  await assert.rejects(write(1, foreign), /does not belong/);
  const duplicate = structuredClone(doc); duplicate.positions[2].employeeId = ids[1];
  await assert.rejects(write(1, duplicate), /only once/);
  const vacant = structuredClone(doc); vacant.positions[1].employeeId = null;
  await assert.rejects(write(1, vacant, true), /Place all existing staff/);
  const noManager = structuredClone(doc); noManager.positions.push({ ...doc.positions[0], id: "vacant", employeeId: null }); noManager.positions[2].parentId = "vacant";
  await assert.rejects(write(1, noManager, true), /occupied reporting position/);
  await db.query("update employees set team = 'Changed elsewhere' where id = $1", [ids[2]]);
  await assert.rejects(write(1, doc, true), /Staff records changed/);
  await db.query("update employees set team = null where id = $1", [ids[2]]);
  // Force a mid-publication failure and verify employee changes/history roll back.
  await db.exec("reset role");
  await db.exec(`create function fail_structure_history_test() returns trigger language plpgsql as $$ begin raise exception 'simulated history failure'; end $$;
    create trigger fail_history before insert on organisation_structure_versions for each row execute function fail_structure_history_test();`);
  await db.exec("set role service_role");
  await assert.rejects(write(1, doc, true), /simulated history failure/);
  assert.deepEqual(await roster(), baseline);
  await db.exec("reset role; drop trigger fail_history on organisation_structure_versions; set role service_role");
  await write(1, doc, true);
  const published = await roster();
  assert.equal(published[1].line_manager_id, ids[0]);
  assert.equal(published[2].line_manager_id, ids[1]);
  assert.equal(published[0].people_responsibility, "manager");
  assert.equal(published[1].people_responsibility, "team_lead");
  assert.equal(published[2].team, "Delivery");
  assert.equal((await db.query("select platform_role from employees where id=$1", [ids[1]])).rows[0].platform_role, "standard");
  assert.equal((await db.query("select count(*)::int as count from organisation_structure_versions")).rows[0].count, 1);
  assert.equal((await db.query("select line_manager_id from employees where id=$1", [ids[3]])).rows[0].line_manager_id, null);
  // RLS and execute privileges, exercised as a real non-service database role.
  await db.exec(`reset role; set role authenticated; set test.actor = '${member}';`);
  assert.equal((await db.query("select * from organisation_structures")).rows.length, 0);
  await assert.rejects(write(2, doc), /permission denied/);
  await assert.rejects(db.query("update organisation_structures set revision=99"), /permission denied/);
  await db.exec(`set test.actor = '${hr}'`);
  assert.equal((await db.query("select * from organisation_structures")).rows.length, 1);
  assert.equal((await db.query("select * from organisation_structure_versions")).rows.length, 1);
  await db.exec("reset role");
  await db.query("update employees set org_id=$1 where user_id=$2", [otherOrg, hr]);
  await db.exec(`set role authenticated; set test.actor = '${hr}'`);
  assert.equal((await db.query("select * from organisation_structures")).rows.length, 0, "HR from a different organisation must not see this chart");
  console.log("PASS: migration executes; draft isolation; atomic publish/rollback; manager/team fields; stale edits; graph validation; tenant boundaries; RLS and RPC privileges.");
} finally { await db.close(); }
