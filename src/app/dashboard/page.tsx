"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";
import { useUser } from "@/context/UserContext";
import type { Employee } from "@/types";

function dashboardFor(user: Employee): string {
  if (user.platformRole === "hr_admin" || user.platformRole === "super_admin") {
    return "/dashboard/hr";
  }
  if (user.platformRole === "executive_view" || user.cadre === "executive") {
    return "/dashboard/executive";
  }
  if (user.peopleResponsibility !== "none") return "/dashboard/manager";
  return "/dashboard/employee";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, session, loading } = useUser();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/auth/login");
      return;
    }
    if (user.id === "unlinked") return;
    router.replace(dashboardFor(user));
  }, [loading, router, session, user]);

  if (!loading && session && user.id === "unlinked") {
    return (
      <main className="min-h-screen bg-paper px-4 py-10">
        <section className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-pulse-soft text-pulse">
            <ShieldAlert size={20} />
          </div>
          <h1 className="text-lg font-bold text-ink">Workspace not linked</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This account is signed in, but it is not attached to an organisation
            employee record yet. Ask your HR admin or super admin to resend the
            invite for this email.
          </p>
          <Link
            href="/auth/login"
            className="mt-5 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Return to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm text-muted">
        <Loader2 size={18} className="animate-spin text-pulse" />
        Opening your workspace...
      </section>
    </main>
  );
}
