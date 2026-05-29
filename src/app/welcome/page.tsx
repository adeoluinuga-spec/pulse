"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ClipboardList,
  Heart,
  Loader2,
  Upload,
  User,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

interface PersonalForm {
  phone: string;
  homeAddress: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
}

const ORIENTATION_CARDS = [
  {
    icon: ClipboardList,
    title: "Submit your weekly report every Friday",
    body: "Capture your wins, blockers, and what support you need. Takes under 5 minutes.",
    color: "bg-pulse-soft text-pulse",
  },
  {
    icon: BarChart2,
    title: "Update your goal progress when things change",
    body: "Keep your goals current so your manager sees the real picture, not a snapshot.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Heart,
    title: "Complete your wellbeing check-in each week",
    body: "A one-question pulse check so Pulse can flag if the team needs support.",
    color: "bg-green-soft text-green",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [platformRole, setPlatformRole] = useState("standard");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState<PersonalForm>({
    phone: "",
    homeAddress: "",
    emergencyName: "",
    emergencyPhone: "",
    emergencyRelation: "",
  });

  useEffect(() => {
    async function load() {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login?error=no_session");
        return;
      }

      // Find the employee record (may have been pre-created by HR with user_id=null)
      const { data: emp } = await supabase
        .from("employees")
        .select("id, name, phone, home_address, emergency_contact, avatar_url, user_id, platform_role")
        .or(`user_id.eq.${user.id},email.eq.${user.email}`)
        .single();

      if (!emp) {
        router.replace("/auth/login?error=no_account");
        return;
      }

      // Link user_id if not yet set
      if (!emp.user_id) {
        await supabase
          .from("employees")
          .update({ user_id: user.id })
          .eq("id", emp.id);
      }

      const ec = emp.emergency_contact as {
        name?: string;
        phone?: string;
        relation?: string;
      } | null;

      setEmployeeId(emp.id);
      setEmployeeName(emp.name ?? "");
      setPlatformRole((emp as { platform_role?: string }).platform_role ?? "standard");
      setAvatarUrl(emp.avatar_url ?? null);
      setForm({
        phone: emp.phone ?? "",
        homeAddress: emp.home_address ?? "",
        emergencyName: ec?.name ?? "",
        emergencyPhone: ec?.phone ?? "",
        emergencyRelation: ec?.relation ?? "",
      });
      setLoading(false);
    }

    load();
  }, [router]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return;
    setError("");
    setSaving(true);

    try {
      const supabase = getSupabase();
      let uploadedUrl = avatarUrl;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `${employeeId}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });

        if (!upErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          uploadedUrl = pub.publicUrl;
        }
      }

      const { error: saveErr } = await supabase
        .from("employees")
        .update({
          phone: form.phone || null,
          home_address: form.homeAddress || null,
          emergency_contact: form.emergencyName
            ? {
                name: form.emergencyName,
                phone: form.emergencyPhone,
                relation: form.emergencyRelation,
              }
            : null,
          ...(uploadedUrl ? { avatar_url: uploadedUrl } : {}),
        })
        .eq("id", employeeId);

      if (saveErr) {
        setError("Could not save your details. Try again.");
        return;
      }

      setStep(2);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <Loader2 className="animate-spin text-muted" size={24} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_28rem),linear-gradient(135deg,var(--cream),var(--paper))] px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        {/* Logo + greeting */}
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pulse font-syne text-lg font-black text-white shadow-[0_0_0_8px_rgba(232,68,10,0.12)]">
            P
          </span>
          <div>
            <p className="font-syne text-xl font-extrabold text-ink">
              Welcome to Pulse{employeeName ? `, ${employeeName.split(" ")[0]}` : ""}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              {step === 1 ? "Step 1 of 2 — Your details" : "Step 2 of 2 — How Pulse works"}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s <= step ? "bg-pulse" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Personal Details ── */}
        {step === 1 && (
          <form
            onSubmit={handleStep1Submit}
            className="rounded-[28px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] md:p-8"
          >
            <p className="mb-5 text-sm leading-relaxed text-muted">
              HR has already set up your profile. Confirm or update your personal
              details — this information is only visible to you and HR.
            </p>

            {/* Avatar upload */}
            <div className="mb-6 flex items-center gap-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="relative grid h-16 w-16 cursor-pointer place-items-center overflow-hidden rounded-full bg-pulse-soft text-pulse ring-2 ring-pulse/20 transition hover:ring-pulse/40"
              >
                {avatarPreview || avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreview ?? avatarUrl ?? ""}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User size={24} />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
                  <Upload size={14} className="text-white" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Profile photo</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-0.5 text-xs font-bold text-pulse underline-offset-2 hover:underline"
                >
                  Upload photo (optional)
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <div className="space-y-4">
              <Field label="Phone number">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+234 800 000 0000"
                  className={inputCls}
                />
              </Field>

              <Field label="Home address">
                <input
                  type="text"
                  value={form.homeAddress}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, homeAddress: e.target.value }))
                  }
                  placeholder="123 Example Street, Lagos"
                  className={inputCls}
                />
              </Field>

              <div className="rounded-2xl border border-border bg-paper p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
                  Emergency Contact
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={form.emergencyName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emergencyName: e.target.value }))
                    }
                    placeholder="Contact name"
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="tel"
                      value={form.emergencyPhone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, emergencyPhone: e.target.value }))
                      }
                      placeholder="Phone number"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={form.emergencyRelation}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, emergencyRelation: e.target.value }))
                      }
                      placeholder="Relation (e.g. Spouse)"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl border border-red/20 bg-red-soft px-4 py-3 text-sm font-semibold text-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  Save &amp; Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ── Step 2: Orientation ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] md:p-8">
              <p className="mb-6 text-sm leading-relaxed text-muted">
                There are three things to stay on top of in Pulse. That&apos;s it.
              </p>

              <div className="space-y-4">
                {ORIENTATION_CARDS.map((card, i) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={i}
                      className="flex gap-4 rounded-2xl border border-border bg-paper p-4"
                    >
                      <div
                        className={`mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${card.color}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-ink">{card.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{card.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-2xl bg-pulse-soft px-4 py-3">
                <CheckCircle2 size={16} className="flex-shrink-0 text-pulse" />
                <p className="text-xs font-semibold text-pulse">
                  Your profile is all set. Your manager can now see your goals and
                  reports.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                if (platformRole === "hr_admin") router.replace("/hr");
                else if (platformRole === "executive_view") router.replace("/executive");
                else router.replace("/dashboard");
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition"
            >
              Got it — Let&apos;s go
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
