"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { NIGERIAN_STATES } from "@/lib/payrollInputs";
import PayrollDialog from "./PayrollDialog";
import { api, errorParts, naira } from "./payrollClient";
import styles from "./payroll.module.css";

/**
 * One person's pay and payroll details.
 *
 * Pay history is shown newest first and cannot be edited: a change is a new
 * record from a date. That is what lets an old month be recalculated from what
 * was true then, and it is why the form asks "from when?" before "how much?".
 */

type Component = { code: string; label: string; amountKobo: number; taxable: boolean; pensionable: boolean; isBasic: boolean };

type Detail = {
  person: { id: string; name: string | null; email: string | null; department: string | null; join_date: string | null };
  compensation: Array<{ id: string; effective_from: string; components: Component[]; grade: string | null; reason: string | null }>;
  profile: Record<string, unknown> | null;
};

type DraftComponent = { code: string; label: string; amount: string; taxable: boolean; pensionable: boolean; isBasic: boolean };

const STARTER: DraftComponent[] = [
  { code: "basic", label: "Basic salary", amount: "", taxable: true, pensionable: true, isBasic: true },
  { code: "housing", label: "Housing allowance", amount: "", taxable: true, pensionable: true, isBasic: false },
  { code: "transport", label: "Transport allowance", amount: "", taxable: true, pensionable: true, isBasic: false },
];

const nairaInput = (kobo: unknown) => (kobo === null || kobo === undefined || Number(kobo) === 0 ? "" : String(Number(kobo) / 100));

