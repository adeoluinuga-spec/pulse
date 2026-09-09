// UI smoke test with isolated synthetic staff. All external network calls are blocked.
// Start Next dev with NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS=true on port 3100.
// Install playwright in PULSE_TEST_TOOLS and set PULSE_TEST_BROWSER to Chrome/Edge.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.env.PULSE_TEST_TOOLS ?? ".", "package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: process.env.PULSE_TEST_BROWSER, headless: true });
const root = process.env.PULSE_TEST_URL ?? "http://127.0.0.1:3100";
const output = resolve(process.env.PULSE_TEST_OUTPUT ?? process.env.TEMP ?? ".", "pulse-structure-evidence");
await mkdir(output, { recursive: true });
const employees = [
  { id: "a", name: "Ada Davidson", email: "ada@example.test", role: "Managing director", department: "Leadership", team: null, line_manager_id: null, people_responsibility: "director" },
  { id: "b", name: "Tunde Cole", email: "tunde@example.test", role: "Consulting lead", department: "Advisory", team: "Delivery", line_manager_id: "a", people_responsibility: "team_lead" },
  { id: "c", name: "Ife Okoro", email: "ife@example.test", role: "Consultant", department: "Advisory", team: "Delivery", line_manager_id: "b", people_responsibility: "none" },
  { id: "d", name: "Maya Bello", email: "maya@example.test", role: "People lead", department: "People", team: "Operations", line_manager_id: "a", people_responsibility: "manager" },
];
let structure = null;
let history = [];
let publishCount = 0;
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await context.route("**/*", async route => {
  const request = route.request();
  if (!request.url().startsWith(root)) return route.abort();
  if (new URL(request.url()).pathname === "/api/organisation/structure") {
    if (request.method() === "GET") return route.fulfill({ json: { organisationName: "Stuart Davidson · test organisation", employees, structure, history } });
    const body = request.postDataJSON();
    assert.equal(body.revision, structure?.revision ?? 0);
    structure = { draft: body.document, revision: body.revision + 1, roster_baseline: body.rosterBaseline,
      published: structure?.published ?? null, published_at: structure?.published_at ?? null };
    if (body.action === "publish") {
      publishCount++;
      for (const p of body.document.positions) {
        const employee = employees.find(e => e.id === p.employeeId);
        if (!employee) continue;
        employee.role = p.title; employee.department = p.department; employee.team = p.team || null;
        employee.line_manager_id = body.document.positions.find(parent => parent.id === p.parentId)?.employeeId ?? null;
        employee.people_responsibility = p.responsibility;
      }
      structure.published = body.document; structure.published_at = new Date().toISOString();
      structure.roster_baseline = structuredClone(employees);
      history = [{ revision: structure.revision, published_at: structure.published_at }];
    }
    return route.fulfill({ json: { revision: structure.revision, published: body.action === "publish" } });
  }
  return route.continue();
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
try {
  await page.goto(`${root}/dashboard/organisation`);
  await page.getByRole("heading", { name: "Give everyone a clear place." }).waitFor();
  await page.getByRole("button", { name: /Leadership.*Managing director/ }).click();
  assert.equal(await page.getByLabel("Position title", { exact: true }).inputValue(), "Managing director");
  await page.getByLabel("Reports to", { exact: true }).selectOption("staff-c");
  await page.getByText(/Reporting lines contain a loop/).first().waitFor();
  assert.equal(await page.getByLabel("Reports to", { exact: true }).inputValue(), "");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("button", { name: /Advisory.*Consultant.*Ife/ }).locator("..").dragTo(
    page.getByRole("button", { name: /Leadership.*Managing director/ }).locator(".."));
  await page.getByRole("button", { name: /Advisory.*Consultant.*Ife/ }).click();
  assert.equal(await page.getByLabel("Reports to", { exact: true }).inputValue(), "staff-a", "dragging onto a manager changes the primary reporting line");
  await page.getByLabel("Reports to", { exact: true }).selectOption("staff-a");
  await page.getByLabel("Leadership responsibility", { exact: true }).selectOption("team_lead");
  await page.getByLabel("Theme", { exact: true }).selectOption("forest");
  await page.getByLabel("Layout", { exact: true }).selectOption("horizontal");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText(/Draft saved · revision 1/).waitFor();
  assert.equal(employees[2].line_manager_id, "b", "draft must not publish");
  await page.reload();
  await page.getByText(/Draft saved · revision 1/).waitFor();
  assert.equal(await page.getByLabel("Theme", { exact: true }).inputValue(), "forest");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  await page.getByRole("dialog").getByText("Ife Okoro", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Publish structure", exact: true }).click();
  await page.getByText(/Draft saved · revision 2/).waitFor();
  assert.equal(publishCount, 1); assert.equal(employees[2].line_manager_id, "a");
  await page.screenshot({ path: resolve(output, "desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: /Department hierarchy/ }).click();
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Publish structure", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("button", { name: "Undo last edit", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Layout", { exact: true }).selectOption("vertical");
  await page.getByRole("button", { name: "Fit chart", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile page must not overflow horizontally");
  await page.getByRole("button", { name: "Position", exact: true }).click();
  await page.getByLabel("Position title", { exact: true }).fill("New associate");
  await page.getByRole("button", { name: "Remove position", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove position", exact: true }).click();
  await page.screenshot({ path: resolve(output, "mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop/mobile editor; cycle prevention; staff editing; draft/resume; publish review; incomplete template blocked; undo; position removal; no browser exceptions. Screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); }
