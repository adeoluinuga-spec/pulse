"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, Check, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

interface OrgForm {
  name: string;
  slug: string;
  currency: string;
  cadence: string;
  hrAdminEmail: string;
  firstInviteeRole: string;
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminPage() {
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL ?? "";

  const [form, setForm] = useState<OrgForm>({
    name: "",
    slug: "",
    currency: "NGN",
    cadence: "quarterly",
    hrAdminEmail: "",
    firstInviteeRole: "hr_admin",
  });

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        setAuthEmail(data.user?.email ?? null);
        setLoading(false);
      });
  }, []);

  const isAuthorised = authEmail === superAdminEmail;

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: toSlug(name) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/create-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
      } else {
        setDone(json.message ?? "Organisation created.");
        setForm({ name: "", slug: "", currency: "NGN", cadence: "quarterly", hrAdminEmail: "", firstInviteeRole: "hr_admin" });
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <Loader2 className="animate-spin text-muted" size={24} />
      </main>
    );
  }

  if (!isAuthorised) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-red-soft text-red">
            <ShieldAlert size={28} />
          </div>
          <h1 className="font-syne text-2xl font-bold text-ink">Access Denied</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            This page is restricted to Pulse super administrators.
            {authEmail && (
              <>
                <br />
                <span className="mt-2 block font-mono text-xs text-muted/60">
                  {authEmail}
                </span>
              </>
            )}
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-ink px-6 text-sm font-bold text-white"
          >
            Back to Dashboard
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_28rem),linear-gradient(135deg,var(--cream),var(--paper))] px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pulse font-syne text-lg font-black text-white shadow-[0_0_0_8px_rgba(232,68,10,0.12)]">
            P
          </span>
          <div>
            <p className="font-syne text-xl font-extrabold text-ink">Pulse Admin</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              Onboard a new organisation
            </p>
          </div>
        </div>

        {/* Success banner */}
        {done && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-green/20 bg-green-soft p-4">
            <div className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-green text-white">
              <Check size={13} />
            </div>
            <p className="text-sm font-semibold text-green">{done}</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red/20 bg-red-soft p-4">
            <p className="text-sm font-semibold text-red">{error}</p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] md:p-8"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-pulse-soft px-3 py-2 text-pulse">
            <Building2 size={14} />
            <span className="text-xs font-black">Create New Organisation</span>
          </div>

          <div className="space-y-4">
            <Field label="Organisation Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                placeholder="Zenith Corp"
                className={inputCls}
              />
            </Field>

            <Field label="URL Slug" hint="Auto-generated, edit if needed" required>
              <input
                type="text"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slug: toSlug(e.target.value) }))
                }
                required
                placeholder="zenith-corp"
                pattern="[a-z0-9-]+"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className={inputCls}
                >
                  <option value="NGN">NGN — Nigerian Naira</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="GHS">GHS — Ghanaian Cedi</option>
                  <option value="ZAR">ZAR — South African Rand</option>
                </select>
              </Field>

              <Field label="Appraisal Cadence">
                <select
                  value={form.cadence}
                  onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))}
                  className={inputCls}
                >
                  <option value="quarterly">Quarterly</option>
                  <option value="bi-annual">Bi-annual</option>
                  <option value="annual">Annual</option>
                </select>
              </Field>
            </div>

            <Field label="First Invitee Email" hint="This person gets the first invite" required>
              <input
                type="email"
                value={form.hrAdminEmail}
                onChange={(e) => setForm((f) => ({ ...f, hrAdminEmail: e.target.value }))}
                required
                placeholder="hr@company.com"
                className={inputCls}
              />
            </Field>

            <Field label="Their Role" hint="Determines what they can see and do">
              <select
                value={form.firstInviteeRole}
                onChange={(e) => setForm((f) => ({ ...f, firstInviteeRole: e.target.value }))}
                className={inputCls}
              >
                <option value="hr_admin">HR Admin — manages people, invites, appraisals</option>
                <option value="executive_view">Executive — sees org-wide performance overview</option>
              </select>
            </Field>
          </div>

          <button
            type="submit"
            disabled={submitting || !form.name || !form.slug || !form.hrAdminEmail}
            className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <>
                Create Organisation
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Signed in as{" "}
          <span className="font-mono font-bold text-pulse">{authEmail}</span>
        </p>
      </div>
    </main>
  );
}

const inputCls =
  "mt-1.5 h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">
        {label}
        {required && <span className="ml-1 text-pulse">*</span>}
      </span>
      {hint && <span className="ml-2 text-[10px] text-muted/60">{hint}</span>}
      {children}
    </label>
  );
}
