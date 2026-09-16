// Browser journeys through every payroll screen, against stubbed API responses.
//
// Typechecking cannot see what a person sees: an unlabelled field, a button that
// renders but does nothing, a request body built from the wrong state. This
// drives the real pages in Chrome and checks what they send.
//
//   npm i --no-save playwright        (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
//   npx next dev -p 3100
//   PULSE_TEST_BROWSER="/c/Program Files/Google/Chrome/Application/chrome.exe" \
//     node scripts/tests/payroll-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

// localhost, not 127.0.0.1: Next 16 blocks dev resources for origins not in
// allowedDevOrigins, and 127.0.0.1 is not one — the page never hydrates.
const root = process.env.PULSE_TEST_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.PULSE_TEST_BROWSER, headless: true });

const N = (naira) => Math.round(naira * 100);
const HR = "hr", CEO = "ceo", ADA = "ada";

const people = [
  { id: HR, name: "Hana Ross", email: "hana@t.co", department: "People", platformRole: "hr_admin", joinDate: "2024-01-01", exitDate: null, onPayroll: false, currentPay: null, missing: ["pay", "bank account", "TIN"] },
  { id: CEO, name: "Chidi Eze", email: "chidi@t.co", department: "Leadership", platformRole: "executive_view", joinDate: "2024-01-01", exitDate: null, onPayroll: false, currentPay: null, missing: ["pay"] },
  { id: ADA, name: "Ada Obi", email: "ada@t.co", department: "Advisory", platformRole: "standard", joinDate: "2025-03-01", exitDate: null, onPayroll: true, currentPay: { effectiveFrom: "2025-03-01", grossKobo: N(500_000) }, missing: [] },
];

const line = {
  id: "line-ada", employee_id: ADA, employee_name: "Ada Obi", days_paid: 30, days_in_period: 30,
  earnings: [{ label: "Basic", amountKobo: N(300_000), source: "recurring" }, { label: "Housing", amountKobo: N(150_000), source: "recurring" }, { label: "Transport", amountKobo: N(50_000), source: "recurring" }],
  deductions: [{ label: "PAYE", amountKobo: N(63_950), statutory: true }, { label: "Pension (employee)", amountKobo: N(40_000), statutory: true }, { label: "National Housing Fund", amountKobo: N(7_500), statutory: true }],
  employer: [{ label: "Pension (employer)", amountKobo: N(50_000) }],
  gross_kobo: N(500_000), paye_kobo: N(63_950), pension_employee_kobo: N(40_000), nhf_kobo: N(7_500), other_deductions_kobo: 0, net_kobo: N(388_550), employer_cost_kobo: N(560_000),
  tax_state: "Lagos",
  tax_working: { regime: "nta", annualGrossKobo: N(6_000_000), reliefs: [{ label: "Pension contribution (employee)", amountKobo: N(480_000) }], chargeableKobo: N(5_430_000), bands: [{ fromKobo: 0, toKobo: N(800_000), rateBps: 0, taxKobo: 0 }], annualTaxKobo: N(767_400), exempt: false, minimumTaxApplied: false },
  blockers: [], warnings: ["No tax identification number recorded."],
};

const totals = { headcount: 1, grossKobo: N(500_000), payeKobo: N(63_950), pensionEmployeeKobo: N(40_000), pensionEmployerKobo: N(50_000), netKobo: N(388_550), employerCostKobo: N(560_000), blockerCount: 0 };
const allow = { allowed: true };
const deny = (reason) => ({ allowed: false, reason });

let viewerId = HR;
let runStatus = "draft";
let calculated = false;
const posts = [];

