import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { groupLearningSessions, validateLearningSession } from './learningSessions.ts';
import type { LearningActivity } from './learning.ts';

test('Session values accept optional integer numbers only', () => {
  assert.equal(validateLearningSession(null), null);
  assert.equal(validateLearningSession(undefined), null);
  for (const value of [1, 2, 50]) assert.equal(validateLearningSession(value), value);
  for (const value of [0, 51, -1, 1.5, '2', '', false, {}, NaN])
    assert.throws(() => validateLearningSession(value), /Choose a session/);
});

test('Grouping sorts sessions numerically, preserves activity order, and handles unassigned work', () => {
  const base: LearningActivity = { id: 'a', cohort_id: 'c', title: 'Reading', summary: null, type: 'content', config: { body: 'Read' }, position: 0, released: true };
  const input = [
    { ...base, id: 'ten', session_number: 10 },
    { ...base, id: 'two-late', session_number: 2, position: 2 },
    { ...base, id: 'legacy' },
    { ...base, id: 'two-first', session_number: 2, position: 1 },
    { ...base, id: 'one', session_number: 1 },
  ];
  const original = JSON.stringify(input);
  const groups = groupLearningSessions(input);
  assert.deepEqual(groups.map(g => g.label), ['Session 1', 'Session 2', 'Session 10', 'Unassigned activities']);
  assert.deepEqual(groups[1].activities.map(a => a.id), ['two-first', 'two-late']);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(groupLearningSessions([]), []);
  assert.equal(groupLearningSessions([base])[0].session, null);
});

test('Session migration permits regrouping answered activities without changing answers or unlocking questions', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table organisations(id uuid primary key); create table employees(id uuid primary key);');
    for (const file of ['20261001_000001_learning_area.sql', '20261030_000002_learning_sessions.sql'])
      await db.exec(readFileSync(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'));
    const org = randomUUID(), cohort = randomUUID(), activity = randomUUID();
    await db.query('insert into organisations values($1)', [org]);
    await db.query("insert into learning_cohorts(id,org_id,name,client_name) values($1,$2,'Programme','Client')", [cohort, org]);
    await db.query("insert into learning_activities(id,cohort_id,type,title,config,released) values($1,$2,'form','Reflection','{}',true)", [activity, cohort]);
    await db.query("insert into learning_trainees(cohort_id,display_name,token_hash,token_ciphertext) values($1,'Learner','hash','encrypted')", [cohort]);
    await db.query("select learning_save('hash',$1,'{\"answer\":\"Keep my answer\"}',false)", [activity]);
    await db.query('update learning_activities set session_number=2 where id=$1', [activity]);
    const { rows } = await db.query<{ session_number: number; released: boolean; payload: {answer: string} }>('select a.session_number,a.released,s.payload from learning_activities a join learning_submissions s on s.activity_id=a.id where a.id=$1', [activity]);
    assert.equal(rows[0].session_number, 2);
    assert.equal(rows[0].released, true);
    assert.equal(rows[0].payload.answer, 'Keep my answer');
    await assert.rejects(db.query("update learning_activities set config='{\"changed\":true}' where id=$1", [activity]), /cannot be changed/);
    await assert.rejects(db.query('update learning_activities set session_number=0 where id=$1', [activity]), /check constraint/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('update learning_activities set session_number=1 where id=$1', [activity]), /permission denied/);
  } finally { await db.close(); }
});
