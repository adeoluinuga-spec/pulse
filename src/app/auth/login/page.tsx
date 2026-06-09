"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  Check,
  ChevronRight,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateProfile } from "@/lib/api/profile";
import { useToast } from "@/components/ui/Toast";

type AuthStep = "login" | "otp" | "welcome" | "profile";

interface BootstrapResult {
  status: string;
  role?: string;
  onboardingCompleted?: boolean;
}

const insights = [
  "Consistency compounds faster than intensity.",
  "High-performing teams communicate before problems escalate.",
  "Pulse makes work visible.",
  "Execution is strategy revealed.",
];

const controlledByOrg = [
  "Department",
  "Band",
  "Compensation",
  "Permissions",
  "Reporting structure",
  "Cadre",
  "People responsibility",
];

function isWorkEmail(email: string) {
  const freeProviders = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain.length > 0 && !freeProviders.includes(domain);
}

function firstNameFromEmail(email: string) {
  const local = email.split("@")[0] || "";
  const first = local.split(/[._-]/)[0] || "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function dashboardPath(role?: string) {
  if (role === "hr_admin") return "/dashboard/hr";
  if (role === "executive_view") return "/dashboard/executive";
  return "/dashboard";
}

function isOrgRepresentative(role?: string) {
  return role === "hr_admin" || role === "executive_view";
}

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [nextOfKin, setNextOfKin] = useState("");

  const insight = useMemo(() => insights[new Date().getDate() % insights.length], []);
  const connected = isWorkEmail(email);
  const firstName = useMemo(() => firstNameFromEmail(email), [email]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (error) {
      showToast("Could not send code. Try again in a few minutes.", "error");
      return;
    }

    setStep("otp");
  }

  function updateOtp(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtpDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpDigits.join(""),
      type: "email",
    });
    setLoading(false);

    if (error) {
      showToast("Invalid or expired code. Try again.", "error");
      return;
    }

    showToast("Identity verified", "success");

    // Super admin check
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    const verifiedEmail = verifiedUser?.email?.toLowerCase() ?? "";
    const superAdminEmail = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL ?? "").toLowerCase();

    if (superAdminEmail && verifiedEmail === superAdminEmail) {
      router.replace("/admin");
      return;
    }

    // Get access token to pass explicitly (avoids cookie timing issues)
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";

    // Bootstrap: link or find employee record server-side (service role, bypasses RLS)
    const bootstrapRes = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const bootstrap = bootstrapRes.ok
      ? (await bootstrapRes.json() as BootstrapResult)
      : { status: "error" };

    const role = bootstrap.role;

    if (isOrgRepresentative(role) && !bootstrap.onboardingCompleted) {
      router.replace("/onboarding");
      return;
    }

    if (isOrgRepresentative(role)) {
      router.replace(dashboardPath(role));
      return;
    }

    if (bootstrap.onboardingCompleted) {
      router.replace("/dashboard");
      return;
    }

    // No employee record at all — first time through welcome/profile flow
    setStep("welcome");
  }

  function handlePhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhoto(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await updateProfile({
      phone,
      homeAddress: address,
      emergencyContact: { contact: emergencyContact },
      nextOfKin: { contact: nextOfKin },
      onboardingCompleted: true,
    });
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
    setLoading(false);
    showToast("Profile basics saved. Welcome to Pulse.", "success");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_28rem),linear-gradient(135deg,var(--cream),var(--paper))] text-ink md:grid md:grid-cols-[1.08fr_0.92fr]">
      <section className="relative flex min-h-[50vh] flex-col justify-between overflow-hidden bg-ink px-6 pb-8 pt-7 text-white md:m-6 md:min-h-[calc(100vh-48px)] md:rounded-[38px] md:px-10 md:py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-16 h-80 w-80 animate-pulse rounded-full bg-pulse/18 blur-3xl" />
          <div className="absolute bottom-10 right-[-80px] h-[28rem] w-[28rem] rounded-full bg-white/[0.07] blur-3xl" />
          <div className="absolute left-10 right-10 top-1/2 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
          <div className="absolute bottom-24 left-10 h-40 w-[78%] rounded-full border border-white/10" />
          <div className="absolute bottom-32 left-20 h-24 w-[54%] rounded-full border border-pulse/20" />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pulse font-syne text-lg font-black shadow-[0_0_0_8px_rgba(232,68,10,0.12)]">P</span>
            <div>
              <p className="font-syne text-xl font-extrabold">Pulse</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">Living Work OS</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/62 md:inline-flex">
            Pulse for your organisation
          </span>
        </div>

        <div className="relative z-10 max-w-2xl py-12 md:py-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-pulse">
            <Sparkles size={15} />
            <span className="text-xs font-bold">Pulse intelligence layer</span>
          </div>
          <h1 className="mt-6 max-w-xl font-syne text-[44px] font-bold leading-[0.96] md:text-7xl">
            Work, understood better.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/58">
            A unified intelligent workspace for performance, growth, collaboration, and organizational clarity.
          </p>
        </div>

        <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_0.72fr] md:items-end">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/32">Today&apos;s operating note</p>
            <p className="mt-3 font-syne text-xl font-bold leading-snug text-white">{insight}</p>
          </div>
          <div className="hidden rounded-[24px] border border-white/10 bg-white/[0.045] p-4 md:block">
            <div className="flex items-center justify-between">
              <span className="h-2 w-2 rounded-full bg-pulse shadow-[0_0_0_7px_rgba(232,68,10,0.12)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Live clarity</span>
            </div>
            <div className="mt-6 space-y-2">
              {[72, 48, 88].map((width, index) => (
                <div key={width} className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-pulse/80 transition-all duration-700" style={{ width: `${width - index * 4}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-[50vh] items-center justify-center px-4 py-8 md:min-h-screen md:px-10">
        <div className="w-full max-w-[470px]">
          <Progress step={step} />
          <div className="mt-5 overflow-hidden rounded-[34px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] md:p-8">
            {step === "login" && (
              <form onSubmit={handleLogin} className="animate-fade-up">
                <Eyebrow icon={<Building2 size={14} />} text="Sign in to Pulse" />
                <h2 className="mt-4 font-syne text-3xl font-bold leading-tight text-ink">Sign in to your workspace.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">Sign in with your company credentials. Pulse will connect you to the right workspace automatically.</p>

                <label className="mt-7 block text-xs font-bold uppercase tracking-widest text-muted">
                  Company Email
                  <div className="relative mt-2">
                    <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      placeholder="adeolu@zenithcorp.com"
                      className="h-14 w-full rounded-2xl border border-border bg-paper pl-11 pr-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]"
                    />
                  </div>
                </label>

                <div className={`mt-3 overflow-hidden rounded-2xl border transition-all duration-300 ${connected ? "max-h-28 border-green/20 bg-green-soft/70 p-3 opacity-100" : "max-h-0 border-transparent opacity-0"}`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink font-syne text-sm font-black text-white">Z</span>
                    <div>
                      <p className="text-sm font-black text-green">Work email recognised</p>
                      <p className="text-xs text-muted">Workspace theme and access layer detected.</p>
                    </div>
                  </div>
                </div>

                <PrimaryButton loading={loading} disabled={!email.trim()}>Send Code</PrimaryButton>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={verifyOtp} className="animate-fade-up">
                <Eyebrow icon={<ShieldCheck size={14} />} text="Identity check" />
                <h2 className="mt-4 font-syne text-3xl font-bold leading-tight text-ink">Verify Your Identity</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  We sent a secure verification code to your work email.
                </p>
                <div className="mt-7 grid grid-cols-6 gap-2 md:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(node) => { otpRefs.current[index] = node; }}
                      value={digit}
                      onChange={(event) => updateOtp(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKey(index, event)}
                      inputMode="numeric"
                      maxLength={1}
                      className="h-14 rounded-2xl border border-border bg-paper text-center font-syne text-2xl font-bold text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)] md:h-16"
                    />
                  ))}
                </div>
                <p className="mt-4 rounded-2xl bg-pulse-soft px-4 py-3 text-xs font-bold text-pulse">
                  Check your email — the code expires in 10 minutes.
                </p>
                <PrimaryButton loading={loading} disabled={otpDigits.join("").length < 6}>Verify and continue</PrimaryButton>
              </form>
            )}

            {step === "welcome" && (
              <div className="animate-fade-up">
                <div className="grid h-14 w-14 place-items-center rounded-3xl bg-pulse-soft text-pulse">
                  <Sparkles size={22} />
                </div>
                <h2 className="mt-5 font-syne text-4xl font-bold leading-tight text-ink">Welcome to Pulse, {firstName}.</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  Pulse helps you stay aligned, grow intentionally, receive support, track performance transparently, and work with clarity.
                </p>
                <div className="mt-6 grid gap-2">
                  {["Stay aligned", "Grow intentionally", "Receive support", "Track performance transparently"].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-sm font-bold text-ink">
                      <Check size={16} className="text-green" />
                      {item}
                    </div>
                  ))}
                </div>
                <PrimaryButton onClick={() => setStep("profile")}>Complete Your Profile</PrimaryButton>
              </div>
            )}

            {step === "profile" && (
              <form onSubmit={completeProfile} className="animate-fade-up">
                <Eyebrow icon={<Camera size={14} />} text="Your profile basics" />
                <h2 className="mt-4 font-syne text-3xl font-bold leading-tight text-ink">Complete only what belongs to you.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">Your organization will complete the rest.</p>

                <button type="button" onClick={() => photoInputRef.current?.click()} className="mt-7 flex w-full items-center gap-4 rounded-3xl border border-border bg-paper p-4 text-left transition hover:border-pulse/35 hover:bg-card active:scale-[0.99]">
                  <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-ink text-sm font-black text-white ring-4 ring-white">
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : firstName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-ink">Profile photo</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">Add an executive-style image or keep initials for now.</span>
                  </span>
                  <Camera size={18} className="text-pulse" />
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />

                <div className="mt-5 grid gap-3">
                  <TextField label="Phone Number" value={phone} onChange={setPhone} placeholder="+234 801 234 5678" />
                  <TextField label="Address" value={address} onChange={setAddress} placeholder="Home address" />
                  <TextField label="Emergency Contact" value={emergencyContact} onChange={setEmergencyContact} placeholder="Name, relationship, phone" />
                  <TextField label="Next of Kin" value={nextOfKin} onChange={setNextOfKin} placeholder="Name and phone" />
                </div>

                <div className="mt-5 rounded-3xl border border-border bg-paper p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted">Controlled by HR/IT</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {controlledByOrg.map((item) => (
                      <span key={item} className="rounded-full bg-card px-3 py-1.5 text-[11px] font-bold text-muted">{item}</span>
                    ))}
                  </div>
                </div>

                <PrimaryButton disabled={!phone.trim() || !address.trim() || !emergencyContact.trim() || !nextOfKin.trim()}>
                  Enter Pulse
                </PrimaryButton>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Progress({ step }: { step: AuthStep }) {
  const steps: AuthStep[] = ["login", "otp", "welcome", "profile"];
  const current = steps.indexOf(step);

  return (
    <div className="flex items-center gap-2 px-1">
      {steps.map((item, index) => (
        <div key={item} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full bg-pulse transition-all duration-500 ${index <= current ? "w-full" : "w-0"}`} />
        </div>
      ))}
    </div>
  );
}

function Eyebrow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-pulse-soft px-3 py-2 text-pulse">
      {icon}
      <span className="text-xs font-black">{text}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  loading = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={loading || disabled}
      className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition hover:shadow-[0_22px_42px_rgba(232,68,10,0.26)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading ? <Loader2 size={17} className="animate-spin" /> : null}
      {children}
      {!loading ? <ChevronRight size={16} /> : null}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest text-muted">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]"
      />
    </label>
  );
}
