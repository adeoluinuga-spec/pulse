// The Team page in a real browser, against stubbed /api/team/* responses.
//
// Checks that every tab renders what the server returns and nothing else — in
// particular that none of the old demo company's people, messages or
// escalations appear — and that tasks, messages and escalations are sent to
// the server with the right content.
//
//   npm i --no-save playwright        (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
//   npx next dev -p 3100              (with NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS=true in .env.local)
//   PULSE_TEST_BROWSER="C:/Program Files/Google/Chrome/Application/chrome.exe" \
//     node scripts/tests/team-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

// localhost, not 127.0.0.1: Next 16 blocks dev resources for other origins.
const root = process.env.PULSE_TEST_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.PULSE_TEST_BROWSER, headless: true });

const DEMO_NAMES = ["Adeolu Johnson", "Amara Osei", "Bolu Adeyemi", "Kemi Adebayo", "Zenith Ops", "CRM access delay", "Critical client dependency", "Yuki Tanaka"];

const person = (id, name, extra = {}) => ({ id, name, role: "Analyst", department: "Ops", team: null, avatarUrl: null, avatarColor: "#245de8", initials: name.split(" ").map((p) => p[0]).join(""), ...extra });
const ME = person("11111111-1111-4111-8111-111111111111", "Stuart Director", { role: "Director" });
const MGR = person("22222222-2222-4222-8222-222222222222", "Nkem Manager", { role: "Manager" });
const IFE = person("33333333-3333-4333-8333-333333333333", "Ife Analyst");
const DM = `dm:${[ME.id, IFE.id].sort().join(":")}`;

const member = (p, managerId, managerName, extra = {}) => ({
  ...p,
  lineManagerId: managerId,
  lineManagerName: managerName,
  isDirect: managerId === ME.id,
  peopleResponsibility: "none",
  goals: { count: 2, averageProgress: 45, atRisk: 1, completed: 0 },
  reports: { count: 1, last: { submittedAt: "2026-09-12T10:00:00Z", status: "submitted", type: "weekly" }, awaitingReview: 1 },
  tasks: { open: 1, overdue: 0 },
  ...extra,
});

const posts = [];
const messages = [];
const escalations = { raised: [], toHandle: [], viewerIsHr: false };

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (!url.origin.startsWith(root)) return route.abort();
  const body = request.postData() ? JSON.parse(request.postData()) : null;
  if (body) posts.push({ path: url.pathname, method: request.method(), body });

  if (url.pathname === "/api/team") {
    return json({
      viewer: ME,
      wholeLine: true,
      directCount: 1,
      members: [
        member(MGR, ME.id, ME.name, { peopleResponsibility: "manager", goals: { count: 0, averageProgress: null, atRisk: 0, completed: 0 }, reports: { count: 0, last: null, awaitingReview: 0 } }),
        member(IFE, MGR.id, MGR.name),
      ],
    });
  }
  if (url.pathname === "/api/team/tasks") {
    if (request.method() === "GET") {
      return json({
        tasks: [{ id: "t1", title: "Send the Q3 forecast", dueDate: "2026-09-30", complete: false, completedAt: null, source: "assigned", linkedGoal: null, assignee: IFE, setBy: ME, mine: false }],
        goals: [{ id: "g1", title: "Grow revenue" }],
        assignable: [ME, MGR, IFE],
      });
    }
    return json({ id: "t2" }, 201);
  }
  if (url.pathname === "/api/team/chat") {
    if (request.method() === "POST") {
      messages.push({ id: `m${messages.length + 1}`, body: body.body, at: new Date().toISOString(), mine: true, sender: ME });
      return json({ id: "m", at: new Date().toISOString() }, 201);
    }
    const channel = url.searchParams.get("channel");
    if (!channel) {
      return json({
        viewerId: ME.id,
        channels: [{ id: `team:${ME.id}`, kind: "team", label: "My team" }, { id: "department:Ops", kind: "department", label: "Ops" }],
        direct: [],
        people: [{ ...MGR, channel: `dm:${[ME.id, MGR.id].sort().join(":")}` }, { ...IFE, channel: DM }],
      });
    }
    const after = url.searchParams.get("after");
    return json({ channel, messages: messages.filter((m) => !after || m.at > after) });
  }
  if (url.pathname === "/api/team/escalations") {
    if (request.method() === "POST") {
      escalations.raised.push({ id: "e1", title: body.title, description: body.description, type: body.type, urgency: body.urgency, status: "raised", anonymous: body.anonymous, resolutionNote: null, createdAt: new Date().toISOString(), updatedAt: null, resolvedAt: null, raisedBy: ME, assignedTo: null, routedToHr: true, mine: true, canProgress: false });
      return json({ id: "e1", routedTo: "hr" }, 201);
    }
    return json(escalations);
  }
  if (url.pathname.startsWith("/api/")) return json({});
  return route.continue();
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && !/Failed to load resource|favicon|supabase/i.test(message.text()) && errors.push(message.text()));

