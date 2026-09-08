"use client";

import { useEffect, useMemo, useState } from "react";

import {
  reorderInstrumentItems,
  sortInstrumentItems,
  validateAssessmentInstrument,
  type AssessmentInstrumentItem,
  type AssessmentInstrumentItemType,
} from "@/lib/assessmentInstrument";

type FrameworkRecord = {
  id: string;
  name: string;
  competencies: Array<{ id: string; name: string; level?: string; function?: string; active?: boolean }>;
};

const emptyDraft = {
  body: "",
  type: "scale" as AssessmentInstrumentItemType,
  competencyId: "",
};

export default function AssessmentInstrumentPage() {
  const [frameworks, setFrameworks] = useState<FrameworkRecord[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState("");
  const [items, setItems] = useState<AssessmentInstrumentItem[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/assessments/frameworks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload?.error ?? "Unable to load frameworks");
        return;
      }
      const nextFrameworks = (payload.frameworks ?? []) as FrameworkRecord[];
      setFrameworks(nextFrameworks);
      if (nextFrameworks[0]) {
        setSelectedFrameworkId(nextFrameworks[0].id);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedFrameworkId) return;

    async function loadItems() {
      const cycleResponse = await fetch("/api/assessments/cycles", { cache: "no-store" });
      const cyclePayload = await cycleResponse.json();
      const cycle = (cyclePayload.cycles ?? [])[0];
      if (!cycle?.id) {
        setItems([]);
        return;
      }

      const response = await fetch(`/api/assessments/items?cycleId=${encodeURIComponent(cycle.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload?.error ?? "Unable to load instrument items");
        return;
      }
      setItems((payload.items ?? []) as AssessmentInstrumentItem[]);
    }

    void loadItems();
  }, [selectedFrameworkId]);

  const selectedFramework = frameworks.find((framework) => framework.id === selectedFrameworkId) ?? frameworks[0];
  const competencies = selectedFramework?.competencies ?? [];
  const sortedItems = useMemo(() => sortInstrumentItems(items), [items]);
  const groupedItems = useMemo(
    () =>
      competencies.map((competency) => ({
        ...competency,
        items: sortedItems.filter((item) => item.competencyId === competency.id && item.isActive !== false),
      })),
    [competencies, sortedItems],
  );
  const standaloneTextItems = sortedItems.filter((item) => item.itemType === "text" && item.isActive !== false);
  const validation = useMemo(
    () => validateAssessmentInstrument({ competencies, items: sortedItems }),
    [competencies, sortedItems],
  );

  async function saveItem() {
    const body = draft.body.trim();
    if (!body) {
      setNotice("Item body cannot be blank.");
      return;
    }
    if (draft.type === "scale" && !draft.competencyId) {
      setNotice("Select a competency for the scale item.");
      return;
    }

    const cycleResponse = await fetch("/api/assessments/cycles", { cache: "no-store" });
    const cyclePayload = await cycleResponse.json();
    const cycle = (cyclePayload.cycles ?? [])[0];
    if (!cycle?.id) {
      setNotice("Create a live cycle before authoring the instrument.");
      return;
    }

    const payload = {
      cycleId: cycle.id,
      competencyId: draft.type === "scale" ? draft.competencyId : null,
      itemType: draft.type,
      body,
      isActive: true,
      displayOrder: Math.max(sortedItems.length, 0),
    };

    const method = editingId ? "PUT" : "POST";
    const response = await fetch("/api/assessments/items", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
    });
    const nextPayload = await response.json();

    if (!response.ok) {
      setNotice(nextPayload?.error ?? "Unable to save item");
      return;
    }

    const savedItem = nextPayload.item as AssessmentInstrumentItem;
    setItems((current) => {
      if (editingId) {
        return current.map((item) => (item.id === editingId ? { ...item, ...savedItem } : item));
      }
      return [...current, { ...savedItem, body: savedItem.body ?? body }];
    });
    setDraft(emptyDraft);
    setEditingId(null);
    setNotice(editingId ? "Item updated." : "Item created.");
  }

  async function toggleActive(itemId: string, active: boolean) {
    const response = await fetch("/api/assessments/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, body: "", itemType: "scale", isActive: active, competencyId: null }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload?.error ?? "Unable to update item");
      return;
    }
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, isActive: active } : item)));
  }

  async function moveItem(itemId: string, direction: "up" | "down") {
    const reordered = reorderInstrumentItems(sortedItems, itemId, direction);
    setItems(reordered);

    for (const [index, item] of reordered.entries()) {
      await fetch("/api/assessments/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          body: item.body,
          itemType: item.itemType,
          competencyId: item.competencyId ?? null,
          displayOrder: index,
          isActive: item.isActive,
        }),
      });
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">360 instrument</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900">Build the assessment instrument</h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            {validation.activeScaleCount} active scale items
          </div>
        </div>

        {notice ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{notice}</div> : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
                <label className="text-sm font-semibold text-slate-700">
                  Item type
                  <select
                    value={draft.type}
                    onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AssessmentInstrumentItemType }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="scale">Scale item</option>
                    <option value="text">Open-text item</option>
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Competency
                  <select
                    value={draft.competencyId}
                    onChange={(event) => setDraft((current) => ({ ...current, competencyId: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select competency</option>
                    {competencies.map((competency) => (
                      <option key={competency.id} value={competency.id}>{competency.name}</option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={saveItem}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    {editingId ? "Save item" : "Add item"}
                  </button>
                </div>
              </div>

              <label className="mt-4 block text-sm font-semibold text-slate-700">
                Item body
                <textarea
                  value={draft.body}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  rows={4}
                  placeholder={draft.type === "scale" ? "This leader communicates a clear direction for the team." : "What should this leader start doing?"}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="space-y-4">
              {groupedItems.map((competency) => (
                <div key={competency.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-slate-900">{competency.name}</h2>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {competency.items.length} active item{competency.items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {competency.items.filter((item) => item.itemType === "scale").length} scale
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {competency.items.length === 0 ? (
                      <p className="text-sm text-slate-500">No items yet for this competency.</p>
                    ) : (
                      competency.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">{item.body}</p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{item.itemType}</p>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => moveItem(item.id!, "up")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold">↑</button>
                              <button type="button" onClick={() => moveItem(item.id!, "down")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold">↓</button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(item.id ?? null);
                                  setDraft({
                                    body: item.body,
                                    type: item.itemType,
                                    competencyId: item.competencyId ?? "",
                                  });
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                              >
                                Edit
                              </button>
                              <button type="button" onClick={() => void toggleActive(item.id!, false)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                                Deactivate
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-black text-slate-900">Standalone open text</h2>
              <div className="mt-3 space-y-2">
                {standaloneTextItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No open-text items yet.</p>
                ) : (
                  standaloneTextItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm text-slate-700">{item.body}</p>
                      <button type="button" onClick={() => void toggleActive(item.id!, false)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Deactivate</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Readiness</p>
              <div className="mt-3 space-y-2">
                {validation.valid ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Instrument is ready to open.</div>
                ) : (
                  validation.errors.map((error) => (
                    <div key={error} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Preview</p>
              <div className="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {groupedItems.map((competency) => (
                  <div key={competency.id}>
                    <p className="text-sm font-black text-slate-900">{competency.name}</p>
                    <div className="mt-2 space-y-2">
                      {competency.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-sm text-slate-700">{item.body}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            <span>1</span>
                            <span>2</span>
                            <span>3</span>
                            <span>4</span>
                            <span>5</span>
                            <span className="ml-auto rounded-full border border-slate-200 px-2 py-1">Unable to Observe</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {standaloneTextItems.length > 0 && (
                  <div>
                    <p className="text-sm font-black text-slate-900">Open text</p>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      {standaloneTextItems.map((item) => (
                        <div key={item.id} className="mb-3 last:mb-0">
                          <p>{item.body}</p>
                          <textarea rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm" placeholder="Write your response here" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
