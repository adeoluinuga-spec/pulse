"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface WeightItem {
  key: string;
  label: string;
  value: number;
}

interface LeaveType {
  type: string;
  days: number;
}

interface EmployeeRow {
  name: string;
  email: string;
  department: string;
  team: string;
  cadre: string;
  peopleResponsibility: string;
  lineManagerEmail: string;
  band: string;
  joinDate: string;
}

interface InviteResult {
  email: string;
  status: "sent" | "error" | "pending";
  error?: string;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "name",
  "email",
  "department",
  "team",
  "cadre",
  "peopleResponsibility",
  "lineManagerEmail",
  "band",
  "joinDate",
];

const CSV_TEMPLATE =
  [
    CSV_HEADERS.join(","),
    "Jane Doe,jane.doe@company.com,Engineering,Platform,mid,none,manager@company.com,L2 - Engineer II,2024-01-15",
    "John Smith,john.smith@company.com,Sales,Enterprise,senior,manager,director@company.com,L4 - Senior Manager,2022-06-01",
  ].join("\n");

function parseCSV(text: string): EmployeeRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return {
      name: obj.name ?? "",
      email: obj.email ?? "",
      department: obj.department ?? "",
      team: obj.team ?? "",
      cadre: obj.cadre ?? "entry",
      peopleResponsibility: obj.peopleResponsibility ?? "none",
      lineManagerEmail: obj.lineManagerEmail ?? "",
      band: obj.band ?? "",
      joinDate: obj.joinDate ?? "",
    };
  });
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: WeightItem[] = [
  { key: "goal_achievement", label: "Goal Achievement", value: 35 },
  { key: "report_consistency", label: "Report Consistency", value: 20 },
  { key: "kpi_performance", label: "KPI Performance", value: 25 },
  { key: "manager_assessment", label: "Manager Assessment", value: 10 },
  { key: "peer_feedback", label: "Peer Feedback", value: 10 },
];

const DEFAULT_LEAVE: LeaveType[] = [
  { type: "Annual", days: 20 },
  { type: "Sick", days: 10 },
  { type: "Compassionate", days: 3 },
  { type: "Maternity", days: 90 },
  { type: "Paternity", days: 10 },
];

