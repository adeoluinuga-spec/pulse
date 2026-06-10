"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgForm {
  name: string;
  slug: string;
  currency: string;
  cadence: string;
  hrAdminEmail: string;
  executiveEmail: string;
}

interface OrgMetrics {
  id: string;
  name: string;
  slug: string;
  currency: string;
  appraisalCadence: string;
  createdAt: string;
  employeeCount: number;
  hrCount: number;
  execCount: number;
  goalCount: number;
  activeCycle: string | null;
}

type Tab = "orgs" | "create";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const inputCls =
  "mt-1.5 h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]";

// ── Root page ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL ?? "";

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      setAuthEmail(data.user?.email ?? null);
      setLoading(false);
    });
  }, []);

  const isAuthorised =
    authEmail !== null &&
    superAdminEmail !== "" &&
    authEmail.toLowerCase() === superAdminEmail.toLowerCase();

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
              <span className="mt-2 block font-mono text-xs text-muted/60">{authEmail}</span>
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

  return <AdminDashboard authEmail={authEmail!} />;
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

function AdminDashboard({ authEmail }: { authEmail: string }) {
  const [tab, setTab] = useState<Tab>("orgs");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_28rem),linear-gradient(135deg,var(--cream),var(--paper))] px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pulse font-syne text-lg font-black text-white shadow-[0_0_0_8px_rgba(232,68,10,0.12)]">
              P
            </span>
            <div>
              <p className="font-syne text-xl font-extrabold text-ink">Pulse Admin</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                Super Admin Console
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted md:block">
            {authEmail}
          </span>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex rounded-2xl border border-border bg-card p-1">
          <TabBtn active={tab === "orgs"} onClick={() => setTab("orgs")}>
            <Building2 size={14} />
            Organisations
          </TabBtn>
          <TabBtn active={tab === "create"} onClick={() => setTab("create")}>
            <Plus size={14} />
            Add Organisation
          </TabBtn>
        </div>

        {tab === "orgs" ? <OrgListView /> : <CreateOrgView onCreated={() => setTab("orgs")} />}
      </div>
    </main>
  );
}

// ── Organisation list ──────────────────────────────────────────────────────────

function OrgListView() {
  const [orgs, setOrgs] = useState<OrgMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orgs");
      const json = (await res.json()) as { orgs?: OrgMetrics[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setOrgs(json.orgs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organisations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch("/api/admin/orgs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Delete failed");
      }
      setOrgs((prev) => prev.filter((o) => o.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-soft px-4 py-3 text-sm font-semibold text-red">
        {error}
      </div>
    );
  }

  if (!orgs.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-card py-20 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-pulse-soft text-pulse">
          <Building2 size={22} />
        </div>
        <p className="font-syne text-xl font-bold text-ink">No organisations yet</p>
        <p className="mt-2 text-sm text-muted">
          Create your first organisation using the Add Organisation tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
        {orgs.length} organisation{orgs.length !== 1 ? "s" : ""}
      </p>

      {orgs.map((org) => {
        const isExpanded = expandedId === org.id;
        const isConfirm = confirmDeleteId === org.id;
        const isDeleting = deletingId === org.id;

        return (
          <div
            key={org.id}
            className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm"
          >
            {/* Row */}
            <div className="flex items-center gap-3 p-5">
              {/* Avatar */}
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-pulse-soft font-syne text-base font-black text-pulse">
                {org.name.slice(0, 1).toUpperCase()}
              </div>

              {/* Name + slug — click to expand */}
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpandedId(isExpanded ? null : org.id)}
              >
                <p className="truncate font-syne text-base font-bold text-ink">{org.name}</p>
                <p className="text-xs text-muted">
                  {org.slug} · {org.currency} · {org.appraisalCadence}
                </p>
              </button>

              {/* Quick stats */}
              <div className="hidden items-center gap-2 md:flex">
                <Chip icon={<Users size={11} />} label={`${org.employeeCount} staff`} />
                {org.activeCycle && (
                  <Chip icon={<TrendingUp size={11} />} label={org.activeCycle} />
                )}
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : org.id)}
                className="flex-shrink-0 rounded-xl p-2 text-muted transition hover:bg-paper hover:text-ink"
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {/* Delete */}
              {isConfirm ? (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleDelete(org.id)}
                    disabled={isDeleting}
                    className="rounded-xl bg-red px-3 py-2 text-xs font-bold text-white"
                  >
                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-xl bg-paper px-3 py-2 text-xs font-bold text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDelete(org.id)}
                  disabled={isDeleting}
                  className="flex-shrink-0 rounded-xl p-2 text-muted transition hover:bg-red-soft hover:text-red"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Expanded detail panel */}
            {isExpanded && (
              <div className="border-t border-border bg-paper px-5 py-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricTile
                    icon={<Users size={15} />}
                    label="Total Staff"
                    value={org.employeeCount}
                  />
                  <MetricTile
                    icon={<ShieldCheck size={15} />}
                    label="HR Admins"
                    value={org.hrCount}
                  />
                  <MetricTile
                    icon={<TrendingUp size={15} />}
                    label="Executives"
                    value={org.execCount}
                  />
                  <MetricTile
                    icon={<Target size={15} />}
                    label="Active Goals"
                    value={org.goalCount}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <InfoBadge label="Cadence" value={org.appraisalCadence} />
                  <InfoBadge label="Currency" value={org.currency} />
                  {org.activeCycle && (
                    <InfoBadge label="Active Cycle" value={org.activeCycle} />
                  )}
                  <InfoBadge
                    label="Created"
                    value={new Date(org.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Create organisation form ───────────────────────────────────────────────────

function CreateOrgView({ onCreated }: { onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<OrgForm>({
    name: "",
    slug: "",
    currency: "NGN",
    cadence: "quarterly",
    hrAdminEmail: "",
    executiveEmail: "",
  });

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
        setForm({ name: "", slug: "", currency: "NGN", cadence: "quarterly", hrAdminEmail: "", executiveEmail: "" });
        setTimeout(onCreated, 1500);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {done && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-green/20 bg-green-soft p-4">
          <div className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-green text-white">
            <Check size={13} />
          </div>
          <p className="text-sm font-semibold text-green">{done}</p>
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-2xl border border-red/20 bg-red-soft p-4">
          <p className="text-sm font-semibold text-red">{error}</p>
        </div>
      )}

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
              placeholder="Acme Ltd"
              className={inputCls}
            />
          </Field>

          <Field label="URL Slug" hint="Auto-generated, edit if needed" required>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: toSlug(e.target.value) }))}
              required
              placeholder="acme-ltd"
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

          <Field label="HR Admin Email" hint="Invited into org setup flow">
            <input
              type="email"
              value={form.hrAdminEmail}
              onChange={(e) => setForm((f) => ({ ...f, hrAdminEmail: e.target.value }))}
              placeholder="hr@company.com"
              className={inputCls}
            />
          </Field>

          <Field label="Executive Email" hint="CEO, MD, or COO — invited into executive view">
            <input
              type="email"
              value={form.executiveEmail}
              onChange={(e) => setForm((f) => ({ ...f, executiveEmail: e.target.value }))}
              placeholder="ceo@company.com"
              className={inputCls}
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={submitting || !form.name || !form.slug || (!form.hrAdminEmail && !form.executiveEmail)}
          className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <>
              Create Organisation & Send Invites
              <ChevronRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors ${
        active ? "bg-ink text-white" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-muted">
      {icon}
      {label}
    </span>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="font-syne text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs">
      <span className="font-bold uppercase tracking-widest text-muted">{label}: </span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

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
