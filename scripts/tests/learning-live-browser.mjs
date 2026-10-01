// A live role-play and its material files, in a real browser against stubbed
// APIs: the trainee acts it out away from Pulse and writes their own account,
// the observer writes a different one, and the facilitator reads them side by
// side without either person having seen the other's.
//
//   npx next dev -p 3100
//   PULSE_TEST_BROWSER="C:/Program Files/Google/Chrome/Application/chrome.exe" \
//     node scripts/tests/learning-live-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = process.env.PULSE_TEST_URL || "http://localhost:3100";
const browser = await chromium.launch({
  executablePath: process.env.PULSE_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const ACTIVITY = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const [MANAGER, REPORT, OBSERVER] = ["t-manager", "t-report", "t-observer"];

const participantFields = [
  { key: "heard", label: "Did you feel heard and understood?", type: "scale", lowLabel: "Not at all", highLabel: "Completely", required: true },
  { key: "differently", label: "What would you do differently next time?", type: "textarea", required: true },
];
const observerFields = [
  { key: "listened", label: "Did each person listen without interrupting?", type: "scale", lowLabel: "Rarely", highLabel: "Throughout", required: true },
  { key: "behaviour", label: "What observable behaviour did you see?", type: "textarea", required: true },
];

const activity = {
  id: ACTIVITY,
  cohort_id: "c1",
  title: "Difficult conversation practice",
  summary: "Act it out, then write your own account.",
  type: "roleplay",
  position: 1,
  released: true,
  config: {
    mode: "live",
    scenario: "A team member has missed three deadlines this month.",
    roles: ["Manager", "Team member"],
    participantFields,
    observerFields,
  },
};

const members = [
  { trainee_id: MANAGER, role_name: "Manager", seat: 0, name: "Ada Okafor" },
  { trainee_id: REPORT, role_name: "Team member", seat: 1, name: "Bode Udo" },
  { trainee_id: OBSERVER, role_name: "Observer", seat: -1, name: "Chi Eze" },
];

const files = [{ id: FILE, activity_id: ACTIVITY, name: "Scenario brief.pdf", mime: "application/pdf", size_bytes: 180_000 }];
const submissions = [];
const posts = [];

function dashboard(traineeId, name) {
  return {
    trainee: { id: traineeId, name },
    cohort: { name: "Manager Development Programme", clientName: "Bracken Media Solutions" },
    activities: [activity],
    submissions: submissions.filter((s) => s.trainee_id === traineeId).map((s) => ({ activity_id: s.activity_id, payload: s.payload, status: s.status, updated_at: "2026-10-02T09:00:00Z" })),
    rooms: [{ id: "room-1", activity_id: ACTIVITY, name: "Pair one", status: "active", turn_number: 0, members, messages: [] }],
    files,
  };
}

const context = await browser.newContext({ viewport: { width: 420, height: 920 }, reducedMotion: "reduce" });
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (!url.origin.startsWith(root)) return route.abort();
  const body = request.postData() ? JSON.parse(request.postData()) : null;
  if (body) posts.push({ path: url.pathname, body });

  const token = url.pathname.startsWith("/api/public/learning/") ? url.pathname.split("/").pop() : null;
  if (token) {
    const who = token === "manager-link" ? [MANAGER, "Ada Okafor"] : token === "observer-link" ? [OBSERVER, "Chi Eze"] : null;
    if (!who) return json({ error: "This link is not valid." }, 404);
    if (request.method() === "GET") return json(dashboard(who[0], who[1]));
    if (body?.action === "file") return json({ url: `${root}/stub-file.pdf`, name: "Scenario brief.pdf", mime: "application/pdf" });
    submissions.push({ trainee_id: who[0], activity_id: body.activityId, payload: body.payload, status: body.draft ? "draft" : "submitted" });
    return json({ saved: true, message: "Your work is saved.", email: "not_requested" });
  }

  if (url.pathname === "/api/learning/cohorts/c1" && request.method() === "GET") {
    return json({
      cohort: { id: "c1", name: "Manager Development Programme", client_name: "Bracken Media Solutions", status: "active" },
      trainees: members.map((m) => ({ id: m.trainee_id, display_name: m.name, email: null, token: "x".repeat(64), expires_at: "2027-01-01T00:00:00Z", revoked_at: null, last_seen_at: null })),
      activities: [activity],
      submissions: submissions.map((s) => ({ ...s, updated_at: "2026-10-02T09:00:00Z" })),
      rooms: [{ id: "room-1", activity_id: ACTIVITY, name: "Pair one", status: "active" }],
      members: members.map((m) => ({ room_id: "room-1", activity_id: ACTIVITY, trainee_id: m.trainee_id, role_name: m.role_name, seat: m.seat })),
      messages: [],
      files,
    });
  }
  if (url.pathname.startsWith("/api/")) return json({});
  if (url.pathname === "/stub-file.pdf") return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 stub" });
  return route.continue();
});

