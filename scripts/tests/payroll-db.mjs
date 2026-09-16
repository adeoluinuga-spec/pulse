// Runs the real payroll migration in PGlite and tries to break every guard it
// claims to enforce. The application writes with the service-role client, so
// these database guards are what stop an application bug from, say, editing a
// paid run — they have to be proven, not assumed.
//
//   npm i --no-save @electric-sql/pglite
//   node scripts/tests/payroll-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const HR = "20000000-0000-4000-8000-000000000001";
const CEO = "20000000-0000-4000-8000-000000000002";
const STAFF = "20000000-0000-4000-8000-000000000003";
const STAFF_USER = "30000000-0000-4000-8000-000000000003";

const refused = async (sql, params, pattern, label) => {
  await assert.rejects(() => db.query(sql, params), pattern, label);
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
  await db.exec("grant all on all tables in schema public to anon, authenticated, service_role;");

  await db.query("insert into organisations(id, name, slug) values ($1, 'Test Co', 'test')", [ORG]);
  await db.query("insert into auth.users values ($1)", [STAFF_USER]);
  await db.query(
    `insert into employees(id, org_id, name, email, platform_role, join_date, compensation, user_id) values
      ($1, $4, 'HR', 'hr@t.co', 'hr_admin', '2024-01-01', null, null),
      ($2, $4, 'CEO', 'ceo@t.co', 'executive_view', '2024-01-01', null, null),
      ($3, $4, 'Staff', 'staff@t.co', 'standard', '2025-03-01', $5, $6)`,
    [HR, CEO, STAFF, ORG, JSON.stringify({ basic: 300000, housing: 150000, transport: 50000, medical: 0 }), STAFF_USER],
  );

  await db.exec(await readFile("supabase/migrations/20260916_000001_restrict_salary_visibility.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20260916_000002_payroll.sql", "utf8"));

  // ── carry-over ──────────────────────────────────────────────────────────────
  const carried = await db.query("select effective_from::text, components from employee_compensation where employee_id = $1", [STAFF]);
  assert.equal(carried.rows.length, 1, "existing pay is carried into the dated table");
  assert.equal(carried.rows[0].effective_from, "2025-03-01", "effective from the join date");
  const codes = carried.rows[0].components.map((c) => c.code);
  assert.deepEqual(codes, ["basic", "housing", "transport"], "zero-value components are not carried");
  assert.equal(carried.rows[0].components[0].amountKobo, 30000000, "naira converted to kobo");

  await db.exec(await readFile("supabase/migrations/20260916_000002_payroll.sql", "utf8"));
  const again = await db.query("select count(*)::int as n from employee_compensation where employee_id = $1", [STAFF]);
  assert.equal(again.rows[0].n, 1, "running the migration twice does not duplicate pay records");

  // ── browser roles see nothing ───────────────────────────────────────────────
  await db.exec(`set test.actor = '${STAFF_USER}'`);
  await db.exec("set role authenticated");
  for (const table of ["payroll_runs", "payroll_run_lines", "employee_compensation", "employee_payroll_profiles", "payroll_permissions"]) {
    await refused(`select * from ${table}`, [], /permission denied/i, `authenticated reading ${table}`);
  }
  await refused("insert into payroll_permissions(org_id, employee_id, can_approve) values ($1, $2, true)", [ORG, STAFF], /permission denied/i, "an employee granting themselves approval");
  await db.exec("reset role");
  await db.exec("set role service_role");

  // ── one live run per month ──────────────────────────────────────────────────
  const run = (await db.query("insert into payroll_runs(org_id, period_year, period_month, created_by) values ($1, 2026, 9, $2) returning id", [ORG, HR])).rows[0].id;
  await refused("insert into payroll_runs(org_id, period_year, period_month) values ($1, 2026, 9)", [ORG], /duplicate key|unique/i, "a second live run for September");

  // ── lines follow their run ──────────────────────────────────────────────────
  await db.query("insert into payroll_run_lines(run_id, org_id, employee_id, employee_name, days_paid, days_in_period, net_kobo) values ($1, $2, $3, 'Staff', 30, 30, 38855000)", [run, ORG, STAFF]);
  await db.query("insert into payroll_adjustments(run_id, org_id, employee_id, label, kind, amount_kobo) values ($1, $2, $3, 'Bonus', 'earning', 100000)", [run, ORG, STAFF]);

  // ── status machine ──────────────────────────────────────────────────────────
  await refused("update payroll_runs set status = 'approved', approved_by = $2, approved_at = now(), submitted_by = $3 where id = $1", [run, CEO, HR], /cannot move from draft to approved/, "skipping review");

  await db.query("update payroll_runs set status = 'submitted', submitted_by = $2, submitted_at = now(), calculated_by = $2 where id = $1", [run, HR]);

  await refused("update payroll_run_lines set net_kobo = 99999999 where run_id = $1", [run], /locked/, "editing a line in a submitted run");
  await refused("insert into payroll_adjustments(run_id, org_id, employee_id, label, kind, amount_kobo) values ($1, $2, $3, 'Sneaky', 'earning', 500)", [run, ORG, STAFF], /locked/, "adding an adjustment after submission");

  // ── maker-checker backstop ──────────────────────────────────────────────────
  await refused("update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1", [run, HR], /approver_is_not_(submitter|calculator)/, "the person who calculated and submitted the run approving it");

  await db.query("update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1", [run, CEO]);

  // ── an approved run is permanent ────────────────────────────────────────────
  await refused("update payroll_runs set totals = '{}'::jsonb where id = $1", [run], /can no longer change/, "touching an approved run");
  await refused("update payroll_runs set status = 'draft' where id = $1", [run], /can no longer change/, "reopening an approved run");
  await refused("delete from payroll_runs where id = $1", [run], /cannot be deleted/, "deleting an approved run");
  await refused("delete from payroll_run_lines where run_id = $1", [run], /locked/, "deleting a paid line");

  // ── compensation is append-only and protected once paid ─────────────────────
  await refused("update employee_compensation set components = components where employee_id = $1", [STAFF], /never edited/, "editing a pay record");
  await refused("delete from employee_compensation where employee_id = $1", [STAFF], /already been paid/, "removing pay that September's run relied on");

  const future = (await db.query(
    "insert into employee_compensation(org_id, employee_id, effective_from, components) values ($1, $2, '2027-01-01', '[{\"code\":\"basic\",\"amountKobo\":1}]') returning id",
    [ORG, STAFF],
  )).rows[0].id;
  await db.query("delete from employee_compensation where id = $1", [future]);

  // ── a draft can be voided and removed, children and all ─────────────────────
  const october = (await db.query("insert into payroll_runs(org_id, period_year, period_month) values ($1, 2026, 10) returning id", [ORG])).rows[0].id;
  await db.query("insert into payroll_run_lines(run_id, org_id, employee_id, employee_name, days_paid, days_in_period) values ($1, $2, $3, 'Staff', 31, 31)", [october, ORG, STAFF]);
  await db.query("update payroll_runs set status = 'void' where id = $1", [october]);
  await db.query("insert into payroll_runs(org_id, period_year, period_month) values ($1, 2026, 10)", [ORG]);
  await db.query("delete from payroll_runs where id = $1", [october]);
  const left = await db.query("select count(*)::int as n from payroll_run_lines where run_id = $1", [october]);
  assert.equal(left.rows[0].n, 0, "a voided draft's lines go with it");

  // ── bank account numbers are NUBAN-shaped ───────────────────────────────────
  await refused("insert into employee_payroll_profiles(org_id, employee_id, account_number) values ($1, $2, '12345')", [ORG, CEO], /check/i, "a malformed account number");

  console.log(
    "PASS: pay carried over once, in kobo; browser roles read and write nothing; one live run per month; lines and adjustments lock on submission; review cannot be skipped; the submitter cannot approve; an approved run cannot be changed, reopened or deleted; paid compensation cannot be edited or removed; a voided draft can be replaced and deleted with its lines; account numbers must be 10 digits.",
  );
} finally {
  await db.close();
}
