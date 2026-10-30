import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLearningConfig, validateLearningAnswers } from './learning.ts';

const activities = JSON.parse(readFileSync(new URL('../../scripts/learning/bracken-session2.json', import.meta.url), 'utf8'));
test('Session 2 contains eight valid activities with the approved release plan', () => {
  assert.equal(activities.length, 8);
  assert.equal(new Set(activities.map((a: { title: string }) => a.title)).size, 8);
  assert.deepEqual(activities.map((a: { released: boolean }) => a.released), [true, true, false, false, false, false, false, false]);
  for (const a of activities) assert.doesNotThrow(() => validateLearningConfig(a.type, a.config));
  assert.deepEqual(activities.filter((a: { type: string }) => a.type === 'form').map((a: { config: { fields: unknown[] } }) => a.config.fields.length), [6, 6, 3, 5, 4]);
});
test('Clash log is repeatable, required answers enforced, and privacy is accurate', () => {
  const c = validateLearningConfig('form', activities[1].config);
  assert.equal(c.repeatable, true);
  assert.throws(() => validateLearningAnswers(c, {}, false), /Please answer/);
  assert.deepEqual(validateLearningAnswers(c, {}, true), {});
  assert.match(c.intro!, /administrators/);
  assert.match(c.confirmText!, /unattributed summary/);
  assert.doesNotMatch(activities[3].config.confirmText, /Only you and the facilitator/);
  assert.match(activities[3].config.intro, /not other trainees/);
  assert.throws(() => validateLearningConfig('form', { ...c, repeatable: 'true' }), /Repeatable/);
  assert.throws(() => validateLearningConfig('form', { ...c, rows: 3 }), /development plan/);
});
