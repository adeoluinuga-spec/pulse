"use client";

import type { ReactNode } from "react";
import { ClipboardList, LockKeyhole, MailCheck } from "lucide-react";

import My360StatusCard from "@/components/assessments/My360StatusCard";

export default function My360DashboardPage() {
  return (
    <main className="dashboard-page space-y-5 px-4 pb-8 md:px-7">
      <section className="rounded-lg bg-ink p-5 text-white md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-white">
            <ClipboardList size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">My 360 assessment</p>
            <h1 className="mt-2 font-syne text-3xl font-bold leading-tight">Your current 360 status</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
              This is your personal view of active assessment cycles, reviewer requests, and released reports.
            </p>
          </div>
        </div>
      </section>

      <My360StatusCard />

      <section className="grid gap-3 md:grid-cols-2">
        <InfoPanel
          icon={<MailCheck size={18} />}
          title="Review links stay in email"
          body="Each feedback request uses a private, single-use invitation link. Pulse will show that a request exists, but the review itself opens from the secure email."
        />
        <InfoPanel
          icon={<LockKeyhole size={18} />}
          title="Reports appear only after release"
          body="Your individual report remains hidden until the review process is complete and HR releases it according to the cycle rules."
        />
      </section>
    </main>
  );
}

function InfoPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-cobalt-light text-cobalt">
        {icon}
      </div>
      <p className="text-sm font-black text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
    </div>
  );
}
