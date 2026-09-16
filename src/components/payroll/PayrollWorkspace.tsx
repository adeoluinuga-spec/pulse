"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, CalendarPlus, Loader2, ShieldCheck, Users } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { NIGERIAN_STATES } from "@/lib/payrollInputs";
import PayrollDialog from "./PayrollDialog";
import { api, errorParts, monthLabel, naira, STATUS_LABEL } from "./payrollClient";
import styles from "./payroll.module.css";

/**
 * The payroll workspace: runs, the people on payroll, and setup.
 *
 * Setup is not a separate wizard because payroll is never finished being set
 * up — people join, bank accounts change, somebody new becomes the approver —
 * so what is missing is shown where the work happens, on every visit.
 */

type Run = {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  totals: { headcount?: number; netKobo?: number; grossKobo?: number; employerCostKobo?: number; blockerCount?: number };
  approved_at: string | null;
  calculated_at: string | null;
};

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  platformRole: string | null;
  joinDate: string | null;
  exitDate: string | null;
  onPayroll: boolean;
  currentPay: { effectiveFrom: string; grossKobo: number } | null;
  missing: string[];
};

type Overview = {
  viewer: { employeeId: string; canPrepare: boolean; canApprove: boolean; canViewAll: boolean; canManagePermissions: boolean };
  settings: { pensionEnabled: boolean; nhfEnabled: boolean; nsitfEnabled: boolean; itfEnabled: boolean; defaultTaxState: string | null; payDay: number | null; stored: boolean };
  currentRules: { id: string; label: string; verification: string } | null;
  people: Person[];
  runs: Run[];
  permissions: Array<{ employeeId: string; canPrepare: boolean; canApprove: boolean; canViewAll: boolean }>;
  approverCount: number;
};

type Tab = "runs" | "people" | "setup";

