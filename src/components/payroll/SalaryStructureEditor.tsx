"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { validateSalaryStructure } from "@/lib/payrollSalaryStructure";
import { api, errorParts } from "./payrollClient";
import styles from "./payroll.module.css";

type Row = { code: string; label: string; percent: number | string; taxable: boolean; pensionable: boolean; isBasic: boolean };
type Stored = { code: string; label: string; percentBps: number; taxable: boolean; pensionable: boolean; isBasic: boolean };

const STARTER: Row[] = [
  { code: "basic", label: "Basic salary", percent: 40, taxable: true, pensionable: true, isBasic: true },
  { code: "housing", label: "Housing allowance", percent: 5, taxable: true, pensionable: true, isBasic: false },
  { code: "transport", label: "Transport allowance", percent: 5, taxable: true, pensionable: true, isBasic: false },
  { code: "other", label: "Other allowance", percent: 50, taxable: true, pensionable: false, isBasic: false },
];

export default function SalaryStructureEditor({ structure, version, canEdit, onSaved }: {
  structure: Stored[] | null;
  version: number;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Row[]>(STARTER);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setRows(structure?.length ? structure.map((row) => ({ ...row, percent: row.percentBps / 100 })) : STARTER);
  }, [structure]);

  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, at) => ({
    ...row,
    ...(at === index ? patch : {}),
    ...(patch.isBasic && at !== index ? { isBasic: false } : {}),
  })));
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);

  async function save() {
    const result = validateSalaryStructure(rows);
    if (!result.ok) { setErrors(result.errors); return; }
    setBusy(true);
    setErrors([]);
    try {
      await api("/api/payroll/settings", { method: "PATCH", body: JSON.stringify({ salaryStructure: rows }) });
      await onSaved();
      showToast("Organisation salary structure saved.", "success");
    } catch (error) {
      const parts = errorParts(error);
      setErrors([parts.message, ...parts.errors]);
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.panel}>
      <h2>Salary structure</h2>
      <p className={styles.muted}>New pay records use these percentages of annual gross. Existing pay records keep their saved amounts.</p>
      <p className={styles.hint}>{structure?.length ? `Structure version ${version}` : "Set this up before entering annual gross for employees."}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Code</th><th>Component</th><th>Share of gross</th><th>Basic</th><th>Taxable</th><th>Pensionable</th><th /></tr></thead>
          <tbody>{rows.map((row, index) => (
            <tr key={index}>
              <td><input className={styles.input} aria-label={`Component ${index + 1} code`} value={row.code} disabled={!canEdit || busy} onChange={(event) => update(index, { code: event.target.value })} /></td>
              <td><input className={styles.input} aria-label={`Component ${index + 1} name`} value={row.label} disabled={!canEdit || busy} onChange={(event) => update(index, { label: event.target.value })} /></td>
              <td><input className={styles.input} aria-label={`${row.label} percentage`} type="number" min="0.01" max="100" step="0.01" value={row.percent} disabled={!canEdit || busy} onChange={(event) => update(index, { percent: event.target.value })} />%</td>
              <td><input type="radio" name="salary-basic" aria-label={`${row.label} is basic`} checked={row.isBasic} disabled={!canEdit || busy} onChange={() => update(index, { isBasic: true })} /></td>
              <td><input type="checkbox" aria-label={`${row.label} is taxable`} checked={row.taxable} disabled={!canEdit || busy} onChange={(event) => update(index, { taxable: event.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${row.label} is pensionable`} checked={row.pensionable} disabled={!canEdit || busy} onChange={(event) => update(index, { pensionable: event.target.checked })} /></td>
              <td>{canEdit ? <button type="button" className={`${styles.small} ${styles.danger}`} aria-label={`Remove ${row.label}`} disabled={busy} onClick={() => setRows(rows.filter((_, at) => at !== index))}><Trash2 size={14} /></button> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={styles.spread}>
        <strong>Total: {total.toFixed(2)}%</strong>
        {canEdit ? <div className={styles.actions}>
          <button type="button" className={styles.small} disabled={busy || rows.length >= 30} onClick={() => setRows([...rows, { code: "", label: "", percent: "", taxable: true, pensionable: false, isBasic: false }])}><Plus size={14} /> Add component</button>
          <button type="button" className={styles.primary} disabled={busy || Math.round(total * 100) !== 10_000} onClick={() => void save()}><Save size={14} /> Save structure</button>
        </div> : null}
      </div>
      {errors.length ? <div className={styles.error} role="alert"><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null}
    </div>
  );
}
