"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calculator, CheckCircle2, Download, Loader2, Plus, Send, Trash2, Undo2, XCircle } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import PayrollDialog from "./PayrollDialog";
import { api, errorParts, monthLabel, naira, STATUS_LABEL } from "./payrollClient";
import styles from "./payroll.module.css";

/**
 * One payroll run, from draft to approved.
 *
 * Every button's availability comes from the server's decision for this
 * viewer, and a disabled button shows the server's reason — so an approver who
 * also added an adjustment sees exactly why they cannot approve, instead of a
 * greyed-out control and a guess.
 */

type Decision = { allowed: true } | { allowed: false; reason: string };

type Line = {
  id: string;
  employee_id: string;
  employee_name: string;
  days_paid: number;
  days_in_period: number;
  earnings: Array<{ label: string; amountKobo: number; source: string }>;
  deductions: Array<{ label: string; amountKobo: number; statutory: boolean }>;
  employer: Array<{ label: string; amountKobo: number }>;
  gross_kobo: number;
  paye_kobo: number;
  pension_employee_kobo: number;
  nhf_kobo: number;
  other_deductions_kobo: number;
  net_kobo: number;
  employer_cost_kobo: number;
  tax_state: string | null;
  tax_working: {
    regime: string;
    annualGrossKobo: number;
    reliefs: Array<{ label: string; amountKobo: number }>;
    chargeableKobo: number;
    bands: Array<{ fromKobo: number; toKobo: number | null; rateBps: number; taxKobo: number }>;
    annualTaxKobo: number;
    exempt: boolean;
    minimumTaxApplied: boolean;
  } | null;
  blockers: string[];
  warnings: string[];
};

type Detail = {
  run: {
    id: string;
    period_year: number;
    period_month: number;
    status: string;
    revision: number;
    rule_set_id: string | null;
    totals: Record<string, number>;
    returned_reason: string | null;
    calculated_at: string | null;
    calculatedByName: string | null;
    submitted_at: string | null;
    submittedByName: string | null;
    approved_at: string | null;
    approvedByName: string | null;
  };
  state: { calculationIsCurrent: boolean; hasBeenCalculated: boolean; blockerCount: number; contributorIds: string[] };
  decisions: Record<"calculate" | "submit" | "return" | "approve" | "void" | "adjust", Decision>;
  viewer: { employeeId: string; canPrepare: boolean; canApprove: boolean };
  lines: Line[];
  adjustments: Array<{ id: string; employee_id: string; employeeName: string | null; label: string; kind: string; amount_kobo: number; taxable: boolean; pensionable: boolean }>;
  events: Array<{ action: string; actorName: string | null; created_at: string; payload: Record<string, unknown> }>;
};

const EVENT_LABEL: Record<string, string> = {
  created: "Run started",
  calculated: "Calculated",
  adjustment_added: "Adjustment added",
  adjustment_removed: "Adjustment removed",
  submitted: "Submitted for approval",
  returned: "Returned to preparer",
  approved: "Approved",
  voided: "Voided",
  exported: "File downloaded",
  payslip_viewed: "Payslip viewed",
  performance_bonuses_imported: "Performance bonuses imported",
};

const pct = (bps: number) => `${bps / 100}%`;

