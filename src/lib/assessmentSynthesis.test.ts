import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUOTED_WORDS,
  MINIMUM_COMMENTS_PER_THEME,
  batchBySubject,
  countThemeSupport,
  findQuotationInSynthesis,
  findQuotedSpan,
  gateThemes,
  pseudonymiseVerbatims,
  redactIdentifiers,
  sumUsage,
  type RawVerbatim,
} from "./assessmentSynthesis.ts";

const verbatim = (over: Partial<RawVerbatim> & { reviewerId: string }): RawVerbatim => ({
  raterGroup: "colleague",
  competencyId: "c1",
  itemId: "i1",
  comment: "Runs a tight meeting.",
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
// ANTI-QUOTATION — the hard requirement
// ════════════════════════════════════════════════════════════════════════════

// A distinctive phrase, fed in as a rater comment, must not survive into the
// output. This is the check that stands between a rater and being identified by
// their own turn of phrase.
test("a distinctive phrase from a comment does not appear in the synthesis", () => {
  const distinctive =
    "she single-handedly rescued the Kaduna tower rollout during the harmattan shutdown last February";

  const sources = [distinctive];

  // What a model must not do: reuse the phrasing.
  const quoting = {
    themes: [
      {
        title: "Delivery under pressure",
        description: `Colleagues noted that ${distinctive}, which shaped their view.`,
      },
    ],
  };
  const caught = findQuotationInSynthesis(quoting, sources);
  assert.ok(caught, "a verbatim reuse of the phrase must be caught");
  assert.ok(caught.includes("kaduna"), "the offending span should be reported");

  // What a model should do: synthesise in its own words.
  const synthesised = {
    themes: [
      {
        title: "Delivery under pressure",
        description:
          "Several raters described this leader stepping in personally to keep a major regional infrastructure programme on track through a difficult seasonal disruption.",
      },
    ],
    strengths: ["Keeps complex delivery moving when conditions deteriorate."],
  };
  assert.equal(
    findQuotationInSynthesis(synthesised, sources),
    null,
    "a genuine paraphrase must pass",
  );
});

test("the quotation threshold is more than eight consecutive words", () => {
  assert.equal(MAX_QUOTED_WORDS, 8);

  const source = "one two three four five six seven eight nine ten";

  // Exactly eight shared words is allowed.
  assert.equal(findQuotedSpan("one two three four five six seven eight", [source]), null);

  // Nine is not.
  assert.ok(findQuotedSpan("one two three four five six seven eight nine", [source]));
});

test("punctuation and capitalisation cannot smuggle a quotation past the check", () => {
  const source = "he consistently protects his team from unreasonable escalation demands";
  const disguised = "He, consistently — PROTECTS his team; from unreasonable escalation demands!";

  assert.ok(findQuotedSpan(disguised, [source]));
});

test("scans nested synthesis structures, not just top-level prose", () => {
  const source = "the quarterly planning cycle is treated as a box ticking exercise here";
  const synthesis = {
    themes: [{ title: "Planning", description: "Fine.", nested: { note: source } }],
  };

  assert.ok(findQuotationInSynthesis(synthesis, [source]));
});

test("reports no quotation when there are no sources", () => {
  assert.equal(findQuotedSpan("anything at all goes here in this sentence", []), null);
});

// ════════════════════════════════════════════════════════════════════════════
// PSEUDONYMISATION — the model never sees an identity
// ════════════════════════════════════════════════════════════════════════════

test("replaces rater identity with per-category pseudonyms", () => {
  const comments = pseudonymiseVerbatims([
    verbatim({ reviewerId: "rev-b", comment: "Clear communicator." }),
    verbatim({ reviewerId: "rev-a", comment: "Delegates well." }),
    verbatim({ reviewerId: "rev-c", raterGroup: "direct_report", comment: "Approachable." }),
  ]);

  assert.deepEqual(
    comments.map((c) => c.label).sort(),
    ["Colleague 1", "Colleague 2", "Direct report 1"],
  );

  const serialised = JSON.stringify(comments);
  for (const id of ["rev-a", "rev-b", "rev-c"]) {
    assert.equal(serialised.includes(id), false, `${id} must not reach the model`);
  }
});

test("gives the same rater the same label across runs", () => {
  const rows = [
    verbatim({ reviewerId: "rev-b", comment: "One." }),
    verbatim({ reviewerId: "rev-a", comment: "Two." }),
  ];

  const first = pseudonymiseVerbatims(rows);
  const second = pseudonymiseVerbatims([...rows].reverse());

  const labelFor = (set: typeof first, text: string) =>
    set.find((c) => c.text.startsWith(text))?.label;

  assert.equal(labelFor(first, "One"), labelFor(second, "One"));
  assert.equal(labelFor(first, "Two"), labelFor(second, "Two"));
});

test("strips emails, links, phone numbers and names from comment text", () => {
  const redacted = redactIdentifiers(
    "Ask Ada Obi at ada.obi@telco.ng or +234 802 555 1234, see https://intranet/x",
    ["Ada Obi"],
  );

  assert.equal(redacted.includes("ada.obi@telco.ng"), false);
  assert.equal(redacted.includes("Ada"), false);
  assert.equal(redacted.includes("Obi"), false);
  assert.equal(redacted.includes("intranet"), false);
  assert.equal(/\d{4}/.test(redacted), false);
});

test("redacts a first name on its own, not only the full name", () => {
  const redacted = redactIdentifiers("Ada chairs the review and Ada sets the tone.", ["Ada Obi"]);
  assert.equal(redacted.includes("Ada"), false);
});

test("leaves ordinary words alone", () => {
  const text = "Runs a disciplined operations review every fortnight.";
  assert.equal(redactIdentifiers(text, ["Ada Obi"]), text);
});

test("drops comments that redact down to nothing", () => {
  const comments = pseudonymiseVerbatims([verbatim({ reviewerId: "r1", comment: "   " })]);
  assert.deepEqual(comments, []);
});

// ════════════════════════════════════════════════════════════════════════════
// THEME GATING — n<3, matching the scoring service
// ════════════════════════════════════════════════════════════════════════════

test("the theme threshold matches the scoring suppression rule", () => {
  assert.equal(MINIMUM_COMMENTS_PER_THEME, 3);
});

test("suppresses a theme drawn from two comments in one category", () => {
  const [theme] = gateThemes([
    { title: "T", description: "D", supportingLabels: ["Colleague 1", "Colleague 2"] },
  ]);

  assert.equal(theme.supportCount, 2);
  assert.equal(theme.suppressed, true);
  assert.deepEqual(theme.raterGroups, []);
});

test("reports a theme drawn from three comments in one category", () => {
  const [theme] = gateThemes([
    {
      title: "T",
      description: "D",
      supportingLabels: ["Colleague 1", "Colleague 2", "Colleague 3"],
    },
  ]);

  assert.equal(theme.supportCount, 3);
  assert.equal(theme.suppressed, false);
  assert.deepEqual(theme.raterGroups, ["colleague"]);
});

test("counts distinct labels, so one rater repeating themselves is still one voice", () => {
  const [theme] = gateThemes([
    {
      title: "T",
      description: "D",
      supportingLabels: ["Colleague 1", "Colleague 1", "Colleague 1", "Colleague 1"],
    },
  ]);

  assert.equal(theme.supportCount, 1);
  assert.equal(theme.suppressed, true);
});

test("keeps a cross-category theme but drops thin attributions", () => {
  const [theme] = gateThemes([
    {
      title: "T",
      description: "D",
      supportingLabels: [
        "Colleague 1",
        "Colleague 2",
        "Colleague 3",
        "Customer 1",
      ],
    },
  ]);

  assert.equal(theme.suppressed, false);
  // Colleagues clear the threshold; the single customer must not be pointed at.
  assert.deepEqual(theme.raterGroups, ["colleague"]);
});

test("counts support per rater category", () => {
  const counts = countThemeSupport(["Colleague 1", "Colleague 2", "Direct report 1", "Line manager 1"]);

  assert.equal(counts.total, 4);
  assert.equal(counts.byGroup.colleague, 2);
  assert.equal(counts.byGroup.direct_report, 1);
  assert.equal(counts.byGroup.line_manager, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// BATCHING AND COST
// ════════════════════════════════════════════════════════════════════════════

test("batches comments per subject", () => {
  const batches = batchBySubject([
    { subjectId: "a", comment: "1" },
    { subjectId: "b", comment: "2" },
    { subjectId: "a", comment: "3" },
  ]);

  assert.equal(batches.size, 2);
  assert.equal(batches.get("a")?.length, 2);
});

test("sums token usage across a cycle, tolerating gaps", () => {
  const total = sumUsage([
    { inputTokens: 1200, outputTokens: 800, requests: 1 },
    null,
    { inputTokens: 900, outputTokens: 650, requests: 1 },
    undefined,
  ]);

  assert.deepEqual(total, { inputTokens: 2100, outputTokens: 1450, requests: 2 });
  assert.deepEqual(sumUsage([]), { inputTokens: 0, outputTokens: 0, requests: 0 });
});
