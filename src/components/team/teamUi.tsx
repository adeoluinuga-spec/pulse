"use client";

/* eslint-disable @next/next/no-img-element */

import clsx from "clsx";

import type { Person } from "./teamClient";

export function Avatar({ person, size = "md" }: { person: Pick<Person, "name" | "initials"> & Partial<Person>; size?: "sm" | "md" }) {
  return (
    <div
      className={clsx(
        "flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm ring-2 ring-white",
        size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs",
      )}
      style={{ backgroundColor: person.avatarColor ?? "#245de8" }}
      aria-hidden="true"
    >
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" /> : person.initials}
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-lg border border-border bg-card p-4", className)}>{children}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("rounded-lg border p-4 text-sm", tone === "error" ? "border-red/30 bg-red-soft text-red" : "border-border bg-paper text-muted")}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{children}</p>;
}
