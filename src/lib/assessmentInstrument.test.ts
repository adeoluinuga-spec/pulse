import test from "node:test";
import assert from "node:assert/strict";

import {
  reorderInstrumentItems,
  sortInstrumentItems,
  validateAssessmentInstrument,
  type AssessmentInstrumentItem,
} from "./assessmentInstrument.ts";

function makeScaleItem(id: string, competencyId: string, order: number, body: string): AssessmentInstrumentItem {
  return {
    id,
    competencyId,
    itemType: "scale",
    body,
    displayOrder: order,
    isActive: true,
  };
}

function makeTextItem(id: string, order: number, body: string): AssessmentInstrumentItem {
  return {
    id,
    competencyId: null,
    itemType: "text",
    body,
    displayOrder: order,
    isActive: true,
  };
}

test("validates a complete 8-competency, 32-item instrument", () => {
  const competencies = Array.from({ length: 8 }, (_, index) => ({
    id: `competency-${index + 1}`,
    name: `Competency ${index + 1}`,
  }));

  const items: AssessmentInstrumentItem[] = [];
  for (const [index, competency] of competencies.entries()) {
    for (let offset = 0; offset < 4; offset += 1) {
      items.push(makeScaleItem(`scale-${index + 1}-${offset + 1}`, competency.id, offset, `Scale item ${offset + 1} for ${competency.name}`));
    }
  }
  items.push(makeTextItem("text-1", 100, "What should this leader start doing?"));

  const result = validateAssessmentInstrument({ competencies, items });
  assert.equal(result.valid, true);
  assert.equal(result.activeScaleCount, 32);
  assert.equal(result.openTextCount, 1);
});

test("rejects incomplete instruments before a cycle can open", () => {
  const competencies = [{ id: "competency-1", name: "Leadership" }];
  const items: AssessmentInstrumentItem[] = [
    makeScaleItem("scale-1", "competency-1", 0, "Leading with clarity."),
    makeTextItem("text-1", 1, "What should this leader stop doing?"),
  ];

  const result = validateAssessmentInstrument({ competencies, items });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.toLowerCase().includes("at least two active scale items")));
  assert.equal(result.openTextCount, 1);
});

test("reorders items by display order and keeps display indexes contiguous", () => {
  const items: AssessmentInstrumentItem[] = [
    makeScaleItem("a", "competency-1", 0, "First"),
    makeScaleItem("b", "competency-1", 1, "Second"),
    makeScaleItem("c", "competency-1", 2, "Third"),
  ];

  const reordered = reorderInstrumentItems(items, "b", "up");
  const sorted = sortInstrumentItems(reordered);
  assert.deepEqual(sorted.map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(sorted.map((item) => item.displayOrder), [0, 1, 2]);
});
