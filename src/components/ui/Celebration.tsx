"use client";

import clsx from "clsx";

export default function Celebration({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[280] flex justify-center px-4">
      <div className="relative overflow-hidden rounded-full border border-green/20 bg-card px-5 py-3 text-sm font-bold text-green shadow-[var(--shadow-lg)]">
        <span className="relative z-10">{label}</span>
        {Array.from({ length: 8 }, (_, index) => (
          <span
            key={index}
            className={clsx("absolute h-1.5 w-1.5 rounded-full bg-pulse/70 celebration-particle")}
            style={{
              left: `${18 + index * 9}%`,
              top: "50%",
              animationDelay: `${index * 45}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
