"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, SlidersHorizontal } from "lucide-react";
import { useUser } from "@/context/UserContext";

const themes = [
  { name: "Finance OS", tone: "bg-surface", text: "White surfaces, cool greys, cobalt actions." },
  { name: "Board Review", tone: "bg-paper-50", text: "Dense reporting with low visual noise." },
  { name: "Operations", tone: "bg-cobalt-light", text: "Blue-tinted focus for active work sessions." },
  { name: "Audit Desk", tone: "bg-paper-100", text: "Neutral review mode for HR governance." },
  { name: "Executive", tone: "bg-ink text-white", text: "High-contrast mode for presentation rooms." },
];

const backgrounds = [
  "Plain white",
  "Near-white banding",
  "Compact console",
  "Board pack",
];

export default function SettingsPage() {
  const { user } = useUser();
  const [theme, setTheme] = useState(themes[0].name);
  const [background, setBackground] = useState(backgrounds[0]);

  return (
    <main className="dashboard-page space-y-5">
      <section className="rounded-lg border border-paper-200 bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-2 text-cobalt">
          <SlidersHorizontal size={15} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">Personalization</p>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-ink">Workspace appearance</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          A clear, consistent workspace with navy highlights, cobalt actions and calm surfaces, inspired by your performance reviews.
        </p>
      </section>

      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Curated themes</p>
        <div className="grid gap-3 md:grid-cols-3">
          {themes.map((item) => (
            <button key={item.name} onClick={() => setTheme(item.name)} className={clsx("relative min-h-32 rounded-lg border p-4 text-left shadow-sm transition", item.tone, theme === item.name ? "border-cobalt" : "border-paper-200")}>
              {theme === item.name && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-cobalt text-white"><Check size={13} /></span>}
              <p className="text-base font-semibold">{item.name}</p>
              <p className={clsx("mt-2 text-sm", item.tone.includes("text-white") ? "text-white/65" : "text-muted")}>{item.text}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Workspace background</p>
        <div className="rounded-lg border border-paper-200 bg-surface p-4 shadow-sm">
          <div className="grid gap-2 md:grid-cols-4">
            {backgrounds.map((item) => (
              <button key={item} onClick={() => setBackground(item)} className={clsx("rounded-md border px-4 py-3 text-left text-sm font-semibold", background === item ? "border-cobalt bg-cobalt-light text-cobalt-dark" : "border-paper-200 bg-paper-50 text-muted")}>{item}</button>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-paper-200 bg-paper-50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Preview for {user.name}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{theme}</p>
            <p className="mt-1 text-sm text-muted">{background}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