export default function RunView({ runId }: { runId: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<Line | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [dialogError, setDialogError] = useState({ message: "", errors: [] as string[] });
  const [adjustment, setAdjustment] = useState({ employeeId: "", label: "", kind: "earning", amount: "", taxable: true, pensionable: false });
  const [people, setPeople] = useState<Array<{ id: string; name: string | null; onPayroll: boolean }>>([]);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/payroll/runs/${runId}`));
      setLoadError("");
    } catch (thrown) {
      setLoadError(errorParts(thrown).message);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "calculate" | "submit" | "return" | "approve" | "void", extra: Record<string, unknown> = {}) => {
    if (!data) return;
    setBusy(action);
    setDialogError({ message: "", errors: [] });
    try {
      await api(`/api/payroll/runs/${runId}`, { method: "POST", body: JSON.stringify({ action, revision: data.run.revision, ...extra }) });
      const done = { calculate: "Payroll calculated.", submit: "Sent for approval.", return: "Returned to the preparer.", approve: "Payroll approved.", void: "Run voided." };
      showToast(done[action], "success");
      setReturning(false);
      setReason("");
      await load();
    } catch (thrown) {
      const { message, errors } = errorParts(thrown);
      if (action === "return") setDialogError({ message, errors });
      else showToast(message, "error");
      if ((thrown as { status?: number }).status === 409) await load();
    } finally {
      setBusy("");
    }
  };

  const openAdjustment = async () => {
    setAdding(true);
    setDialogError({ message: "", errors: [] });
    if (!people.length) {
      try {
        const overview = await api<{ people: Array<{ id: string; name: string | null; onPayroll: boolean }> }>("/api/payroll/overview");
        setPeople(overview.people);
      } catch (thrown) {
        setDialogError({ ...errorParts(thrown) });
      }
    }
  };

  const addAdjustment = async () => {
    setBusy("adjust");
    setDialogError({ message: "", errors: [] });
    try {
      await api(`/api/payroll/runs/${runId}/adjustments`, { method: "POST", body: JSON.stringify(adjustment) });
      showToast("Adjustment added. Recalculate to include it.", "success");
      setAdding(false);
      setAdjustment({ employeeId: "", label: "", kind: "earning", amount: "", taxable: true, pensionable: false });
      await load();
    } catch (thrown) {
      setDialogError(errorParts(thrown));
    } finally {
      setBusy("");
    }
  };

  const removeAdjustment = async (id: string) => {
    setBusy(`remove:${id}`);
    try {
      await api(`/api/payroll/runs/${runId}/adjustments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      showToast("Adjustment removed. Recalculate to update the figures.", "success");
      await load();
    } catch (thrown) {
      showToast(errorParts(thrown).message, "error");
    } finally {
      setBusy("");
    }
  };

  const download = async (type: "bank" | "paye" | "pension" | "nhf") => {
    setBusy(`export:${type}`);
    try {
      const response = await fetch(`/api/payroll/runs/${runId}/export?type=${type}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not download that file.");
      }
      const omitted = Number(response.headers.get("X-Pulse-Omitted") ?? 0);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `payroll-${type}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast(
        omitted ? `Downloaded. ${omitted} ${omitted === 1 ? "person was" : "people were"} left off — check their payroll details.` : "Downloaded.",
        omitted ? "warning" : "success",
      );
    } catch (thrown) {
      showToast(errorParts(thrown).message, "error");
    } finally {
      setBusy("");
    }
  };

  const problems = useMemo(() => {
    if (!data) return { blockers: 0, warnings: 0 };
    return {
      blockers: data.lines.reduce((sum, line) => sum + line.blockers.length, 0),
      warnings: data.lines.reduce((sum, line) => sum + line.warnings.length, 0),
    };
  }, [data]);

  if (loadError) {
    return (
      <div className={styles.workspace}>
        <Link href="/payroll" className={styles.back}>
          <ArrowLeft size={14} /> Payroll
        </Link>
        <div className={styles.error} role="alert">
          {loadError}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.workspace}>
        <p className={styles.muted}>Loading payroll run…</p>
      </div>
    );
  }

  const { run, state, decisions } = data;
  const t = run.totals;
  const reasonOf = (decision: Decision) => (decision.allowed ? undefined : decision.reason);
  const isDraft = run.status === "draft";

  return (
    <div className={styles.workspace}>
      <Link href="/payroll" className={styles.back}>
        <ArrowLeft size={14} /> Payroll
      </Link>

      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Payroll run</p>
          <h2>{monthLabel(run.period_year, run.period_month)}</h2>
          <p>
            <span className={styles.badge} data-status={run.status}>
              {STATUS_LABEL[run.status] ?? run.status}
            </span>{" "}
            {run.calculatedByName ? `Calculated by ${run.calculatedByName}. ` : ""}
            {run.submittedByName ? `Submitted by ${run.submittedByName}. ` : ""}
            {run.approvedByName ? `Approved by ${run.approvedByName}. ` : ""}
            {run.rule_set_id ? `Tax rules: ${run.rule_set_id}.` : ""}
          </p>
        </div>
      </div>

      {run.returned_reason && isDraft ? (
        <div className={styles.warning} role="status">
          <strong>Returned for changes:</strong> {run.returned_reason}
        </div>
      ) : null}
      {state.hasBeenCalculated && !state.calculationIsCurrent && (isDraft || run.status === "submitted") ? (
        <div className={styles.warning} role="status">
          Pay records, payroll details or adjustments have changed since this run was calculated. The figures below are out of date
          {isDraft ? " — recalculate before submitting." : " — return it so it can be recalculated."}
        </div>
      ) : null}

      <div className={styles.row} style={{ marginBottom: 12 }}>
        {isDraft && data.viewer.canPrepare ? (
          <>
            <button type="button" className={styles.button} onClick={() => void act("calculate")} disabled={!decisions.calculate.allowed || Boolean(busy)} title={reasonOf(decisions.calculate)}>
              {busy === "calculate" ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
              {state.hasBeenCalculated ? "Recalculate" : "Calculate"}
            </button>
            <button type="button" className={styles.primary} onClick={() => void act("submit")} disabled={!decisions.submit.allowed || Boolean(busy)} title={reasonOf(decisions.submit)}>
              {busy === "submit" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit for approval
            </button>
            <button type="button" className={styles.button} onClick={() => void openAdjustment()} disabled={!decisions.adjust.allowed || Boolean(busy)} title={reasonOf(decisions.adjust)}>
              <Plus size={14} /> Add adjustment
            </button>
            <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => void act("void")} disabled={!decisions.void.allowed || Boolean(busy)} title={reasonOf(decisions.void)}>
              <XCircle size={14} /> Void
            </button>
          </>
        ) : null}
        {run.status === "submitted" && data.viewer.canApprove ? (
          <>
            <button type="button" className={styles.approve} onClick={() => void act("approve")} disabled={!decisions.approve.allowed || Boolean(busy)} title={reasonOf(decisions.approve)}>
              {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve payroll
            </button>
            <button type="button" className={styles.button} onClick={() => setReturning(true)} disabled={!decisions.return.allowed || Boolean(busy)} title={reasonOf(decisions.return)}>
              <Undo2 size={14} /> Return for changes
            </button>
          </>
        ) : null}
        {run.status === "approved"
          ? (
              [
                ["bank", "Bank payment file"],
                ["paye", "PAYE by state"],
                ["pension", "Pension schedule"],
                ["nhf", "NHF schedule"],
              ] as const
            ).map(([type, label]) => (
              <button key={type} type="button" className={type === "bank" ? styles.primary : styles.button} onClick={() => void download(type)} disabled={Boolean(busy)}>
                {busy === `export:${type}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {label}
              </button>
            ))
          : null}
      </div>

      {run.status === "submitted" && data.viewer.canApprove && !decisions.approve.allowed ? (
        <p className={styles.notice}>{decisions.approve.reason}</p>
      ) : null}
      {isDraft && state.hasBeenCalculated && !decisions.submit.allowed ? <p className={styles.notice}>{decisions.submit.reason}</p> : null}

      {state.hasBeenCalculated ? (
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <strong>{t.headcount ?? 0}</strong>
            <span>People paid</span>
          </div>
          <div className={styles.metric}>
            <strong>{naira(t.grossKobo ?? 0)}</strong>
            <span>Gross pay</span>
          </div>
          <div className={styles.metric}>
            <strong>{naira(t.payeKobo ?? 0)}</strong>
            <span>PAYE</span>
          </div>
          <div className={styles.metric}>
            <strong>{naira((t.pensionEmployeeKobo ?? 0) + (t.pensionEmployerKobo ?? 0))}</strong>
            <span>Pension (both sides)</span>
          </div>
          <div className={styles.metric}>
            <strong>{naira(t.netKobo ?? 0)}</strong>
            <span>Net pay to bank</span>
          </div>
          <div className={styles.metric}>
            <strong>{naira(t.employerCostKobo ?? 0)}</strong>
            <span>Total cost to employer</span>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>
          <Calculator size={30} />
          <h2>Not calculated yet</h2>
          <p className={styles.muted}>
            Add any bonuses or deductions for this month first, then calculate. You can recalculate as often as you need until the
            run is submitted.
          </p>
        </div>
      )}

      {problems.blockers || problems.warnings ? (
        <p className={problems.blockers ? styles.error : styles.warning}>
          {problems.blockers ? `${problems.blockers} problem${problems.blockers === 1 ? "" : "s"} must be fixed before this run can be submitted. ` : ""}
          {problems.warnings ? `${problems.warnings} note${problems.warnings === 1 ? "" : "s"} worth checking.` : ""} Open a person to see the detail.
        </p>
      ) : null}

      {data.lines.length ? (
        <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Person</th>
                <th className={styles.num}>Gross</th>
                <th className={styles.num}>PAYE</th>
                <th className={styles.num}>Pension</th>
                <th className={styles.num}>NHF</th>
                <th className={styles.num}>Other</th>
                <th className={styles.num}>Net pay</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <button type="button" className={styles.small} onClick={() => setSelected(line)} aria-label={`Show the breakdown for ${line.employee_name}`}>
                      {line.employee_name}
                    </button>
                    <small>
                      {line.days_paid < line.days_in_period ? `${line.days_paid} of ${line.days_in_period} days · ` : ""}
                      {line.tax_state ?? "no tax state"}
                    </small>
                  </td>
                  <td className={styles.num}>{naira(line.gross_kobo)}</td>
                  <td className={styles.num}>{naira(line.paye_kobo)}</td>
                  <td className={styles.num}>{naira(line.pension_employee_kobo)}</td>
                  <td className={styles.num}>{naira(line.nhf_kobo)}</td>
                  <td className={styles.num}>{naira(line.other_deductions_kobo)}</td>
                  <td className={styles.num}>
                    <strong>{naira(line.net_kobo)}</strong>
                  </td>
                  <td>
                    {line.blockers.length || line.warnings.length ? (
                      <ul className={styles.issues}>
                        {line.blockers.map((entry) => (
                          <li key={entry} data-kind="blocker">
                            {entry}
                          </li>
                        ))}
                        {line.warnings.map((entry) => (
                          <li key={entry} data-kind="warning">
                            {entry}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data.adjustments.length || (isDraft && data.viewer.canPrepare) ? (
        <div className={styles.panel}>
          <div className={styles.spread}>
            <h2>Adjustments this month</h2>
          </div>
          <p className={styles.muted}>
            One-off earnings and deductions. Anyone who adds or removes one cannot approve this run.
          </p>
          {data.adjustments.length ? (
            <table className={styles.table}>
              <tbody>
                {data.adjustments.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.label}</strong>
                      <small>
                        {entry.employeeName} · {entry.kind === "earning" ? `earning${entry.taxable ? ", taxable" : ", not taxable"}${entry.pensionable ? ", pensionable" : ""}` : "deduction after tax"}
                      </small>
                    </td>
                    <td className={styles.num}>
                      {entry.kind === "deduction" ? "−" : "+"}
                      {naira(entry.amount_kobo)}
                    </td>
                    <td>
                      {isDraft && decisions.adjust.allowed ? (
                        <button type="button" className={`${styles.small} ${styles.danger}`} onClick={() => void removeAdjustment(entry.id)} disabled={busy === `remove:${entry.id}`} aria-label={`Remove ${entry.label}`}>
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>None yet.</p>
          )}
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>History</h2>
        <ul className={styles.timeline}>
          {data.events.map((event, index) => (
            <li key={`${event.created_at}-${index}`}>
              <span>
                <strong>{EVENT_LABEL[event.action] ?? event.action}</strong>
                {event.actorName ? ` — ${event.actorName}` : ""}
                {event.action === "returned" && typeof event.payload.reason === "string" ? `: “${event.payload.reason}”` : ""}
                {event.action === "exported" && typeof event.payload.type === "string" ? ` (${event.payload.type})` : ""}
              </span>
              <span className={styles.muted}>{new Date(event.created_at).toLocaleString("en-GB")}</span>
            </li>
          ))}
        </ul>
      </div>

      <PayrollDialog open={Boolean(selected)} title={selected ? `${selected.employee_name} — ${monthLabel(run.period_year, run.period_month)}` : ""} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <div className={styles.grid2}>
              <div>
                <h3 className={styles.eyebrow}>Earnings</h3>
                <table className={styles.table}>
                  <tbody>
                    {selected.earnings.map((entry, index) => (
                      <tr key={`${entry.label}-${index}`}>
                        <td>{entry.label}</td>
                        <td className={styles.num}>{naira(entry.amountKobo)}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>Gross pay</td>
                      <td className={styles.num}>{naira(selected.gross_kobo)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className={styles.eyebrow}>Deductions</h3>
                <table className={styles.table}>
                  <tbody>
                    {selected.deductions.map((entry, index) => (
                      <tr key={`${entry.label}-${index}`}>
                        <td>{entry.label}</td>
                        <td className={styles.num}>{naira(entry.amountKobo)}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>Net pay</td>
                      <td className={styles.num}>{naira(selected.net_kobo)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {selected.tax_working ? (
              <>
                <h3 className={styles.eyebrow} style={{ marginTop: 16 }}>
                  How PAYE was worked out (annual)
                </h3>
                <table className={styles.table}>
                  <tbody>
                    <tr>
                      <td>Annual gross income</td>
                      <td className={styles.num}>{naira(selected.tax_working.annualGrossKobo)}</td>
                    </tr>
                    {selected.tax_working.reliefs.map((relief) => (
                      <tr key={relief.label}>
                        <td>less {relief.label}</td>
                        <td className={styles.num}>({naira(relief.amountKobo)})</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>Chargeable income</td>
                      <td className={styles.num}>{naira(selected.tax_working.chargeableKobo)}</td>
                    </tr>
                    {selected.tax_working.bands.map((band) => (
                      <tr key={band.fromKobo}>
                        <td>
                          {pct(band.rateBps)} on {naira(band.fromKobo)} – {band.toKobo === null ? "above" : naira(band.toKobo)}
                        </td>
                        <td className={styles.num}>{naira(band.taxKobo)}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>
                        Annual tax{selected.tax_working.exempt ? " (minimum-wage exemption)" : ""}
                        {selected.tax_working.minimumTaxApplied ? " (minimum tax)" : ""}
                      </td>
                      <td className={styles.num}>{naira(selected.tax_working.annualTaxKobo)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}
            {selected.employer.length ? (
              <p className={styles.muted} style={{ marginTop: 12 }}>
                Employer also pays: {selected.employer.map((entry) => `${entry.label} ${naira(entry.amountKobo)}`).join(" · ")}. Total cost{" "}
                {naira(selected.employer_cost_kobo)}.
              </p>
            ) : null}
          </>
        ) : null}
      </PayrollDialog>

      <PayrollDialog
        open={returning}
        title="Return this run for changes"
        onClose={() => {
          setReturning(false);
          setDialogError({ message: "", errors: [] });
        }}
        busy={busy === "return"}
        error={dialogError.message}
        footer={
          <button type="button" className={styles.primary} onClick={() => void act("return", { reason })} disabled={busy === "return" || !reason.trim()}>
            <Undo2 size={14} /> Return run
          </button>
        }
      >
        <label className={styles.field}>
          What needs to change?
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Ada's arrears for August are missing." />
          <span className={styles.hint}>The preparer sees this on the run.</span>
        </label>
      </PayrollDialog>

      <PayrollDialog
        open={adding}
        title="Add an adjustment"
        onClose={() => {
          setAdding(false);
          setDialogError({ message: "", errors: [] });
        }}
        busy={busy === "adjust"}
        error={dialogError.message}
        errors={dialogError.errors}
        footer={
          <button type="button" className={styles.primary} onClick={() => void addAdjustment()} disabled={busy === "adjust"}>
            <Plus size={14} /> Add
          </button>
        }
      >
        <div className={styles.grid2}>
          <label className={styles.field}>
            Person
            <select aria-label="Person" value={adjustment.employeeId} onChange={(event) => setAdjustment({ ...adjustment, employeeId: event.target.value })}>
              <option value="">Choose someone</option>
              {people
                .filter((person) => person.onPayroll)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field}>
            Type
            <select aria-label="Type" value={adjustment.kind} onChange={(event) => setAdjustment({ ...adjustment, kind: event.target.value })}>
              <option value="earning">Earning — bonus, arrears, overtime</option>
              <option value="deduction">Deduction — loan, advance, other</option>
            </select>
          </label>
          <label className={styles.field}>
            Description
            <input value={adjustment.label} onChange={(event) => setAdjustment({ ...adjustment, label: event.target.value })} placeholder="Q3 performance bonus" />
          </label>
          <label className={styles.field}>
            Amount (₦)
            <input type="number" min={0} step="0.01" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} />
          </label>
        </div>
        {adjustment.kind === "earning" ? (
          <>
            <label className={styles.check}>
              <input type="checkbox" checked={adjustment.taxable} onChange={(event) => setAdjustment({ ...adjustment, taxable: event.target.checked })} /> Taxable
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={adjustment.pensionable} onChange={(event) => setAdjustment({ ...adjustment, pensionable: event.target.checked })} /> Pensionable
            </label>
          </>
        ) : (
          <p className={styles.hint}>Deductions are taken after tax.</p>
        )}
      </PayrollDialog>
    </div>
  );
}
