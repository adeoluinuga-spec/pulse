/** Preview by default. Use --apply to add only missing activities to the verified SD programme.
 * node --experimental-strip-types scripts/learning/setup-bracken-session2.mjs --apply
 * Does not send mail, create trainees, rotate links, or overwrite existing activities.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { validateLearningConfig } from '../../src/lib/learning.ts';

process.loadEnvFile('.env.local');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const cohortId = '1779e1b1-271f-4f98-ab8f-122e0cbc87a1';
const orgId = 'ac0a9bf7-9342-428c-bca1-d846f62da717';
const { data: cohort, error } = await db.from('learning_cohorts')
  .select('id,name,client_name,org_id,status,organisations(name)').eq('id', cohortId).eq('org_id', orgId).single();
if (error || cohort?.name !== 'Manager Development Programme' || cohort.client_name !== 'Bracken Media Solutions'
  || cohort.organisations?.name !== 'Stuart Davidson' || cohort.status !== 'active') throw new Error('Target programme verification failed. No writes.');
const content = JSON.parse(readFileSync(new URL('./bracken-session2.json', import.meta.url), 'utf8'));
for (const a of content) validateLearningConfig(a.type, a.config);
const { data: existing, error: readError } = await db.from('learning_activities')
  .select('id,title,position,released,config').eq('cohort_id', cohortId).order('position');
if (readError) throw new Error('Cannot inspect existing activities. No writes.');
for (const a of content) {
  if (existing.filter(e => e.title === a.title).length > 1) throw new Error(`Duplicate existing activity: ${a.title}. Resolve before proceeding.`);
}
const { error: migrationError } = await db.from('learning_submissions').select('entry_id').limit(0);
const migrationReady = !migrationError;
let position = Math.max(-1, ...existing.map(a => a.position)) + 1;
const missing = content.filter(a => !existing.some(e => e.title === a.title)).map(a => ({
  ...a, cohort_id: cohortId, position: position++, released: a.config.repeatable ? false : a.released,
}));
// Repeatable activity remains hidden until the migration AND new deployment are verified.
console.log(JSON.stringify({ programme: cohort.name, migrationReady, existingActivities: existing.map(a => ({ title: a.title, released: a.released })),
  toAdd: missing.map(a => ({ title: a.title, released: a.released })), apply: process.argv.includes('--apply') }, null, 2));
if (process.argv.includes('--apply') && missing.length) {
  const { error: insertError } = await db.from('learning_activities').insert(missing);
  if (insertError) throw new Error(`Activity insertion failed: ${insertError.code}`);
  console.log(`Added ${missing.length} activities. Existing work and links were not changed.`);
}
