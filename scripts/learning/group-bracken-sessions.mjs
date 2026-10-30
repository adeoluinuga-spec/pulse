/** Preview first; --apply assigns only the approved Session 1/2 activities. Never changes questions, release or links. */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const cohort = '1779e1b1-271f-4f98-ab8f-122e0cbc87a1';
const { data: owner, error: ownerError } = await db.from('learning_cohorts').select('name,client_name,org_id').eq('id', cohort).single();
if (ownerError || owner?.org_id !== 'ac0a9bf7-9342-428c-bca1-d846f62da717' || owner.name !== 'Manager Development Programme' || owner.client_name !== 'Bracken Media Solutions') throw Error('Target verification failed');
const second = JSON.parse(readFileSync(new URL('./bracken-session2.json', import.meta.url), 'utf8')).map(a => a.title);
const first = ['The difficult conversation', 'Practice scenarios', 'My commitment', 'Role-play reflection', 'Individual Development Plan', 'Difficult conversation practice', 'The Four Review Parameters', 'The 2026 Board', 'One thing I would change in 2027', 'Clarity, Effort & Result', 'Practice Rounds'];
const { data: before, error } = await db.from('learning_activities').select('id,title,type,config,released,position,session_number').eq('cohort_id', cohort).order('id');
if (error) throw Error('Cannot read session column. Apply the learning sessions migration first.');
const expected = new Map([...first.map(title => [title, 1]), ...second.map(title => [title, 2])]);
for (const [title, session] of expected) {
  const matches = before.filter(a => a.title === title);
  if (matches.length !== 1) throw Error(`Expected exactly one activity: ${title}`);
  if (matches[0].session_number !== null && matches[0].session_number !== session) throw Error(`Activity already assigned elsewhere: ${title}`);
}
console.log(JSON.stringify(before.map(a => ({ title: a.title, session: expected.get(a.title) ?? a.session_number, released: a.released })), null, 2));
if (process.argv.includes('--apply')) {
  for (const session of [1, 2]) {
    const ids = before.filter(a => expected.get(a.title) === session && a.session_number === null).map(a => a.id);
    if (!ids.length) continue;
    const { error: writeError } = await db.from('learning_activities').update({ session_number: session }).eq('cohort_id', cohort).in('id', ids).is('session_number', null);
    if (writeError) throw Error(`Session ${session} assignment failed`);
  }
  const { data: after, error: verifyError } = await db.from('learning_activities').select('id,title,type,config,released,position,session_number').eq('cohort_id', cohort).order('id');
  if (verifyError || JSON.stringify(before.map(a => ({ ...a, session_number: null }))) !== JSON.stringify(after.map(a => ({ ...a, session_number: null })))) throw Error('Activity verification failed; inspect before continuing.');
  for (const a of after) if (expected.has(a.title) && a.session_number !== expected.get(a.title)) throw Error('Session verification failed');
  console.log('Verified: Session 1 has 11 activities; Session 2 has 8. Questions, release states and positions unchanged.');
}
