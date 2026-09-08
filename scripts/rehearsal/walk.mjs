/**
 * Walks the rater-facing chain over real HTTP against a running server, and the
 * adversarial token checks. Requires: node scripts/rehearsal/seed.mjs first.
 *
 *   BASE=http://localhost:3210 node scripts/rehearsal/walk.mjs
 */
import { readFileSync } from "node:fs";
import { connect } from "./_db.mjs";

const BASE = process.env.BASE ?? "http://localhost:3210";
const state = JSON.parse(readFileSync("scripts/rehearsal/.seed-state.json", "utf8"));

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

const get = (path) => fetch(`${BASE}${path}`, { redirect: "manual" });
const send = (method) => (path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
  });
// The verb is the mode: PATCH saves a draft, POST submits.
const post = send("POST");
const patch = send("PATCH");

const c = connect();
await c.connect();

// ── pick fixtures ───────────────────────────────────────────────────────────
// Read live status rather than trusting the seed plan, so the walk is re-runnable
// after a previous run has already consumed a rater.
const { rows: openRaters } = await c.query(
  `select id from public.assessment_reviewers
   where cycle_id = $1 and status = 'not_started'
     and (token_expires_at is null or token_expires_at > now())
   order by id`,
  [state.cycleId],
);
const openIds = new Set(openRaters.map((r) => r.id));
const fresh = state.tokens.find((t) => openIds.has(t.reviewerId));
if (!fresh) {
  console.error("No unstarted, unexpired rater left. Re-seed before re-running.");
  process.exit(1);
}
const submitted = state.tokens.find((t) => t.willSubmit);
const expired = state.tokens.find((t) => t.expired);
const drafter = state.tokens.find((t) => t.willDraft);

console.log("\n════ CHAIN: rater journey ════════════════════════════════════");

// 1. open on mobile
{
  const res = await get(`/api/assessments/submissions?token=${encodeURIComponent(fresh.token)}`);
  const body = await res.json();
  record(
    "rater opens assessment via token",
    res.status === 200 && body.status === "ready",
    `status=${res.status} state=${body.status} competencies=${body.instrument?.competencies?.length} textItems=${body.instrument?.textItems?.length}`,
  );
  globalThis.__instrument = body.instrument;
}

// 2. queue page renders for that rater
{
  const res = await get(`/review/queue/${encodeURIComponent(fresh.token)}`);
  const html = res.status === 200 ? await res.text() : "";
  const m = html.match(/(\d+) of (\d+) complete/);
  record(
    "rater queue lists every assignment that email owes",
    res.status === 200 && Boolean(m),
    `status=${res.status} progress="${m ? m[0] : "not found"}"`,
  );
}

// 3. save a draft
const instrument = globalThis.__instrument;
const scale = instrument.competencies.flatMap((k) => k.items.map((i) => ({ ...i, competency: k.id })));
const text = instrument.textItems;
{
  const partial = scale.slice(0, 6).map((i, n) => ({
    itemId: i.id,
    itemType: "scale",
    score: n === 0 ? null : 4,
    notObserved: n === 0,
    comment: n === 1 ? "Steady under pressure." : undefined,
  }));
  const res = await patch("/api/assessments/submissions", {
    token: fresh.token,
    mode: "draft",
    responses: partial,
  });
  const body = await res.json();
  record(
    "rater saves a partial draft",
    res.status === 200 && body.submission?.status === "in_progress",
    `status=${res.status} state=${body.submission?.status}`,
  );
}

// 4. resume — the draft must come back
{
  const res = await get(`/api/assessments/submissions?token=${encodeURIComponent(fresh.token)}`);
  const body = await res.json();
  const draftCount = body.draft?.responses?.length ?? 0;
  const uto = body.draft?.responses?.filter((r) => r.notObserved).length ?? 0;
  record(
    "rater resumes and sees saved answers",
    res.status === 200 && draftCount === 6 && uto === 1,
    `restored=${draftCount} unableToObserve=${uto} lastSavedAt=${Boolean(body.lastSavedAt)}`,
  );
}

