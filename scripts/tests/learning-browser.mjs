import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.env.PULSE_TEST_URL || "http://localhost:3100";
const artifacts = join(tmpdir(), "pulse-learning-browser");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PULSE_TEST_BROWSER ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const tokens = ["a".repeat(64), "b".repeat(64)];
const trainees = tokens.map((token, i) => ({
  id: `t${i + 1}`,
  display_name: ["Ada Okafor", "Bola Adeyemi"][i],
  email: `trainee${i + 1}@example.com`,
  token,
  expires_at: "2027-01-01T00:00:00Z",
  last_seen_at: null,
}));
const activities = [
  {
    id: "reading",
    cohort_id: "c1",
    title: "The difficult conversation",
    type: "content",
    released: true,
    position: 0,
    summary: "Four steps.",
    config: {
      body: "## Four steps\n\n| Step | Action |\n| --- | --- |\n| Listen | Ask for their perspective |\n\n<script>alert('unsafe')</script>",
    },
  },
  {
    id: "commit",
    cohort_id: "c1",
    title: "My commitment",
    type: "form",
    released: true,
    position: 1,
    summary: "Your commitment.",
    config: {
      fields: [
        {
          key: "commitment",
          label: "My commitment",
          type: "textarea",
          required: true,
        },
      ],
    },
  },
  {
    id: "role",
    cohort_id: "c1",
    title: "Role-play practice",
    type: "roleplay",
    released: true,
    position: 2,
    summary: "Practise together.",
    config: {
      scenario:
        "A report was delivered late. Discuss what happened and agree a next step.",
      roles: ["Manager", "Team member"],
      rounds: 1,
    },
  },
  {
    id: "idp",
    cohort_id: "c1",
    title: "Individual Development Plan",
    type: "form",
    released: true,
    position: 3,
    config: {
      rows: 2,
      fields: [{ key: "goal", label: "Development goal", type: "text" }],
      singleFields: [
        { key: "support", label: "Support needed", type: "textarea" },
      ],
    },
  },
];
const submissions = [];
const room = {
  id: "room1",
  activity_id: "role",
  name: "Practice group 1",
  status: "active",
  turn_number: 0,
  members: trainees.map((t, i) => ({
    trainee_id: t.id,
    name: t.display_name,
    role_name: ["Manager", "Team member"][i],
    seat: i,
  })),
  messages: [],
};
const cohort = {
  id: "c1",
  name: "Manager Development Programme",
  client_name: "Bracken Media Solutions",
  status: "active",
};
const posts = [];
const errors = [];
async function context(width = 360) {
  const ctx = await browser.newContext({
    viewport: { width, height: 860 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  await ctx.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const respond = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.origin !== root) return route.abort();
    if (url.pathname.startsWith("/api/public/learning/")) {
      const token = url.pathname.split("/").at(-1),
        person = trainees.find((t) => t.token === token);
      if (!person)
        return respond(
          {
            error:
              "This link is not valid. Please ask your facilitator for a new one.",
          },
          404,
        );
      if (req.method() === "POST") {
        const b = JSON.parse(req.postData());
        posts.push(b);
        if (b.action === "speak") {
          if (room.members[room.turn_number % 2].trainee_id !== person.id)
            return respond({ error: "Wait for your turn." }, 409);
          room.messages.push({
            id: crypto.randomUUID(),
            trainee_id: person.id,
            body: b.message,
            created_at: new Date().toISOString(),
          });
          room.turn_number++;
          if (room.turn_number === 2) room.status = "completed";
          return respond({ saved: true });
        }
        const existing = submissions.findIndex(
          (s) => s.activity_id === b.activityId && s.trainee_id === person.id,
        );
        const saved = {
          activity_id: b.activityId,
          trainee_id: person.id,
          payload: b.payload ?? {},
          status: b.draft ? "draft" : "submitted",
          updated_at: new Date().toISOString(),
        };
        if (existing >= 0) submissions[existing] = saved;
        else submissions.push(saved);
        return respond({
          saved: true,
          message: b.draft ? "Draft saved." : "Your work is saved.",
          email: "not_requested",
        });
      }
      return respond({
        trainee: { id: person.id, name: person.display_name },
        cohort: { name: cohort.name, clientName: cohort.client_name },
        activities,
        submissions: submissions.filter((s) => s.trainee_id === person.id),
        rooms: [room],
      });
    }
    if (url.pathname === "/api/learning/cohorts")
      return respond(
        req.method() === "POST"
          ? { id: "c1" }
          : {
              cohorts: [
                {
                  ...cohort,
                  learning_trainees: [{ count: 2 }],
                  learning_activities: [{ count: 4 }],
                },
              ],
            },
      );
    if (url.pathname === "/api/learning/cohorts/c1") {
      if (req.method() === "POST") {
        const b = JSON.parse(req.postData());
        posts.push(b);
        if (b.action === "activity")
          activities.push({
            ...b,
            id: crypto.randomUUID(),
            cohort_id: "c1",
            position: 20,
            released: false,
          });
        return respond({ saved: true });
      }
      return respond({
        cohort,
        trainees,
        activities,
        submissions,
        rooms: [room],
        members: room.members.map((m) => ({
          ...m,
          room_id: room.id,
          activity_id: room.activity_id,
        })),
        messages: room.messages.map((m) => ({ ...m, room_id: room.id })),
      });
    }
    if (url.pathname.startsWith("/api/")) return respond({});
    return route.continue();
  });
  return ctx;
}
async function fit(page) {
  const excess = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  assert.ok(excess <= 1, `Page overflows by ${excess}px`);
}
try {
  const first = await context(),
    second = await context();
  const page = await first.newPage(),
    other = await second.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${root}/t/${tokens[0]}`, { timeout: 120000 });
  await page.getByRole("heading", { name: "Hello, Ada Okafor" }).waitFor();
  await fit(page);
  await page.screenshot({
    path: join(artifacts, "trainee-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: /The difficult conversation/ }).click();
  await page.getByRole("button", { name: "Mark as read" }).click();
  await page.getByRole("button", { name: "Read", exact: true }).waitFor();
  assert.equal(
    await page.locator("script").filter({ hasText: "alert('unsafe')" }).count(),
    0,
  );
  await page.goto(`${root}/t/${tokens[0]}/a/commit`);
  await page.getByLabel("My commitment").fill("Listen before responding.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.reload();
  await page.getByLabel("My commitment").waitFor();
  assert.equal(
    await page.getByLabel("My commitment").inputValue(),
    "Listen before responding.",
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByText("Your work is saved.", { exact: true }).waitFor();
  await other.goto(`${root}/t/${tokens[1]}/a/commit`, { timeout: 120000 });
  await other.getByLabel("My commitment").waitFor();
  assert.equal(await other.getByLabel("My commitment").inputValue(), "");
  await page.goto(`${root}/t/${tokens[0]}/a/idp`);
  await page.getByLabel("Development goal").nth(0).fill("Coach my team");
  await page.getByLabel("Support needed").fill("Monthly mentor session");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.reload();
  assert.equal(
    await page.getByLabel("Support needed").inputValue(),
    "Monthly mentor session",
  );
  await fit(page);
  await page.goto(`${root}/t/${tokens[0]}/a/role`);
  await other.goto(`${root}/t/${tokens[1]}/a/role`);
  await other.getByRole("button", { name: "Send response" }).waitFor();
  assert.ok(
    await other.getByRole("button", { name: "Send response" }).isDisabled(),
  );
  await page
    .getByLabel("Your response in character")
    .fill("What got in the way of delivering the report?");
  await page.getByRole("button", { name: "Send response" }).click();
  await page
    .getByText("What got in the way of delivering the report?", { exact: true })
    .waitFor();
  await other.reload();
  await other
    .getByLabel("Your response in character")
    .fill("I need to flag missing inputs earlier.");
  await other.getByRole("button", { name: "Send response" }).click();
  await other
    .getByText("Role-play complete. Your discussion is saved.")
    .waitFor();
  await page.reload();
  await page
    .getByText("Role-play complete. Your discussion is saved.")
    .waitFor();
  await fit(page);
  await page.screenshot({
    path: join(artifacts, "roleplay-mobile.png"),
    fullPage: true,
  });
  await page.goto(`${root}/t/invalid`);
  await page.getByText(/This link is not valid/).waitFor();
  assert.ok(!page.url().includes("/auth"));
  const hr = await context(1440),
    admin = await hr.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  const inviteRequests = [];
  await hr.route("**/api/learning/cohorts/c1/invitations", async (route) => {
    const body = route.request().postDataJSON();
    inviteRequests.push(body);
    const failed = body.traineeId === "t2" && inviteRequests.filter((r) => r.traineeId === "t2").length === 1;
    await route.fulfill({ status: failed ? 502 : 200, contentType: "application/json", body: JSON.stringify(failed ? { error: "Provider unavailable. Retry." } : { status: "accepted" }) });
  });
  await admin.goto(`${root}/cohorts/c1`, { timeout: 120000 });
  await admin.getByRole("heading", { name: cohort.name }).waitFor();
  await admin.getByText("Email invitations", { exact: true }).click();
  await admin.getByRole("button", { name: "Send invitations", exact: true }).click();
  await admin.getByText("Provider unavailable. Retry.", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "Send invitations", exact: true }).click();
  await admin.getByRole("button", { name: "Resend invitation to Bola Adeyemi", exact: true }).waitFor();
  assert.equal(inviteRequests.length, 3);
  assert.equal(inviteRequests[1].requestId, inviteRequests[2].requestId);
  assert.equal(inviteRequests.filter((r) => r.traineeId === "t1").length, 1);
  await admin.setViewportSize({ width: 360, height: 860 });
  await fit(admin);
  await admin.screenshot({ path: join(artifacts, "invitations-mobile.png"), fullPage: true });
  await admin.setViewportSize({ width: 1440, height: 860 });
  await admin.getByRole("button", { name: "Activities", exact: true }).click();
  await admin
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await admin.getByLabel("Title", { exact: true }).fill("Session notes");
  // Built with ordinary controls now, not by typing JSON.
  await admin
    .getByLabel("What kind of activity is this?")
    .selectOption("material");
  await admin.getByLabel("The material").fill("Our next session");
  await admin
    .getByRole("button", { name: "Preview what trainees see" })
    .click();
  await admin.getByRole("heading", { name: "Session notes" }).waitFor();
  await admin
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await admin.getByText("Session notes", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "Responses", exact: true }).click();
  await admin.getByLabel("Activity", { exact: true }).selectOption("role");
  await admin
    .getByText("What got in the way of delivering the report?", { exact: true })
    .waitFor();
  const download = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "CSV export" }).click();
  const file = await (await download).path();
  assert.match(await readFile(file, "utf8"), /Ada Okafor/);
  await admin.screenshot({
    path: join(artifacts, "facilitator-desktop.png"),
    fullPage: true,
  });
  await admin.setViewportSize({ width: 360, height: 860 });
  await fit(admin);
  await admin.screenshot({
    path: join(artifacts, "facilitator-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `PASS: mobile dashboard, Markdown safety, draft resume, IDP, separate trainees, role-play turns, facilitator editor/export, invalid link. Screenshots: ${artifacts}`,
  );
} finally {
  await browser.close();
}