function runDetail() {
  const asApprover = viewerId === CEO;
  const contributor = viewerId === HR;
  return {
    run: { id: "run-sep", period_year: 2026, period_month: 9, status: runStatus, revision: 3, rule_set_id: "ng-nta-2026", totals: calculated ? totals : {}, returned_reason: null, calculated_at: calculated ? "2026-09-20T10:00:00Z" : null, calculatedByName: calculated ? "Hana Ross" : null, submitted_at: null, submittedByName: runStatus !== "draft" ? "Hana Ross" : null, approved_at: null, approvedByName: runStatus === "approved" ? "Chidi Eze" : null },
    state: { calculationIsCurrent: true, hasBeenCalculated: calculated, blockerCount: 0, contributorIds: [HR] },
    decisions: {
      calculate: runStatus === "draft" && !asApprover ? allow : deny("Only somebody who prepares payroll can do that."),
      submit: runStatus === "draft" && calculated && !asApprover ? allow : deny("Calculate the run before submitting it."),
      adjust: runStatus === "draft" && !asApprover ? allow : deny("Only somebody who prepares payroll can do that."),
      void: runStatus === "draft" && !asApprover ? allow : deny("Only somebody who prepares payroll can do that."),
      approve: runStatus === "submitted" && asApprover && !contributor ? allow : deny("You worked on this run, so you cannot also approve or return it. A different approver has to review it — that separation is the main protection against payroll fraud."),
      return: runStatus === "submitted" && asApprover ? allow : deny("Only a named payroll approver can do that."),
    },
    viewer: { employeeId: viewerId, canPrepare: viewerId === HR, canApprove: viewerId === CEO || viewerId === "hr-approver" },
    lines: calculated ? [line] : [],
    adjustments: [],
    events: [{ action: "created", actorName: "Hana Ross", created_at: "2026-09-20T09:00:00Z", payload: {} }],
  };
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true });
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (!request.url().startsWith(root)) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();

  const body = request.method() === "GET" ? null : request.postDataJSON?.() ?? null;
  if (request.method() !== "GET") posts.push({ path: url.pathname + url.search, method: request.method(), body });

  const json = (data, status = 200) => route.fulfill({ status, json: data });

  if (url.pathname === "/api/payroll/overview") {
    return json({
      viewer: { employeeId: viewerId, canPrepare: viewerId === HR, canApprove: viewerId === CEO, canViewAll: true, canManagePermissions: viewerId === HR },
      settings: { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: false, defaultTaxState: null, payDay: 25, stored: true },
      currentRules: { id: "ng-nta-2026", label: "Nigeria Tax Act 2025", verification: "unverified" },
      people,
      runs: [{ id: "run-sep", period_year: 2026, period_month: 9, status: runStatus, totals: calculated ? totals : {}, approved_at: null, calculated_at: calculated ? "2026-09-20T10:00:00Z" : null }],
      permissions: [{ employeeId: CEO, canPrepare: false, canApprove: true, canViewAll: false }],
      approverCount: 1,
    });
  }
  if (url.pathname === "/api/payroll/runs" && request.method() === "POST") return json({ run: { id: "run-oct" } }, 201);
  if (url.pathname === "/api/payroll/runs/run-sep" && request.method() === "GET") return json(runDetail());
  if (url.pathname === "/api/payroll/runs/run-oct" && request.method() === "GET") {
    // A run that has only just been started: an empty draft, as the API returns it.
    const fresh = runDetail();
    return json({
      ...fresh,
      run: { ...fresh.run, id: "run-oct", period_month: 10, status: "draft", totals: {}, calculated_at: null, calculatedByName: null, submittedByName: null, approvedByName: null },
      state: { ...fresh.state, hasBeenCalculated: false, contributorIds: [] },
      lines: [],
    });
  }
  if (url.pathname === "/api/payroll/runs/run-sep" && request.method() === "POST") {
    if (body.action === "calculate") calculated = true;
    if (body.action === "submit") runStatus = "submitted";
    if (body.action === "approve") runStatus = "approved";
    return json({ ok: true, revision: 4 });
  }
  if (url.pathname === "/api/payroll/runs/run-sep/adjustments") return json({ id: "adj-1" }, 201);
  if (url.pathname === "/api/payroll/runs/run-sep/export") {
    return route.fulfill({ status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="pulse-bank-2026-09.csv"', "X-Pulse-Omitted": "0" }, body: "Account name\r\nADA OBI\r\n" });
  }
  if (url.pathname === "/api/payroll/permissions" || url.pathname === "/api/payroll/settings") return json({ saved: true });
  if (url.pathname === `/api/payroll/people/${ADA}` && request.method() === "GET") {
    return json({
      person: { id: ADA, name: "Ada Obi", email: "ada@t.co", department: "Advisory", join_date: "2025-03-01" },
      compensation: [{ id: "comp-1", effective_from: "2025-03-01", grade: "L3", reason: null, components: [
        { code: "basic", label: "Basic salary", amountKobo: N(300_000), taxable: true, pensionable: true, isBasic: true },
        { code: "housing", label: "Housing allowance", amountKobo: N(150_000), taxable: true, pensionable: true, isBasic: false },
      ] }],
      profile: { tax_state: "Lagos", bank_name: "Access Bank", account_number: "0123456789", annual_rent_kobo: 0 },
    });
  }
  if (url.pathname === `/api/payroll/people/${ADA}` && request.method() === "PUT") return json({ saved: true });
  if (url.pathname === `/api/payroll/people/${ADA}/compensation`) return json({ id: "comp-2" }, 201);
  if (url.pathname === "/api/payroll/payslips") {
    return json({ payslips: [{ id: "line-ada", year: 2026, month: 9, grossKobo: N(500_000), netKobo: N(388_550), payeKobo: N(63_950), approvedAt: "2026-09-21T12:00:00Z" }] });
  }
  if (url.pathname === "/api/payroll/payslips/line-ada") {
    if (url.searchParams.get("format") === "pdf") {
      return route.fulfill({ status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="payslip-2026-09.pdf"' }, body: "%PDF-1.4" });
    }
    return json({ payslip: { organisationName: "Test Co", periodLabel: "September 2026", daysPaid: 30, daysInPeriod: 30, taxState: "Lagos", earnings: line.earnings, deductions: line.deductions, employer: line.employer, grossKobo: line.gross_kobo, totalDeductionsKobo: N(111_450), netKobo: line.net_kobo } });
  }
  return json({});
});

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(`${page.url()} :: ${error.message} :: ${(error.stack ?? "").split("\n").slice(1, 3).join(" | ")}`));

try {
  // ── workspace ───────────────────────────────────────────────────────────────
  console.log("Checking the payroll workspace");
  await page.goto(`${root}/payroll`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Payroll", exact: true }).waitFor();
  await page.getByText("Before the first real payroll").waitFor();
  assert.ok(await page.getByText(/tax rules have not been checked/).isVisible(), "the unverified-rules warning is shown");

  await page.getByRole("button", { name: "People and pay" }).click();
  await page.getByText("Ada Obi").waitFor();
  assert.ok(await page.getByText("Not on payroll").first().isVisible(), "people without pay are marked, not hidden");

  await page.getByRole("button", { name: "Setup and access" }).click();
  await page.getByLabel("Chidi Eze can approve payroll", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Chidi Eze can approve payroll", { exact: true }).isChecked(), true);
  // Server-authoritative: the box reflects access re-read from the API, so assert
  // on the request the page sends rather than on the box staying ticked.
  await page.getByLabel("Ada Obi can approve payroll", { exact: true }).click();
  await page.waitForTimeout(300);
  const grant = posts.find((p) => p.path === "/api/payroll/permissions");
  assert.deepEqual(grant.body, { employeeId: ADA, canPrepare: false, canApprove: true, canViewAll: false }, "granting approval sends exactly that grant");
  await page.getByLabel("Default tax state", { exact: true }).selectOption("Lagos");

  await page.getByRole("button", { name: "Start a payroll run" }).first().click();
  await page.getByLabel("Month", { exact: true }).selectOption("10");
  await page.getByLabel("Year", { exact: true }).fill("2026");
  // The first visit to a route compiles it in dev, which can take a while.
  await page.getByRole("button", { name: "Start run", exact: true }).click({ noWaitAfter: true });
  await page.waitForURL(/\/payroll\/runs\/run-oct/, { timeout: 90_000 });
  await page.getByRole("heading", { name: "October 2026" }).waitFor({ timeout: 60_000 });
  await page.getByText("Not calculated yet").waitFor();
  const created = posts.find((p) => p.path === "/api/payroll/runs");
  assert.deepEqual(created.body, { year: 2026, month: 10 });

  // ── a draft run, as the preparer ────────────────────────────────────────────
  console.log("Checking a draft run as the preparer");
  await page.goto(`${root}/payroll/runs/run-sep`, { waitUntil: "domcontentloaded" });
  await page.getByText("Not calculated yet").waitFor();
  assert.equal(await page.getByRole("button", { name: /Submit for approval/ }).isDisabled(), true, "cannot submit before calculating");

  await page.getByRole("button", { name: /^Calculate$/ }).click();
  await page.getByRole("button", { name: "Show the breakdown for Ada Obi" }).waitFor();
  const calc = posts.find((p) => p.body?.action === "calculate");
  assert.equal(calc.body.revision, 3, "actions carry the revision they were read at");

  await page.getByRole("button", { name: "Show the breakdown for Ada Obi" }).click();
  await page.getByText("How PAYE was worked out (annual)").waitFor();
  assert.ok(await page.getByRole("dialog").getByText("₦5,430,000.00").isVisible(), "the tax working shows chargeable income");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /Add adjustment/ }).click();
  await page.getByLabel("Person", { exact: true }).selectOption(ADA);
  await page.getByLabel("Type", { exact: true }).selectOption("earning");
  await page.getByLabel("Description", { exact: true }).fill("Q3 bonus");
  await page.getByLabel("Amount (₦)", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(300);
  const adj = posts.find((p) => p.path.endsWith("/adjustments"));
  assert.equal(adj.body.employeeId, ADA);
  assert.equal(adj.body.amount, "100000");

  await page.getByRole("button", { name: /Submit for approval/ }).click();
  await page.waitForTimeout(300);
  assert.equal(runStatus, "submitted");

  // ── the same run, as someone who worked on it, cannot approve ───────────────
  viewerId = "hr-approver";
  await page.goto(`${root}/payroll/runs/run-sep`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Approve payroll/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Approve payroll/ }).isDisabled(), true);
  assert.ok(await page.getByText(/main protection against payroll fraud/).isVisible(), "the maker-checker reason is shown, not just a grey button");

  // ── a named approver approves, and the files appear ─────────────────────────
  console.log("Checking approval and downloads");
  viewerId = CEO;
  await page.goto(`${root}/payroll/runs/run-sep`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Approve payroll/ }).click();
  await page.getByRole("button", { name: /Bank payment file/ }).waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Bank payment file/ }).click()]);
  assert.equal(download.suggestedFilename(), "pulse-bank-2026-09.csv");

  // ── one person's pay ────────────────────────────────────────────────────────
  console.log("Checking a person's pay");
  viewerId = HR;
  await page.goto(`${root}/payroll/people/${ADA}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Ada Obi" }).waitFor();
  assert.equal(await page.getByLabel("Tax state", { exact: true }).inputValue(), "Lagos");
  await page.getByLabel("Tax identification number", { exact: true }).fill("12345678");
  await page.getByRole("button", { name: /Save payroll details/ }).click();
  await page.waitForTimeout(300);
  const saved = posts.find((p) => p.method === "PUT");
  assert.equal(saved.body.accountNumber, "0123456789", "existing bank details are sent back unchanged");
  assert.equal(saved.body.taxState, "Lagos");

  await page.getByRole("button", { name: /Change pay/ }).click();
  await page.getByLabel("Component 1 monthly amount in naira", { exact: true }).fill("350000");
  await page.getByRole("button", { name: /Save pay record/ }).click();
  await page.waitForTimeout(300);
  const comp = posts.find((p) => p.path.endsWith("/compensation"));
  assert.equal(comp.body.components[0].amount, "350000", "the new record starts from the previous one, with the change applied");
  assert.equal(comp.body.components[0].isBasic, true);
  assert.equal(comp.body.components.length, 2);

  // ── my payslips ─────────────────────────────────────────────────────────────
  console.log("Checking my payslips");
  viewerId = ADA;
  await page.goto(`${root}/payslips`, { waitUntil: "domcontentloaded" });
  await page.getByRole("cell", { name: "September 2026", exact: true }).waitFor();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("dialog").getByText("₦388,550.00").first().waitFor();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("dialog").getByRole("button", { name: /Download PDF/ }).click()]);
  assert.equal(pdf.suggestedFilename(), "payslip-2026-09.pdf");

  // ── mobile ──────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}/payslips`, { waitUntil: "domcontentloaded" });
  await page.getByRole("cell", { name: "September 2026", exact: true }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `the payslip page does not scroll sideways on a phone (overflow ${overflow}px)`);

  assert.deepEqual(consoleErrors, [], "no uncaught errors in the browser");

  console.log("PASS: workspace warnings, people and setup tabs; approval grant and tax-state default; starting a run; calculate carrying its revision; the PAYE breakdown; adding an adjustment; submitting; a contributor shown why they cannot approve; a named approver approving; the bank file downloading; editing payroll details and adding a pay record from the previous one; viewing and downloading a payslip; no sideways scroll on a phone; no browser errors.");
} finally {
  await browser.close();
}
