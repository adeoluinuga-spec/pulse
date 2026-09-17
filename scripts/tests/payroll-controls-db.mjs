// The payroll controls added after the September 2026 audit, against a real
// Postgres: frozen payment details, workflow changes committed with their audit
// events, maker-checker enforced by the database itself, and a performance bonus
// paid at most once per appraisal.
//
//   npm i --no-save @electric-sql/pglite
//   node --experimental-strip-types scripts/tests/payroll-controls-db.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER_ORG = "10000000-0000-4000-8000-000000000002";
const HR = "20000000-0000-4000-8000-000000000001";
const CEO = "20000000-0000-4000-8000-000000000002";
const ADA = "20000000-0000-4000-8000-000000000003";
const CLERK = "20000000-0000-4000-8000-000000000004";
const AUDITOR = "20000000-0000-4000-8000-000000000005";
const OUTSIDER = "20000000-0000-4000-8000-000000000009";
const CYCLE = "30000000-0000-4000-8000-000000000001";
const APPRAISAL = "40000000-0000-4000-8000-000000000001";

const refused = (sql, params, pattern, label) => assert.rejects(() => db.query(sql, params), pattern, label);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const events = async (runId, action) => (await db.query("select actor_id, payload from payroll_events where run_id = $1 and action = $2", [runId, action])).rows;

const line = (employeeId, snapshot) => ({
  employeeId,
  name: "Ada",
  daysPaid: 30,
  daysInPeriod: 30,
  earnings: [],
  deductions: [],
  employer: [],
  grossKobo: 50_000_000,
  basicKobo: 30_000_000,
  payeKobo: 6_395_000,
  pensionEmployeeKobo: 4_000_000,
  pensionEmployerKobo: 5_000_000,
  nhfKobo: 750_000,
  nhisKobo: 0,
  nsitfKobo: 500_000,
  itfKobo: 500_000,
  otherDeductionsKobo: 0,
  netKobo: 38_855_000,
  employerCostKobo: 56_000_000,
  taxState: "Lagos",
  taxWorking: {},
  blockers: [],
  warnings: [],
  paymentSnapshot: snapshot,
});