const errors = [];
try {
  // ── the person who took a role ──────────────────────────────────────────────
  console.log("Checking the trainee who played the Manager");
  const trainee = await context.newPage();
  trainee.on("pageerror", (e) => errors.push(e.message));
  await trainee.goto(`${root}/t/manager-link/a/${ACTIVITY}`, { timeout: 120_000 });
  await trainee.getByText("A team member has missed three deadlines this month.").waitFor({ timeout: 120_000 });
  await trainee.getByText("You are Manager.").waitFor();
  await trainee.getByText(/Have the conversation together/).waitFor();
  await trainee.getByText("Bode Udo — Team member").waitFor();
  await trainee.getByText(/The other people in your group do not see them/).waitFor();

  // The material file opens through a link asked for at that moment.
  await trainee.getByRole("button", { name: "Scenario brief.pdf" }).click();
  await trainee.waitForTimeout(300);
  assert.ok(posts.some((p) => p.body?.action === "file" && p.body.fileId === FILE), "the file link is requested from the server, not held in the page");

  // They answer the participant questions, not the observer's.
  const page = await trainee.locator("body").innerText();
  assert.ok(page.includes("Did you feel heard and understood?"), "participants are asked what they experienced");
  assert.equal(page.includes("What observable behaviour did you see?"), false, "and never the observer's questions");

  await trainee.getByRole("radio", { name: "4", exact: true }).first().check();
  await trainee.getByLabel("What would you do differently next time?").fill("Open with the facts, not the judgement.");
  await trainee.getByRole("button", { name: "Submit" }).click();
  await trainee.waitForTimeout(500);
  const sent = posts.filter((p) => p.body?.activityId === ACTIVITY).pop();
  assert.equal(sent.body.payload.differently, "Open with the facts, not the judgement.");
  assert.equal(sent.body.payload.heard, 4);

  // ── the observer gets different questions ───────────────────────────────────
  console.log("Checking the observer");
  const watcher = await context.newPage();
  watcher.on("pageerror", (e) => errors.push(e.message));
  await watcher.goto(`${root}/t/observer-link/a/${ACTIVITY}`, { timeout: 120_000 });
  await watcher.getByText("You are Observer, watching the conversation.").waitFor({ timeout: 120_000 });
  await watcher.getByText(/Watch the conversation/).waitFor();
  const observerPage = await watcher.locator("body").innerText();
  assert.ok(observerPage.includes("What observable behaviour did you see?"), "the observer is asked what they saw");
  assert.equal(observerPage.includes("Did you feel heard and understood?"), false, "and not what a participant felt");
  assert.equal(observerPage.includes("Open with the facts"), false, "nobody sees anybody else's answers");

  await watcher.getByRole("radio", { name: "2", exact: true }).first().check();
  await watcher.getByLabel("What observable behaviour did you see?").fill("Two interruptions in the first minute.");
  await watcher.getByRole("button", { name: "Submit" }).click();
  await watcher.waitForTimeout(500);

  // ── the facilitator reads them together ────────────────────────────────────
  console.log("Checking the facilitator's comparison");
  const hr = await context.newPage();
  hr.on("pageerror", (e) => errors.push(e.message));
  await hr.setViewportSize({ width: 1440, height: 1000 });
  await hr.goto(`${root}/cohorts/c1`, { timeout: 120_000 });
  await hr.getByRole("button", { name: "Responses", exact: true }).click({ timeout: 120_000 });
  await hr.getByText("Pair one").waitFor();
  await hr.getByText("2 of 3 have written their feedback.", { exact: false }).waitFor();

  // Both accounts of the same conversation, next to each other.
  const comparison = await hr.locator("body").innerText();
  assert.ok(comparison.includes("Open with the facts, not the judgement."), "the manager's own account");
  assert.ok(comparison.includes("Two interruptions in the first minute."), "and the observer's");
  assert.ok(comparison.includes("Each person answered without seeing the others."), "said plainly, because it is what makes the comparison worth reading");
  // The observer is asked different questions, and the report shows each person's own.
  assert.ok(comparison.includes("What observable behaviour did you see?"));
  assert.ok(comparison.includes("Did you feel heard and understood?"));

  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS: a live role-play shows each person their role, their group and instructions to act it out; participants and the observer answer different questions and never see each other's; material files open through a link requested at the moment of clicking; submissions carry the right answers; the facilitator reads both accounts of the same conversation side by side, with the count of who has written theirs.");
} finally {
  await browser.close();
}
