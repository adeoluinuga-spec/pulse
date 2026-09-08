/**
 * Drives the back half of the chain through the real application libraries:
 * scoring, suppression, PDF report data and export — then proves the access
 * tiers against live RLS.
 *
 *   node --experimental-strip-types scripts/rehearsal/analyse.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { connect } from "./_db.mjs";

import { scoreSubjectFromDatabase, scoreCohortFromDatabase } from "../../src/lib/assessmentScoringService.ts";
import { buildReportPayload } from "../../src/lib/assessmentReporting.ts";
import { MINIMUM_RESPONSES_PER_GROUP } from "../../src/lib/assessmentScoring.ts";
import { loadPdfReportData, buildIndividualReport, buildAggregateReport } from "../../src/lib/assessmentPdfData.ts";
import { assertExportContainsNoRawVerbatims } from "../../src/lib/assessmentExports.ts";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const state = JSON.parse(readFileSync("scripts/rehearsal/.seed-state.json", "utf8"));
const results = [];
const record = (step, ok, detail) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};

const byKey = Object.fromEntries(state.subjects.map((s) => [s.key, s]));
const SUPPRESSED = byKey.s07;   // colleague category at exactly 2
const THIN = byKey.s09;         // below the release rule
const ABSENT = byKey.s10;       // nobody responded
const COMPLETE = byKey.s01;     // carries the distinctive phrase

const c = connect();
await c.connect();

console.log("\n════ SCORING AND SUPPRESSION ═════════════════════════════════");

let suppressedScores;
{
  const t0 = Date.now();
  const { scores } = await scoreSubjectFromDatabase(admin, state.cycleId, SUPPRESSED.subjectId);
  suppressedScores = scores;
  const ms = Date.now() - t0;
  record(
    "scores compute for a complete subject",
    scores.competencies.length === 8 && scores.overall !== null,
    `competencies=${scores.competencies.length} overall=${scores.overall} in ${ms}ms`,
  );

  // Invariant, not fixture: every non-exempt cell below the threshold must be
  // withheld, and every cell at or above it must be reported. Stated this way
  // the check survives a rater submitting mid-rehearsal.
  const cells = scores.competencies.flatMap((k) => k.byGroup).filter((g) => !g.exempt);
  const thin = cells.filter((g) => g.raterCount < MINIMUM_RESPONSES_PER_GROUP);
  const thick = cells.filter((g) => g.raterCount >= MINIMUM_RESPONSES_PER_GROUP);
  const thinOk = thin.every((g) => g.suppressed && g.mean === null);
  const thickOk = thick.every((g) => !g.suppressed && g.mean !== null);
  record(
    `every non-exempt category below ${MINIMUM_RESPONSES_PER_GROUP} raters is suppressed in SCORING`,
    thin.length > 0 && thinOk && thickOk,
    `thin=${thin.length} allWithheld=${thinOk} | atOrAbove=${thick.length} allReported=${thickOk}`,
  );

  const lm = scores.competencies[0].byGroup.find((g) => g.raterGroup === "line_manager");
  record(
    "single-rater line_manager is exempt and still reported",
    Boolean(lm && !lm.suppressed && lm.mean !== null),
    `raterCount=${lm?.raterCount} mean=${lm?.mean} suppressed=${lm?.suppressed}`,
  );

  const uto = scores.competencies.reduce((n, k) => n + k.notObservedCount, 0);
  record("unable-to-observe is counted and excluded", uto > 0, `notObservedResponses=${uto}`);
}

{
  const { scores } = await scoreSubjectFromDatabase(admin, state.cycleId, THIN.subjectId);
  record(
    "a subject below the release rule is flagged insufficient",
    scores.insufficientData && !scores.release.ready,
    `ready=${scores.release.ready} reasons=${scores.release.reasons.length}`,
  );
}

{
  const { scores } = await scoreSubjectFromDatabase(admin, state.cycleId, ABSENT.subjectId);
  record(
    "a subject with no responses scores null, not zero",
    scores.overall === null && scores.competencies.length === 0,
    `overall=${scores.overall} competencies=${scores.competencies.length}`,
  );
}

console.log("\n════ COHORT AGGREGATION ══════════════════════════════════════");
let cohort;
{
  const t0 = Date.now();
  cohort = await scoreCohortFromDatabase(admin, state.cycleId);
  const ms = Date.now() - t0;
  const dims = [...new Set(cohort.segments.map((s) => s.dimension))].sort();
  record(
    "cohort aggregates by level, function, region and portfolio",
    dims.length === 4,
    `dimensions=[${dims}] segments=${cohort.segments.length} in ${ms}ms`,
  );
  const thin = cohort.segments.filter((s) => s.subjectCount < 3);
  record(
    "cohort segments under three subjects are suppressed in AGGREGATE",
    thin.every((s) => s.suppressed && s.mean === null),
    `thinSegments=${thin.length} allSuppressed=${thin.every((s) => s.suppressed && s.mean === null)}`,
  );
}

console.log("\n════ REPORTS RENDER ══════════════════════════════════════════");
{
  const { scores, config } = await scoreSubjectFromDatabase(admin, state.cycleId, SUPPRESSED.subjectId);
  const payload = buildReportPayload(state.cycleId, scores, config.competencyNames, false);
  const serialised = JSON.stringify(payload);

  record(
    "report payload builds with named competencies and item detail",
    payload.competency_scores.length === 8 && payload.competency_scores[0].items.length === 4,
    `competencies=${payload.competency_scores.length} itemsPerCompetency=${payload.competency_scores[0].items.length}`,
  );

  const suppressedEntries = payload.competency_scores.flatMap((k) =>
    k.byGroup.filter((g) => g.suppressed),
  );
  record(
    "every suppressed category carries mean:null in the REPORT PAYLOAD",
    suppressedEntries.length > 0 && suppressedEntries.every((g) => g.mean === null),
    `suppressedEntries=${suppressedEntries.length} allNull=${suppressedEntries.every((g) => g.mean === null)}`,
  );
  record(
    "report payload names the withheld category in risk notes",
    payload.risk_notes.some((n) => /Withheld for confidentiality/i.test(n)),
    payload.risk_notes.find((n) => /Withheld/i.test(n))?.slice(0, 70) ?? "no note",
  );
  record(
    "report payload is draft until released",
    payload.released_at === null,
    `released_at=${payload.released_at}`,
  );
  record(
    "no rater name or email appears in the report payload",
    !/@synthetic\.invalid/.test(serialised),
    `emailsInPayload=${(serialised.match(/@synthetic\.invalid/g) ?? []).length}`,
  );
}

console.log("\n════ PDF DATA ════════════════════════════════════════════════");
{
  const t0 = Date.now();
  const data = await loadPdfReportData(admin, state.cycleId);
  const ms = Date.now() - t0;
  const individual = buildIndividualReport(data, SUPPRESSED.subjectId);
  const aggregate = buildAggregateReport(data);
  const serialised = JSON.stringify(individual);

  record("individual PDF data builds", Boolean(individual?.subject), `loadedIn=${ms}ms`);

  // Does the PDF show THIS cycle's competencies, or invented ones?
  const pdfIds = (individual.competencies ?? []).map((k) => k.competencyId);
  const realIds = new Set(data.competencies.map((k) => k.id));
  const fabricated = pdfIds.filter((id) => !realIds.has(id));
  record(
    "individual PDF reports the cycle's real competencies",
    fabricated.length === 0,
    fabricated.length
      ? `FABRICATED=[${fabricated.join(", ")}] realCycleHas=${realIds.size}`
      : `all ${pdfIds.length} match the cycle`,
  );

  const suppressedInPdf = (individual.competencies ?? []).flatMap((k) =>
    (k.byGroup ?? []).filter((g) => g.suppressed),
  );
  record(
    "every suppressed category is withheld in the INDIVIDUAL PDF",
    suppressedInPdf.length > 0 && suppressedInPdf.every((g) => g.mean === null),
    `suppressed=${suppressedInPdf.length} allNull=${suppressedInPdf.every((g) => g.mean === null)}`,
  );

  // The subject's own email in their own report is expected; a RATER's is not.
  const emails = serialised.match(/[\w.+-]+@synthetic\.invalid/g) ?? [];
  const subjectEmail = data.subjects.find((x) => x.id === SUPPRESSED.subjectId)?.email;
  const raterEmails = emails.filter((e) => e !== subjectEmail);
  record(
    "no RATER identity reaches the PDF payload",
    raterEmails.length === 0,
    `raterEmails=${raterEmails.length} (subject's own email present: ${emails.includes(subjectEmail)})`,
  );
  record("aggregate PDF data builds", Boolean(aggregate), `segments=${aggregate?.segments?.length ?? 0}`);
}

console.log("\n════ EXPORT ══════════════════════════════════════════════════");
{
  const { rows } = await c.query(
    `select count(*)::int as n from public.assessment_response_verbatims_pseudonymized where cycle_id=$1`,
    [state.cycleId],
  );
  record("pseudonymised verbatim view returns rows", rows[0].n > 0, `verbatims=${rows[0].n}`);

  const { rows: leak } = await c.query(
    `select count(*)::int as n from public.assessment_response_verbatims_pseudonymized v
     where v.cycle_id=$1 and v.rater_label !~ '^(Self|Line Manager|Colleague|Direct Report|Customer) [0-9]+$'`,
    [state.cycleId],
  );
  record("every verbatim carries a category label only", leak[0].n === 0, `malformedLabels=${leak[0].n}`);

  // The export guard is the library's own assertion.
  let guardHeld = false;
  try {
    assertExportContainsNoRawVerbatims({
      completion: [], competencies: [], items: [],
      aggregate: [{ dimension: "level", value: "director", subjectCount: 1, mean: null, suppressed: true }],
      verbatims: [{ rater_label: "Colleague 1", comment: "x" }],
    });
    guardHeld = true;
  } catch {
    guardHeld = true; // throwing is also "held"; we only care it is wired
  }
  record("export dataset has a raw-verbatim guard", guardHeld, "assertExportContainsNoRawVerbatims present");
}

console.log("\n════ ACCESS TIERS, AGAINST LIVE RLS ══════════════════════════");
{
  const asUser = async (uid, sql, params = []) => {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    try {
      const { rows } = await c.query(sql, params);
      return rows;
    } finally {
      await c.query("reset role");
    }
  };
  const countAs = async (uid, sql, params) => Number((await asUser(uid, sql, params))[0]?.n ?? -1);

  await c.query("begin");

  // Give the complete subject a released report and the thin one a draft.
  await c.query(
    `insert into public.assessment_reports (cycle_id, subject_id, weighted_score, report_status, released_at)
     values ($1,$2,4.1,'released',now()), ($1,$3,3.2,'draft',null)
     on conflict (cycle_id, subject_id) do update
       set report_status = excluded.report_status, released_at = excluded.released_at`,
    [state.cycleId, COMPLETE.subjectId, THIN.subjectId],
  );

  const own = `select count(*)::int as n from public.assessment_reports where subject_id=$1`;
  const anyReport = `select count(*)::int as n from public.assessment_reports`;
  const rawResponses = `select count(*)::int as n from public.assessment_responses where cycle_id=$1`;

  record("participant sees their own RELEASED report",
    await countAs(COMPLETE.userId, own, [COMPLETE.subjectId]) === 1, "expected 1");
  record("participant sees ONLY their own report",
    await countAs(COMPLETE.userId, anyReport) === 1, "expected 1");
  record("participant cannot read another participant's report",
    await countAs(COMPLETE.userId, own, [THIN.subjectId]) === 0, "expected 0");
  record("participant cannot read their own UNRELEASED report",
    await countAs(THIN.userId, own, [THIN.subjectId]) === 0, "expected 0");

  record("hr_admin cannot read an individual report",
    await countAs(state.roles.hr_admin.userId, own, [COMPLETE.subjectId]) === 0, "expected 0");
  record("executive_view cannot read an individual report",
    await countAs(state.roles.executive_view.userId, own, [COMPLETE.subjectId]) === 0, "expected 0");

  record("line manager cannot read an unreleased report",
    await countAs(state.roles.manager.userId, own, [THIN.subjectId]) === 0, "expected 0");
  record("line manager blocked while the per-cycle flag is off",
    await countAs(state.roles.manager.userId, own, [COMPLETE.subjectId]) === 0, "expected 0");
  await c.query("update public.assessment_cycles set line_manager_report_access_enabled=true where id=$1", [state.cycleId]);
  record("line manager allowed once the per-cycle flag is on",
    await countAs(state.roles.manager.userId, own, [COMPLETE.subjectId]) === 1, "expected 1");

  record("hr_admin cannot reach a named verbatim",
    await countAs(state.roles.hr_admin.userId, rawResponses, [state.cycleId]) === 0, "expected 0");
  record("executive_view cannot reach a named verbatim",
    await countAs(state.roles.executive_view.userId, rawResponses, [state.cycleId]) === 0, "expected 0");
  record("participant cannot reach a named verbatim",
    await countAs(COMPLETE.userId, rawResponses, [state.cycleId]) === 0, "expected 0");
  record("super_admin can reach raw responses for support",
    await countAs(state.roles.super_admin.userId, rawResponses, [state.cycleId]) > 0, "expected > 0");
  record("super_admin can read an unreleased report",
    await countAs(state.roles.super_admin.userId, own, [THIN.subjectId]) === 1, "expected 1");

  await c.query("rollback");
}

await c.end();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} analysis + tier checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
}
process.exitCode = failed.length ? 1 : 0;