const noDemoNames = async (where) => {
  const text = await page.locator("body").innerText();
  for (const name of DEMO_NAMES) assert.ok(!text.includes(name), `demo content "${name}" appeared on ${where}`);
};

try {
  console.log("Checking My Team");
  await page.goto(`${root}/dashboard/team`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("tab", { name: "My Team" }).waitFor({ timeout: 90_000 });
  await page.getByText("2 people").waitFor();
  await page.getByText("Reporting to you").waitFor();
  await page.getByText(`Reporting to ${MGR.name}`).waitFor();
  await page.getByText("No goals set yet · No work reports submitted yet").waitFor();
  await page.getByText("1 goal behind or at risk · 1 report waiting for review").waitFor();
  await noDemoNames("My Team");
  if (process.env.PULSE_SCREENSHOTS) await page.screenshot({ path: `${process.env.PULSE_SCREENSHOTS}/team-my-team.png`, fullPage: true });

  console.log("Checking the give-a-task path and Tasks");
  await page.getByRole("button", { name: /Ife Analyst/ }).click();
  await page.getByRole("button", { name: "Give a task" }).click();
  await page.getByRole("tab", { name: "Tasks", selected: true }).waitFor();
  await page.getByLabel("What needs doing").fill("Prepare the board pack");
  assert.equal(await page.getByLabel("For").inputValue(), IFE.id, "the task form arrives addressed to the chosen person");
  await page.getByRole("button", { name: "Save task" }).click();
  await page.getByText("Task saved.").waitFor();
  const task = posts.find((p) => p.path === "/api/team/tasks" && p.method === "POST");
  assert.deepEqual({ title: task.body.title, assigneeId: task.body.assigneeId }, { title: "Prepare the board pack", assigneeId: IFE.id });
  await page.getByRole("button", { name: /Set by me/ }).click();
  await page.getByText("Send the Q3 forecast").waitFor();
  await noDemoNames("Tasks");

  console.log("Checking Chat");
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByText("No messages yet. Say hello.").waitFor();
  await page.getByLabel("Message", { exact: true }).fill("Morning, team");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Morning, team").waitFor();
  const sent = posts.find((p) => p.path === "/api/team/chat");
  assert.equal(sent.body.channel, `team:${ME.id}`);
  await page.getByRole("button", { name: "New" }).click();
  await page.getByLabel("Message a colleague").selectOption(DM);
  await page.getByText(IFE.name, { exact: true }).first().waitFor();
  await noDemoNames("Chat");

  console.log("Checking Escalations");
  await page.getByRole("tab", { name: "Escalations" }).click();
  await page.getByText("Nothing has been escalated to you.").waitFor();
  await page.getByRole("button", { name: "Raise an escalation" }).click();
  await page.getByLabel("Title").fill("Concern about workload allocation");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByText("This will go to HR.").waitFor();
  await page.getByLabel(/Raise anonymously/).check();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("Sent to HR.", { exact: false }).waitFor();
  const raised = posts.find((p) => p.path === "/api/team/escalations");
  assert.deepEqual({ type: raised.body.type, anonymous: raised.body.anonymous }, { type: "people", anonymous: true });
  await page.getByText("Concern about workload allocation").waitFor();
  await noDemoNames("Escalations");
  if (process.env.PULSE_SCREENSHOTS) await page.screenshot({ path: `${process.env.PULSE_SCREENSHOTS}/team-escalations.png`, fullPage: true });

  console.log("Checking the phone layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "My Team" }).click();
  await page.getByText("2 people").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no sideways scroll on a phone (overflow ${overflow}px)`);

  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS: My Team shows the org chart's people grouped by manager with real attention reasons; giving a task arrives addressed to the chosen person and posts to the server; chat sends to the team channel and opens direct messages; a people escalation is routed to HR and can be anonymous; none of the old demo names appear anywhere; no sideways scroll on a phone; no browser errors.");
} finally {
  await browser.close();
}
