// Proves migration 20260916_000001 against a real Postgres, not against SQL text.
//
// An earlier RLS test in this repo regex-matched migration files and passed
// while none of the policies it described were applied. This one runs the
// actual schema and the actual migration in PGlite, signs in as a real role,
// and asks the database what it will hand over.
//
//   npm i --no-save @electric-sql/pglite
//   node scripts/tests/salary-visibility-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const ME = "20000000-0000-4000-8000-000000000001";
const COLLEAGUE = "20000000-0000-4000-8000-000000000002";
const MY_USER = "30000000-0000-4000-8000-000000000001";
const THEIR_USER = "30000000-0000-4000-8000-000000000002";

const denied = async (sql, label) => {
  await assert.rejects(() => db.query(sql), /permission denied/i, `${label} should be refused`);
};

try {
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  await db.exec(await readFile("supabase/schema/01_tables.sql", "utf8"));
  await db.exec(await readFile("supabase/schema/02_rls.sql", "utf8"));

  // Supabase's default: the browser roles get table-wide privileges and RLS
  // decides which rows. That default is what leaked salaries.
  await db.exec("grant all on all tables in schema public to anon, authenticated, service_role;");

  await db.query("insert into organisations(id, name, slug) values($1, 'Test Co', 'test')", [ORG]);
  await db.query("insert into auth.users values ($1), ($2)", [MY_USER, THEIR_USER]);
  const pay = (basic) => JSON.stringify({ basic, housing: basic / 2, transport: 50000, totalGross: basic * 1.5 + 50000 });
  await db.query(
    "insert into employees(id, user_id, org_id, name, email, platform_role, compensation) values ($1,$2,$3,'Me','me@test.co','standard',$4), ($5,$6,$3,'Colleague','them@test.co','standard',$7)",
    [ME, MY_USER, ORG, pay(300000), COLLEAGUE, THEIR_USER, pay(900000)],
  );

  const asMe = async () => {
    await db.exec("reset role");
    await db.exec(`set test.actor = '${MY_USER}'`);
    await db.exec("set role authenticated");
  };

  // ── Before: the leak is real ────────────────────────────────────────────────
  await asMe();
  const before = await db.query("select compensation from employees where id = $1", [COLLEAGUE]);
  assert.equal(before.rows.length, 1, "precondition: a colleague's salary IS readable before the migration");
  assert.equal(before.rows[0].compensation.basic, 900000);

  // ── Apply the migration as the owner ────────────────────────────────────────
  await db.exec("reset role");
  await db.exec(await readFile("supabase/migrations/20260916_000001_restrict_salary_visibility.sql", "utf8"));

  // ── After ───────────────────────────────────────────────────────────────────
  await asMe();

  await denied(`select compensation from employees where id = '${COLLEAGUE}'`, "a colleague's salary");
  await denied(`select compensation from employees where id = '${ME}'`, "my own salary through the browser role");
  await denied("select * from employees", "select * (it includes the revoked column)");

  const directory = await db.query("select id, name, email, department, platform_role from employees order by name");
  assert.equal(directory.rows.length, 2, "the staff directory still works");

  const selfColumns = (await readFile("src/lib/api/profile.ts", "utf8")).match(/const SELF_COLUMNS = "([^"]+)"/)[1];
  const mine = await db.query(`select ${selfColumns} from employees where user_id = '${MY_USER}'`);
  assert.equal(mine.rows.length, 1, "the profile loader's exact column list still reads the signed-in user");
  assert.ok(!("compensation" in mine.rows[0]), "and it does not include pay");

  await db.query("update employees set phone = '0800' where id = $1", [ME]);
  const phone = await db.query("select phone from employees where id = $1", [ME]);
  assert.equal(phone.rows[0].phone, "0800", "people can still update their own contact details");

  await db.exec("reset role");
  await db.exec("set role anon");
  await denied("select name from employees", "anonymous access to the staff directory");

  await db.exec("reset role");
  await db.exec("set role service_role");
  const server = await db.query("select compensation from employees where id = $1", [COLLEAGUE]);
  assert.equal(server.rows[0].compensation.basic, 900000, "the server still reads pay, for the payroll routes");

  console.log(
    "PASS: before the migration a colleague's salary was readable; after it, pay is refused to the browser roles (own row included), select * is refused, the directory, the profile loader's columns and own-row updates still work, anon reads nothing, and the server still reads pay.",
  );
} finally {
  await db.close();
}
