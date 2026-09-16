"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

import PayrollDialog from "./PayrollDialog";
import { api, errorParts, monthLabel, naira } from "./payrollClient";
import styles from "./payroll.module.css";

/**
 * Your own payslips, and nobody else's.
 *
 * Only approved months appear. The routes behind this take no employee id, so
 * there is nothing on this page that could be changed to show someone else.
 */

type Summary = { id: string; year: number; month: number; grossKobo: number; netKobo: number; payeKobo: number; approvedAt: string | null };

type Payslip = {
  organisationName: string;
  periodLabel: string;
  daysPaid: number;
  daysInPeriod: number;
  taxState: string | null;
  earnings: Array<{ label: string; amountKobo: number }>;
  deductions: Array<{ label: string; amountKobo: number }>;
  employer: Array<{ label: string; amountKobo: number }>;
  grossKobo: number;
  totalDeductionsKobo: number;
  netKobo: number;
};

export default function MyPayslips() {
  const [payslips, setPayslips] = useState<Summary[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ id: string; payslip: Payslip } | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api<{ payslips: Summary[] }>("/api/payroll/payslips")
      .then((body) => setPayslips(body.payslips))
      .catch((thrown) => setError(errorParts(thrown).message));
  }, []);

  const view = async (id: string) => {
    setBusy(id);
    try {
      const body = await api<{ payslip: Payslip }>(`/api/payroll/payslips/${id}`);
      setOpen({ id, payslip: body.payslip });
    } catch (thrown) {
      setError(errorParts(thrown).message);
    } finally {
      setBusy("");
    }
  };

  const downloadPdf = async (id: string) => {
    setBusy(`pdf:${id}`);
    try {
      const response = await fetch(`/api/payroll/payslips/${id}?format=pdf`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not download this payslip.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "payslip.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (thrown) {
      setError(errorParts(thrown).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Pay</p>
          <h1>My payslips</h1>
          <p className={styles.muted}>A payslip appears here once that month&apos;s payroll has been approved.</p>
        </div>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {payslips === null && !error ? <p className={styles.muted}>Loading…</p> : null}

      {payslips && !payslips.length ? (
        <div className={styles.empty}>
          <FileText size={32} />
          <h2>No payslips yet</h2>
          <p className={styles.muted}>When your organisation approves a payroll that includes you, the payslip will be here.</p>
        </div>
      ) : null}

      {payslips?.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={styles.num}>Gross</th>
                <th className={styles.num}>PAYE</th>
                <th className={styles.num}>Net pay</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payslips.map((slip) => (
                <tr key={slip.id}>
                  <td>
                    <strong>{monthLabel(slip.year, slip.month)}</strong>
                  </td>
                  <td className={styles.num}>{naira(slip.grossKobo)}</td>
                  <td className={styles.num}>{naira(slip.payeKobo)}</td>
                  <td className={styles.num}>
                    <strong>{naira(slip.netKobo)}</strong>
                  </td>
                  <td>
                    <div className={styles.row}>
                      <button type="button" className={styles.small} onClick={() => void view(slip.id)} disabled={busy === slip.id}>
                        {busy === slip.id ? <Loader2 size={12} className="animate-spin" /> : null} View
                      </button>
                      <button type="button" className={styles.small} onClick={() => void downloadPdf(slip.id)} disabled={busy === `pdf:${slip.id}`} aria-label={`Download the ${monthLabel(slip.year, slip.month)} payslip as a PDF`}>
                        {busy === `pdf:${slip.id}` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <PayrollDialog
        open={Boolean(open)}
        title={open ? `Payslip — ${open.payslip.periodLabel}` : ""}
        onClose={() => setOpen(null)}
        footer={
          open ? (
            <button type="button" className={styles.primary} onClick={() => void downloadPdf(open.id)}>
              <Download size={14} /> Download PDF
            </button>
          ) : null
        }
      >
        {open ? (
          <>
            <p className={styles.muted}>
              {open.payslip.organisationName} · paid for {open.payslip.daysPaid} of {open.payslip.daysInPeriod} days
              {open.payslip.taxState ? ` · tax state ${open.payslip.taxState}` : ""}
            </p>
            <div className={styles.grid2}>
              <table className={styles.table}>
                <tbody>
                  {open.payslip.earnings.map((row, index) => (
                    <tr key={`e-${index}`}>
                      <td>{row.label}</td>
                      <td className={styles.num}>{naira(row.amountKobo)}</td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td>Gross pay</td>
                    <td className={styles.num}>{naira(open.payslip.grossKobo)}</td>
                  </tr>
                </tbody>
              </table>
              <table className={styles.table}>
                <tbody>
                  {open.payslip.deductions.map((row, index) => (
                    <tr key={`d-${index}`}>
                      <td>{row.label}</td>
                      <td className={styles.num}>{naira(row.amountKobo)}</td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td>Net pay</td>
                    <td className={styles.num}>{naira(open.payslip.netKobo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {open.payslip.employer.length ? (
              <p className={styles.muted} style={{ marginTop: 12 }}>
                Your employer also pays on your behalf: {open.payslip.employer.map((row) => `${row.label} ${naira(row.amountKobo)}`).join(" · ")}.
              </p>
            ) : null}
          </>
        ) : null}
      </PayrollDialog>
    </div>
  );
}
