// Drives a whole payroll run through the real engine and the real database
// functions: calculate with the TypeScript engine, store with
// payroll_store_calculation, then submit and approve through the guarded table.
//
// The engine is unit-tested and the guards are tested on their own; this is the
// test that they agree with each other — that what the engine produces is what
// the database stores, and that storing it is all-or-nothing.
//
//   npm i --no-save @electric-sql/pglite
//   node --experimental-strip-types scripts/tests/payroll-calculation-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { calculatePayLine, totalsFor } from "../../src/lib/payrollGrossToNet.ts";
import { ruleSetById } from "../../src/lib/payrollRules.ts";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER_ORG = "10000000-0000-4000-8000-000000000002";
const HR = "20000000-0000-4000-8000-000000000001";
const CEO = "20000000-0000-4000-8000-000000000002";
const ADA = "20000000-0000-4000-8000-000000000003";
const OUTSIDER = "20000000-0000-4000-8000-000000000009";
const N = (naira) => Math.round(naira * 100);
const NTA = ruleSetById("ng-nta-2026");

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
  await db.query("insert into organisations(id, name, slug) values ($1,'Test Co','test'), ($2,'Other Co','other')", [ORG, OTHER_ORG]);
  await db.query(
    `insert into employees(id, org_id, name, email, platform_role) values
      ($1,$5,'HR','hr@t.co','hr_admin'), ($2,$5,'CEO','ceo@t.co','executive_view'), ($3,$5,'Ada','ada@t.co','standard'), ($4,$6,'Outsider','o@x.co','standard')`,
    [HR, CEO, ADA, OUTSIDER, ORG, OTHER_ORG],
  );
  for (const file of ["20260916_000001_restrict_salary_visibility.sql", "20260916_000002_payroll.sql", "20260916_000003_payroll_atomic_calculation.sql"]) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec("set role service_role");

  // ── the engine calculates Ada's September ───────────────────────────────────
  const line = calculatePayLine({
    employee: {
      employeeId: ADA,
      name: "Ada",
      components: [
        { code: "basic", label: "Basic", amountKobo: N(300_000), taxable: true, pensionable: true, isBasic: true },
        { code: "housing", label: "Housing", amountKobo: N(150_000), taxable: true, pensionable: true, isBasic: false },
        { code: "transport", label: "Transport", amountKobo: N(50_000), taxable: true, pensionable: true, isBasic: false },
      ],
      adjustments: [],
      profile: { taxState: "Lagos", annualRentKobo: 0, nhisMonthlyKobo: 0, lifeAssuranceAnnualKobo: 0, pensionExempt: false, nhfExempt: false, hasBankDetails: true, hasPensionDetails: true, hasTin: true },
      joinDate: "2020-01-01",
      exitDate: null,
    },
    period: { year: 2026, month: 9 },
    ruleSet: NTA,
    settings: { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: true },
  });
  const totals = totalsFor([line]);

  const run = (await db.query("insert into payroll_runs(org_id, period_year, period_month) values ($1, 2026, 9) returning id, revision", [ORG])).rows[0];
  const store = (revision, lines, actor = HR) =>
    db.query("select public.payroll_store_calculation($1, $2, $3, $4, $5, $6, $7, $8) as revision", [
      run.id, revision, actor, JSON.stringify(lines), JSON.stringify(totalsFor(lines)), NTA.id, JSON.stringify(NTA), "fp-1",
    ]);

  // ── store it ────────────────────────────────────────────────────────────────
  const stored = await store(0, [line]);
  assert.equal(stored.rows[0].revision, 1, "calculating bumps the revision");

  const row = (await db.query("select * from payroll_run_lines where run_id = $1", [run.id])).rows[0];
  assert.equal(Number(row.net_kobo), N(388_550), "the database stores exactly the engine's net pay");
  assert.equal(Number(row.paye_kobo), N(63_950));
  assert.equal(Number(row.basic_kobo), N(300_000), "the month's basic is stored for the NHF schedule");
  assert.equal(row.tax_working.annualTaxKobo, N(767_400), "the tax working travels with the line");

  const runRow = (await db.query("select totals, rule_set_id, rule_set, calculated_by from payroll_runs where id = $1", [run.id])).rows[0];
  assert.equal(runRow.totals.netKobo, totals.netKobo);
  assert.equal(runRow.rule_set_id, "ng-nta-2026");
  assert.equal(runRow.rule_set.paye.bands[1].rateBps, 1500, "a full copy of the rules is kept on the run");
  assert.equal(runRow.calculated_by, HR);

  // ── recalculating replaces, never duplicates ────────────────────────────────
  await store(1, [line]);
  const count = (await db.query("select count(*)::int as n from payroll_run_lines where run_id = $1", [run.id])).rows[0].n;
  assert.equal(count, 1, "recalculation replaces the lines");

  // ── a stale revision is a conflict, not a silent overwrite ──────────────────
  await refused("select public.payroll_store_calculation($1, 0, $2, '[]'::jsonb, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')", [run.id, HR], /changed while you were working/, "two preparers calculating at once");

  // ── a line for another tenant's employee is refused, and nothing is lost ────
  await refused(
    "select public.payroll_store_calculation($1, 2, $2, $3, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')",
    [run.id, HR, JSON.stringify([{ ...line, employeeId: OUTSIDER }])],
    /outside this organisation/,
    "a line naming another organisation's employee",
  );
  const survived = (await db.query("select net_kobo from payroll_run_lines where run_id = $1", [run.id])).rows;
  assert.equal(survived.length, 1, "the refused calculation did not wipe the existing lines");
  assert.equal(Number(survived[0].net_kobo), N(388_550));

  // ── a failure part-way leaves the previous calculation intact ───────────────
  await refused(
    "select public.payroll_store_calculation($1, 2, $2, $3, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')",
    [run.id, HR, JSON.stringify([line, { ...line }])],
    /duplicate key|unique/i,
    "a calculation that fails while inserting",
  );
  const afterFailure = (await db.query("select count(*)::int as n from payroll_run_lines where run_id = $1", [run.id])).rows[0].n;
  assert.equal(afterFailure, 1, "the delete was rolled back with the failed insert — the run was never left empty");
  const revisionAfterFailure = (await db.query("select revision from payroll_runs where id = $1", [run.id])).rows[0].revision;
  assert.equal(revisionAfterFailure, 2, "a failed calculation does not advance the revision");

  // ── submit, approve, and the run locks against recalculation ────────────────
  await db.query("update payroll_runs set status='submitted', submitted_by=$2, submitted_at=now(), revision=revision+1 where id=$1", [run.id, HR]);
  await refused("select public.payroll_store_calculation($1, 3, $2, '[]'::jsonb, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')", [run.id, HR], /Only a draft/, "recalculating a submitted run");

  await db.query("update payroll_runs set status='approved', approved_by=$2, approved_at=now(), revision=revision+1 where id=$1", [run.id, CEO]);
  await refused("select public.payroll_store_calculation($1, 4, $2, '[]'::jsonb, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')", [run.id, HR], /Only a draft/, "recalculating an approved run");

  // ── the browser roles cannot call it ────────────────────────────────────────
  await db.exec("reset role");
  await db.exec("set role authenticated");
  await refused("select public.payroll_store_calculation($1, 4, $2, '[]'::jsonb, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')", [run.id, HR], /permission denied/i, "a signed-in user calling the function directly");

  console.log(
    "PASS: the engine's figures are stored exactly, with the tax working and a copy of the rules; recalculation replaces lines; a stale revision conflicts; another tenant's employee is refused without losing the existing lines; a failure part-way rolls back entirely; submitted and approved runs cannot be recalculated; browser roles cannot call the function.",
  );
} finally {
  await db.close();
}
