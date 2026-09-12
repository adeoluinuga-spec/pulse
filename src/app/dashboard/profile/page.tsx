"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Image,
  Lock,
  Mail,
  PenLine,
  Camera,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getSupabase } from "@/lib/supabase";
import { updateProfile } from "@/lib/api/profile";
import type { Document as EmployeeDocument } from "@/types";

type SectionKey = "personal" | "documents" | "compensation";
type EditableKey =
  | "phone"
  | "homeAddress"
  | "emergencyContact"
  | "nextOfKin";

type RequiredStatus = "verified" | "pending" | "rejected" | "missing";

interface RequiredDocument {
  type: string;
  status: RequiredStatus;
  reason?: string;
}

const sections: { key: SectionKey; label: string }[] = [
  { key: "personal", label: "Personal Info" },
  { key: "documents", label: "Documents" },
  { key: "compensation", label: "Band & Compensation" },
];

const requiredDocuments: RequiredDocument[] = [
  { type: "Employment Contract", status: "verified" },
  { type: "Government ID", status: "verified" },
  { type: "Tax Form", status: "verified" },
  { type: "Bank Details", status: "verified" },
  { type: "Medical Form", status: "verified" },
  { type: "Performance Agreement", status: "verified" },
  { type: "Training Certificate", status: "pending" },
  { type: "Next of Kin Form", status: "missing" },
  { type: "Address Verification", status: "missing" },
];

