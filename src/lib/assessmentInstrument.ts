export type AssessmentInstrumentItemType = "scale" | "text";

export type AssessmentInstrumentItem = {
  id?: string;
  competencyId?: string | null;
  itemType: AssessmentInstrumentItemType;
  body: string;
  displayOrder: number;
  isActive: boolean;
};

export type AssessmentInstrumentCompetency = {
  id: string;
  name: string;
  items?: AssessmentInstrumentItem[];
};

export type InstrumentCompetencyStatus = {
  competencyId: string;
  competencyName: string;
  activeScaleCount: number;
  valid: boolean;
  errors: string[];
};

export type AssessmentInstrumentValidation = {
  valid: boolean;
  errors: string[];
  activeScaleCount: number;
  openTextCount: number;
  competencyStatuses: InstrumentCompetencyStatus[];
};

export function normalizeInstrumentBody(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function sortInstrumentItems(items: AssessmentInstrumentItem[]): AssessmentInstrumentItem[] {
  return [...items].sort((left, right) => {
    const leftOrder = Number(left.displayOrder ?? 0);
    const rightOrder = Number(right.displayOrder ?? 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.body.localeCompare(right.body);
  });
}

export function reorderInstrumentItems(
  items: AssessmentInstrumentItem[],
  itemId: string,
  direction: "up" | "down",
): AssessmentInstrumentItem[] {
  const sorted = sortInstrumentItems(items);
  const currentIndex = sorted.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return sorted;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= sorted.length) return sorted;

  const reordered = [...sorted];
  [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];

  return reordered.map((item, index) => ({
    ...item,
    displayOrder: index,
  }));
}

export function validateAssessmentInstrument(input: {
  competencies: Array<{ id: string; name: string; items?: AssessmentInstrumentItem[] }>;
  items: AssessmentInstrumentItem[];
}): AssessmentInstrumentValidation {
  const activeItems = (input.items ?? []).filter((item) => item.isActive !== false);
  const errors: string[] = [];
  const competencyStatuses: InstrumentCompetencyStatus[] = [];
  const totalOpenText = activeItems.filter((item) => item.itemType === "text").length;
  const totalScale = activeItems.filter((item) => item.itemType === "scale").length;

  if (!input.competencies.length) {
    errors.push("At least one competency is required before the instrument can open.");
  }

  for (const competency of input.competencies) {
    const activeScaleItems = activeItems.filter(
      (item) => item.competencyId === competency.id && item.itemType === "scale",
    );
    const invalidBodyItems = activeItems.filter(
      (item) =>
        item.competencyId === competency.id &&
        normalizeInstrumentBody(item.body).length === 0,
    );

    const competencyErrors: string[] = [];
    if (activeScaleItems.length < 2) {
      competencyErrors.push(`${competency.name} needs at least two active scale items.`);
    }
    if (invalidBodyItems.length > 0) {
      competencyErrors.push(`${competency.name} contains an item with empty body text.`);
    }

    competencyStatuses.push({
      competencyId: competency.id,
      competencyName: competency.name,
      activeScaleCount: activeScaleItems.length,
      valid: competencyErrors.length === 0,
      errors: competencyErrors,
    });

    if (competencyErrors.length) {
      errors.push(...competencyErrors);
    }
  }

  for (const item of activeItems) {
    if (normalizeInstrumentBody(item.body).length === 0) {
      errors.push(`Item ${item.id ?? "new"} cannot be blank.`);
    }
  }

  if (totalOpenText < 1) {
    errors.push("At least one active open-text item is required.");
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    activeScaleCount: totalScale,
    openTextCount: totalOpenText,
    competencyStatuses,
  };
}