const SNAPSHOT = { bankName: "Access Bank", bankCode: "044", accountNumber: "0123456789", accountName: "Ada Obi", pfaName: "ARM", rsaPin: "PEN100", nhfNumber: null, tin: "123" };

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
      ($1,$7,'HR','hr@t.co','hr_admin'), ($2,$7,'CEO','ceo@t.co','executive_view'), ($3,$7,'Ada','ada@t.co','standard'),
      ($4,$7,'Clerk','clerk@t.co','standard'), ($5,$7,'Auditor','aud@t.co','standard'), ($6,$8,'Outsider','o@x.co','standard')`,
    [HR, CEO, ADA, CLERK, AUDITOR, OUTSIDER, ORG, OTHER_ORG],
  );
  for (const file of [
    "20260916_000001_restrict_salary_visibility.sql",
    "20260916_000002_payroll.sql",
    "20260916_000003_payroll_atomic_calculation.sql",
    "20260917_000001_payroll_control_hardening.sql",
  ]) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec("set role service_role");

  const newRun = async (month) => (await one("insert into payroll_runs(org_id, period_year, period_month) values ($1, 2026, $2) returning id", [ORG, month])).id;
  const revisionOf = async (runId) => (await one("select revision from payroll_runs where id = $1", [runId])).revision;
  const store = (runId, revision, lines, actor = HR) =>
    db.query("select public.payroll_store_calculation($1, $2, $3, $4, '{}'::jsonb, 'ng-nta-2026', '{}'::jsonb, 'fp') as revision", [runId, revision, actor, JSON.stringify(lines)]);
  const transition = (runId, revision, actor, action, reason = null) =>
    db.query("select public.payroll_transition($1, $2, $3, $4, $5) as revision", [runId, revision, actor, action, reason]);
  const importBonus = (runId, actor, rows) =>
    db.query("select public.payroll_import_bonuses($1, $2, $3, $4) as n", [runId, actor, CYCLE, JSON.stringify(rows)]);
  const bonus = { employeeId: ADA, appraisalId: APPRAISAL, label: "Performance bonus — 2026 H1", amountKobo: 15_000_000, note: "Score 4.2" };

  // ── 1. payment details are frozen with the calculation ──────────────────────
  const sept = await newRun(9);
  await store(sept, 0, [line(ADA, SNAPSHOT)]);
  const stored = await one("select payment_snapshot from payroll_run_lines where run_id = $1", [sept]);
  assert.deepEqual(stored.payment_snapshot, SNAPSHOT, "the line keeps the account it was calculated against");
  assert.equal((await events(sept, "calculated")).length, 1, "the calculation's event was written with it");
  assert.equal((await events(sept, "calculated"))[0].actor_id, HR);
  await refused("select public.payroll_store_calculation($1, 1, null, '[]'::jsonb, '{}'::jsonb, 'x', '{}'::jsonb, 'fp')", [sept], /record who ran it/, "a calculation with no actor");

  // ── 2. maker-checker is enforced by the database ────────────────────────────
  // The clerk adds an adjustment with no event at all — as if the event write
  // had failed. Authorship alone must still make them a contributor.
  await db.query("insert into payroll_adjustments(run_id, org_id, employee_id, label, kind, amount_kobo, created_by) values ($1,$2,$3,'Arrears','earning',100000,$4)", [sept, ORG, ADA, CLERK]);
  const contributors = (await one("select public.payroll_contributors($1) as ids", [sept])).ids;
  assert.deepEqual([...contributors].sort(), [HR, CLERK].sort(), "calculator and adjustment author, with or without events");

  await refused("select public.payroll_transition($1, $2, $3, 'approve')", [sept, await revisionOf(sept), CEO], /Calculate the run first|problems|cannot move/, "approving a draft");
  await transition(sept, await revisionOf(sept), HR, "submit");
  assert.equal((await events(sept, "submitted")).length, 1, "submission recorded with the change");

  await refused("select public.payroll_transition($1, $2, $3, 'approve')", [sept, await revisionOf(sept), CLERK], /worked on this run/, "the adjustment author approving");
  await refused("select public.payroll_transition($1, $2, $3, 'approve')", [sept, await revisionOf(sept), HR], /worked on this run/, "the calculator and submitter approving");
  await refused("select public.payroll_transition($1, $2, $3, 'return', '')", [sept, await revisionOf(sept), CEO], /Say why/, "returning with no reason");
  await refused("select public.payroll_transition($1, 0, $2, 'approve')", [sept, CEO], /changed while you were working/, "approving a stale revision");

  await transition(sept, await revisionOf(sept), CEO, "approve");
  const approved = await one("select status, approved_by from payroll_runs where id = $1", [sept]);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approved_by, CEO);
  assert.equal((await events(sept, "approved")).length, 1, "approval recorded with the change");

  // Editing the profile afterwards changes nothing about the approved line.
  await db.query("insert into employee_payroll_profiles(employee_id, org_id, bank_name, account_number) values ($1,$2,'Rogue Bank','9999999999')", [ADA, ORG]);
  assert.equal((await one("select payment_snapshot from payroll_run_lines where run_id = $1", [sept])).payment_snapshot.accountNumber, "0123456789");
  await refused("update payroll_run_lines set payment_snapshot = '{}'::jsonb where run_id = $1", [sept], /locked/, "rewriting an approved line's destination");

  // A blocked run cannot be submitted, even if the application thinks it can.
  const blocked = await newRun(8);
  await store(blocked, 0, [{ ...line(ADA, SNAPSHOT), blockers: ["No bank account on record."] }]);
  await refused("select public.payroll_transition($1, $2, $3, 'submit')", [blocked, await revisionOf(blocked), HR], /problems that block/, "submitting with blockers");

  // ── 3. a bonus is paid once per appraisal ───────────────────────────────────
  const oct = await newRun(10);
  const nov = await newRun(11);
  assert.equal((await importBonus(oct, CLERK, [bonus])).rows[0].n, 1);
  assert.equal((await events(oct, "performance_bonuses_imported")).length, 1, "import recorded with the insert");

  await refused("select public.payroll_import_bonuses($1, $2, $3, $4)", [oct, CLERK, CYCLE, JSON.stringify([bonus])], /already in a payroll run/, "importing the same appraisal again into the same run");
  await refused("select public.payroll_import_bonuses($1, $2, $3, $4)", [nov, HR, CYCLE, JSON.stringify([bonus])], /already in a payroll run/, "importing the same appraisal into another run");
  await refused(
    "insert into payroll_adjustments(run_id, org_id, employee_id, label, kind, amount_kobo, source) values ($1,$2,$3,'Dup','earning',1,$4)",
    [oct, ORG, ADA, JSON.stringify({ type: "appraisal", appraisalId: APPRAISAL })],
    /duplicate key|unique/i,
    "a second bonus row for the same appraisal bypassing the function",
  );
  await refused("select public.payroll_import_bonuses($1, $2, $3, $4)", [nov, HR, CYCLE, JSON.stringify([{ ...bonus, appraisalId: "other", employeeId: OUTSIDER }])], /outside this organisation/, "a bonus for another tenant's employee");
  await refused("select public.payroll_import_bonuses($1, $2, $3, $4)", [sept, HR, CYCLE, JSON.stringify([{ ...bonus, appraisalId: "late" }])], /draft run/, "importing into an approved run");

  // The failed import into November left nothing behind.
  assert.equal((await one("select count(*)::int as n from payroll_adjustments where run_id = $1", [nov])).n, 0);

  // Voiding October releases the appraisal to be paid in November instead.
  await transition(oct, await revisionOf(oct), HR, "void");
  assert.equal((await importBonus(nov, HR, [bonus])).rows[0].n, 1, "a voided run no longer counts as paying the bonus");

  // ── 4. removing an adjustment is recorded, or does not happen ───────────────
  const adjustment = (await one("select id from payroll_adjustments where run_id = $1", [nov])).id;
  await db.query("select public.payroll_remove_adjustment($1, $2, $3)", [nov, adjustment, AUDITOR]);
  assert.equal((await one("select count(*)::int as n from payroll_adjustments where id = $1", [adjustment])).n, 0);
  const removal = await events(nov, "adjustment_removed");
  assert.equal(removal.length, 1);
  assert.equal(removal[0].actor_id, AUDITOR);
  assert.ok((await one("select public.payroll_contributors($1) as ids", [nov])).ids.includes(AUDITOR), "the remover is now a contributor");
  await refused("select public.payroll_remove_adjustment($1, $2, $3)", [nov, adjustment, AUDITOR], /not found/, "removing it twice");

  const sepAdjustment = (await one("select id from payroll_adjustments where run_id = $1", [sept])).id;
  const eventsBefore = (await one("select count(*)::int as n from payroll_events where run_id = $1", [sept])).n;
  await refused("select public.payroll_remove_adjustment($1, $2, $3)", [sept, sepAdjustment, HR], /locked/, "removing from an approved run");
  assert.equal((await one("select count(*)::int as n from payroll_events where run_id = $1", [sept])).n, eventsBefore, "the refused removal left no event behind");

  // ── 5. the browser roles cannot call any of it ──────────────────────────────
  await db.exec("reset role");
  await db.exec("set role authenticated");
  for (const [sql, params] of [
    ["select public.payroll_contributors($1)", [nov]],
    ["select public.payroll_transition($1, 0, $2, 'void')", [nov, HR]],
    ["select public.payroll_import_bonuses($1, $2, $3, '[]'::jsonb)", [nov, HR, CYCLE]],
    ["select public.payroll_remove_adjustment($1, $2, $3)", [nov, adjustment, HR]],
  ]) {
    await refused(sql, params, /permission denied/i, `a signed-in user calling ${sql}`);
  }

  console.log(
    "PASS: lines keep the payment details they were calculated with, and later profile edits cannot reach an approved run; calculation, submission, approval, voiding, bonus import and removal all commit with their events; the database refuses approval by anyone who calculated, submitted or authored an adjustment even with no event, refuses stale revisions, blockers and reasonless returns; an appraisal pays out once across all live runs, including against a direct insert, and again only after its run is voided; browser roles cannot call the functions.",
  );
} finally {
  await db.close();
}
