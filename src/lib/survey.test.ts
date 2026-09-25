import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReport,
  commentsFor,
  reportCsv,
  validateGroupFields,
  validateMinimumGroup,
  validateQuestions,
  validateSubmission,
  OTHER_LABEL,
  type StoredResponse,
  type SurveyDefinition,
} from "./survey.ts";

const survey: SurveyDefinition = {
  id: "s1",
  title: "Baseline",
  intro: null,
  status: "open",
  minimumGroup: 3,
  groupFields: [
    { key: "department", label: "Department", options: ["Sales", "Studio", "Ops"], required: true },
    { key: "level", label: "Level", options: ["Junior", "Senior"], required: false },
  ],
  questions: [
    { id: "q1", position: 1, type: "scale", prompt: "I am clear about what is expected of me", required: true },
    { id: "q2", position: 2, type: "scale", prompt: "Decisions are made quickly enough", required: true },
    { id: "q3", position: 3, type: "text", prompt: "What should we start doing?", required: false },
  ],
};

const answer = (department: string, level: string, q1: number, q2: number, comment?: string): StoredResponse => ({
  id: `r-${Math.random()}`,
  groups: { department, level },
  answers: [
    { questionId: "q1", rating: q1 },
    { questionId: "q2", rating: q2 },
    ...(comment ? [{ questionId: "q3", text: comment }] : []),
  ],
});

test("a survey needs questions, and wording that says something", () => {
  assert.equal(validateQuestions([]).ok, false);
  const bad = validateQuestions([{ prompt: "?" }]);
  assert.ok(!bad.ok && bad.errors[0].includes("Question 1"));
  const good = validateQuestions([{ prompt: "I know what is expected of me", type: "scale" }, { prompt: "Anything else?", type: "text" }]);
  assert.ok(good.ok);
  assert.equal(good.questions[0].required, true, "a rated question is required by default");
  assert.equal(good.questions[1].required, false, "a comment box is not");
});

test("group fields need a label and at least two distinct options", () => {
  const bad = validateGroupFields([{ label: "Department", options: ["Sales"] }, { label: "Level", options: ["A", "a"] }]);
  assert.equal(bad.ok, false);
  const good = validateGroupFields([{ label: "Department", options: [" Sales ", "Studio"] }]);
  assert.ok(good.ok);
  assert.deepEqual(good.fields[0], { key: "department", label: "Department", options: ["Sales", "Studio"], required: true });
});

test("the minimum group size cannot be set below three", () => {
  assert.equal(validateMinimumGroup(2), null);
  assert.equal(validateMinimumGroup(3), 3);
  assert.equal(validateMinimumGroup(5), 5);
  assert.equal(validateMinimumGroup(99), null);
});

test("a submission must answer the required questions, within the scale", () => {
  const missing = validateSubmission(survey, { answers: [{ questionId: "q1", rating: 4 }], groups: { department: "Sales" } });
  assert.ok(!missing.ok && missing.errors.some((error) => error.includes("Decisions are made")));

  const offScale = validateSubmission(survey, { answers: [{ questionId: "q1", rating: 9 }, { questionId: "q2", rating: 3 }], groups: { department: "Sales" } });
  assert.ok(!offScale.ok && offScale.errors.some((error) => error.includes("between 1 and 5")));

  const fine = validateSubmission(survey, {
    answers: [{ questionId: "q1", rating: 4 }, { questionId: "q2", rating: 2 }, { questionId: "q3", text: "  More clarity  " }],
    groups: { department: "Sales", level: "Senior" },
  });
  assert.ok(fine.ok);
  assert.equal(fine.answers.length, 3);
  assert.equal(fine.answers[2].text, "More clarity");
});

test("a required group must be chosen, and only from its own options", () => {
  const none = validateSubmission(survey, { answers: [{ questionId: "q1", rating: 4 }, { questionId: "q2", rating: 4 }], groups: {} });
  assert.ok(!none.ok && none.errors.some((error) => error.includes("department")));

  const invented = validateSubmission(survey, {
    answers: [{ questionId: "q1", rating: 4 }, { questionId: "q2", rating: 4 }],
    groups: { department: "Board of one" },
  });
  assert.ok(!invented.ok, "a group nobody offered cannot be added by hand");
});

test("a closed survey takes no answers", () => {
  const result = validateSubmission({ ...survey, status: "closed" }, { answers: [{ questionId: "q1", rating: 4 }], groups: { department: "Sales" } });
  assert.ok(!result.ok && result.errors[0].includes("closed"));
});

test("questions nobody asked are ignored rather than stored", () => {
  const result = validateSubmission(survey, {
    answers: [{ questionId: "q1", rating: 4 }, { questionId: "q2", rating: 4 }, { questionId: "smuggled", rating: 5 }],
    groups: { department: "Ops" },
  });
  assert.ok(result.ok);
  assert.deepEqual(result.answers.map((a) => a.questionId), ["q1", "q2"]);
});

test("under the minimum, the whole report is withheld — not shown with gaps", () => {
  const report = buildReport(survey, [answer("Sales", "Junior", 4, 4), answer("Sales", "Senior", 3, 3)]);
  assert.equal(report.suppressed, true);
  assert.equal(report.responses, 2);
  assert.deepEqual(report.questions, []);
  assert.deepEqual(report.breakdowns, []);
});

test("at the minimum, means and the spread of answers are reported", () => {
  const report = buildReport(survey, [
    answer("Sales", "Junior", 4, 2, "More clarity please"),
    answer("Sales", "Senior", 5, 3),
    answer("Studio", "Junior", 3, 1, "Fewer meetings"),
  ]);
  assert.equal(report.suppressed, false);
  assert.equal(report.responses, 3);
  const q1 = report.questions.find((question) => question.questionId === "q1");
  assert.equal(q1?.mean, 4);
  assert.deepEqual(q1?.distribution, [0, 0, 1, 1, 1], "one each of 3, 4 and 5");
  assert.equal(report.overallMean, 3); // (4 + 2) / 2
  assert.deepEqual(commentsFor(report), ["More clarity please", "Fewer meetings"]);
});

