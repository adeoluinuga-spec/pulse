// The two survey screens in a real browser, against stubbed APIs: the public
// page a member of staff opens with no account, and the HR report.
//
//   npm i --no-save playwright        (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
//   npx next dev -p 3100
//   PULSE_TEST_BROWSER="C:/Program Files/Google/Chrome/Application/chrome.exe" \
//     node scripts/tests/survey-browser.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = process.env.PULSE_TEST_URL ?? "http://localhost:3100";
const SLUG = "abc123def456abc123def456";
const browser = await chromium.launch({ executablePath: process.env.PULSE_TEST_BROWSER, headless: true });

const questions = [
  { id: "q1", type: "scale", prompt: "I am clear about what is expected of me in my role", lowLabel: "Strongly disagree", highLabel: "Strongly agree", required: true },
  { id: "q2", type: "scale", prompt: "Decisions here are made quickly enough", lowLabel: null, highLabel: null, required: true },
  { id: "q3", type: "text", prompt: "What should we start doing?", lowLabel: null, highLabel: null, required: false },
];
const groupFields = [
  { key: "department", label: "Department", options: ["Sales", "Studio", "Operations"], required: true },
  { key: "level", label: "Level", options: ["Junior", "Senior"], required: false },
];

const posts = [];
const survey = {
  id: "s1",
  title: "Bracken baseline survey",
  slug: SLUG,
  intro: "This takes about five minutes and closes on Friday.",
  status: "open",
  closingNote: "Results are shared with everyone in February.",
  minimumGroup: 3,
  groupFields,
  questions,
};

const report = {
  responses: 12,
  minimumGroup: 3,
  suppressed: false,
  overallMean: 3.4,
  questions: [
    { questionId: "q1", prompt: questions[0].prompt, type: "scale", answered: 12, mean: 3.8, distribution: [1, 1, 3, 4, 3], comments: [] },
    { questionId: "q2", prompt: questions[1].prompt, type: "scale", answered: 12, mean: 3.0, distribution: [2, 2, 4, 3, 1], comments: [] },
    { questionId: "q3", prompt: questions[2].prompt, type: "text", answered: 3, mean: null, distribution: [], comments: ["Clearer priorities", "Fewer meetings", "More feedback"] },
  ],
  breakdowns: [
    {
      key: "department",
      label: "Department",
      hiddenGroups: 1,
      groups: [
        { value: "Sales", responses: 6, suppressed: false, mean: 3.9, questions: [] },
        { value: "Studio", responses: 4, suppressed: false, mean: 3.1, questions: [] },
        { value: "Operations", responses: 0, suppressed: true, mean: null, questions: [] },
      ],
    },
    { key: "level", label: "Level", hiddenGroups: 0, groups: [{ value: "Junior", responses: 7, suppressed: false, mean: 3.2, questions: [] }, { value: "Senior", responses: 5, suppressed: false, mean: 3.7, questions: [] }] },
  ],
};

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (!url.origin.startsWith(root)) return route.abort();
  if (request.postData()) posts.push({ path: url.pathname, body: JSON.parse(request.postData()) });

  if (url.pathname === `/api/public/survey/${SLUG}`) {
    if (request.method() !== "POST") return json({ survey });
    // Mirrors the server: required answers and required groups, or 422.
    const sent = JSON.parse(request.postData());
    const errors = [];
    for (const field of groupFields) if (field.required && !sent.groups?.[field.key]) errors.push(`Choose your ${field.label.toLowerCase()}.`);
    for (const question of questions) {
      if (question.required && !sent.answers?.some((answer) => answer.questionId === question.id)) errors.push(`"${question.prompt}" needs an answer.`);
    }
    return errors.length ? json({ error: "Some answers are missing.", errors }, 422) : json({ received: true, closingNote: survey.closingNote }, 201);
  }
  if (url.pathname === "/api/surveys" && request.method() === "GET") {
    return json({ surveys: [{ id: "s1", title: survey.title, slug: SLUG, status: "open", minimum_group: 3, responses: 12, created_at: "2026-09-25T09:00:00Z" }] });
  }
  if (url.pathname === "/api/surveys/s1") return json({ survey, report, commentCount: 3 });
  if (url.pathname.startsWith("/api/")) return json({});
  return route.continue();
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && !/Failed to load resource|favicon|supabase/i.test(message.text()) && errors.push(message.text()));

