"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Play, RotateCcw } from "lucide-react";

type Cycle = {
  id: string;
  name: string;
  status: string;
};

type ReportEntry = {
  key: string;
  type: "individual" | "aggregate";
  subjectName?: string;
  status: "pending" | "running" | "complete" | "failed";
  filename: string;
  error?: string;
  bytes?: number;
  downloadUrl?: string | null;
};

type BatchJob = {
  jobId: string;
  status: "pending" | "running" | "complete" | "failed";
  total: number;
  complete: number;
  failed: number;
  reports: ReportEntry[];
};

export default function PdfReportBatch() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [job, setJob] = useState<BatchJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/assessments/cycles", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!alive) return;
        const nextCycles = payload.cycles ?? [];
        setCycles(nextCycles);
        setCycleId(nextCycles[0]?.id ?? "");
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load cycles"));
    return () => {
      alive = false;
    };
  }, []);

  const sortedReports = useMemo(() => {
    if (!job) return [];
    return [...job.reports].sort((a, b) => {
      if (a.type !== b.type) return a.type === "aggregate" ? -1 : 1;
      return (a.subjectName ?? a.filename).localeCompare(b.subjectName ?? b.filename);
    });
  }, [job]);

  async function runBatch(resume = false) {
    if (!cycleId && !job?.jobId) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/assessments/reports/pdf/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume && job ? { jobId: job.jobId } : { cycleId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate PDFs");
      setJob(payload);
      setNotice(`Generated ${payload.complete} of ${payload.total} PDFs.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to generate PDFs");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-4 py-6 text-ink sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse">Stuart Davidson</p>
            <h1 className="mt-2 text-3xl font-semibold">360 PDF report generation</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              className="h-11 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold"
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => runBatch(false)}
              disabled={busy || !cycleId}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-pulse px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Play size={16} /> Generate batch
            </button>
            {job ? (
              <button
                type="button"
                onClick={() => runBatch(true)}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-black/10 bg-white px-4 text-sm font-semibold"
              >
                <RotateCcw size={16} /> Resume
              </button>
            ) : null}
          </div>
        </header>

        {notice ? <p className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm font-semibold">{notice}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Total</p>
            <p className="mt-2 text-3xl font-semibold">{job?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Complete</p>
            <p className="mt-2 text-3xl font-semibold text-green">{job?.complete ?? 0}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Failed</p>
            <p className="mt-2 text-3xl font-semibold text-amber">{job?.failed ?? 0}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <div className="grid grid-cols-[1.3fr_0.8fr_0.7fr_0.6fr] gap-3 border-b border-black/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <span>Report</span>
            <span>Type</span>
            <span>Status</span>
            <span>File</span>
          </div>
          {sortedReports.length ? sortedReports.map((report) => (
            <div key={report.key} className="grid grid-cols-[1.3fr_0.8fr_0.7fr_0.6fr] items-center gap-3 border-b border-black/5 px-4 py-3 text-sm last:border-b-0">
              <span className="font-semibold">{report.subjectName ?? "Aggregate cohort report"}</span>
              <span className="capitalize text-muted">{report.type}</span>
              <span className="font-semibold capitalize">{report.status}</span>
              {report.downloadUrl ? (
                <a href={report.downloadUrl} className="inline-flex items-center gap-2 font-semibold text-pulse">
                  <Download size={15} /> PDF
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 text-muted"><FileText size={15} /> Pending</span>
              )}
            </div>
          )) : (
            <div className="px-4 py-10 text-sm font-semibold text-muted">No batch has been generated yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
