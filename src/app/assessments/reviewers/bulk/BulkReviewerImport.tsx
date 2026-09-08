"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";

type Cycle = {
  id: string;
  name: string;
};

type ReportRow = {
  rowNumber: number;
  subjectEmail: string;
  raterName: string;
  raterEmail: string;
  relationshipType: string;
  status: "valid" | "error";
  errors: string[];
  warnings: string[];
};

type BulkResponse = {
  imported?: boolean;
  canImport?: boolean;
  requiresConfirmation?: boolean;
  assignmentCount?: number;
  rows?: ReportRow[];
  loadWarnings?: Array<{ reviewerEmail: string; assignmentCount: number; cap: number; message: string }>;
  errorReportCsv?: string;
  error?: string;
};

function downloadReport(csv?: string) {
  if (!csv) return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulse-reviewer-bulk-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function BulkReviewerImport() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cap, setCap] = useState(6);
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCycles() {
      const response = await fetch("/api/assessments/cycles", { cache: "no-store" });
      const data = await response.json();
      if (cancelled) return;
      const nextCycles = (data?.cycles ?? []) as Cycle[];
      setCycles(nextCycles);
      setCycleId(nextCycles[0]?.id ?? "");
    }

    void loadCycles();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(confirm: boolean) {
    if (!file || !cycleId) {
      setNotice("Choose an assessment cycle and upload a CSV or XLSX file.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const formData = new FormData();
      formData.set("cycleId", cycleId);
      formData.set("confirm", String(confirm));
      formData.set("cap", String(cap));
      formData.set("file", file);

      const response = await fetch("/api/assessments/reviewers/bulk", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as BulkResponse;
      setResult(data);

      if (!response.ok && response.status !== 422) {
        throw new Error(data.error ?? "Unable to process reviewer import");
      }

      if (confirm && response.ok) {
        setNotice(`${data.assignmentCount ?? 0} reviewer assignments imported.`);
      } else if (data.canImport) {
        setNotice("Validation passed. Confirm when you are ready to create the assignments.");
      } else {
        setNotice("Validation found issues. Download the row report, fix the file, and upload again.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to process reviewer import.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-muted">Reviewer setup</p>
            <h1 className="mt-1 text-2xl font-black text-ink">Bulk import rater assignments</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Upload `subject_email`, `rater_name`, `rater_email`, `relationship_type`, and optional `organisation`.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadReport(result?.errorReportCsv)}
            disabled={!result?.errorReportCsv}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-black text-ink disabled:opacity-40"
          >
            <Download size={17} />
            Download report
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr]">
          <label>
            <span className="text-xs font-bold text-muted">Assessment cycle</span>
            <select
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-bold text-muted">Rater cap warning</span>
            <input
              type="number"
              min={1}
              value={cap}
              onChange={(event) => setCap(Number(event.target.value))}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-pulse"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 self-end rounded-lg border border-border bg-white px-4 text-sm font-black text-ink">
            <Upload size={17} />
            {file ? file.name : "Choose file"}
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={loading || !file}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pulse px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            Validate file
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={loading || !file || !result?.canImport}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-40"
          >
            Create assignments
          </button>
        </div>

        {notice && <p className="mt-4 rounded-lg bg-pulse-soft p-3 text-sm font-bold text-pulse">{notice}</p>}
      </section>

      {result?.loadWarnings && result.loadWarnings.length > 0 && (
        <section className="mt-4 rounded-lg border border-amber/30 bg-amber-soft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 text-amber" />
            <div>
              <h2 className="text-sm font-black text-amber">Rater load warnings</h2>
              <div className="mt-2 space-y-1 text-sm font-bold leading-6 text-amber">
                {result.loadWarnings.map((warning) => (
                  <p key={warning.reviewerEmail}>{warning.message}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {result?.rows && (
        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-black text-ink">Row validation</h2>
            <p className="mt-1 text-sm text-muted">{result.rows.length} row{result.rows.length === 1 ? "" : "s"} checked</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-paper text-xs font-black uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Rater</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-4 py-3 font-bold">{row.rowNumber}</td>
                    <td className="px-4 py-3">{row.subjectEmail}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink">{row.raterName}</p>
                      <p className="text-xs text-muted">{row.raterEmail}</p>
                    </td>
                    <td className="px-4 py-3">{row.relationshipType}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-black ${row.status === "valid" ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-muted">
                      {[...row.errors, ...row.warnings].join(" ") || "No issues"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