try {
  console.log("Checking the public survey page");
  await page.goto(`${root}/s/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText(survey.title).waitFor({ timeout: 90_000 });
  await page.getByText("This is anonymous.").waitFor();
  await page.getByText(/not signing in and your name, email address and device are not recorded/).waitFor();

  // No sign-in chrome: no sidebar, no notification bell, no avatar menu.
  assert.equal(await page.locator("nav[aria-label='Workspace navigation']").count(), 0, "the public page has no app sidebar");
  assert.equal(await page.getByRole("button", { name: /notification/i }).count(), 0, "the public page has no notification bell");

  // Nothing on the page asks who they are.
  const body = await page.locator("body").innerText();
  for (const word of ["Sign in", "Email address", "Your name", "Password"]) {
    assert.ok(!body.includes(word), `the public page must not ask for "${word}"`);
  }

  console.log("Answering it");
  await page.getByRole("button", { name: "Send my answers" }).click();
  await page.getByText(/needs an answer|Choose your department/).first().waitFor();

  await page.getByLabel("Department").selectOption("Sales");
  await page.getByLabel(/^Level/).selectOption("Senior");
  await page.getByRole("group", { name: /clear about what is expected/ }).getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("group", { name: /Decisions here are made/ }).getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("textbox").fill("Agree priorities before the week starts");
  await page.getByRole("button", { name: "Send my answers" }).click();

  await page.getByText("Thank you").waitFor();
  await page.getByText(survey.closingNote).waitFor();

  const submission = posts.find((post) => post.path === `/api/public/survey/${SLUG}`);
  assert.deepEqual(submission.body.groups, { department: "Sales", level: "Senior" });
  assert.deepEqual(
    submission.body.answers.sort((a, b) => a.questionId.localeCompare(b.questionId)),
    [
      { questionId: "q1", rating: 4 },
      { questionId: "q2", rating: 2 },
      { questionId: "q3", text: "Agree priorities before the week starts" },
    ],
  );
  assert.equal(JSON.stringify(submission.body).toLowerCase().includes("email"), false, "the submission carries nothing identifying");

  console.log("Checking that the browser remembers it answered");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("This browser has already sent an answer").waitFor();

  console.log("Checking the HR report");
  await page.goto(`${root}/surveys`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText(survey.title).first().click();
  await page.getByText("The link to send").waitFor({ timeout: 60_000 });
  await page.getByText(`${root}/s/${SLUG}`).waitFor();
  await page.getByText("12", { exact: true }).first().waitFor();
  await page.getByText("By department").waitFor();
  await page.getByText("By level").waitFor();
  await page.getByText("too few to show").waitFor();
  await page.getByText("1 group is hidden for having fewer than 3 answers.", { exact: false }).waitFor();

  // The report shows one grouping at a time — never a department crossed with a level.
  const reportText = await page.locator("body").innerText();
  for (const crossed of ["Senior in Sales", "Sales · Senior", "Sales/Senior"]) {
    assert.ok(!reportText.includes(crossed), `the report must not cross groups (${crossed})`);
  }
  // Comments appear, but never labelled with who or which group.
  await page.getByText("Clearer priorities").waitFor();
  assert.ok(reportText.includes("without department or level"), "the report says comments carry no group");

  console.log("Checking the phone layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}/s/${SLUG}`, { waitUntil: "domcontentloaded" });
  await page.getByText(survey.title).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no sideways scroll on a phone (overflow ${overflow}px)`);

  assert.deepEqual(errors, [], "no browser errors");
  console.log("PASS: the public page states the anonymity promise and asks nothing identifying; it refuses an empty submission, sends ratings, a comment and the self-chosen groups and nothing else, and remembers in the browser that it has been answered; the HR report shows the link, the counts, one grouping at a time with small groups marked too few to show, and comments with no group attached; no sideways scroll on a phone; no browser errors.");
} finally {
  await browser.close();
}
