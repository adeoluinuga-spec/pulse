"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";
import { useUser } from "@/context/UserContext";

const themes = [
  { name: "Executive Cream", tone: "bg-cream", text: "Warm, spacious, boardroom calm." },
  { name: "Midnight Focus", tone: "bg-ink text-white", text: "Deep focus for executive review sessions." },
  { name: "Warm Paper", tone: "bg-paper", text: "Soft paper texture for daily operating rhythm." },
  { name: "Graphite Pro", tone: "bg-[#24211f] text-white", text: "Restrained contrast with premium depth." },
  { name: "Deep Focus", tone: "bg-[#14110f] text-white", text: "Quiet command-center mood." },
];

const backgrounds = [
  "Soft gradient",
  "Layered paper texture",
  "Calm abstract field",
  "Muted executive glow",
];

export default function SettingsPage() {
  const { user } = useUser();
  const [theme, setTheme] = useState(themes[0].name);
  const [background, setBackground] = useState(backgrounds[0]);

  return (
    <main className="dashboard-page space-y-6 px-4 md:px-7">
      <section className="rounded-[28px] bg-ink p-6 text-white">
        <div className="flex items-center gap-2 text-pulse">
          <Sparkles size={15} />
          <p className="text-xs font-bold uppercase tracking-[0.18em]">Personalization</p>
        </div>
        <h1 className="mt-3 font-syne text-3xl font-bold">Make Pulse feel like your work rhythm.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
          These settings are session-based for now. They preview the premium, restrained personalization layer planned for each employee.
        </p>
      </section>

      <section>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Curated Themes</p>
        <div className="grid gap-3 md:grid-cols-3">
          {themes.map((item) => (
            <button key={item.name} onClick={() => setTheme(item.name)} className={clsx("relative min-h-36 rounded-[24px] border p-4 text-left shadow-sm transition", item.tone, theme === item.name ? "border-pulse" : "border-border")}>
              {theme === item.name && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-pulse text-white"><Check size={14} /></span>}
              <p className="font-syne text-lg font-bold">{item.name}</p>
              <p className={clsx("mt-2 text-sm", item.tone.includes("text-white") ? "text-white/58" : "text-muted")}>{item.text}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Ambient Background</p>
        <div className="rounded-[24px] border border-border bg-card p-4">
          <div className="grid gap-2 md:grid-cols-4">
            {backgrounds.map((item) => (
              <button key={item} onClick={() => setBackground(item)} className={clsx("rounded-2xl border px-4 py-4 text-left text-sm font-bold", background === item ? "border-pulse bg-pulse-soft text-pulse" : "border-border bg-paper text-muted")}>{item}</button>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-[22px] border border-border bg-[radial-gradient(circle_at_20%_10%,rgba(232,68,10,0.12),transparent_34%),linear-gradient(135deg,var(--cream),var(--paper))] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Preview for {user.name}</p>
            <p className="mt-2 font-syne text-2xl font-bold text-ink">{theme}</p>
            <p className="mt-1 text-sm text-muted">{background}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
