/**
 * SYNTHETIC REHEARSAL SEED — creates one fully-marked, purgeable 360 cycle.
 *
 * Everything hangs off one organisation whose slug is REHEARSAL_SLUG, and every
 * uuid it mints starts with the same prefix nibble. Purge is therefore a single
 * command: node scripts/rehearsal/purge.mjs
 *
 * Nothing here is real. Names are generated, comments are written for this
 * script, and every row a human might see is prefixed [SYNTHETIC].
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { connect } from "./_db.mjs";
import { REHEARSAL_SLUG, UUID_PREFIX } from "./_const.mjs";




let counter = 0;
const uid = () => {
  counter += 1;
  return `${UUID_PREFIX}-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
};
const hash = (t) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

const COMPETENCIES = [
  "Sets Direction",
  "Develops People",
  "Drives Execution",
  "Customer Obsession",
  "Commercial Judgement",
  "Collaboration Across Silos",
  "Resilience Under Pressure",
  "Ethical Leadership",
];

const ITEM_STEMS = [
  "Communicates what matters most for the year ahead.",
  "Makes the trade-offs behind a decision visible.",
  "Follows through on commitments made to other teams.",
  "Creates room for others to raise bad news early.",
];

const TEXT_ITEMS = [
  "What should this leader start doing?",
  "What should this leader stop doing?",
  "What does this leader do that most helps you succeed?",
];

/** One deliberately distinctive phrase, used to prove the anti-quotation check. */
export const DISTINCTIVE_PHRASE =
  "she personally rerouted the Kaduna backhaul during the harmattan blackout and never mentioned it once";

const COMMENT_POOL = [
  "Keeps the weekly operating rhythm steady even when targets slip.",
  "Tends to decide alone and explain afterwards, which slows the team down.",
  "Will say the uncomfortable thing in front of the executive team.",
  "Escalates too quickly instead of resolving at source.",
  "Protects the team from noise without hiding the real risks.",
  "Coaching is inconsistent; some people get a lot of time and others none.",
  "Reads the commercial picture faster than most peers.",
  "Under pressure the tone sharpens and people stop volunteering problems.",
];

const FIRST = ["Ada", "Ben", "Chidi", "Dami", "Emeka", "Funke", "Gbenga", "Halima", "Ibrahim", "Joy", "Kemi", "Lanre", "Musa", "Ngozi", "Obi", "Peju", "Rita", "Segun", "Tunde", "Uche", "Vivian", "Yemi", "Zainab", "Bola"];
const LAST = ["Obi", "Eze", "Njoku", "Adeyemi", "Okafor", "Bello", "Danjuma", "Ogun", "Yakubu", "Musa", "Ade", "Nwosu"];

let nameSeed = 0;
const person = () => {
  const f = FIRST[nameSeed % FIRST.length];
  const l = LAST[Math.floor(nameSeed / FIRST.length) % LAST.length];
  nameSeed += 1;
  return { name: `${f} ${l}`, email: `${f}.${l}.${nameSeed}@synthetic.invalid`.toLowerCase() };
};

const LEVELS = ["director", "assistant_director"];
const FUNCTIONS = ["Network", "Commercial", "Customer Experience", "Technology"];
const REGIONS = ["Lagos", "Abuja", "Port Harcourt"];
const PORTFOLIOS = ["Core", "Enterprise", "Consumer"];

/** 8 raters per subject. */
const COMPOSITION = ["self", "line_manager", "colleague", "colleague", "colleague", "direct_report", "direct_report", "customer"];

/**
 * Per-subject behaviour. `submit` lists the composition slots that submit.
 * s07 leaves exactly one colleague unsubmitted, so that category lands on
 * EXACTLY 2 responses and must be suppressed everywhere it could surface.
 */
const PLAN = [
  { key: "s01", label: "complete (carries the distinctive phrase)", submit: "all" },
  { key: "s02", label: "complete", submit: "all" },
  { key: "s03", label: "complete", submit: "all" },
  { key: "s04", label: "complete", submit: "all" },
  { key: "s05", label: "complete", submit: "all" },
  { key: "s06", label: "complete, heavy unable-to-observe", submit: "all", utoRate: 0.35 },
  { key: "s07", label: "SUPPRESSION: colleague category left at exactly 2", submit: [0, 1, 2, 3, 5, 6, 7] },
  { key: "s08", label: "partial: two raters mid-draft", submit: [0, 1, 2, 3, 5], draft: [4, 6] },
  { key: "s09", label: "too thin to release", submit: [1, 2] },
  { key: "s10", label: "absent: nobody responded", submit: [] },
];