// 5. submit in full
{
  const full = [
    ...scale.map((i) => ({ itemId: i.id, itemType: "scale", score: 4, notObserved: false })),
    ...text.map((i) => ({ itemId: i.id, itemType: "text", comment: "Delegates more than last year." })),
  ];
  const res = await post("/api/assessments/submissions", {
    token: fresh.token,
    mode: "submit",
    responses: full,
  });
  const body = await res.json();
  record(
    "rater submits a complete assessment",
    res.status === 200 && body.submission?.status === "submitted",
    `status=${res.status} state=${body.submission?.status} scored=${body.submission?.summary?.scored} uto=${body.submission?.summary?.notObserved}`,
  );
}

console.log("\n════ ADVERSARIAL: each must fail closed ══════════════════════");

// A1. reuse a submitted token
{
  const res = await post("/api/assessments/submissions", {
    token: fresh.token,
    mode: "submit",
    responses: scale.slice(0, 1).map((i) => ({ itemId: i.id, itemType: "scale", score: 1, notObserved: false })),
  });
  record("reuse of a submitted token is refused", res.status === 409, `status=${res.status} (want 409)`);
}

// A2. the GET side of a submitted token
{
  const res = await get(`/api/assessments/submissions?token=${encodeURIComponent(submitted.token)}`);
  const body = await res.json();
  record(
    "submitted token cannot reopen the form",
    body.status === "submitted" && !body.instrument,
    `state=${body.status} instrumentReturned=${Boolean(body.instrument)}`,
  );
}

// A3. expired token
{
  const res = await get(`/api/assessments/submissions?token=${encodeURIComponent(expired.token)}`);
  const body = await res.json();
  record("expired token is refused", res.status === 410 && body.status === "expired", `status=${res.status} (want 410)`);

  const post410 = await post("/api/assessments/submissions", {
    token: expired.token,
    mode: "submit",
    responses: scale.slice(0, 1).map((i) => ({ itemId: i.id, itemType: "scale", score: 3, notObserved: false })),
  });
  record("expired token cannot submit", post410.status === 410, `status=${post410.status} (want 410)`);
}

// A4. garbage token
{
  const res = await get("/api/assessments/submissions?token=not-a-real-token");
  record("unknown token is refused", res.status === 404, `status=${res.status} (want 404)`);
}

// A5. submit after closes_on
{
  await c.query("update public.assessment_cycles set closes_on = current_date - 1 where id = $1", [state.cycleId]);
  const victim = state.tokens.find((t) => !t.willSubmit && !t.expired && t.token !== fresh.token);
  const res = await post("/api/assessments/submissions", {
    token: victim.token,
    mode: "submit",
    responses: scale.map((i) => ({ itemId: i.id, itemType: "scale", score: 4, notObserved: false })),
  });
  record("submission after closes_on is refused", res.status === 409 || res.status === 410, `status=${res.status} (want 409/410)`);
  await c.query("update public.assessment_cycles set closes_on = $2 where id = $1", [state.cycleId, state.closesOn]);
}

// A6. cross-rater token isolation on the queue
{
  const other = state.tokens.find((t) => t.subjectKey !== fresh.subjectKey && t.email !== fresh.email && !t.expired);
  const res = await get(`/review/queue/${encodeURIComponent(fresh.token)}`);
  const html = await res.text();
  const leaked = html.includes(other.email);
  record("queue does not leak another rater's assignments", !leaked, `otherRaterEmailPresent=${leaked}`);
}

// A7. a body whose mode contradicts the verb must be refused, not coerced.
// Coercing it submits irreversibly and freezes the rater out of their own draft.
{
  const victim = state.tokens.find((t) => openIds.has(t.reviewerId) && t.reviewerId !== fresh.reviewerId);
  if (victim) {
    const res = await post("/api/assessments/submissions", {
      token: victim.token,
      mode: "draft",
      responses: scale.slice(0, 3).map((i) => ({ itemId: i.id, itemType: "scale", score: 4, notObserved: false })),
    });
    const { rows } = await c.query("select status from public.assessment_reviewers where id=$1", [victim.reviewerId]);
    record(
      "POST carrying mode:draft is refused, not silently submitted",
      res.status === 400 && rows[0].status === "not_started",
      `status=${res.status} (want 400) reviewerLeftAs=${rows[0].status}`,
    );
  } else {
    record("POST carrying mode:draft is refused, not silently submitted", false, "no spare rater to test with");
  }
}

await c.end();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} chain + adversarial checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
}
process.exitCode = failed.length ? 1 : 0;
