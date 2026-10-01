import test from "node:test";
import assert from "node:assert/strict";
import {
  learningCsv,
  learningEmailHtml,
  parseLearningTrainees,
  validateLearningAnswers,
  validateLearningConfig,
} from "./learning.ts";
import { learningStarter } from "./learningTemplate.ts";
import { learningText } from "./learning.ts";

test("programme names reject missing and oversized values", () => {
  assert.equal(learningText("  Bracken  ", "Client"), "Bracken");
  assert.throws(() => learningText(null, "Client"));
  assert.throws(() => learningText("  ", "Client"));
  assert.throws(() => learningText("123456", "Client", 5));
});

test("all starter activities validate, with scenarios and IDP held for facilitator review", () => {
  for (const a of learningStarter)
    assert.doesNotThrow(() => validateLearningConfig(a.type, a.config));
  assert.equal(
    learningStarter.find((a) => a.title === "Practice scenarios")?.released,
    false,
  );
  assert.equal(
    learningStarter.find((a) => a.type === "roleplay")?.released,
    false,
  );
});
test("form config refuses duplicate keys, unsupported fields, invalid choices and oversized rows", () => {
  const field = {
    key: "answer",
    label: "Your answer",
    type: "textarea",
    required: true,
  };
  assert.throws(() =>
    validateLearningConfig("form", { fields: [field, field] }),
  );
  assert.throws(() =>
    validateLearningConfig("form", { fields: [{ ...field, type: "html" }] }),
  );
  assert.throws(() =>
    validateLearningConfig("form", {
      fields: [{ ...field, type: "choice", options: ["same", "same"] }],
    }),
  );
  assert.throws(() =>
    validateLearningConfig("form", { fields: [field], rows: 11 }),
  );
  assert.throws(() =>
    validateLearningConfig("roleplay", {
      scenario: "A scenario",
      roles: ["Manager", "Manager"],
      rounds: 2,
    }),
  );
});
test("submission enforces required answers, scale bounds and choice membership while drafts permit missing answers", () => {
  const c = validateLearningConfig("form", {
    fields: [
      { key: "answer", label: "Answer", type: "textarea", required: true },
      { key: "rating", label: "Rating", type: "scale" },
      { key: "choice", label: "Choice", type: "choice", options: ["A", "B"] },
    ],
  });
  assert.throws(() => validateLearningAnswers(c, { answer: " " }));
  assert.deepEqual(validateLearningAnswers(c, {}, true), {});
  assert.throws(() => validateLearningAnswers(c, { answer: "Yes", rating: 6 }));
  assert.throws(() =>
    validateLearningAnswers(c, { answer: "Yes", choice: "C" }),
  );
  assert.deepEqual(
    validateLearningAnswers(c, {
      answer: " Yes ",
      rating: 4,
      choice: "B",
      trainee_id: "forged",
    }),
    { answer: "Yes", rating: 4, choice: "B" },
  );
});
test("IDP retains fixed goal rows and the separate support fields", () => {
  const c = validateLearningConfig("form", {
    rows: 2,
    fields: [{ key: "goal", label: "Goal", type: "text", required: true }],
    singleFields: [{ key: "support", label: "Support", type: "textarea" }],
  });
  const payload = {
    rows: [{ goal: "Listen" }, { goal: "Coach" }],
    support: "Mentoring",
  };
  assert.deepEqual(validateLearningAnswers(c, payload), payload);
  assert.throws(() => validateLearningAnswers(c, { rows: [{}] }));
  assert.throws(() => validateLearningAnswers(c, { rows: [null, {}] }));
});
test("bulk trainee entry rejects an entire malformed or duplicate batch", () => {
  assert.deepEqual(parseLearningTrainees("Ada, ADA@example.com\nBola"), [
    { display_name: "Ada", email: "ada@example.com" },
    { display_name: "Bola", email: null },
  ]);
  assert.throws(
    () => parseLearningTrainees("Ada, ada@example.com\nBola, invalid"),
    /Line 2/,
  );
  assert.throws(
    () => parseLearningTrainees("Ada, ada@example.com\nAda 2, ADA@example.com"),
    /twice/,
  );
});
test("CSV escapes formula injection, quotes and embedded line breaks", () => {
  const csv = learningCsv([["=HYPERLINK(1)", 'A "quote"', "line\nbreak"]]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /A ""quote""/);
  assert.match(csv, /"line\nbreak"/);
});
test("email receipt escapes HTML and keeps answers in the private dashboard", () => {
  const html = learningEmailHtml(
    "<script>",
    "Saved",
    "https://example.com/t/abc",
  );
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /https:\/\/example.com\/t\/abc/);
});
