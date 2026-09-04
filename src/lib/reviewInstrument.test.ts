import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftMap,
  buildReviewInstrument,
  countAnsweredReviewItems,
  flattenReviewInstrument,
  relationshipLabel,
} from "./reviewInstrument.ts";

test("builds a review instrument with ordered competencies and standalone text last", () => {
  const instrument = buildReviewInstrument(
    [
      { id: "people", name: "Develops People", sort_order: 2 },
      { id: "direction", name: "Sets Direction", sort_order: 1 },
    ],
    [
      { id: "start", item_type: "text", body: "What should this leader start doing?", display_order: 99 },
      { id: "d2", competency_id: "direction", item_type: "scale", body: "Connects work to strategy.", display_order: 2 },
      { id: "d1", competency_id: "direction", item_type: "scale", body: "Communicates priorities.", display_order: 1 },
      { id: "p1", competency_id: "people", item_type: "scale", body: "Coaches people.", display_order: 1 },
    ],
  );

  assert.deepEqual(instrument.competencies.map((competency) => competency.id), ["direction", "people"]);
  assert.deepEqual(instrument.competencies[0].items.map((item) => item.id), ["d1", "d2"]);
  assert.deepEqual(instrument.textItems.map((item) => item.id), ["start"]);
  assert.deepEqual(flattenReviewInstrument(instrument).map((item) => item.id), ["d1", "d2", "p1", "start"]);
});

test("counts rated, not-observed and text responses as answered", () => {
  const instrument = buildReviewInstrument(
    [{ id: "direction", name: "Sets Direction", sort_order: 1 }],
    [
      { id: "d1", competency_id: "direction", item_type: "scale", body: "Communicates priorities.", display_order: 1 },
      { id: "d2", competency_id: "direction", item_type: "scale", body: "Connects work to strategy.", display_order: 2 },
      { id: "continue", item_type: "text", body: "What should continue?", display_order: 3 },
    ],
  );

  const progress = countAnsweredReviewItems(instrument, {
    d1: { itemId: "d1", itemType: "scale", score: 5 },
    d2: { itemId: "d2", itemType: "scale", notObserved: true },
    continue: { itemId: "continue", itemType: "text", comment: "" },
  });

  assert.equal(progress.answered, 2);
  assert.equal(progress.total, 3);
  assert.deepEqual(progress.unansweredItemIds, ["continue"]);
});

test("draft map keeps the latest keyed item response and relationship labels are humane", () => {
  const draft = buildDraftMap([
    { itemId: "item-1", itemType: "scale", score: 3, updatedAt: "2026-09-04T10:00:00Z" },
    { itemId: "", itemType: "text", comment: "ignored" },
  ]);

  assert.equal(draft["item-1"].score, 3);
  assert.equal(relationshipLabel("line_manager"), "Line manager");
  assert.equal(relationshipLabel("mystery"), "Reviewer");
});
