/**
 * Load sanity. Measures the real per-unit cost of each expensive stage against
 * the seeded 10-subject cycle, then extrapolates to the 71-subject / 568-assignment
 * cohort. Extrapolation is linear and labelled as such — these stages are all
 * per-subject loops, so linear is the right model, but the numbers are estimates.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { connect } from "./_db.mjs";
import { scoreSubjectFromDatabase, scoreCohortFromDatabase } from "../../src/lib/assessmentScoringService.ts";
import { buildReportPayload } from "../../src/lib/assessmentReporting.ts";
import { loadPdfReportData, buildIndividualReport, buildAggregateReport } from "../../src/lib/assessmentPdfData.ts";
import { parseBulkReviewerCsv } from "../../src/lib/assessmentReviewerBulk.ts";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const state = JSON.parse(readFileSync("scripts/rehearsal/.seed-state.json", "utf8"));

const COHORT_SUBJECTS = 71;
const COHORT_ASSIGNMENTS = 568;
const rows = [];
const ms = (n) => `${Math.round(n)}ms`;
const mins = (n) => `${(n / 60000).toFixed(1)} min`;

const time = async (fn) => { const t = Date.now(); const v = await fn(); return [Date.now() - t, v]; };

// 1. Bulk assignment import — parse 568 rows.
{
  const header = "subject_email,rater_name,rater_email,relationship_type\n";
  const body = Array.from({ length: COHORT_ASSIGNMENTS }, (_, i) =>
    `subject${i % COHORT_SUBJECTS}@x.test,Rater ${i},rater${i}@x.test,colleague`).join("\n");
  const [t, parsed] = await time(async () => parseBulkReviewerCsv(header + body));
  const n = parsed?.rows?.length ?? parsed?.valid?.length ?? (Array.isArray(parsed) ? parsed.length : 0);
  rows.push({ stage: "bulk import parse (568 rows)", measured: ms(t), projected568: ms(t), note: `parsed ${n} rows` });
}

// 2. Scoring pass — per subject, then the whole cohort.
{
  const subs = state.subjects;
  const t0 = Date.now();
  for (const s of subs) {
    const { scores, config } = await scoreSubjectFromDatabase(admin, state.cycleId, s.subjectId);
    buildReportPayload(state.cycleId, scores, config.competencyNames, false);
  }
  const total = Date.now() - t0;
  const per = total / subs.length;
  rows.push({
    stage: "score + build report payload",
    measured: `${ms(total)} for ${subs.length} subjects`,
    projected568: mins(per * COHORT_SUBJECTS),
    note: `${ms(per)} per subject`,
  });
}

// 3. Cohort aggregation — one pass over every subject.
{
  const [t] = await time(() => scoreCohortFromDatabase(admin, state.cycleId));
  rows.push({
    stage: "cohort aggregation",
    measured: ms(t),
    projected568: mins((t / state.subjects.length) * COHORT_SUBJECTS),
    note: "re-scores every subject",
  });
}

// 4. PDF batch — data load once, then per-subject report build.
{
  const [tLoad, data] = await time(() => loadPdfReportData(admin, state.cycleId, { includePrior: true }));
  const t0 = Date.now();
  for (const s of state.subjects) buildIndividualReport(data, s.subjectId);
  const tBuild = Date.now() - t0;
  buildAggregateReport(data);
  const per = tBuild / state.subjects.length;
  rows.push({ stage: "PDF data load (once per batch)", measured: ms(tLoad), projected568: ms(tLoad), note: "single query set" });
  rows.push({
    stage: "PDF report model build",
    measured: `${ms(tBuild)} for ${state.subjects.length}`,
    projected568: mins(per * COHORT_SUBJECTS),
    note: `${per.toFixed(1)}ms per subject (model only, not PDF render)`,
  });
}

// 5. Raw write throughput, as observed while seeding.
{
  const c = connect(); await c.connect();
  const [t] = await time(async () => {
    for (let i = 0; i < 20; i += 1) await c.query("select 1");
  });
  await c.end();
  const rtt = t / 20;
  rows.push({
    stage: "database round trip (pooler, eu-west-1)",
    measured: `${rtt.toFixed(0)}ms`,
    projected568: mins(rtt * COHORT_ASSIGNMENTS * 35),
    note: "projection = one insert per response, the naive path",
  });
}

console.table(rows);
console.log(`\nProjections assume ${COHORT_SUBJECTS} subjects / ${COHORT_ASSIGNMENTS} assignments, linear in subjects.`);
