import { isResponseAnswered, type ReviewResponse } from "./reviewSubmission.ts";

export type ReviewRelationshipType = "self" | "line_manager" | "colleague" | "direct_report" | "customer";

export type ReviewInstrumentCompetencyRow = {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
};

export type ReviewInstrumentItemRow = {
  id: string;
  competency_id?: string | null;
  item_type: "scale" | "text";
  body: string;
  display_order?: number | null;
};

export type ReviewInstrumentItem = {
  id: string;
  type: "scale" | "text";
  body: string;
  displayOrder: number;
};

export type ReviewInstrumentCompetency = {
  id: string;
  name: string;
  description: string;
  displayOrder: number;
  items: ReviewInstrumentItem[];
};

export type ReviewInstrument = {
  competencies: ReviewInstrumentCompetency[];
  textItems: ReviewInstrumentItem[];
};

export type ReviewDraftResponse = ReviewResponse & {
  updatedAt?: string | null;
};

export function relationshipLabel(group: string): string {
  const labels: Record<ReviewRelationshipType, string> = {
    self: "Self assessment",
    line_manager: "Line manager",
    colleague: "Colleague",
    direct_report: "Direct report",
    customer: "Customer",
  };

  return labels[group as ReviewRelationshipType] ?? "Reviewer";
}

function orderValue(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function buildReviewInstrument(
  competencies: ReviewInstrumentCompetencyRow[],
  items: ReviewInstrumentItemRow[],
): ReviewInstrument {
  const sortedCompetencies = [...competencies].sort(
    (a, b) => orderValue(a.sort_order) - orderValue(b.sort_order) || a.name.localeCompare(b.name),
  );

  const itemsByCompetency = new Map<string, ReviewInstrumentItem[]>();
  const textItems: ReviewInstrumentItem[] = [];

  [...items]
    .sort((a, b) => orderValue(a.display_order) - orderValue(b.display_order) || a.body.localeCompare(b.body))
    .forEach((item) => {
      const nextItem: ReviewInstrumentItem = {
        id: item.id,
        type: item.item_type,
        body: item.body,
        displayOrder: orderValue(item.display_order),
      };

      if (item.competency_id) {
        const current = itemsByCompetency.get(item.competency_id) ?? [];
        itemsByCompetency.set(item.competency_id, [...current, nextItem]);
        return;
      }

      textItems.push(nextItem);
    });

  return {
    competencies: sortedCompetencies.map((competency) => ({
      id: competency.id,
      name: competency.name,
      description: competency.description ?? "",
      displayOrder: orderValue(competency.sort_order),
      items: itemsByCompetency.get(competency.id) ?? [],
    })),
    textItems,
  };
}

export function flattenReviewInstrument(instrument: ReviewInstrument): ReviewInstrumentItem[] {
  return [
    ...instrument.competencies.flatMap((competency) => competency.items),
    ...instrument.textItems,
  ];
}

export function buildDraftMap(responses: ReviewDraftResponse[]): Record<string, ReviewDraftResponse> {
  return Object.fromEntries(
    responses
      .filter((response) => response.itemId?.trim())
      .map((response) => [response.itemId!.trim(), response]),
  );
}

export function countAnsweredReviewItems(
  instrument: ReviewInstrument,
  responses: Record<string, ReviewResponse>,
): { answered: number; total: number; unansweredItemIds: string[] } {
  const items = flattenReviewInstrument(instrument);
  const unansweredItemIds = items
    .filter((item) => !isResponseAnswered({
      ...responses[item.id],
      itemId: item.id,
      itemType: item.type,
    }))
    .map((item) => item.id);

  return {
    answered: items.length - unansweredItemIds.length,
    total: items.length,
    unansweredItemIds,
  };
}
