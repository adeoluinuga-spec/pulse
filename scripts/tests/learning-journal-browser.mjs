import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = process.env.PULSE_TEST_URL || 'http://localhost:3100';
const token = 'a'.repeat(64);
const content = JSON.parse(readFileSync(new URL('../learning/bracken-session2.json', import.meta.url), 'utf8'));
const activity = { ...content[1], id: 'journal', cohort_id: 'cohort', position: 0 };
const submissions = [];
const browser = await chromium.launch({ executablePath: process.env.PULSE_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== root) return route.abort();
    if (!url.pathname.startsWith('/api/public/learning/')) return route.continue();
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      assert.match(body.entryId, /^[0-9a-f-]{36}$/);
      const existing = submissions.find(s => s.entry_id === body.entryId);
      const entry = { entry_id: body.entryId, activity_id: 'journal', status: body.draft ? 'draft' : 'submitted', payload: body.payload, updated_at: new Date().toISOString() };
      if (existing) Object.assign(existing, entry); else submissions.push(entry);
      return route.fulfill({ json: { message: body.draft ? 'Draft saved.' : 'Entry saved.', email: 'not_requested' } });
    }
    return route.fulfill({ json: { trainee: { id: 'one', name: 'Test learner' }, cohort: { name: 'Test programme', clientName: 'Bracken' }, activities: [activity], submissions, rooms: [] } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${root}/t/${token}/a/journal`);
  await page.getByRole('button', { name: 'Add a clash', exact: true }).click();
  await page.getByLabel('What was raised? The situation, in facts.').fill('First incident: shared project deadline.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('heading', { name: 'Your entries (1)' }).waitFor();
  await page.reload();
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Continue draft' }).click();
  assert.equal(await page.getByLabel('What was raised? The situation, in facts.').inputValue(), 'First incident: shared project deadline.');
  await page.getByLabel('A project lead', { exact: true }).check();
  await page.getByLabel('Same day', { exact: true }).check();
  await page.getByLabel('The rule settled it', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Add a clash', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add a clash', exact: true }).click();
  await page.getByLabel('What was raised? The situation, in facts.').fill('Second incident: urgent task.');
  await page.getByLabel('An executive', { exact: true }).check();
  await page.getByLabel('Still open', { exact: true }).check();
  await page.getByLabel('I worked around the rule', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('heading', { name: 'Your entries (2)' }).waitFor();
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].payload.q1, 'First incident: shared project deadline.');
  assert.notEqual(submissions[0].entry_id, submissions[1].entry_id);
  assert.equal(await page.getByRole('button', { name: 'Continue draft' }).count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(`${root}/t/${token}`);
  await page.getByText('1 of 1 complete').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: 360px journal, draft resume, two separate entries, submitted history, progress and privacy. APIs mocked; no emails sent.');
} finally { await browser.close(); }
