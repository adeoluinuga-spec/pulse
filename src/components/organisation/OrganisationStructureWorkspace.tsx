"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, ChevronRight, GitBranch, LayoutTemplate, Loader2, Plus, Save, Undo2, Users, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { applyStructureTemplate, effectiveResponsibility, parseStructure, RESPONSIBILITIES, structureChanges, structureFromEmployees,
  validateStructure, type Position, type StructureDocument, type StructureEmployee, type StructureTemplate } from "@/lib/organisationStructure";
import StructureChart from "./StructureChart";
import styles from "./structure.module.css";

type WorkspaceData = {
  organisationName: string; employees: StructureEmployee[];
  structure: { draft: StructureDocument; roster_baseline: StructureEmployee[]; revision: number; published_at: string | null; published: StructureDocument | null } | null;
  history: Array<{ revision: number; published_at: string }>;
};
async function loadWorkspace(): Promise<WorkspaceData> {
  const response = await fetch("/api/organisation/structure", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load your organisation.");
  return data;
}
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());

export default function OrganisationStructureWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [document, setDocument] = useState<StructureDocument | null>(null);
  const [baseline, setBaseline] = useState<StructureEmployee[]>([]);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState("");
  const [savedBaseline, setSavedBaseline] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undo, setUndo] = useState<Array<{ document: StructureDocument; baseline: StructureEmployee[] }>>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"templates" | "publish" | "remove" | "reload" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { showToast } = useToast();

  const adopt = useCallback((next: WorkspaceData) => {
    const doc = next.structure?.draft ?? structureFromEmployees(next.employees);
    setData(next); setDocument(doc); setBaseline(next.structure?.roster_baseline ?? next.employees);
    setRevision(next.structure?.revision ?? 0); setSaved(JSON.stringify(doc));
    setSavedBaseline(JSON.stringify(next.structure?.roster_baseline ?? next.employees)); setUndo([]);
    setSelectedId(previous => doc.positions.some(p => p.id === previous) ? previous : doc.positions[0]?.id ?? null);
  }, []);
  useEffect(() => {
    let active = true;
    loadWorkspace().then(next => { if (active) adopt(next); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adopt]);
  const dirty = document !== null && (JSON.stringify(document) !== saved || JSON.stringify(baseline) !== savedBaseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal(); else dialogRef.current?.close();
  }, [dialog]);

  const employees = data?.employees ?? [];
  const selected = document?.positions.find(p => p.id === selectedId) ?? null;
  const assigned = new Set(document?.positions.flatMap(p => p.employeeId ? [p.employeeId] : []) ?? []);
  const unassigned = employees.filter(e => !assigned.has(e.id));
  const issues = useMemo(() => document && data ? validateStructure(document, data.employees, true) : [], [document, data]);
  const changes = useMemo(() => document && data ? structureChanges(document, data.employees) : [], [document, data]);
  const filteredStaff = employees.filter(e => `${e.name} ${e.email} ${e.department ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const staleRoster = data ? JSON.stringify(baseline) !== JSON.stringify(data.employees) : false;

  function change(next: StructureDocument) {
    if (!document || busy) return;
    setUndo(previous => [...previous.slice(-39), { document, baseline }]); setDocument(next); setError("");
  }
  function edit(patch: Partial<Position>) {
    if (!document || !selected) return;
    change({ ...document, positions: document.positions.map(p => p.id === selected.id ? { ...p, ...patch } : p) });
  }
  function move(id: string, parentId: string | null) {
    if (!document || !document.positions.some(p => p.id === id)) return;
    const next = { ...document, positions: document.positions.map(p => p.id === id ? { ...p, parentId } : p) };
    const errors = validateStructure(next, employees);
    if (errors.length) { showToast(errors[0], "error"); return; }
    change(next); setSelectedId(id);
  }
  function add(kind: "position" | "department" | "team", employee?: StructureEmployee) {
    if (!document) return;
    if (document.positions.length >= 1000) { showToast("This chart supports up to 1,000 positions.", "error"); return; }
    const position: Position = {
      id: crypto.randomUUID(), title: employee?.role || (kind === "department" ? "Department lead" : kind === "team" ? "Team lead" : "New position"),
      employeeId: employee?.id ?? null, parentId: selected?.id ?? null,
      department: employee?.department || (kind === "department" ? "New department" : selected?.department || ""),
      team: employee?.team || (kind === "team" ? "New team" : selected?.team || ""),
      responsibility: kind === "department" ? "manager" : kind === "team" ? "team_lead" : "none",
    };
    change({ ...document, positions: [...document.positions, position] }); setSelectedId(position.id);
  }
  function assign(employeeId: string | null) {
    if (!document || !selected) return;
    change({ ...document, positions: document.positions.map(p => p.id === selected.id ? { ...p, employeeId }
      : employeeId && p.employeeId === employeeId ? { ...p, employeeId: null } : p) });
  }
  function chooseTemplate(template: StructureTemplate) {
    if (!document) return;
    const next = applyStructureTemplate(template, employees);
    change({ ...next, theme: document.theme, layout: document.layout });
    // Templates use the freshly loaded roster as their live baseline.
    setBaseline(employees); setSelectedId(next.positions[0]?.id ?? null); setDialog(null);
  }
  async function reload() {
    setBusy(true); setError(""); setDialog(null);
    try { adopt(await loadWorkspace()); } catch (e) { setError(e instanceof Error ? e.message : "Unable to reload."); }
    finally { setBusy(false); }
  }
  async function save(publish: boolean) {
    if (!document) return;
    setBusy(true); setError("");
    try {
      const parsed = parseStructure(document);
      const response = await fetch("/api/organisation/structure", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: parsed, revision, rosterBaseline: baseline, action: publish ? "publish" : "save" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the structure.");
      setRevision(result.revision); setSaved(JSON.stringify(parsed)); setSavedBaseline(JSON.stringify(baseline)); setDocument(parsed); setUndo([]); setDialog(null);
      showToast(publish ? "Structure published. Reporting lines and team leadership are now active in Pulse." : "Draft saved. Live reporting lines have not changed.", "success");
      if (publish) {
        try { adopt(await loadWorkspace()); }
        catch { setError("The structure was published, but the refreshed staff list could not load. Reload before editing again."); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); setDialog(null); }
    finally { setBusy(false); }
  }

  if (loading) return <div className={styles.notice} role="status"><Loader2 size={16} className="inline animate-spin" /> Loading your organisation and staff…</div>;
  if (!document || !data) return <section className={styles.workspace}><h1 className="text-xl font-semibold">Organisation structure</h1><div className={styles.error} role="alert">{error}</div><button className={styles.button} onClick={reload} disabled={busy}>Try again</button> <Link className={styles.button} href="/dashboard/hr">Back to HR</Link></section>;

  return <div className={styles.workspace} data-theme={document.theme}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/dashboard/hr">HR workspace</Link><ChevronRight size={12} /><span>Organisation structure</span></nav>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>{data.organisationName} / People & structure</div><h1>Give everyone a clear place.</h1><p>Build your organisation chart, assign your people, and connect the reporting lines that Pulse uses every day.</p></div>
      <div className={styles.actions}><button className={styles.button} onClick={() => save(false)} disabled={busy || (!dirty && revision > 0)}><Save size={15} />Save draft</button><button className={styles.primaryButton} onClick={() => setDialog("publish")} disabled={busy}><Check size={15} />Review & publish</button></div>
    </header>
    <div className={styles.stats}>
      {[[employees.length, "Existing staff"], [document.positions.filter(p => p.employeeId).length, "Assigned to positions"], [unassigned.length, "Still to place"], [new Set(document.positions.map(p => p.department).filter(Boolean)).size, "Departments in draft"]].map(([number, label]) => <div className={styles.stat} key={label}><strong>{number}</strong><span>{label}</span></div>)}
    </div>
    <div className={styles.inline}><span className={styles.status}>{dirty ? "Unsaved changes" : revision ? `Draft saved · revision ${revision}` : "Draft from existing staff"}</span><span className={styles.muted}>{data.structure?.published_at ? `Last published ${new Date(data.structure.published_at).toLocaleString()}` : "Not published yet"}</span><button className={styles.smallButton} disabled={busy} onClick={() => setDialog("reload")}>Reload</button></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {staleRoster && <div className={styles.error}>Staff records have changed since this draft began. Choose Templates → Use live reporting lines to start again from the current staff list, then review your changes.</div>}
    {!employees.length && <div className={styles.notice}>Start by <Link href="/dashboard/hr?mode=setup&tab=people" className="underline">adding your staff in People setup</Link>. You can still design vacant positions here.</div>}
    <div className={styles.toolbar}>
      <div className={styles.inline}><button className={styles.button} onClick={() => setDialog("templates")} disabled={busy}><LayoutTemplate size={14} />Templates</button><button className={styles.button} onClick={() => add("position")} disabled={busy}><Plus size={14} />Position</button><button className={styles.button} onClick={() => add("department")} disabled={busy}><Building2 size={14} />Department</button><button className={styles.button} onClick={() => add("team")} disabled={busy}><Users size={14} />Team</button><button className={styles.iconButton} aria-label="Undo last edit" disabled={!undo.length || busy} onClick={() => { const previous = undo[undo.length - 1]; setDocument(previous.document); setBaseline(previous.baseline); setUndo(undo.slice(0, -1)); }}><Undo2 size={15} /></button></div>
      <div className={styles.inline}><label>Layout<select aria-label="Layout" value={document.layout} disabled={busy} onChange={e => change({ ...document, layout: e.target.value as StructureDocument["layout"] })}><option value="vertical">Top to bottom</option><option value="horizontal">Left to right</option></select></label><label>Theme<select aria-label="Theme" value={document.theme} disabled={busy} onChange={e => change({ ...document, theme: e.target.value as StructureDocument["theme"] })}><option value="cobalt">Cobalt</option><option value="forest">Forest</option><option value="slate">Slate</option></select></label></div>
    </div>
    <div className={styles.editor}>
      <div><StructureChart document={document} employees={employees} selectedId={selectedId} onSelect={setSelectedId} onMove={move} disabled={busy} />
        <details className={styles.notice}><summary className="cursor-pointer font-semibold">{issues.length ? `${issues.length} things to resolve before publishing` : "Structure is ready for review"}</summary>{issues.length ? <ul className={styles.issues}>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>All staff are placed and reporting lines are valid. Review the changes before making them live.</p>}</details>
      </div>
      <aside className={styles.sidebar}>
        <section className={styles.panel}>
          <div className={styles.inline} style={{ justifyContent: "space-between" }}><h2>Position details</h2>{selected && <button className={styles.iconButton} aria-label="Deselect position" onClick={() => setSelectedId(null)}><X size={13} /></button>}</div>
          {selected ? <fieldset disabled={busy}>
            <p className={styles.muted}>Changes stay in your draft until you publish.</p>
            <label className={styles.field}>Position title<input value={selected.title} maxLength={160} onChange={e => edit({ title: e.target.value })} /></label>
            <label className={styles.field}>Assigned staff member<select aria-label="Assigned staff member" value={selected.employeeId ?? ""} onChange={e => assign(e.target.value || null)}><option value="">Vacant position</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.email}{assigned.has(e.id) && e.id !== selected.employeeId ? " (move here)" : ""}</option>)}</select><small>Choosing someone already placed moves them here and leaves their former position vacant.</small></label>
            <label className={styles.field}>Reports to<select aria-label="Reports to" value={selected.parentId ?? ""} onChange={e => move(selected.id, e.target.value || null)}><option value="">Top level · no line manager</option>{document.positions.filter(p => p.id !== selected.id).map(p => <option key={p.id} value={p.id}>{p.title} — {employees.find(e => e.id === p.employeeId)?.name ?? "Vacant"}</option>)}</select></label>
            <p className={styles.muted}>When the direct reporting position is vacant, Pulse uses the nearest occupied position above as the line manager. With one vacancy, this is normally two levels up.</p>
            <label className={styles.field}>Department<input list="structure-departments" value={selected.department} maxLength={120} onChange={e => edit({ department: e.target.value })} /></label>
            <datalist id="structure-departments">{[...new Set([...employees.map(e => e.department), ...document.positions.map(p => p.department)].filter(Boolean))].map(name => <option value={name!} key={name} />)}</datalist>
            <label className={styles.field}>Team<input list="structure-teams" value={selected.team} maxLength={120} onChange={e => edit({ team: e.target.value })} /><small>Use the same department and team names for people in the same group.</small></label>
            <datalist id="structure-teams">{[...new Set(document.positions.filter(p => p.department === selected.department).map(p => p.team).filter(Boolean))].map(name => <option value={name} key={name} />)}</datalist>
            <label className={styles.field}>Leadership responsibility<select aria-label="Leadership responsibility" value={selected.responsibility} onChange={e => edit({ responsibility: e.target.value as Position["responsibility"] })}>{RESPONSIBILITIES.map(r => <option value={r} key={r}>{r === "none" ? "Individual contributor" : titleCase(r)}</option>)}</select><small>{effectiveResponsibility(selected, document.positions) !== selected.responsibility ? "This person has direct reports, so Pulse will enable their manager workspace when published." : "Team leads and managers can open their manager workspace. HR and administrator access are managed separately."}</small></label>
            <div className={styles.actions} style={{ marginTop: 18 }}><button type="button" className={styles.smallButton} onClick={() => add("position")}><Plus size={12} />Add direct report</button><button type="button" className={styles.dangerButton} onClick={() => setDialog("remove")}>Remove position</button></div>
          </fieldset> : <p className={styles.muted}>Select a chart card to assign a person and choose their manager. With no selection, new positions are added at the top level.</p>}
        </section>
        <section className={styles.panel}><h2>Your staff <span className={styles.muted}>· {unassigned.length} unassigned</span></h2><p className={styles.muted}>Use existing staff records. No duplicate profiles.</p><label className={styles.field}>Find a staff member<input className={styles.search} placeholder="Search name, email or department" value={search} onChange={e => setSearch(e.target.value)} /></label><div className={styles.staffList}>
          {filteredStaff.map(e => { const position = document.positions.find(p => p.employeeId === e.id); return <div className={styles.staffRow} key={e.id}><div><strong>{e.name}</strong><small>{e.department || "No department"}{!position ? " · Unassigned" : ""}</small></div><button className={styles.smallButton} disabled={busy} onClick={() => { if (position) setSelectedId(position.id); else add("position", e); }}>{position ? "Edit" : "Place"}</button></div>; })}
          {!filteredStaff.length && <p className={styles.muted}>No staff match your search.</p>}
        </div><Link className={`${styles.smallButton} mt-3`} href="/dashboard/hr?mode=setup&tab=people">Manage staff records</Link></section>
      </aside>
    </div>
    <details className={styles.history}><summary>Publication history</summary>{data.history.length ? data.history.map(version => <p key={version.revision} className="mt-2">Revision {version.revision} · {new Date(version.published_at).toLocaleString()}</p>) : <p className="mt-2">Your first publication will appear here.</p>}</details>
    <dialog ref={dialogRef} className={styles.dialog} onCancel={event => { if (busy) event.preventDefault(); else setDialog(null); }} aria-labelledby="structure-dialog-title">
      {dialog === "templates" && <><h2 id="structure-dialog-title">Choose your starting structure</h2><p>This replaces the current draft. Live reporting lines change only when you publish. You can undo the template before saving.</p><div className={styles.templates}>
        {([ ["existing", "Use live reporting lines", "Import the current staff list, positions, departments and managers. Best when you are refining an existing organisation."],
          ["departments", "Department hierarchy", "An organisation lead with department leads and staff grouped beneath them. Assign people to the vacant lead positions."],
          ["blank", "Custom structure", "An empty canvas for your own shape. Add positions, departments and teams, then place your staff."] ] as const).map(([key, title, description]) => <button key={key} className={styles.template} onClick={() => chooseTemplate(key)}><strong>{title}</strong><span>{description}</span></button>)}
      </div></>}
      {dialog === "publish" && <><h2 id="structure-dialog-title">Review your organisation structure</h2><p>Publishing makes these reporting lines active for manager dashboards, 360 relationship checks and applicable manager report access. When a direct manager position is vacant, the nearest occupied position above becomes the effective line manager. Position titles, departments, teams and leadership responsibilities will also be updated.</p>
        {issues.length > 0 || staleRoster ? <div className={styles.error}><strong>Resolve these before publishing</strong><ul className={styles.issues}>{issues.map(issue => <li key={issue}>{issue}</li>)}{staleRoster && <li>The staff roster changed. Start from the live reporting lines.</li>}</ul></div> : <>
          <div className={styles.notice}><strong>{changes.length} staff record{changes.length === 1 ? "" : "s"} will change.</strong><p>{document.positions.filter(p => p.employeeId && !p.parentId).length} top-level staff · {document.positions.filter(p => !p.employeeId).length} vacant positions. Themes and chart layout do not affect permissions.</p></div>
          <div className={styles.reviewList}>{changes.map(({ employee, managerId, fields }) => <div key={employee.id} className={styles.reviewRow}><strong>{employee.name}</strong><span>{fields.join(", ")}<br />Manager: {employees.find(e => e.id === employee.line_manager_id)?.name ?? "None"} → {employees.find(e => e.id === managerId)?.name ?? "None"}</span></div>)}</div>
        </>}
      </>}
      {dialog === "remove" && selected && <><h2 id="structure-dialog-title">Remove {selected.title}?</h2><p>The employee stays on your staff list and becomes unassigned. Direct reports move up to this position’s parent. Review their reporting lines before publishing.</p></>}
      {dialog === "reload" && <><h2 id="structure-dialog-title">Reload the saved draft?</h2><p>Unsaved edits will be lost. Pulse will load the most recent saved draft and staff list for your organisation.</p></>}
      <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => setDialog(null)}>{dialog === "publish" ? "Keep editing" : "Cancel"}</button>
        {dialog === "publish" && <button className={styles.primaryButton} disabled={busy || issues.length > 0 || staleRoster} onClick={() => save(true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Publish structure</button>}
        {dialog === "remove" && selected && <button className={styles.dangerButton} onClick={() => { change({ ...document, positions: document.positions.filter(p => p.id !== selected.id).map(p => p.parentId === selected.id ? { ...p, parentId: selected.parentId } : p) }); setSelectedId(null); setDialog(null); }}>Remove position</button>}
        {dialog === "reload" && <button className={styles.primaryButton} disabled={busy} onClick={reload}>Reload saved draft</button>}
      </div>
    </dialog>
    <footer className="mt-6"><Link className={styles.breadcrumb} href="/dashboard/hr"><ArrowLeft size={12} />Back to HR dashboard</Link><p className={`${styles.muted} mt-3`}><GitBranch size={12} className="inline" /> Solid reporting lines define the primary manager. Matrix and dotted-line relationships are reserved for a later version.</p></footer>
  </div>;
}
