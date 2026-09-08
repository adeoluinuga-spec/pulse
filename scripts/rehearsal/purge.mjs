/**
 * ONE-COMMAND PURGE of everything the rehearsal seed created.
 *
 *   node scripts/rehearsal/purge.mjs
 *
 * Deleting the organisation cascades to cycles, subjects, reviewers, responses,
 * reports, items, competencies and audit events. The auth.users rows do not
 * cascade from the organisation, so they are removed by their uuid prefix.
 */
import { existsSync, unlinkSync } from "node:fs";
import { connect } from "./_db.mjs";
import { REHEARSAL_SLUG, UUID_PREFIX } from "./_const.mjs";

const c = connect();
await c.connect();

try {
  await c.query("begin");

  const { rows: orgs } = await c.query(
    "delete from public.organisations where slug = $1 returning id",
    [REHEARSAL_SLUG],
  );
  const users = await c.query("delete from auth.users where id::text like $1", [`${UUID_PREFIX}-%`]);

  // Nothing synthetic should survive this.
  const { rows: leftover } = await c.query(
    `select
       (select count(*) from public.assessment_cycles where id::text like $1) as cycles,
       (select count(*) from public.assessment_reviewers where id::text like $1) as reviewers,
       (select count(*) from public.assessment_responses where id::text like $1) as responses,
       (select count(*) from public.employees where id::text like $1) as employees`,
    [`${UUID_PREFIX}-%`],
  );

  await c.query("commit");

  console.log(`purged ${orgs.length} organisation(s) and ${users.rowCount} auth user(s)`);
  console.table(leftover);

  if (existsSync("scripts/rehearsal/.seed-state.json")) {
    unlinkSync("scripts/rehearsal/.seed-state.json");
    console.log("removed scripts/rehearsal/.seed-state.json");
  }
} catch (error) {
  await c.query("rollback");
  console.error("PURGE FAILED (rolled back):", error.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
