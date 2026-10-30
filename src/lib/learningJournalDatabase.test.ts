import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('Journal entries preserve history, isolate trainees, reject closed access and preserve legacy forms', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table organisations(id uuid primary key); create table employees(id uuid primary key);');
    for (const name of ['20261001_000001_learning_area.sql', '20261002_000001_learning_live_roleplay.sql', '20261030_000001_learning_repeatable_entries.sql'])
      await db.exec(readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    const org = randomUUID(), cohort = randomUUID(), other = randomUUID(), form = randomUUID(), journal = randomUUID(), e1 = randomUUID(), e2 = randomUUID();
    await db.query('insert into organisations values($1)', [org]);
    await db.query("insert into learning_cohorts(id,org_id,name,client_name) values($1,$3,'Programme','Client'),($2,$3,'Other programme','Other client')", [cohort, other, org]);
    await db.query("insert into learning_activities(id,cohort_id,type,title,config,released) values($1,$3,'form','Log','{\"repeatable\":true}',true),($2,$3,'form','Reflection','{}',true)", [journal, form, cohort]);
    await db.query("insert into learning_trainees(cohort_id,display_name,token_hash,token_ciphertext) values($1,'Alice','alice','encrypted'),($1,'Bob','bob','encrypted'),($2,'Outsider','outside','encrypted')", [cohort, other]);
    const save = (hash: string, entry: string, payload: string, draft = false) => db.query('select learning_save_entry($1,$2,$3,$4,$5) as saved', [hash, journal, payload, draft, entry]);
    await save('alice', e1, '{"q1":"Draft"}', true);
    await save('alice', e1, '{"q1":"First incident"}');
    await save('alice', e1, '{"q1":"Should not overwrite"}');
    await save('alice', e2, '{"q1":"Second incident"}');
    const { rows } = await db.query<{payload: {q1: string}}>('select payload from learning_submissions order by payload->>\'q1\'');
    assert.deepEqual(rows.map(r => r.payload.q1), ['First incident', 'Second incident']);
    await save('bob', e1, '{"q1":"Bob has his own entry"}');
    assert.equal((await db.query('select * from learning_submissions')).rows.length, 3);
    await assert.rejects(save('outside', e1, '{}'), /not open/);
    await assert.rejects(save('invalid', e1, '{}'), /no longer active/);
    await assert.rejects(db.query("select learning_save('alice',$1,'{}',false)", [journal]), /valid entry/);
    await db.query("select learning_save('alice',$1,'{\"v\":1}',true)", [form]);
    await db.query("select learning_save('alice',$1,'{\"v\":2}',false)", [form]);
    assert.equal((await db.query('select * from learning_submissions where activity_id=$1', [form])).rows.length, 1);
    await db.query('update learning_activities set released=false where id=$1', [journal]);
    await assert.rejects(save('alice', randomUUID(), '{}'), /not open/);
    await db.query('update learning_activities set released=true where id=$1', [journal]);
    await db.query("update learning_cohorts set status='archived' where id=$1", [cohort]);
    await assert.rejects(save('alice', randomUUID(), '{}'), /not open/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from learning_submissions'), /permission denied/);
    await assert.rejects(save('alice', randomUUID(), '{}'), /permission denied/);
  } finally { await db.close(); }
});