test("groups too small to name are pooled into Other, not thrown away", () => {
  const responses = [
    answer("Sales", "Junior", 5, 5),
    answer("Sales", "Junior", 4, 4),
    answer("Sales", "Senior", 3, 3),
    answer("Studio", "Senior", 1, 1),
    answer("Studio", "Senior", 2, 2),
    answer("Ops", "Senior", 1, 1),
  ];
  const report = buildReport(survey, responses);
  const departments = report.breakdowns.find((breakdown) => breakdown.key === "department");

  const sales = departments?.groups.find((group) => group.value === "Sales");
  assert.equal(sales?.responses, 3);
  assert.equal(sales?.mean, 4);
  assert.equal(sales?.pooled, false);

  // Studio (2) and Ops (1) are each too small, so they answer as one row of 3.
  assert.equal(departments?.groups.some((group) => group.value === "Studio"), false, "a small department is never named");
  assert.equal(departments?.groups.some((group) => group.value === "Ops"), false);
  const other = departments?.groups.find((group) => group.pooled);
  assert.equal(other?.value, OTHER_LABEL);
  assert.equal(other?.responses, 3);
  assert.equal(other?.pooledFrom, 2, "two departments were folded together");
  assert.equal(other?.mean, 1.33); // ratings 1, 2, 1 on each rated question
  assert.equal(departments?.hiddenGroups, 2);
  assert.equal(departments?.pooledWithheld, false);
});

test("a pooled row that is itself too small is withheld, so one department cannot hide inside Other", () => {
  const report = buildReport(survey, [
    answer("Sales", "Junior", 5, 5),
    answer("Sales", "Junior", 4, 4),
    answer("Sales", "Senior", 3, 3),
    answer("Studio", "Senior", 1, 1),
    answer("Studio", "Senior", 2, 2),
  ]);
  const departments = report.breakdowns.find((breakdown) => breakdown.key === "department");
  assert.equal(departments?.groups.length, 1, "only Sales is shown");
  assert.equal(departments?.groups.some((group) => group.pooled), false, "two people are not shown as Other either");
  assert.equal(departments?.pooledWithheld, true);
  assert.equal(departments?.hiddenGroups, 1);
  // Their answers still count in the overall figures.
  assert.equal(report.responses, 5);
});

test("a pooled row big enough to show always mixes at least two groups", () => {
  // Each pooled group holds at most minimum-1 people, so a pooled row reaching
  // the minimum cannot be one group. Checked here so the reasoning cannot rot.
  const report = buildReport(survey, [
    answer("Sales", "Junior", 4, 4),
    answer("Sales", "Junior", 4, 4),
    answer("Studio", "Senior", 2, 2),
    answer("Ops", "Senior", 2, 2),
    answer("Ops", "Junior", 2, 2),
  ]);
  const departments = report.breakdowns.find((breakdown) => breakdown.key === "department");
  const other = departments?.groups.find((group) => group.pooled);
  assert.equal(other?.responses, 5, "Sales (2), Studio (1) and Ops (2) are all too small, so all five pool");
  assert.ok((other?.pooledFrom ?? 0) >= 2);
});

test("departments and levels are separate lists, never crossed", () => {
  const report = buildReport(survey, [
    answer("Sales", "Junior", 5, 5),
    answer("Sales", "Senior", 4, 4),
    answer("Studio", "Junior", 3, 3),
    answer("Ops", "Senior", 2, 2),
  ]);
  assert.deepEqual(report.breakdowns.map((breakdown) => breakdown.key), ["department", "level"]);
  // Every breakdown is one dimension deep: there is no "Senior in Sales" anywhere.
  for (const breakdown of report.breakdowns) {
    for (const group of breakdown.groups) {
      assert.equal(typeof group.value, "string");
      assert.ok(!group.value.includes("·"), "groups are single values, not combinations");
    }
  }
  const levels = report.breakdowns.find((breakdown) => breakdown.key === "level");
  assert.deepEqual(levels?.groups.map((group) => group.value), [OTHER_LABEL], "two of each level, so they pool into one row");
});

test("comments carry no group, so a sentence cannot be traced to a team of three", () => {
  const report = buildReport(survey, [
    answer("Sales", "Junior", 4, 4, "The Sales team is stretched"),
    answer("Studio", "Senior", 4, 4),
    answer("Ops", "Junior", 4, 4),
  ]);
  const text = report.questions.find((question) => question.type === "text");
  assert.deepEqual(text?.comments, ["The Sales team is stretched"]);
  assert.equal(JSON.stringify(report.questions).includes("department"), false);
});

test("the export carries the aggregate only, and is safe to open in a spreadsheet", () => {
  const report = buildReport(survey, [
    answer("Sales", "Junior", 4, 4, "=cmd|' /c calc'!A0"),
    answer("Sales", "Senior", 4, 4),
    answer("Sales", "Senior", 4, 4),
  ]);
  const csv = reportCsv(report);
  assert.ok(csv.includes("Department"));
  assert.ok(csv.includes("Sales,3,4"));
  assert.equal(csv.includes("=cmd"), false, "comments are not exported at all");
  // One Junior and two Seniors: neither reaches three, so the export names
  // neither and shows them pooled instead.
  assert.equal(csv.includes("Junior"), false);
  assert.ok(csv.includes(OTHER_LABEL), "the export shows the pooled row rather than the small groups");
});
