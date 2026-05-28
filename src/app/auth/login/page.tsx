"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      showToast("Invalid email or password", "error");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-paper px-4 py-6 md:grid-cols-[1.08fr_0.92fr] md:p-6">
      <section className="flex min-h-[42vh] flex-col justify-between rounded-[32px] bg-ink p-7 text-white shadow-[var(--shadow-lg)] md:min-h-[calc(100vh-48px)] md:p-10">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pulse font-syne text-lg font-black">P</span>
          <div>
            <p className="font-syne text-xl font-extrabold">Pulse</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">Living Work OS</p>
          </div>
        </div>

        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-pulse">
            <Sparkles size={16} />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">Welcome back</p>
          </div>
          <h1 className="mt-4 font-syne text-4xl font-bold leading-tight md:text-6xl">
            Step into your work rhythm.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/58">
            Performance, goals, coaching, and wellbeing in one calm operating layer.
          </p>
        </div>

        <p className="text-xs text-white/35">Invite-only access for companies onboarded to Pulse.</p>
      </section>

      <section className="flex items-center justify-center px-1 py-8 md:px-10">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] border border-border bg-card p-6 shadow-sm md:p-8">
          <h2 className="font-syne text-2xl font-bold text-ink">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Use the email and password provided by your organization.</p>

          <label className="mt-7 block text-xs font-bold uppercase tracking-widest text-muted">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card"
            />
          </label>

          <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_14px_28px_rgba(232,68,10,0.22)] transition active:scale-[0.97] disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <Link href="/auth/reset" className="mt-5 block text-center text-sm font-bold text-muted transition hover:text-pulse">
            Forgot password?
          </Link>
        </form>
      </section>
    </main>
  );
}
