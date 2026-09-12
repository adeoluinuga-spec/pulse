"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

export default function ResetPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setLoading(false);

    if (error) {
      showToast("Unable to send reset link. Try again.", "error");
      return;
    }

    setSent(true);
    showToast("Check your email for a reset link", "success");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-lg)] md:p-8">
        <Link href="/auth/login" className="text-xs font-semibold uppercase tracking-widest text-pulse">Back to sign in</Link>
        <h1 className="mt-5 font-syne text-3xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Enter your work email and Pulse will send a secure reset link.
        </p>

        <label className="mt-7 block text-xs font-semibold uppercase tracking-widest text-muted">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="mt-2 h-12 w-full rounded-md border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card"
          />
        </label>

        <button
          type="submit"
          disabled={loading || sent}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {sent ? "Reset link sent" : loading ? "Sending..." : "Send reset link"}
        </button>

        {sent && <p className="mt-4 rounded-lg bg-green-soft px-4 py-3 text-sm font-semibold text-green">Check your email for a reset link.</p>}
      </form>
    </main>
  );
}