const bandSteps = ["Entry", "Associate", "Senior Associate", "Principal", "Director"];

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: number, hidden: boolean) {
  if (hidden) return "••••••";
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

function employmentLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function docStatus(status: RequiredStatus | EmployeeDocument["status"]) {
  if (status === "verified") {
    return "bg-green-soft text-green border-green/20";
  }
  if (status === "submitted" || status === "pending") {
    return "bg-amber-soft text-amber border-amber/20";
  }
  if (status === "rejected") {
    return "bg-red-soft text-red border-red/20";
  }
  return "bg-card text-red border-red/35";
}

function statusLabel(status: RequiredStatus | EmployeeDocument["status"]) {
  if (status === "verified") return "Verified";
  if (status === "submitted" || status === "pending") return "Pending Review";
  if (status === "rejected") return "Rejected";
  return "Missing";
}

function FileIcon({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const Icon = lower.includes("jpg") || lower.includes("png") || lower.includes("image") ? Image : FileText;
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-paper text-muted">
      <Icon size={18} />
    </div>
  );
}

function CompletionRing({
  initials,
  color,
  percent,
  imageUrl,
  onUpload,
}: {
  initials: string;
  color: string;
  percent: number;
  imageUrl?: string;
  onUpload: () => void;
}) {
  return (
    <button onClick={onUpload} className="group relative flex h-28 w-28 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(13,13,13,0.14)]" style={{ background: `conic-gradient(var(--pulse) ${percent * 3.6}deg, var(--border) 0deg)` }}>
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-card text-xl font-semibold text-white ring-4 ring-white/60" style={{ backgroundColor: color }}>
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
      </div>
      <span className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-ink text-white shadow-lg transition group-hover:bg-pulse">
        <Camera size={15} />
      </span>
    </button>
  );
}

export default function ProfilePage() {
  const { user, profileImages, setProfileImage } = useUser();
  const [active, setActive] = useState<SectionKey>("personal");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<EditableKey | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<EmployeeDocument | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [hideAmounts, setHideAmounts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadType = useRef<string>("General Document");

  const [profile, setProfile] = useState<Record<EditableKey, string>>({
    phone: user.phone,
    homeAddress: user.homeAddress,
    emergencyContact: "",
    nextOfKin: "",
  });
  const [draft, setDraft] = useState("");
  const [managerName, setManagerName] = useState<string | null>(null);

  // Fetch line manager from Supabase (not mock array)
  useEffect(() => {
    if (!user.lineManagerId) return;
    getSupabase()
      .from("employees")
      .select("name")
      .eq("id", user.lineManagerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setManagerName((data as { name: string }).name);
      });
  }, [user.lineManagerId]);
  const verifiedRequired = requiredDocuments.filter((doc) => doc.status === "verified" || doc.status === "pending").length;
  const requiredPercent = Math.round((verifiedRequired / requiredDocuments.length) * 100);
  const profilePercent = 82;

  const orgDocs = useMemo<EmployeeDocument[]>(
    () => [
      { id: "org-1", name: "Employee Handbook 2026", type: "Policy", status: "verified", uploadDate: "2026-01-08", size: "820 KB" },
      { id: "org-2", name: "Q2 Performance Policy", type: "Policy", status: "verified", uploadDate: "2026-04-01", size: "340 KB" },
      { id: "org-3", name: "Formal Warning Letter", type: "Warning Letter", status: "verified", uploadDate: "2025-11-16", size: "120 KB" },
    ],
    [],
  );

  const currentBandIndex = 2;
  const currentTier =
    [...user.compensation.bonusStructure]
      .sort((a, b) => b.scoreThreshold - a.scoreThreshold)
      .find((tier) => user.performanceScore >= tier.scoreThreshold) ??
    user.compensation.bonusStructure[user.compensation.bonusStructure.length - 1];
  const nextTier = [...user.compensation.bonusStructure]
    .sort((a, b) => a.scoreThreshold - b.scoreThreshold)
    .find((tier) => tier.scoreThreshold > user.performanceScore);

  const requirements = [
    { label: "Performance score ≥ 80%", met: user.performanceScore >= 80, detail: `${user.performanceScore}% current score` },
    { label: "Minimum 18 months at current band", met: true, detail: "38 months tenure" },
    { label: "Complete PMP Certification", met: false, detail: "Training suggestion available" },
    { label: "Manager recommendation", met: false, detail: "Pending" },
    { label: "Peer rating ≥ 4.0", met: user.peerRating >= 4, detail: `${user.peerRating}/5 peer rating` },
  ];
  const metCount = requirements.filter((item) => item.met).length;

  function beginEdit(key: EditableKey) {
    setEditing(key);
    setDraft(profile[key]);
  }

  async function saveEdit(key: EditableKey) {
    const value = draft.trim() || profile[key];
    setProfile((prev) => ({ ...prev, [key]: value }));
    setEditing(null);

    // Persist to Supabase
    const updates: Parameters<typeof updateProfile>[0] = {};
    if (key === "phone") updates.phone = value;
    if (key === "homeAddress") updates.homeAddress = value;
    if (key === "emergencyContact") updates.emergencyContact = { contact: value };
    if (key === "nextOfKin") updates.nextOfKin = { contact: value };
    await updateProfile(updates);

    setToast("Saved ✓");
    setTimeout(() => setToast(""), 1800);
  }

  function startUpload(type: string) {
    pendingUploadType.current = type;
    fileInputRef.current?.click();
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File is too large. Maximum upload size is 10MB.");
      return;
    }
    setUploadingType(pendingUploadType.current);
    setUploadProgress(0);
    const steps = [24, 55, 82, 100];
    steps.forEach((value, index) => {
      setTimeout(() => {
        setUploadProgress(value);
        if (value === 100) {
          setToast("Upload complete");
          setTimeout(() => {
            setUploadingType(null);
            setToast("");
          }, 900);
        }
      }, 280 * (index + 1));
    });
  }

  function handleProfileImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setProfileImage(user.id, reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="dashboard-page space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-[118px] z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-xl md:top-20">
          {toast}
        </div>
      )}

      <section className="px-4">
        <div className="flex rounded-lg border border-border bg-card p-1">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActive(section.key)}
              className={clsx(
                "flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors md:text-sm",
                active === section.key ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

      {active === "personal" && (
        <>
          <section className="px-4 text-center">
            <div className="flex flex-col items-center">
              <CompletionRing initials={user.initials} color={user.avatarColor} percent={profilePercent} imageUrl={profileImages[user.id]} onUpload={() => profileImageInputRef.current?.click()} />
              <input ref={profileImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleProfileImage(event.target.files?.[0])} />
              <h1 className="mt-3 text-2xl font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
                {user.name}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {user.role} · {user.department}
              </p>
              <p className="mt-2 text-xs text-muted">Your profile is {profilePercent}% complete · image editable by you</p>
            </div>
          </section>

          <section className="px-4">
            <div className="rounded-lg border border-green/15 bg-green-soft/70 p-4 pulse-success-glow">
              <p className="text-xs font-semibold uppercase tracking-widest text-green">Recognition Timeline</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {[
                  user.performanceScore >= 80 ? "Momentum Rising" : "Stable",
                  user.weekStreak >= 4 ? "Consistency Streak" : "Strong Alignment",
                  user.aiRec.recommendation === "promote" ? "Promotion Ready" : "Team Impact Recognition",
                ].map((item) => <span key={item} className="rounded-full bg-card px-3 py-2 text-xs font-semibold text-green">{item}</span>)}
              </div>
            </div>
          </section>

          <section className="space-y-4 px-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Managed by Organization</p>
              <div className="grid gap-3 md:grid-cols-2">
                <LockedCard label="Full name" value={user.name} />
                <LockedCard label="Employee ID" value={user.id.toUpperCase()} />
                <LockedCard label="Cadre" value={user.cadre} />
                <LockedCard label="Compensation band" value={user.band.current} />
                <LockedCard label="Department" value={user.department} />
                <LockedCard label="Line manager" value={managerName ?? (user.lineManagerId ? "Loading…" : "Not assigned")} onClick={managerName ? () => setManagerOpen(true) : undefined} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Editable by You</p>
              <div className="grid gap-3 md:grid-cols-2">
                <EditableCard label="Phone number" field="phone" value={profile.phone} editing={editing} draft={draft} onBegin={beginEdit} onDraft={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} />
                <EditableCard label="Home address" field="homeAddress" value={profile.homeAddress} editing={editing} draft={draft} onBegin={beginEdit} onDraft={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} />
                <EditableCard label="Emergency contact" field="emergencyContact" value={profile.emergencyContact || "Not set"} editing={editing} draft={draft} onBegin={beginEdit} onDraft={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} />
                <EditableCard label="Next of kin" field="nextOfKin" value={profile.nextOfKin || "Not set"} editing={editing} draft={draft} onBegin={beginEdit} onDraft={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
            <LockedCard label="Date of hire" value={formatDate(user.joinDate)} />
            <LockedCard label="Team" value={user.team} />
            <LockedCard label="Employment type" value={employmentLabel(user.employmentType)} />
            <LockedCard label="Work location" value="Lagos HQ · Hybrid" />
            </div>
          </section>
        </>
      )}

      {active === "documents" && (
        <>
          <section className="px-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">7 of 9 required documents submitted</p>
                  <p className="mt-1 text-xs text-muted">Keep required documents current for HR compliance.</p>
                </div>
                <span className="text-xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>
                  {requiredPercent}%
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-pulse" style={{ width: `${requiredPercent}%` }} />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {requiredDocuments.map((doc) => (
                  <div key={doc.type} className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="truncate text-xs font-semibold text-ink">{doc.type}</span>
                    <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", docStatus(doc.status))}>
                      {statusLabel(doc.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3 px-4">
            <SectionHeader title="My Documents" />
            {user.documents.length === 0 ? (
              <EmptyState title="No employee documents yet" body="Upload your first document to begin HR review." />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {user.documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onRejected={() => setRejectReason("The uploaded copy is unclear. Please upload a sharper scan.")}
                    onUpload={() => startUpload(doc.type)}
                  />
                ))}
                <MissingRow name="Next of Kin Form" onUpload={() => startUpload("Next of Kin Form")} />
                <MissingRow name="Address Verification" onUpload={() => startUpload("Address Verification")} />
              </div>
            )}
            {uploadingType && (
              <div className="rounded-lg border border-pulse/20 bg-pulse-soft p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-pulse">
                  <span>Uploading {uploadingType}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-pulse" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            {uploadError && (
              <div className="flex items-center gap-2 rounded-lg border border-red/20 bg-red-soft px-3 py-2 text-xs font-semibold text-red">
                <AlertCircle size={14} />
                {uploadError}
              </div>
            )}
          </section>

          <section className="space-y-3 px-4">
            <SectionHeader title="Org Documents" />
            {orgDocs.length === 0 ? (
              <EmptyState title="No organisation documents" body="Company-issued documents will appear here." />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {orgDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    org
                    locked={doc.type === "Warning Letter"}
                    onLocked={() => setConfirmDoc(doc)}
                  />
                ))}
              </div>
            )}
          </section>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.png,.docx"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </>
      )}

      {active === "compensation" && (
        <>
          <section className="px-4">
            <div className="rounded-lg bg-ink p-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/65">Band & Cadre</p>
              <h2 className="mt-2 text-xl font-semibold" style={{ fontFamily: "var(--font-syne)" }}>
                {user.band.current.replace("–", "—")}
              </h2>
              <div className="mt-6 flex items-center">
                {bandSteps.map((step, index) => {
                  const activeNode = index === currentBandIndex;
                  return (
                    <div key={step} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={clsx("rounded-full border-2", activeNode ? "h-5 w-5 border-pulse bg-pulse" : "h-3.5 w-3.5 border-white/25 bg-white/10")} />
                        <span className={clsx("mt-2 max-w-[70px] text-center text-[10px]", activeNode ? "font-semibold text-pulse" : "text-white/65")}>
                          {step}
                        </span>
                      </div>
                      {index < bandSteps.length - 1 && <div className={clsx("mb-6 h-px flex-1", index < currentBandIndex ? "bg-pulse" : "bg-white/15")} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="px-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-ink">Path to {user.band.next.replace("–", "—")}</p>
              <div className="mt-4 space-y-3">
                {requirements.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className={clsx("mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full", item.met ? "bg-green text-white" : "bg-red-soft text-red")}>
                      {item.met ? <Check size={12} /> : <X size={12} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.label}</p>
                      <p className="text-xs text-muted">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted">
                You meet {metCount} of {requirements.length} requirements for promotion to Principal
              </p>
              <button
                onClick={() => document.getElementById("training-suggestions")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-3 w-full rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white"
              >
                See training suggestions
              </button>
            </div>
          </section>

          <section className="grid gap-3 px-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Compensation Package</p>
                <button onClick={() => setHideAmounts((prev) => !prev)} className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  {hideAmounts ? <Eye size={14} /> : <EyeOff size={14} />}
                  {hideAmounts ? "Show amounts" : "Hide amounts"}
                </button>
              </div>
              <MoneyRow label="Basic Salary" value={user.compensation.basic} hidden={hideAmounts} />
              <MoneyRow label="Housing Allowance" value={user.compensation.housing} hidden={hideAmounts} />
              <MoneyRow label="Transport Allowance" value={user.compensation.transport} hidden={hideAmounts} />
              <MoneyRow label="Medical Allowance" value={user.compensation.medical} hidden={hideAmounts} />
              {user.compensation.otherAllowances.map((allowance) => (
                <MoneyRow key={allowance.name} label={allowance.name} value={allowance.amount} hidden={hideAmounts} />
              ))}
              <div className="my-3 border-t border-border" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Total Gross</span>
                <span className="text-2xl font-semibold text-ink" style={{ fontFamily: "var(--font-syne)" }}>
                  {formatMoney(user.compensation.totalGross, hideAmounts)}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-ink p-5 text-white">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-pulse" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-pulse">Performance-linked bonus</p>
              </div>
              <p className="text-sm text-white/60">
                At your current score of {user.performanceScore}%, your Q2 bonus is
              </p>
              <p className="mt-2 text-4xl font-semibold text-pulse" style={{ fontFamily: "var(--font-syne)" }}>
                {formatMoney(currentTier.bonusAmount, hideAmounts)}
              </p>
              <div className="mt-5 divide-y divide-white/10 rounded-lg border border-white/10">
                {[...user.compensation.bonusStructure]
                  .sort((a, b) => a.scoreThreshold - b.scoreThreshold)
                  .map((tier) => {
                    const isCurrent = tier.scoreThreshold === currentTier.scoreThreshold;
                    return (
                      <div key={tier.scoreThreshold} className={clsx("flex items-center justify-between px-3 py-3 text-sm", isCurrent && "bg-pulse/15 text-pulse")}>
                        <span>Score ≥ {tier.scoreThreshold}%</span>
                        <span className="font-semibold">{formatMoney(tier.bonusAmount, hideAmounts)}</span>
                      </div>
                    );
                  })}
              </div>
              <p className="mt-4 text-sm text-white/60">
                {nextTier
                  ? `Reach ${nextTier.scoreThreshold}% to unlock ${formatMoney(nextTier.bonusAmount, hideAmounts)}`
                  : "You are already in the highest bonus tier"}
              </p>
            </div>
          </section>

          <section id="training-suggestions" className="px-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-ink">Training Suggestions</p>
              <div className="mt-3 space-y-2">
                {user.trainingSuggestions.slice(0, 3).map((training) => (
                  <div key={training.id} className="rounded-lg bg-paper px-3 py-2">
                    <p className="text-sm font-semibold text-ink">{training.title}</p>
                    <p className="text-xs text-muted">{training.provider} · {training.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {managerOpen && managerName && (
        <BottomSheet onClose={() => setManagerOpen(false)}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
              {managerName.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">{managerName}</p>
              <p className="truncate text-sm text-muted">Line Manager</p>
            </div>
          </div>
          <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-pulse px-4 py-3 text-sm font-semibold text-white">
            <Mail size={15} />
            Send message
          </button>
        </BottomSheet>
      )}

      {rejectReason && (
        <BottomSheet onClose={() => setRejectReason(null)}>
          <p className="text-base font-semibold text-ink">Rejected document</p>
          <p className="mt-2 text-sm text-muted">{rejectReason}</p>
        </BottomSheet>
      )}

      {confirmDoc && (
        <BottomSheet onClose={() => setConfirmDoc(null)}>
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 text-pulse" />
            <div>
              <p className="text-base font-semibold text-ink">Confirm to view</p>
              <p className="mt-2 text-sm text-muted">
                {confirmDoc.name} is a sensitive organisation-issued document. Confirm you want to view it.
              </p>
            </div>
          </div>
          <button onClick={() => setConfirmDoc(null)} className="mt-4 w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white">
            Confirm and view
          </button>
        </BottomSheet>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title}</p>;
}

function EditableCard({
  label,
  field,
  value,
  editing,
  draft,
  onBegin,
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  field: EditableKey;
  value: string;
  editing: EditableKey | null;
  draft: string;
  onBegin: (field: EditableKey) => void;
  onDraft: (value: string) => void;
  onSave: (field: EditableKey) => void;
  onCancel: () => void;
}) {
  const isEditing = editing === field;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
        {!isEditing && (
          <button onClick={() => onBegin(field)} className="text-muted hover:text-pulse" aria-label={`Edit ${label}`}>
            <PenLine size={14} />
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-pulse"
          />
          <button onClick={() => onSave(field)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-green text-white" aria-label="Save">
            <Check size={14} />
          </button>
          <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-sm font-semibold leading-5 text-ink">{value}</p>
      )}
    </div>
  );
}

function LockedCard({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-4 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
        {onClick ? <ChevronRight size={14} className="text-muted" /> : <Lock size={13} className="text-muted" />}
      </div>
      <p className="text-sm font-semibold leading-5 text-ink">{value}</p>
    </div>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full">
        {content}
      </button>
    );
  }
  return content;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
      <UserRound size={28} className="mx-auto text-muted" />
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs text-muted">{body}</p>
    </div>
  );
}

function DocumentRow({
  doc,
  org = false,
  locked = false,
  onLocked,
  onRejected,
  onUpload,
}: {
  doc: EmployeeDocument;
  org?: boolean;
  locked?: boolean;
  onLocked?: () => void;
  onRejected?: () => void;
  onUpload?: () => void;
}) {
  const row = (
    <div className="flex items-center gap-3 px-4 py-3 text-left">
      <FileIcon type={doc.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {locked && <Lock size={12} className="text-muted" />}
          <p className="truncate text-sm font-semibold text-ink">{doc.name}</p>
        </div>
        <p className="text-xs text-muted">{formatDate(doc.uploadDate)}{doc.size ? ` · ${doc.size}` : ""}</p>
      </div>
      <span className={clsx("flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold", docStatus(doc.status))}>
        {doc.status === "verified" && <Check size={10} className="mr-1 inline" />}
        {statusLabel(doc.status)}
      </span>
      {!org && doc.status !== "verified" && (
        <button onClick={onUpload} className="flex-shrink-0 rounded-lg bg-pulse px-3 py-1.5 text-xs font-semibold text-white">
          Upload
        </button>
      )}
    </div>
  );
  if (locked) {
    return <button onClick={onLocked} className="block w-full">{row}</button>;
  }
  if (doc.status === "pending") {
    return <button onClick={onRejected} className="block w-full">{row}</button>;
  }
  return row;
}

function MissingRow({ name, onUpload }: { name: string; onUpload: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <FileIcon type="Missing" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs text-muted">Not submitted</p>
      </div>
      <span className="flex-shrink-0 rounded-full border border-red/35 px-2.5 py-1 text-[10px] font-semibold text-red">
        Missing
      </span>
      <button onClick={onUpload} className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-pulse px-3 py-1.5 text-xs font-semibold text-white">
        <Upload size={12} />
        Upload
      </button>
    </div>
  );
}

function MoneyRow({ label, value, hidden }: { label: string; value: number; hidden: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{formatMoney(value, hidden)}</span>
    </div>
  );
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/45" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-xl rounded-t-2xl bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </>
  );
}