export default function PersonPay({ employeeId }: { employeeId: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [canPrepare, setCanPrepare] = useState(false);
  const [busy, setBusy] = useState("");
  const [profile, setProfile] = useState<Record<string, string | boolean>>({});
  const [profileError, setProfileError] = useState({ message: "", errors: [] as string[] });
  const [adding, setAdding] = useState(false);
  const [dialogError, setDialogError] = useState({ message: "", errors: [] as string[] });
  const [record, setRecord] = useState({ effectiveFrom: "", reason: "", grade: "", components: STARTER });

  const load = useCallback(async () => {
    try {
      const [detail, overview] = await Promise.all([
        api<Detail>(`/api/payroll/people/${employeeId}`),
        api<{ viewer: { canPrepare: boolean } }>("/api/payroll/overview"),
      ]);
      setData(detail);
      setCanPrepare(overview.viewer.canPrepare);
      const p = detail.profile ?? {};
      setProfile({
        taxState: (p.tax_state as string) ?? "",
        tin: (p.tin as string) ?? "",
        bankName: (p.bank_name as string) ?? "",
        bankCode: (p.bank_code as string) ?? "",
        accountNumber: (p.account_number as string) ?? "",
        accountName: (p.account_name as string) ?? "",
        pfaName: (p.pfa_name as string) ?? "",
        rsaPin: (p.rsa_pin as string) ?? "",
        nhfNumber: (p.nhf_number as string) ?? "",
        annualRent: nairaInput(p.annual_rent_kobo),
        nhisMonthly: nairaInput(p.nhis_monthly_kobo),
        lifeAssuranceAnnual: nairaInput(p.life_assurance_annual_kobo),
        exitDate: (p.exit_date as string) ?? "",
        pensionExempt: Boolean(p.pension_exempt),
        nhfExempt: Boolean(p.nhf_exempt),
      });
      setLoadError("");
    } catch (thrown) {
      setLoadError(errorParts(thrown).message);
    }
  }, [employeeId]);

  useEffect(() => {
    // Loaded after mount, in a callback, so the fetch never sets state during the effect itself.
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : load()));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const saveProfile = async () => {
    setBusy("profile");
    setProfileError({ message: "", errors: [] });
    try {
      await api(`/api/payroll/people/${employeeId}`, { method: "PUT", body: JSON.stringify(profile) });
      showToast("Payroll details saved.", "success");
      await load();
    } catch (thrown) {
      setProfileError(errorParts(thrown));
    } finally {
      setBusy("");
    }
  };

  const openNewRecord = () => {
    const latest = data?.compensation[0];
    setRecord({
      effectiveFrom: new Date().toISOString().slice(0, 10),
      reason: "",
      grade: latest?.grade ?? "",
      components: latest
        ? latest.components.map((c) => ({ code: c.code, label: c.label, amount: String(c.amountKobo / 100), taxable: c.taxable, pensionable: c.pensionable, isBasic: c.isBasic }))
        : STARTER,
    });
    setDialogError({ message: "", errors: [] });
    setAdding(true);
  };

  const addRecord = async () => {
    setBusy("record");
    setDialogError({ message: "", errors: [] });
    try {
      await api(`/api/payroll/people/${employeeId}/compensation`, { method: "POST", body: JSON.stringify(record) });
      showToast("Pay record added.", "success");
      setAdding(false);
      await load();
    } catch (thrown) {
      setDialogError(errorParts(thrown));
    } finally {
      setBusy("");
    }
  };

  const withdraw = async (id: string) => {
    setBusy(`withdraw:${id}`);
    try {
      await api(`/api/payroll/people/${employeeId}/compensation?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      showToast("Pay record withdrawn.", "success");
      await load();
    } catch (thrown) {
      showToast(errorParts(thrown).message, "error");
    } finally {
      setBusy("");
    }
  };

  const updateComponent = (index: number, patch: Partial<DraftComponent>) =>
    setRecord((current) => ({
      ...current,
      components: current.components.map((component, i) => {
        if (patch.isBasic && i !== index) return { ...component, isBasic: false };
        return i === index ? { ...component, ...patch } : component;
      }),
    }));

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
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  const text = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className={styles.field}>
      {label}
      <input value={String(profile[key] ?? "")} disabled={!canPrepare} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} {...props} />
    </label>
  );

  const draftGross = record.components.reduce((sum, component) => sum + (Number(component.amount) || 0), 0);

  return (
    <div className={styles.workspace}>
      <Link href="/payroll" className={styles.back}>
        <ArrowLeft size={14} /> Payroll
      </Link>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Pay and payroll details</p>
          <h1>{data.person.name ?? data.person.email}</h1>
          <p className={styles.muted}>
            {[data.person.department, data.person.join_date ? `joined ${data.person.join_date}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canPrepare ? (
          <button type="button" className={styles.primary} onClick={openNewRecord}>
            <Plus size={15} /> {data.compensation.length ? "Change pay" : "Set pay"}
          </button>
        ) : null}
      </div>

      <div className={styles.panel}>
        <h2>Pay history</h2>
        <p className={styles.muted}>Records are never edited. A change is a new record from the date it takes effect.</p>
        {data.compensation.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>From</th>
                <th>Components</th>
                <th className={styles.num}>Monthly gross</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.compensation.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.effective_from}</strong>
                    <small>{[entry.grade, entry.reason].filter(Boolean).join(" · ") || "—"}</small>
                  </td>
                  <td>
                    <small>
                      {entry.components.map((c) => `${c.label} ${naira(c.amountKobo)}${c.isBasic ? " (basic)" : ""}`).join(" · ")}
                    </small>
                  </td>
                  <td className={styles.num}>{naira(entry.components.reduce((sum, c) => sum + c.amountKobo, 0))}</td>
                  <td>
                    {canPrepare ? (
                      <button
                        type="button"
                        className={`${styles.small} ${styles.danger}`}
                        onClick={() => void withdraw(entry.id)}
                        disabled={busy === `withdraw:${entry.id}`}
                        aria-label={`Withdraw the pay record from ${entry.effective_from}`}
                        title="Only possible while no approved payroll has used this record"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.warning}>No pay is set up, so this person is not on payroll yet.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Payroll details</h2>
        <p className={styles.muted}>Changes to bank details are recorded with who made them.</p>
        {profileError.message ? (
          <div className={styles.error} role="alert">
            {profileError.message}
            {profileError.errors.length ? (
              <ul>
                {profileError.errors.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <h3 className={styles.eyebrow} style={{ marginTop: 14 }}>
          Tax
        </h3>
        <div className={styles.grid3}>
          <label className={styles.field}>
            Tax state
            <select aria-label="Tax state" value={String(profile.taxState ?? "")} disabled={!canPrepare} onChange={(event) => setProfile({ ...profile, taxState: event.target.value })}>
              <option value="">Use the organisation default</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <span className={styles.hint}>The state this person lives in, which receives their PAYE.</span>
          </label>
          {text("tin", "Tax identification number")}
          {text("exitDate", "Last working day", { type: "date" })}
        </div>

        <h3 className={styles.eyebrow}>Bank</h3>
        <div className={styles.grid3}>
          {text("bankName", "Bank")}
          {text("accountNumber", "Account number (10 digits)", { inputMode: "numeric", maxLength: 10 })}
          {text("accountName", "Account name")}
          {text("bankCode", "Bank code (optional)")}
        </div>

        <h3 className={styles.eyebrow}>Pension and NHF</h3>
        <div className={styles.grid3}>
          {text("pfaName", "Pension fund administrator")}
          {text("rsaPin", "RSA PIN")}
          {text("nhfNumber", "NHF number")}
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={Boolean(profile.pensionExempt)} disabled={!canPrepare} onChange={(event) => setProfile({ ...profile, pensionExempt: event.target.checked })} />
          Exempt from pension
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={Boolean(profile.nhfExempt)} disabled={!canPrepare} onChange={(event) => setProfile({ ...profile, nhfExempt: event.target.checked })} />
          Exempt from NHF
        </label>

        <h3 className={styles.eyebrow}>Declared reliefs</h3>
        <div className={styles.grid3}>
          {text("annualRent", "Annual rent paid (₦)", { type: "number", min: 0 })}
          {text("lifeAssuranceAnnual", "Annual life assurance premium (₦)", { type: "number", min: 0 })}
          {text("nhisMonthly", "NHIS deducted monthly (₦)", { type: "number", min: 0 })}
        </div>
        <p className={styles.hint}>Rent and life assurance reduce tax but are not deducted from pay. NHIS is deducted and relieved.</p>

        {canPrepare ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void saveProfile()} disabled={busy === "profile"}>
              {busy === "profile" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save payroll details
            </button>
          </div>
        ) : null}
      </div>

      <PayrollDialog
        open={adding}
        title={data.compensation.length ? "Change pay" : "Set pay"}
        onClose={() => setAdding(false)}
        busy={busy === "record"}
        error={dialogError.message}
        errors={dialogError.errors}
        footer={
          <button type="button" className={styles.primary} onClick={() => void addRecord()} disabled={busy === "record"}>
            {busy === "record" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save pay record
          </button>
        }
      >
        <div className={styles.grid3}>
          <label className={styles.field}>
            Takes effect from
            <input type="date" value={record.effectiveFrom} onChange={(event) => setRecord({ ...record, effectiveFrom: event.target.value })} />
          </label>
          <label className={styles.field}>
            Grade (optional)
            <input value={record.grade} onChange={(event) => setRecord({ ...record, grade: event.target.value })} />
          </label>
          <label className={styles.field}>
            Reason (optional)
            <input value={record.reason} onChange={(event) => setRecord({ ...record, reason: event.target.value })} placeholder="Annual review" />
          </label>
        </div>

        <h3 className={styles.eyebrow} style={{ marginTop: 10 }}>
          Monthly components
        </h3>
        {record.components.map((component, index) => (
          <div key={index} className={styles.componentRow}>
            <input className={styles.input} aria-label={`Component ${index + 1} code`} value={component.code} onChange={(event) => updateComponent(index, { code: event.target.value })} placeholder="code" />
            <input className={styles.input} aria-label={`Component ${index + 1} name`} value={component.label} onChange={(event) => updateComponent(index, { label: event.target.value })} placeholder="Name" />
            <input className={styles.input} aria-label={`Component ${index + 1} monthly amount in naira`} type="number" min={0} value={component.amount} onChange={(event) => updateComponent(index, { amount: event.target.value })} placeholder="₦ per month" />
            <label>
              <input type="radio" name="basic" checked={component.isBasic} onChange={() => updateComponent(index, { isBasic: true })} /> Basic
            </label>
            <label>
              <input type="checkbox" checked={component.taxable} onChange={(event) => updateComponent(index, { taxable: event.target.checked })} /> Taxable
            </label>
            <label>
              <input type="checkbox" checked={component.pensionable} onChange={(event) => updateComponent(index, { pensionable: event.target.checked })} /> Pension
            </label>
            <button
              type="button"
              className={`${styles.small} ${styles.danger}`}
              aria-label={`Remove ${component.label || "this component"}`}
              onClick={() => setRecord({ ...record, components: record.components.filter((_, i) => i !== index) })}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className={styles.spread} style={{ marginTop: 8 }}>
          <button
            type="button"
            className={styles.small}
            onClick={() => setRecord({ ...record, components: [...record.components, { code: "", label: "", amount: "", taxable: true, pensionable: false, isBasic: false }] })}
          >
            <Plus size={12} /> Add component
          </button>
          <span className={styles.muted}>Monthly gross: {naira(Math.round(draftGross * 100))}</span>
        </div>
      </PayrollDialog>
    </div>
  );
}
