"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
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
import { getMyDocuments, updateProfile, uploadDocument } from "@/lib/api/profile";
import type { Document as EmployeeDocument } from "@/types";

type SectionKey = "personal" | "documents" | "compensation";
type EditableKey =
  | "phone"
  | "homeAddress"
  | "emergencyContact"
  | "nextOfKin";

type RequiredStatus = "verified" | "pending" | "rejected" | "missing";

const sections: { key: SectionKey; label: string }[] = [
  { key: "personal", label: "Personal Info" },
  { key: "documents", label: "Documents" },
  { key: "compensation", label: "Band & Compensation" },
];

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
  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
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
  // Profile completeness from the fields a person can actually fill in.
  const completionFields = [user.phone, user.homeAddress, profile.emergencyContact, profile.nextOfKin, profileImages[user.id]];
  const profilePercent = Math.round((completionFields.filter((value) => Boolean(value && String(value).trim())).length / completionFields.length) * 100);

  useEffect(() => {
    if (!user.id) return;
    let cancelled = false;
    getMyDocuments(user.id).then((rows) => {
      if (!cancelled) setDocuments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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
    const type = pendingUploadType.current;
    setUploadingType(type);
    setUploadProgress(10);
    void (async () => {
      const { data: row } = await getSupabase().from("employees").select("org_id").eq("id", user.id).maybeSingle<{ org_id: string | null }>();
      const saved = row?.org_id ? await uploadDocument(file, type, user.id, row.org_id) : null;
      setUploadingType(null);
      setUploadProgress(0);
      if (!saved) {
        setUploadError("The upload did not go through. Please try again, or send the document to HR.");
        return;
      }
      setToast("Uploaded — HR will review it");
      setTimeout(() => setToast(""), 1800);
      setDocuments(await getMyDocuments(user.id));
    })();
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
            </div>
          </section>
        </>
      )}

      {active === "documents" && (
        <>
          <section className="px-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted">Upload documents HR has asked for. Each one is reviewed by HR and marked verified or returned.</p>
              <button onClick={() => startUpload("General Document")} className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-pulse px-3 py-2 text-xs font-semibold text-white">
                <Upload size={13} /> Upload
              </button>
            </div>
          </section>

          <section className="space-y-3 px-4">
            <SectionHeader title="My Documents" />
            {documents === null ? (
              <EmptyState title="Loading documents…" body="" />
            ) : documents.length === 0 ? (
              <EmptyState title="No documents yet" body="Documents you upload will appear here with their review status." />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onUpload={() => startUpload(doc.type)}
                  />
                ))}
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/65">Band</p>
              {user.band.current ? (
                <>
                  <h2 className="mt-2 text-xl font-semibold" style={{ fontFamily: "var(--font-syne)" }}>{user.band.current}</h2>
                  {user.band.next && <p className="mt-2 text-sm text-white/65">Next: {user.band.next}</p>}
                  {user.band.requirements.length > 0 && (
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-white/80">
                      {user.band.requirements.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-white/70">HR has not recorded a band for you yet.</p>
              )}
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

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-ink">Bonuses and payslips</p>
              <p className="mt-2 text-sm text-muted">
                Performance bonuses are set from your released appraisal and paid through payroll. Every payment appears on your payslip.
              </p>
              <a href="/payslips" className="mt-3 inline-block rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white">My payslips</a>
            </div>
          </section>

          {user.trainingSuggestions.length > 0 && <section id="training-suggestions" className="px-4">
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
          </section>}
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
  onUpload,
}: {
  doc: EmployeeDocument;
  org?: boolean;
  locked?: boolean;
  onLocked?: () => void;
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
  return row;
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
