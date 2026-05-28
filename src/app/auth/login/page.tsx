"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronRight, Loader2, Mail, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { employees } from "@/data/mockData";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

type AuthStep = "email" | "phone" | "otp" | "welcome" | "profile";

const insights = [
  "Visibility creates accountability.",
  "Growth compounds through consistency.",
  "High-performing teams communicate early.",
  "Pulse helps organizations see what matters.",
  "Alignment is calmer when the work is visible.",
];

const organizationThemes = [
  { match: "harvesters", name: "Harvesters", message: "Welcome into a calmer rhythm for ministry and execution." },
  { match: "episode", name: "Episode Interiors", message: "A thoughtful operating layer for beautiful work." },
  { match: "zenithcorp", name: "Zenith Corp", message: "Your intelligent workspace for performance, support, and progress." },
];

function organizationFromEmail(email: string) {
  const lower = email.toLowerCase();
  return organizationThemes.find((org) => lower.includes(org.match)) ?? {
    name: "your organization",
    message: "Your intelligent workspace for performance, support, and progress.",
  };
}

function firstNameFromEmail(email: string) {
  const employee = employees.find((emp) => emp.email.toLowerCase() === email.toLowerCase());
  if (employee) return employee.name.split(" ")[0];
  return email.split("@")[0]?.split(/[._-]/)[0] || "there";
}

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [nextOfKin, setNextOfKin] = useState("");

  const insight = useMemo(() => insights[new Date().getDate() % insights.length], []);
  const organization = useMemo(() => organizationFromEmail(email), [email]);
  const firstName = useMemo(() => firstNameFromEmail(email), [email]);

  function continueFromEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@")) {
      showToast("Enter your company email", "warning");
      return;
    }
    setStep("phone");
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phone.trim().length < 7) {
      showToast("Enter a valid phone number", "warning");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    setLoading(false);

    if (error) {
      showToast("We could not send your access code. Please check your email.", "error");
      return;
    }

    setStep("otp");
    showToast("Access code sent to your email", "success");
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.replace(/\s/g, ""),
      type: "email",
    });
    setLoading(false);

    if (error) {
      showToast("Invalid or expired access code", "error");
      return;
    }

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

  function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showToast("Profile basics saved. Welcome to Pulse.", "success");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-paper text-ink md:grid md:grid-cols-[1.05fr_0.95fr]">
      <section className="relative flex min-h-[48vh] flex-col justify-between overflow-hidden bg-ink px-6 pb-8 pt-7 text-white md:m-6 md:min-h-[calc(100vh-48px)] md:rounded-[36px] md:px-10 md:py-10">
        <div className="absolute inset-0 opacity-80">
          <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-pulse/20 blur-3xl" />
          <div className="absolute bottom-12 right-0 h-96 w-96 rounded-full bg-white/8 blur-3xl" />
          <div className="absolute inset-x-10 bottom-1/4 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-pulse font-syne text-lg font-black shadow-[0_0_0_8px_rgba(232,68,10,0.12)]">P</span>
            <div>
              <p className="font-syne text-xl font-extrabold">Pulse</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">Living Work OS</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/58 md:inline-flex">
            Pulse for {organization.name}
          </span>
        </div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-pulse">
            <Sparkles size={15} />
            <span className="text-xs font-bold">Pulse noticed</span>
          </div>
          <h1 className="mt-6 max-w-xl font-syne text-[42px] font-bold leading-[0.96] tracking-normal md:text-7xl">
            Enter your intelligent work life.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/58">
            {insight} Pulse brings growth, alignment, support, and transparent progress into one calm workspace.
          </p>
        </div>

        <div className="relative z-10 grid gap-3 text-sm text-white/54 md:grid-cols-3">
          {["Growth", "Alignment", "Support"].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur">
              <p className="font-bold text-white">{item}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/40">Quiet intelligence for daily execution.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-[52vh] items-center justify-center px-4 py-8 md:min-h-screen md:px-10">
        <div className="w-full max-w-[470px]">
          <Progress step={step} />
          <div className="mt-5 overflow-hidden rounded-[32px] border border-border bg-card/96 p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] backdrop-blur md:p-8">
            {step === "email" && (
              <form onSubmit={continueFromEmail} className="animate-fade-up">
                <Eyebrow icon={<Mail size={14} />} text="Company access" />
                <h2 className="mt-4 font-syne text-3xl font-bold text-ink">Start with your company email.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">Pulse is invite-only. Your organization controls role, reporting line, band, and permissions.</p>
                <label className="mt-7 block text-xs font-bold uppercase tracking-widest text-muted">
                  Company Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="mt-2 h-14 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]"
                  />
                </label>
                <PrimaryButton loading={loading}>Continue</PrimaryButton>
              </form>
            )}

            {step === "phone" && (
              <form onSubmit={requestOtp} className="animate-fade-up">
                <Eyebrow icon={<Phone size={14} />} text={`Pulse for ${organization.name}`} />
                <h2 className="mt-4 font-syne text-3xl font-bold text-ink">Add your phone number.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{organization.message} We use this to keep your profile current and support future secure verification.</p>
                <label className="mt-7 block text-xs font-bold uppercase tracking-widest text-muted">
                  Phone Number
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="+234 801 234 5678"
                    className="mt-2 h-14 w-full rounded-2xl border border-border bg-paper px-4 text-base font-medium text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]"
                  />
                </label>
                <PrimaryButton loading={loading}>Send access code</PrimaryButton>
                <button type="button" onClick={() => setStep("email")} className="mt-4 text-sm font-bold text-muted hover:text-pulse">Use a different email</button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={verifyOtp} className="animate-fade-up">
                <Eyebrow icon={<ShieldCheck size={14} />} text="Secure verification" />
                <h2 className="mt-4 font-syne text-3xl font-bold text-ink">Enter your access code.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">We sent a one-time code to <span className="font-bold text-ink">{email}</span>.</p>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="mt-7 h-16 w-full rounded-3xl border border-border bg-paper px-5 text-center font-syne text-3xl font-bold tracking-[0.32em] text-ink outline-none transition focus:border-pulse focus:bg-card focus:shadow-[0_0_0_4px_var(--pulse-soft)]"
                />
                <PrimaryButton loading={loading} disabled={otp.length < 6}>Verify and continue</PrimaryButton>
                <button type="button" onClick={() => setStep("phone")} className="mt-4 text-sm font-bold text-muted hover:text-pulse">Edit phone number</button>
              </form>
            )}

            {step === "welcome" && (
              <div className="animate-fade-up">
                <div className="grid h-14 w-14 place-items-center rounded-3xl bg-pulse-soft text-pulse">
                  <Sparkles size={22} />
                </div>
                <h2 className="mt-5 font-syne text-4xl font-bold leading-tight text-ink">Welcome to Pulse, {firstName}.</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  Pulse helps employees grow, stay aligned, receive support, track progress, and succeed transparently.
                </p>
                <div className="mt-6 grid gap-2">
                  {["Growth without guesswork", "Support before work feels heavy", "Transparent progress in one place"].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-sm font-bold text-ink">
                      <Check size={16} className="text-green" />
                      {item}
                    </div>
                  ))}
                </div>
                <PrimaryButton onClick={() => setStep("profile")}>Complete your profile</PrimaryButton>
              </div>
            )}

            {step === "profile" && (
              <form onSubmit={completeProfile} className="animate-fade-up">
                <Eyebrow icon={<Camera size={14} />} text="Profile basics" />
                <h2 className="mt-4 font-syne text-3xl font-bold text-ink">Complete only what belongs to you.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">Your organization will complete the rest: department, band, compensation, role, reporting line, and permissions.</p>

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
                  <TextField label="Phone" value={phone} onChange={setPhone} placeholder="+234 801 234 5678" />
                  <TextField label="Address" value={address} onChange={setAddress} placeholder="Home address" />
                  <TextField label="Emergency Contact" value={emergencyContact} onChange={setEmergencyContact} placeholder="Name, relationship, phone" />
                  <TextField label="Next of Kin" value={nextOfKin} onChange={setNextOfKin} placeholder="Name and phone" />
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
  const steps: AuthStep[] = ["email", "phone", "otp", "welcome", "profile"];
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