const c = connect();
await c.connect();

try {
  await c.query("begin");

  const orgId = uid();
  await c.query(
    "insert into public.organisations (id, name, slug, currency) values ($1,$2,$3,'NGN')",
    [orgId, "[SYNTHETIC] Rehearsal Cohort", REHEARSAL_SLUG],
  );

  // Role fixtures for the tier checks.
  const roles = {};
  for (const role of ["hr_admin", "executive_view", "super_admin", "manager"]) {
    const userId = uid();
    const empId = uid();
    const p = person();
    await c.query(
      "insert into auth.users (id, aud, role, email, created_at, updated_at) values ($1,'authenticated','authenticated',$2,now(),now())",
      [userId, p.email],
    );
    await c.query(
      "insert into public.employees (id, user_id, org_id, name, email, platform_role) values ($1,$2,$3,$4,$5,$6)",
      [empId, userId, orgId, `[SYNTHETIC] ${p.name}`, p.email, role],
    );
    roles[role] = { userId, empId, email: p.email };
  }

  const cycleId = uid();
  const closesOn = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  await c.query(
    `insert into public.assessment_cycles
       (id, org_id, name, client_context, status, starts_on, closes_on, line_manager_report_access_enabled)
     values ($1,$2,$3,$4,'collecting',current_date,$5,false)`,
    [cycleId, orgId, "[SYNTHETIC] Rehearsal 360", "Synthetic data for pre-launch rehearsal", closesOn],
  );

  // Instrument: 8 competencies x 4 scale items, plus 3 standalone text items.
  const items = [];
  for (const [i, name] of COMPETENCIES.entries()) {
    const compId = uid();
    await c.query(
      "insert into public.assessment_competencies (id, cycle_id, name, weight, sort_order) values ($1,$2,$3,$4,$5)",
      [compId, cycleId, name, 12.5, i],
    );
    for (const [j, stem] of ITEM_STEMS.entries()) {
      const itemId = uid();
      await c.query(
        "insert into public.assessment_items (id, cycle_id, competency_id, item_type, body, display_order) values ($1,$2,$3,'scale',$4,$5)",
        [itemId, cycleId, compId, `${name}: ${stem}`, i * 4 + j],
      );
      items.push({ id: itemId, type: "scale" });
    }
  }
  for (const [k, body] of TEXT_ITEMS.entries()) {
    const itemId = uid();
    await c.query(
      "insert into public.assessment_items (id, cycle_id, competency_id, item_type, body, display_order) values ($1,$2,null,'text',$3,$4)",
      [itemId, cycleId, body, 100 + k],
    );
    items.push({ id: itemId, type: "text" });
  }

  const scaleItems = items.filter((i) => i.type === "scale");
  const textItems = items.filter((i) => i.type === "text");

  const tokens = [];
  const subjects = [];
  let responseCount = 0;

  for (const [idx, plan] of PLAN.entries()) {
    // Every subject is a real employee so participant self-read can be tested.
    const sp = person();
    const subjEmpId = uid();
    const subjUserId = uid();
    await c.query(
      "insert into auth.users (id, aud, role, email, created_at, updated_at) values ($1,'authenticated','authenticated',$2,now(),now())",
      [subjUserId, sp.email],
    );
    await c.query(
      "insert into public.employees (id, user_id, org_id, name, email, platform_role, line_manager_id) values ($1,$2,$3,$4,$5,'standard',$6)",
      [subjEmpId, subjUserId, orgId, `[SYNTHETIC] ${sp.name}`, sp.email, roles.manager.empId],
    );

    const subjectId = uid();
    await c.query(
      `insert into public.assessment_subjects
         (id, cycle_id, employee_id, name, email, level, function_name, region, portfolio)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [subjectId, cycleId, subjEmpId, `[SYNTHETIC] ${sp.name}`, sp.email,
        LEVELS[idx % 2], FUNCTIONS[idx % FUNCTIONS.length], REGIONS[idx % REGIONS.length], PORTFOLIOS[idx % PORTFOLIOS.length]],
    );

    subjects.push({ key: plan.key, label: plan.label, subjectId, employeeId: subjEmpId, userId: subjUserId, name: sp.name });

    const submits = plan.submit === "all" ? COMPOSITION.map((_, i) => i) : plan.submit;
    const drafts = plan.draft ?? [];
    const utoRate = plan.utoRate ?? 0.08;

    for (const [slot, group] of COMPOSITION.entries()) {
      const rp = group === "self" ? sp : person();
      const reviewerId = uid();
      const plain = newToken();
      // One deliberately expired token, on an unsubmitted rater of s10.
      const isExpired = plan.key === "s10" && slot === 7;
      const expiresAt = isExpired
        ? new Date(Date.now() - 864e5).toISOString()
        : new Date(Date.now() + 14 * 864e5).toISOString();

      await c.query(
        `insert into public.assessment_reviewers
           (id, cycle_id, subject_id, reviewer_name, reviewer_email, reviewer_group,
            token_hash, token_expires_at, invite_status, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'sent','not_started')`,
        [reviewerId, cycleId, subjectId, `[SYNTHETIC] ${rp.name}`, rp.email, group, hash(plain), expiresAt],
      );

      tokens.push({
        subjectKey: plan.key,
        subjectId,
        reviewerId,
        group,
        slot,
        token: plain,
        email: rp.email,
        expired: isExpired,
        willSubmit: submits.includes(slot),
        willDraft: drafts.includes(slot),
      });

      if (!submits.includes(slot) && !drafts.includes(slot)) continue;

      // Draft raters answer only the first half, to exercise resume.
      const answered = drafts.includes(slot) ? scaleItems.slice(0, 16) : scaleItems;

      for (const item of answered) {
        const uto = Math.random() < utoRate;
        const rating = uto ? null : 1 + Math.floor(Math.random() * 5);
        const comment = !uto && Math.random() < 0.4
          ? COMMENT_POOL[Math.floor(Math.random() * COMMENT_POOL.length)]
          : null;
        await c.query(
          `insert into public.assessment_responses
             (cycle_id, subject_id, reviewer_id, item_id, rating, not_observed, comment)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [cycleId, subjectId, reviewerId, item.id, rating, uto, comment],
        );
        responseCount += 1;
      }

      if (submits.includes(slot)) {
        for (const [ti, item] of textItems.entries()) {
          // Plant the distinctive phrase once, on a colleague of s01.
          const text = (plan.key === "s01" && group === "colleague" && slot === 2 && ti === 0)
            ? DISTINCTIVE_PHRASE
            : COMMENT_POOL[(slot + ti) % COMMENT_POOL.length];
          await c.query(
            `insert into public.assessment_responses
               (cycle_id, subject_id, reviewer_id, item_id, rating, not_observed, comment)
             values ($1,$2,$3,$4,null,false,$5)`,
            [cycleId, subjectId, reviewerId, item.id, text],
          );
          responseCount += 1;
        }
        await c.query(
          "update public.assessment_reviewers set status='submitted', invite_status='submitted', submitted_at=now() where id=$1",
          [reviewerId],
        );
      }
    }
  }

  await c.query("commit");

  writeFileSync(
    "scripts/rehearsal/.seed-state.json",
    JSON.stringify({ orgId, cycleId, closesOn, roles, subjects, tokens, distinctivePhrase: DISTINCTIVE_PHRASE }, null, 2),
  );

  const { rows: summary } = await c.query(
    `select
       (select count(*) from public.assessment_subjects where cycle_id=$1) as subjects,
       (select count(*) from public.assessment_reviewers where cycle_id=$1) as assignments,
       (select count(*) from public.assessment_reviewers where cycle_id=$1 and status='submitted') as submitted,
       (select count(*) from public.assessment_reviewers where cycle_id=$1 and status='in_progress') as in_progress,
       (select count(*) from public.assessment_reviewers where cycle_id=$1 and status='not_started') as not_started,
       (select count(*) from public.assessment_items where cycle_id=$1) as items,
       (select count(*) from public.assessment_responses where cycle_id=$1) as responses,
       (select count(*) from public.assessment_responses where cycle_id=$1 and not_observed) as unable_to_observe,
       (select count(*) from public.assessment_responses where cycle_id=$1 and comment is not null) as comments`,
    [cycleId],
  );

  console.log("SEEDED  [SYNTHETIC] Rehearsal 360");
  console.table(summary);
  console.log(`org    ${orgId}`);
  console.log(`cycle  ${cycleId}`);
  console.log("state  scripts/rehearsal/.seed-state.json");
  console.log("purge  node scripts/rehearsal/purge.mjs");
} catch (error) {
  await c.query("rollback");
  console.error("SEED FAILED (rolled back):", error.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