export default function PayrollWorkspace() {
  const { showToast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("runs");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogError, setDialogError] = useState({ message: "", errors: [] as string[] });

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const load = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/payroll/overview"));
      setLoadError("");
    } catch (thrown) {
      setLoadError(errorParts(thrown).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRun = async () => {
    setBusy("create");
    setDialogError({ message: "", errors: [] });
    try {
      const { run } = await api<{ run: { id: string } }>("/api/payroll/runs", { method: "POST", body: JSON.stringify(period) });
      showToast(`${monthLabel(period.year, period.month)} payroll started.`, "success");
      setCreating(false);
      router.push(`/payroll/runs/${run.id}`);
    } catch (thrown) {
      const { message, errors } = errorParts(thrown);
      setDialogError({ message, errors });
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    setBusy("settings");
    try {
      await api("/api/payroll/settings", { method: "PATCH", body: JSON.stringify(patch) });
      showToast("Payroll settings saved.", "success");
      await load();
    } catch (thrown) {
      showToast(errorParts(thrown).message, "error");
    } finally {
      setBusy("");
    }
  };

  const savePermission = async (employeeId: string, grant: { canPrepare: boolean; canApprove: boolean; canViewAll: boolean }) => {
    setBusy(`perm:${employeeId}`);
    try {
      await api("/api/payroll/permissions", { method: "POST", body: JSON.stringify({ employeeId, ...grant }) });
      showToast("Payroll access updated.", "success");
      await load();
    } catch (thrown) {
      showToast(errorParts(thrown).message, "error");
    } finally {
      setBusy("");
    }
  };

  const setupGaps = useMemo(() => {
    if (!data) return [];
    const gaps: string[] = [];
    if (!data.people.some((person) => person.onPayroll)) gaps.push("Nobody has pay set up yet. Add pay for each person on the People tab.");
    if (data.approverCount === 0) gaps.push("No payroll approver is named. A run cannot be approved until someone other than the preparer is given approval rights on the Setup tab.");
    if (data.currentRules?.verification !== "verified") {
      gaps.push("The tax rules have not been checked by a payroll professional. Review PAYROLL_TAX_EXAMPLES before running a real payroll.");
    }
    return gaps;
  }, [data]);

  if (loadError) {
    return (
      <div className={styles.workspace}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Payroll</p>
            <h1>Payroll</h1>
          </div>
        </div>
        <div className={styles.error} role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.workspace}>
        <p className={styles.muted}>
          <Loader2 size={14} className="animate-spin" /> Loading payroll…
        </p>
      </div>
    );
  }

  const onPayroll = data.people.filter((person) => person.onPayroll && !(person.exitDate && person.exitDate < new Date().toISOString().slice(0, 10)));
  const incomplete = onPayroll.filter((person) => person.missing.length);
  const latestApproved = data.runs.find((run) => run.status === "approved");

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>People operations</p>
          <h1>Payroll</h1>
          <p className={styles.muted}>
            Calculate pay, have it approved by a second person, then download the bank and remittance files. Pulse never moves
            money or files with a tax authority.
          </p>
        </div>
        {data.viewer.canPrepare ? (
          <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
            <CalendarPlus size={15} /> Start a payroll run
          </button>
        ) : null}
      </div>

      {setupGaps.length ? (
        <div className={styles.warning} role="status">
          <strong>Before the first real payroll</strong>
          <ul>
            {setupGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <strong>{onPayroll.length}</strong>
          <span>People on payroll</span>
        </div>
        <div className={styles.metric}>
          <strong>{incomplete.length}</strong>
          <span>With missing payroll details</span>
        </div>
        <div className={styles.metric}>
          <strong>{latestApproved ? naira(latestApproved.totals.netKobo ?? 0) : "—"}</strong>
          <span>{latestApproved ? `Net pay, ${monthLabel(latestApproved.period_year, latestApproved.period_month)}` : "No approved run yet"}</span>
        </div>
        <div className={styles.metric}>
          <strong>{data.approverCount}</strong>
          <span>Named approver{data.approverCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className={styles.tabs} role="group" aria-label="Payroll sections">
        {(
          [
            ["runs", "Payroll runs"],
            ["people", "People and pay"],
            ["setup", "Setup and access"],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "runs" ? (
        data.runs.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className={styles.num}>People</th>
                  <th className={styles.num}>Gross</th>
                  <th className={styles.num}>Net pay</th>
                  <th className={styles.num}>Cost to employer</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{monthLabel(run.period_year, run.period_month)}</strong>
                      <small>{run.calculated_at ? `Calculated ${new Date(run.calculated_at).toLocaleDateString("en-GB")}` : "Not calculated yet"}</small>
                    </td>
                    <td>
                      <span className={styles.badge} data-status={run.status}>
                        {STATUS_LABEL[run.status] ?? run.status}
                      </span>
                      {run.totals.blockerCount ? (
                        <small>
                          {run.totals.blockerCount} problem{run.totals.blockerCount === 1 ? "" : "s"} to fix
                        </small>
                      ) : null}
                    </td>
                    <td className={styles.num}>{run.totals.headcount ?? "—"}</td>
                    <td className={styles.num}>{run.totals.grossKobo !== undefined ? naira(run.totals.grossKobo) : "—"}</td>
                    <td className={styles.num}>{run.totals.netKobo !== undefined ? naira(run.totals.netKobo) : "—"}</td>
                    <td className={styles.num}>{run.totals.employerCostKobo !== undefined ? naira(run.totals.employerCostKobo) : "—"}</td>
                    <td>
                      <Link className={styles.small} href={`/payroll/runs/${run.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <Banknote size={32} />
            <h2>No payroll runs yet</h2>
            <p className={styles.muted}>
              A run is one month&apos;s pay for everyone on payroll. Set up pay on the People tab first, then start a run.
            </p>
            {data.viewer.canPrepare ? (
              <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                <CalendarPlus size={15} /> Start a payroll run
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {tab === "people" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Person</th>
                <th className={styles.num}>Monthly gross now</th>
                <th>Payroll details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.people.map((person) => (
                <tr key={person.id}>
                  <td>
                    <strong>{person.name ?? person.email}</strong>
                    <small>{[person.department, person.exitDate ? `leaves ${person.exitDate}` : null].filter(Boolean).join(" · ") || "—"}</small>
                  </td>
                  <td className={styles.num}>
                    {person.currentPay ? naira(person.currentPay.grossKobo) : <span className={styles.badge} data-tone="warn">Not on payroll</span>}
                    {person.currentPay ? <small>since {person.currentPay.effectiveFrom}</small> : null}
                  </td>
                  <td>
                    {person.missing.length ? (
                      <span className={styles.badge} data-tone={person.missing.includes("pay") ? "warn" : "bad"}>
                        <AlertTriangle size={11} /> Missing {person.missing.join(", ")}
                      </span>
                    ) : (
                      <span className={styles.badge} data-tone="good">
                        <ShieldCheck size={11} /> Complete
                      </span>
                    )}
                  </td>
                  <td>
                    <Link className={styles.small} href={`/payroll/people/${person.id}`}>
                      {data.viewer.canPrepare ? "Manage pay" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "setup" ? (
        <>
          <div className={styles.panel}>
            <h2>Tax rules in force</h2>
            {data.currentRules ? (
              <p className={styles.muted}>
                {data.currentRules.label} (<code>{data.currentRules.id}</code>).{" "}
                <span className={styles.badge} data-tone={data.currentRules.verification === "verified" ? "good" : "warn"}>
                  {data.currentRules.verification === "verified" ? "Checked by a payroll professional" : "Not yet checked"}
                </span>
              </p>
            ) : (
              <p className={styles.muted}>No tax rules cover today&apos;s date.</p>
            )}
          </div>

          <div className={styles.panel}>
            <h2>Statutory contributions</h2>
            <p className={styles.muted}>
              These change every future run. Runs already approved keep the settings they were calculated with.
            </p>
            {(
              [
                ["pensionEnabled", "Pension — 8% employee, 10% employer (organisations with 3 or more staff)"],
                ["nhfEnabled", "National Housing Fund — 2.5% of basic salary"],
                ["nsitfEnabled", "NSITF — 1% of gross pay, paid by the employer"],
                ["itfEnabled", "ITF — 1% of gross pay, paid by employers with 5 or more staff"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={styles.check}>
                <input
                  type="checkbox"
                  checked={data.settings[key]}
                  disabled={!data.viewer.canManagePermissions || busy === "settings"}
                  onChange={(event) => void saveSettings({ [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
            <div className={styles.grid2}>
              <label className={styles.field}>
                Default tax state
                <select
                  aria-label="Default tax state"
                  value={data.settings.defaultTaxState ?? ""}
                  disabled={!data.viewer.canManagePermissions || busy === "settings"}
                  onChange={(event) => void saveSettings({ defaultTaxState: event.target.value || null })}
                >
                  <option value="">No default — set per person</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <span className={styles.hint}>PAYE goes to the state each employee lives in. This fills the gap for anyone with no state recorded.</span>
              </label>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Who can do what</h2>
            <p className={styles.muted}>
              HR administrators prepare payroll automatically. Approval must be given to a named person — and nobody can approve a
              run they calculated, adjusted or submitted, even with approval rights.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Prepare</th>
                    <th>Approve</th>
                    <th>See all pay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((person) => {
                    const grant = data.permissions.find((entry) => entry.employeeId === person.id) ?? {
                      canPrepare: false,
                      canApprove: false,
                      canViewAll: false,
                    };
                    const isAdmin = person.platformRole === "hr_admin" || person.platformRole === "super_admin";
                    const disabled = !data.viewer.canManagePermissions || busy === `perm:${person.id}`;
                    const toggle = (key: "canPrepare" | "canApprove" | "canViewAll", value: boolean) =>
                      void savePermission(person.id, { ...grant, [key]: value });
                    return (
                      <tr key={person.id}>
                        <td>
                          <strong>{person.name ?? person.email}</strong>
                          {isAdmin ? <small>HR administrator</small> : null}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${person.name ?? "This person"} can prepare payroll`}
                            checked={isAdmin || grant.canPrepare}
                            disabled={disabled || isAdmin}
                            onChange={(event) => toggle("canPrepare", event.target.checked)}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${person.name ?? "This person"} can approve payroll`}
                            checked={grant.canApprove}
                            disabled={disabled}
                            onChange={(event) => toggle("canApprove", event.target.checked)}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${person.name ?? "This person"} can see everyone's pay`}
                            checked={isAdmin || grant.canViewAll}
                            disabled={disabled || isAdmin}
                            onChange={(event) => toggle("canViewAll", event.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <PayrollDialog
        open={creating}
        title="Start a payroll run"
        onClose={() => {
          setCreating(false);
          setDialogError({ message: "", errors: [] });
        }}
        busy={busy === "create"}
        error={dialogError.message}
        errors={dialogError.errors}
        footer={
          <button type="button" className={styles.primary} onClick={() => void createRun()} disabled={busy === "create"}>
            {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Start run
          </button>
        }
      >
        <p className={styles.muted}>
          The run starts as an empty draft. Nothing is calculated until you choose Calculate, so you can start a month early.
        </p>
        <div className={styles.grid2}>
          <label className={styles.field}>
            Month
            <select aria-label="Month" value={period.month} onChange={(event) => setPeriod({ ...period, month: Number(event.target.value) })}>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(Date.UTC(2000, index, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Year
            <input type="number" min={2020} max={2100} value={period.year} onChange={(event) => setPeriod({ ...period, year: Number(event.target.value) })} />
          </label>
        </div>
      </PayrollDialog>
    </div>
  );
}
