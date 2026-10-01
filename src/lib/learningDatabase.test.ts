import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("learning migration enforces trainee isolation, RLS, role turns, expiry and atomic saves", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create table organisations(id uuid primary key); create table employees(id uuid primary key);",
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261001_000001_learning_area.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const org1 = randomUUID(),
      org2 = randomUUID(),
      c1 = randomUUID(),
      c2 = randomUUID();
    const a1 = randomUUID(),
      a2 = randomUUID(),
      role = randomUUID();
    const t1 = randomUUID(),
      t2 = randomUUID(),
      outsider = randomUUID(),
      observer = randomUUID();
    await db.query("insert into organisations(id) values($1),($2)", [
      org1,
      org2,
    ]);
    await db.query(
      "insert into learning_cohorts(id,org_id,name,client_name) values($1,$2,'SD programme','Bracken'),($3,$4,'Other tenant','Other client')",
      [c1, org1, c2, org2],
    );
    await db.query(
      "insert into learning_activities(id,cohort_id,type,title,config,released) values($1,$2,'form','IDP','{}',true),($3,$4,'form','Other IDP','{}',true),($5,$2,'roleplay','Practice',$6,true)",
      [
        a1,
        c1,
        a2,
        c2,
        role,
        JSON.stringify({
          scenario: "Practise",
          roles: ["Manager", "Team member"],
          rounds: 1,
        }),
      ],
    );
    for (const [id, cohort, hash] of [
      [t1, c1, "first"],
      [t2, c1, "second"],
      [outsider, c2, "outsider"],
      [observer, c1, "observer"],
    ])
      await db.query(
        "insert into learning_trainees(id,cohort_id,display_name,token_hash,token_ciphertext) values($1,$2,$3,$3,'encrypted')",
        [id, cohort, hash],
      );
    await db.query(
      "select learning_save('first',$1,'{\"goal\":\"Listen\"}',true)",
      [a1],
    );
    await db.query(
      "select learning_save('first',$1,'{\"goal\":\"Coach\"}',false)",
      [a1],
    );
    const saved = await db.query<{
      trainee_id: string;
      status: string;
      payload: { goal: string };
    }>("select * from learning_submissions");
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0].trainee_id, t1);
    assert.equal(saved.rows[0].payload.goal, "Coach");
    assert.equal(saved.rows[0].status, "submitted");
    await assert.rejects(
      db.query("select learning_save('first',$1,'{}',false)", [a2]),
      /not open/,
    );
    await assert.rejects(
      db.query(
        "insert into learning_submissions(cohort_id,trainee_id,activity_id,status) values($1,$2,$3,'submitted')",
        [c1, t1, a2],
      ),
      /foreign key/,
    );
    for (const who of ["anon", "authenticated"]) {
      await db.exec(`set role ${who}`);
      for (const table of [
        "learning_cohorts",
        "learning_trainees",
        "learning_activities",
        "learning_submissions",
        "learning_rooms",
        "learning_room_members",
        "learning_messages",
      ])
        await assert.rejects(
          db.query(`select * from ${table}`),
          /permission denied/,
        );
      await assert.rejects(
        db.query("select learning_save('first',$1,'{}',false)", [a1]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    const members = JSON.stringify([
      { traineeId: t1, seat: 0 },
      { traineeId: t2, seat: 1 },
      { traineeId: observer, seat: -1 },
    ]);
    const created = await db.query<{ id: string }>(
      "select learning_create_room($1,$2,'Group one',$3) as id",
      [c1, role, members],
    );
    const room = created.rows[0].id;
    await assert.rejects(
      db.query("select learning_speak('outsider',$1,'Intrusion',$2)", [
        room,
        randomUUID(),
      ]),
      /not available/,
    );
    await assert.rejects(
      db.query("select learning_speak('second',$1,'Too early',$2)", [
        room,
        randomUUID(),
      ]),
      /turn/,
    );
    const nonce = randomUUID();
    await db.query("select learning_speak('first',$1,'What happened?',$2)", [
      room,
      nonce,
    ]);
    await db.query(
      "select learning_speak('first',$1,'Retry same request',$2)",
      [room, nonce],
    );
    assert.equal(
      (await db.query("select * from learning_messages")).rows.length,
      1,
    );
    await db.query(
      "select learning_speak('second',$1,'Here is my perspective',$2)",
      [room, randomUUID()],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from learning_rooms where id=$1",
          [room],
        )
      ).rows[0].status,
      "completed",
    );
    await db.query(
      "select learning_speak('observer',$1,'Clear listening and a useful next step.',$2)",
      [room, randomUUID()],
    );
    await assert.rejects(
      db.query("select learning_speak('first',$1,'After closing',$2)", [
        room,
        randomUUID(),
      ]),
      /finished/,
    );
    await assert.rejects(
      db.query("update learning_activities set config='{}' where id=$1", [
        role,
      ]),
      /cannot be changed/,
    );
    await db.query(
      "update learning_activities set released=false where id=$1",
      [a1],
    );
    await assert.rejects(
      db.query("select learning_save('first',$1,'{}',false)", [a1]),
      /not open/,
    );
    await db.query("update learning_activities set released=true where id=$1", [
      a1,
    ]);
    await db.query(
      "update learning_trainees set expires_at=now()-interval '1 day' where id=$1",
      [t1],
    );
    await assert.rejects(
      db.query("select learning_save('first',$1,'{}',false)", [a1]),
      /no longer active/,
    );
    await db.query(
      "update learning_trainees set expires_at=now()+interval '1 day',revoked_at=now() where id=$1",
      [t1],
    );
    await assert.rejects(
      db.query("select learning_save('first',$1,'{}',false)", [a1]),
      /no longer active/,
    );
    await db.query(
      "update learning_cohorts set status='archived' where id=$1",
      [c1],
    );
    await assert.rejects(
      db.query("select learning_save('second',$1,'{}',false)", [a1]),
      /not open/,
    );
    await db.query("select learning_reorder($1,$2)", [c1, [role, a1]]);
    await assert.rejects(
      db.query("select learning_reorder($1,$2)", [c1, [role, a2]]),
      /changed/,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select learning_rate_limit('digest',1) as ok",
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select learning_rate_limit('digest',1) as ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});