const EMPTY_EMP: EmployeeRow = {
  name: "",
  email: "",
  department: "",
  team: "",
  cadre: "entry",
  peopleResponsibility: "none",
  lineManagerEmail: "",
  band: "",
  joinDate: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [orgId, setOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Step 2 state
  const [locations, setLocations] = useState<string[]>(["Lagos HQ"]);
  const [locationInput, setLocationInput] = useState("");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>(DEFAULT_LEAVE);
  const [weights, setWeights] = useState<WeightItem[]>(DEFAULT_WEIGHTS);

  // Step 3 state
  const [importMode, setImportMode] = useState<"csv" | "manual">("csv");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [manualEmp, setManualEmp] = useState<EmployeeRow>(EMPTY_EMP);
  const [dragOver, setDragOver] = useState(false);
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 4 state
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteDone, setInviteDone] = useState(false);

  // ── Resolve org from auth user metadata ─────────────────────────────────
  useEffect(() => {
    async function load() {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const meta = user.user_metadata as Record<string, string>;
      const metaOrgId = meta?.org_id;

      // Try to find org in DB
      if (metaOrgId) {
        const { data: org } = await supabase
          .from("organisations")
          .select("id, name")
          .eq("id", metaOrgId)
          .single();

        if (org) {
          const o = org as { id: string; name: string };
          setOrgId(o.id);
          setOrgName(o.name);

          // Create HR admin employee record if it doesn't exist yet
          const { data: existing } = await supabase
            .from("employees")
            .select("id")
            .eq("user_id", user.id)
            .single();

          if (!existing) {
            await supabase.from("employees").insert({
              user_id: user.id,
              org_id: o.id,
              email: user.email,
              name: user.email?.split("@")[0] ?? "HR Admin",
              initials: "HR",
              platform_role: "hr_admin",
              cadre: "senior",
              people_responsibility: "manager",
            });
          }
        }
      }
    }

    load();
  }, [router]);

  // ── Weight helpers ────────────────────────────────────────────────────────
  const weightsTotal = weights.reduce((s, w) => s + w.value, 0);

  function updateWeight(key: string, value: number) {
    setWeights((prev) => prev.map((w) => (w.key === key ? { ...w, value } : w)));
  }

  // ── CSV helpers ───────────────────────────────────────────────────────────
  function handleCSVFile(file: File) {
    setCsvError("");
    if (!file.name.endsWith(".csv")) {
      setCsvError("Please upload a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      if (!rows.length) {
        setCsvError("No valid rows found. Check the file format.");
        return;
      }
      setEmployees(rows);
    };
    reader.readAsText(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) handleCSVFile(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pulse-employee-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function addManualEmployee() {
    if (!manualEmp.name || !manualEmp.email) return;
    setEmployees((prev) => [...prev, manualEmp]);
    setManualEmp(EMPTY_EMP);
  }

  function removeEmployee(index: number) {
    setEmployees((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Step 2 save ──────────────────────────────────────────────────────────
  async function saveOrgDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orgId) return;
    if (weightsTotal !== 100) return;

    setSaving(true);
    const supabase = getSupabase();

    const weightMap: Record<string, number> = {};
    weights.forEach((w) => {
      weightMap[w.key] = w.value;
    });

    // Update appraisal cycle weights
    await supabase.from("appraisal_cycles").upsert({
      org_id: orgId,
      name: "Q1",
      status: "active",
      weights: weightMap,
    });

    setSaving(false);
    setStep(3);
  }

  // ── Step 4 send invites ──────────────────────────────────────────────────
  async function sendAllInvites() {
    if (!orgId || !employees.length) return;
    setInviting(true);
    setInviteResults(employees.map((e) => ({ email: e.email, status: "pending" })));

    // Send in batches of 5
    const batchSize = 5;
    const allResults: InviteResult[] = [...inviteResults];

    for (let i = 0; i < employees.length; i += batchSize) {
      const batch = employees.slice(i, i + batchSize);
      try {
        const res = await fetch("/api/admin/send-invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, employees: batch }),
        });

        const json = (await res.json()) as {
          results: Array<{ email: string; status: "sent" | "error"; error?: string }>;
        };

        json.results.forEach((r) => {
          const idx = employees.findIndex((e) => e.email === r.email);
          if (idx >= 0) allResults[idx] = r;
        });

        setInviteResults([...allResults]);
      } catch {
        batch.forEach((emp) => {
          const idx = employees.findIndex((e) => e.email === emp.email);
          if (idx >= 0) allResults[idx] = { email: emp.email, status: "error", error: "Network error" };
        });
        setInviteResults([...allResults]);
      }
    }

    setInviting(false);
    setInviteDone(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_28rem),linear-gradient(135deg,var(--cream),var(--paper))] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Logo + progress */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-pulse font-syne text-base font-black text-white">
              P
            </span>
            <span className="font-syne text-lg font-bold text-ink">Pulse Setup</span>
          </div>
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? "w-8 bg-pulse"
                    : s < step
                      ? "w-4 bg-pulse/40"
                      : "w-4 bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* ── Step 1: Welcome ───────────────────────────────────────────── */}
        {step === 1 && (
          <div className="rounded-[28px] border border-border bg-card p-6 shadow-[0_24px_80px_rgba(13,13,13,0.10)] md:p-10">
            <div className="grid h-14 w-14 place-items-center rounded-3xl bg-pulse-soft text-pulse">
              <Sparkles size={22} />
            </div>
            <h1 className="mt-5 font-syne text-4xl font-bold leading-tight text-ink">
              Welcome to Pulse.
              {orgName && (
                <span className="block text-pulse">Let&apos;s set up {orgName}.</span>
              )}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted">
              This will take about 10 minutes. We&apos;ll configure your organisation,
              import your team, and send everyone their invite.
            </p>

            <div className="mt-8 space-y-3">
              {[
                { num: "01", label: "Organisation details — leave policies, appraisal weights" },
                { num: "02", label: "Import employees — CSV upload or add one by one" },
                { num: "03", label: "Send invites — everyone gets a personalised link" },
              ].map((item) => (
                <div
                  key={item.num}
                  className="flex items-center gap-4 rounded-2xl bg-paper px-4 py-3"
                >
                  <span className="font-syne text-xs font-black text-pulse">{item.num}</span>
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] transition hover:shadow-[0_22px_42px_rgba(232,68,10,0.26)] active:scale-[0.97]"
            >
              Let&apos;s go
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 2: Org Details ───────────────────────────────────────── */}
        {step === 2 && (
          <form onSubmit={saveOrgDetails} className="space-y-6">
            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
              <SectionTitle>Work Locations</SectionTitle>
              <p className="mb-4 text-sm text-muted">
                Where does your team work? Add all locations.
              </p>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => (
                  <span
                    key={loc}
                    className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-ink"
                  >
                    {loc}
                    <button
                      type="button"
                      onClick={() =>
                        setLocations((prev) => prev.filter((l) => l !== loc))
                      }
                      className="text-muted hover:text-red"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (locationInput.trim()) {
                          setLocations((prev) => [...prev, locationInput.trim()]);
                          setLocationInput("");
                        }
                      }
                    }}
                    placeholder="Add location"
                    className="h-9 rounded-full border border-border bg-paper px-3 text-sm outline-none focus:border-pulse"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (locationInput.trim()) {
                        setLocations((prev) => [...prev, locationInput.trim()]);
                        setLocationInput("");
                      }
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
              <SectionTitle>Leave Entitlements</SectionTitle>
              <p className="mb-4 text-sm text-muted">
                Set the annual days per leave type. You can adjust later.
              </p>
              <div className="space-y-3">
                {leaveTypes.map((lt, i) => (
                  <div key={lt.type} className="flex items-center gap-3">
                    <span className="w-32 flex-shrink-0 text-sm font-semibold text-ink">
                      {lt.type}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={lt.days}
                      onChange={(e) =>
                        setLeaveTypes((prev) =>
                          prev.map((l, li) =>
                            li === i ? { ...l, days: parseInt(e.target.value) || 0 } : l,
                          ),
                        )
                      }
                      className="h-10 w-20 rounded-2xl border border-border bg-paper px-3 text-center text-sm font-bold text-ink outline-none focus:border-pulse"
                    />
                    <span className="text-xs text-muted">days / year</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
              <SectionTitle>Appraisal Weights</SectionTitle>
              <p className="mb-4 text-sm text-muted">
                How much does each component count toward the final score?
              </p>
              <div className="space-y-4">
                {weights.map((w) => (
                  <div key={w.key}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{w.label}</span>
                      <span
                        className={`font-syne text-sm font-bold ${w.value > 0 ? "text-pulse" : "text-muted"}`}
                      >
                        {w.value}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={w.value}
                      onChange={(e) =>
                        updateWeight(w.key, parseInt(e.target.value))
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-pulse"
                    />
                  </div>
                ))}
              </div>
              <div
                className={`mt-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition-colors ${
                  weightsTotal === 100
                    ? "bg-green-soft text-green"
                    : "bg-red-soft text-red"
                }`}
              >
                <span>Total</span>
                <span>{weightsTotal}%{weightsTotal !== 100 && " — must equal 100%"}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || weightsTotal !== 100}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  Save & Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ── Step 3: Import Employees ───────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
              <SectionTitle>Import Employees</SectionTitle>
              <p className="mb-6 text-sm leading-relaxed text-muted">
                Add your team so we can send personalised invites.
              </p>

              <div className="mb-6 flex rounded-2xl border border-border bg-paper p-1">
                {(["csv", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setImportMode(mode)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                      importMode === mode
                        ? "bg-ink text-white"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {mode === "csv" ? "Upload CSV" : "Add Manually"}
                  </button>
                ))}
              </div>

              {importMode === "csv" && (
                <div className="space-y-4">
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 text-sm font-bold text-pulse underline underline-offset-2"
                  >
                    <FileText size={14} />
                    Download CSV template
                  </button>

                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors ${
                      dragOver
                        ? "border-pulse bg-pulse-soft"
                        : "border-border bg-paper hover:border-pulse/50"
                    }`}
                  >
                    <Upload
                      size={24}
                      className={dragOver ? "text-pulse" : "text-muted"}
                    />
                    <div className="text-center">
                      <p className="text-sm font-bold text-ink">
                        {dragOver ? "Drop to upload" : "Drag & drop your CSV here"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        or click to browse — .csv only, max 5MB
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleCSVFile(file);
                    }}
                  />

                  {csvError && (
                    <p className="rounded-2xl bg-red-soft px-4 py-3 text-sm font-semibold text-red">
                      {csvError}
                    </p>
                  )}
                </div>
              )}

              {importMode === "manual" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <SmallField
                      label="Full Name *"
                      value={manualEmp.name}
                      onChange={(v) => setManualEmp((e) => ({ ...e, name: v }))}
                    />
                    <SmallField
                      label="Email *"
                      value={manualEmp.email}
                      onChange={(v) => setManualEmp((e) => ({ ...e, email: v }))}
                    />
                    <SmallField
                      label="Department"
                      value={manualEmp.department}
                      onChange={(v) => setManualEmp((e) => ({ ...e, department: v }))}
                    />
                    <SmallField
                      label="Team"
                      value={manualEmp.team}
                      onChange={(v) => setManualEmp((e) => ({ ...e, team: v }))}
                    />
                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                        Cadre
                      </span>
                      <select
                        value={manualEmp.cadre}
                        onChange={(e) =>
                          setManualEmp((emp) => ({ ...emp, cadre: e.target.value }))
                        }
                        className="h-10 w-full rounded-xl border border-border bg-paper px-2 text-sm text-ink outline-none focus:border-pulse"
                      >
                        {["entry", "mid", "senior", "executive"].map((c) => (
                          <option key={c} value={c}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SmallField
                      label="Band"
                      value={manualEmp.band}
                      onChange={(v) => setManualEmp((e) => ({ ...e, band: v }))}
                      placeholder="L2 - Engineer II"
                    />
                  </div>
                  <button
                    onClick={addManualEmployee}
                    disabled={!manualEmp.name || !manualEmp.email}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <Plus size={14} />
                    Add to list
                  </button>
                </div>
              )}
            </div>

            {/* Preview table */}
            {employees.length > 0 && (
              <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <SectionTitle>{employees.length} employee{employees.length !== 1 ? "s" : ""} ready to import</SectionTitle>
                  <button
                    onClick={() => setEmployees([])}
                    className="text-xs font-bold text-muted hover:text-red"
                  >
                    Clear all
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-0 bg-paper px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Dept</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border">
                    {employees.map((emp, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[2fr_2fr_1fr_1fr] items-center gap-0 px-4 py-2.5"
                      >
                        <span className="truncate text-sm font-semibold text-ink">
                          {emp.name}
                        </span>
                        <span className="truncate text-xs text-muted">{emp.email}</span>
                        <span className="truncate text-xs text-muted">
                          {emp.department}
                        </span>
                        <button
                          onClick={() => removeEmployee(i)}
                          className="ml-auto text-muted hover:text-red"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex h-14 flex-1 items-center justify-center rounded-2xl border border-border text-sm font-bold text-muted hover:border-ink hover:text-ink"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={employees.length === 0}
                className="flex h-14 flex-[3] items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Send Invites ────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-border bg-card p-6 md:p-8">
              <SectionTitle>Send Invites</SectionTitle>
              <p className="mb-6 text-sm leading-relaxed text-muted">
                Each person will receive a personalised invite link to set their password
                and complete their profile.
              </p>

              {/* Employee list */}
              <div className="mb-6 overflow-hidden rounded-xl border border-border">
                <div className="divide-y divide-border">
                  {employees.map((emp, i) => {
                    const result = inviteResults[i];
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                          {emp.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">
                            {emp.name}
                          </p>
                          <p className="truncate text-xs text-muted">{emp.email}</p>
                        </div>
                        {result && (
                          <span
                            className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              result.status === "sent"
                                ? "bg-green-soft text-green"
                                : result.status === "error"
                                  ? "bg-red-soft text-red"
                                  : "bg-paper text-muted"
                            }`}
                          >
                            {result.status === "sent"
                              ? "Sent"
                              : result.status === "error"
                                ? "Failed"
                                : "Pending"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress bar */}
              {inviting && (
                <div className="mb-6">
                  <div className="mb-2 flex justify-between text-xs font-bold text-muted">
                    <span>Sending invites...</span>
                    <span>
                      {inviteResults.filter((r) => r.status !== "pending").length} /{" "}
                      {employees.length}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-pulse transition-all duration-300"
                      style={{
                        width: `${
                          employees.length > 0
                            ? (inviteResults.filter((r) => r.status !== "pending").length /
                                employees.length) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {inviteDone ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl bg-green-soft px-4 py-3">
                    <Check size={16} className="text-green" />
                    <span className="text-sm font-bold text-green">
                      {inviteResults.filter((r) => r.status === "sent").length} invites
                      sent successfully
                      {inviteResults.filter((r) => r.status === "error").length > 0 &&
                        ` · ${inviteResults.filter((r) => r.status === "error").length} failed`}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push("/hr")}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-black text-white"
                  >
                    Done — Go to HR Dashboard
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(3)}
                    className="flex h-14 flex-1 items-center justify-center rounded-2xl border border-border text-sm font-bold text-muted hover:border-ink hover:text-ink"
                    disabled={inviting}
                  >
                    Back
                  </button>
                  <button
                    onClick={sendAllInvites}
                    disabled={inviting || !employees.length || !orgId}
                    className="flex h-14 flex-[3] items-center justify-center gap-2 rounded-2xl bg-pulse px-4 text-sm font-black text-white shadow-[0_18px_34px_rgba(232,68,10,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {inviting ? (
                      <>
                        <Loader2 size={17} className="animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send All Invites
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 font-syne text-xl font-bold text-ink">{children}</h2>
  );
}

function SmallField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </span>
      <input
        type={label.toLowerCase().includes("email") ? "email" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-paper px-3 text-sm text-ink outline-none focus:border-pulse"
      />
    </div>
  );
}
