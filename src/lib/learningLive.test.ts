import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

import { liveObserverFields, liveParticipantFields, liveRoleplayFields, validateLearningConfig } from "./learning.ts";

test("a live role-play keeps its scenario and both feedback forms, and needs no turn count", () => {
  const config = validateLearningConfig("roleplay", {
    scenario: "A team member has missed three deadlines.",
    roles: ["Manager", "Team member"],
    mode: "live",
  });
  assert.equal(config.mode, "live");
  assert.equal(config.rounds, undefined, "a conversation held in the room has no turns to count");
  assert.deepEqual(config.participantFields, liveParticipantFields);
  assert.deepEqual(config.observerFields, liveObserverFields);

  // The written mode is untouched and still requires rounds.
  assert.throws(() => validateLearningConfig("roleplay", { scenario: "x".repeat(20), roles: ["A", "B"], mode: "written" }), /rounds/);
  const written = validateLearningConfig("roleplay", { scenario: "x".repeat(20), roles: ["A", "B"], rounds: 4 });
  assert.equal(written.mode, "written", "an activity written before live mode existed stays written");
});

test("the facilitator can replace either set of questions, and bad ones are refused", () => {
  const config = validateLearningConfig("roleplay", {
    scenario: "A difficult conversation about late work.",
    roles: ["Manager", "Team member"],
    mode: "live",
    participantFields: [{ key: "felt", label: "How did it feel?", type: "textarea", required: true }],
    observerFields: [{ key: "saw", label: "What did you see?", type: "textarea" }],
  });
  assert.equal(config.participantFields?.length, 1);
  assert.equal(config.observerFields?.[0].key, "saw");
  assert.throws(() => validateLearningConfig("roleplay", { scenario: "A scenario here.", roles: ["A", "B"], mode: "live", participantFields: [] }), /1 to 20 questions/);
  assert.throws(
    () => validateLearningConfig("roleplay", { scenario: "A scenario here.", roles: ["A", "B"], mode: "live", observerFields: [{ key: "Bad Key", label: "x", type: "textarea" }] }),
    /unique key/,
  );
});

test("who answers what: a role-holder gets the participant questions, the observer gets the observation ones", () => {
  const config = validateLearningConfig("roleplay", { scenario: "A scenario here.", roles: ["Manager", "Team member"], mode: "live" });
  assert.equal(liveRoleplayFields(config, 0)[0].key, liveParticipantFields[0].key);
  assert.equal(liveRoleplayFields(config, 1)[0].key, liveParticipantFields[0].key);
  assert.equal(liveRoleplayFields(config, -1)[0].key, liveObserverFields[0].key, "seat -1 is the observer");
});

test("reading material accepts a video link, with or without text, but not a dubious one", () => {
  const both = validateLearningConfig("content", { body: "Watch before the session.", link: "https://example.com/video", linkLabel: "The recording" });
  assert.equal(both.link, "https://example.com/video");
  assert.equal(validateLearningConfig("content", { link: "https://example.com/deck.pdf" }).body, undefined, "a link alone is enough");
  assert.throws(() => validateLearningConfig("content", { body: "", link: "javascript:alert(1)" }), /full https address/);
  assert.throws(() => validateLearningConfig("content", { body: "", link: "http://example.com" }), /full https address/, "plain http is refused");
  assert.throws(() => validateLearningConfig("content", {}), /text, a link, or both/);
});

test("the database lets a live role-play's group write feedback, and nobody else", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table organisations(id uuid primary key); create table employees(id uuid primary key);");
    for (const file of ["20261001_000001_learning_area.sql", "20261002_000001_learning_live_roleplay.sql"]) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }

    const org = randomUUID();
    const cohort = randomUUID();
    const live = randomUUID();
    const written = randomUUID();
    const [player, observer, outsider] = [randomUUID(), randomUUID(), randomUUID()];
    await db.query("insert into organisations(id) values($1)", [org]);
    await db.query("insert into learning_cohorts(id,org_id,name,client_name) values($1,$2,'Programme','Client')", [cohort, org]);
    await db.query(
      "insert into learning_activities(id,cohort_id,type,title,config,released) values($1,$2,'roleplay','Live practice',$3,true),($4,$2,'roleplay','Written practice',$5,true)",
      [
        live,
        cohort,
        JSON.stringify({ scenario: "Act it out", roles: ["Manager", "Team member"], mode: "live" }),
        written,
        JSON.stringify({ scenario: "Type it out", roles: ["Manager", "Team member"], rounds: 2, mode: "written" }),
      ],
    );
    for (const [id, hash] of [[player, "player"], [observer, "observer"], [outsider, "outsider"]]) {
      await db.query("insert into learning_trainees(id,cohort_id,display_name,token_hash,token_ciphertext) values($1,$2,$3,$3,'x')", [id, cohort, hash]);
    }
    await db.query("select learning_create_room($1,$2,'Pair one',$3)", [
      cohort,
      live,
      JSON.stringify([{ traineeId: player, seat: 0 }, { traineeId: outsider, seat: 1 }, { traineeId: observer, seat: -1 }]),
    ]);

    await db.query("select learning_save('player',$1,'{\"felt\":\"Tense but fair\"}',false)", [live]);
    await db.query("select learning_save('observer',$1,'{\"saw\":\"Two interruptions\"}',false)", [live]);
    const saved = await db.query<{ trainee_id: string }>("select trainee_id from learning_submissions where activity_id=$1", [live]);
    assert.equal(saved.rows.length, 2, "the role-holder and the observer each write their own account");

    // Somebody in the programme but not in this group cannot file feedback on it.
    const stranger = randomUUID();
    await db.query("insert into learning_trainees(id,cohort_id,display_name,token_hash,token_ciphertext) values($1,$2,'Stranger','stranger','x')", [stranger, cohort]);
    await assert.rejects(db.query("select learning_save('stranger',$1,'{}',false)", [live]), /not in a group/);

    // A written role-play is still answered by taking turns, not by saving a form.
    await assert.rejects(db.query("select learning_save('player',$1,'{}',false)", [written]), /not open/);

    // And the ordinary protections still hold.
    await db.query("update learning_trainees set revoked_at=now() where id=$1", [player]);
    await assert.rejects(db.query("select learning_save('player',$1,'{}',false)", [live]), /no longer active/);
    for (const who of ["anon", "authenticated"]) {
      await db.exec(`set role ${who}`);
      await assert.rejects(db.query("select * from learning_files"), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
