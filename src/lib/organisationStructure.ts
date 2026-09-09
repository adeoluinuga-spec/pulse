export const RESPONSIBILITIES = ["none", "team_lead", "manager", "senior_manager", "director"] as const;
export type Responsibility = typeof RESPONSIBILITIES[number];
export type StructureEmployee = {
  id: string; name: string; email: string; role: string | null;
  department: string | null; team: string | null;
  line_manager_id: string | null; people_responsibility: string | null;
};
export type Position = {
  id: string; title: string; employeeId: string | null; parentId: string | null;
  department: string; team: string; responsibility: Responsibility;
};
export type StructureDocument = {
  schemaVersion: 1; theme: "cobalt" | "forest" | "slate";
  layout: "vertical" | "horizontal"; positions: Position[];
};
export type StructureTemplate = "existing" | "departments" | "blank";
export const MAX_POSITIONS = 1000;
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;

/** Parse an untrusted request without casting it to a trusted graph. */
export function parseStructure(value: unknown): StructureDocument {
  if (!value || typeof value !== "object") throw new Error("A structure is required.");
  const doc = value as Record<string, unknown>;
  if (doc.schemaVersion !== 1 || !["cobalt", "forest", "slate"].includes(String(doc.theme)) ||
      !["vertical", "horizontal"].includes(String(doc.layout)) || !Array.isArray(doc.positions) || doc.positions.length > MAX_POSITIONS) {
    throw new Error(`Invalid structure settings. Use at most ${MAX_POSITIONS} positions.`);
  }
  const positions = doc.positions.map((value): Position => {
    if (!value || typeof value !== "object") throw new Error("Invalid position.");
    const p = value as Record<string, unknown>;
    if (typeof p.id !== "string" || !idPattern.test(p.id) ||
        (p.parentId !== null && (typeof p.parentId !== "string" || !idPattern.test(p.parentId))) ||
        (p.employeeId !== null && (typeof p.employeeId !== "string" || !idPattern.test(p.employeeId))) ||
        typeof p.title !== "string" || !p.title.trim() || p.title.length > 160 ||
        typeof p.department !== "string" || p.department.length > 120 ||
        typeof p.team !== "string" || p.team.length > 120 ||
        !RESPONSIBILITIES.includes(p.responsibility as Responsibility)) throw new Error("Every position needs a title and valid reporting settings.");
    return { id: p.id, title: p.title.trim(), parentId: p.parentId, employeeId: p.employeeId,
      department: p.department.trim(), team: p.team.trim(), responsibility: p.responsibility as Responsibility };
  });
  return { schemaVersion: 1, theme: doc.theme as StructureDocument["theme"], layout: doc.layout as StructureDocument["layout"], positions };
}

export function validateStructure(doc: StructureDocument, employees: StructureEmployee[], publishing = false): string[] {
  const errors = new Set<string>();
  const nodes = new Map(doc.positions.map(p => [p.id, p]));
  const roster = new Map(employees.map(e => [e.id, e]));
  const assigned = new Set<string>();
  if (nodes.size !== doc.positions.length) errors.add("Position IDs must be unique.");
  for (const p of doc.positions) {
    if (p.employeeId) {
      if (!roster.has(p.employeeId)) errors.add("A selected employee is no longer in this organisation. Update their position.");
      if (assigned.has(p.employeeId)) errors.add(`${roster.get(p.employeeId)?.name ?? "An employee"} is assigned to more than one position.`);
      assigned.add(p.employeeId);
    }
    if (p.parentId && !nodes.has(p.parentId)) errors.add(`${p.title} reports to a position that no longer exists.`);
    const seen = new Set([p.id]);
    let parent = p.parentId;
    while (parent && nodes.has(parent)) {
      if (seen.has(parent)) { errors.add("Reporting lines contain a loop. A position cannot report to itself or its descendants."); break; }
      seen.add(parent); parent = nodes.get(parent)!.parentId;
    }
    if (publishing && p.employeeId && p.parentId && !effectiveLineManagerId(p, doc.positions)) {
      errors.add(`${roster.get(p.employeeId)?.name ?? p.title} has no occupied manager above this position. Assign someone above them or move the position before publishing.`);
    }
    if (publishing && p.employeeId && !p.department) errors.add(`Set a department for ${roster.get(p.employeeId)?.name ?? p.title}.`);
  }
  if (publishing) {
    const missing = employees.filter(e => !assigned.has(e.id));
    if (missing.length) errors.add(`${missing.length} staff member${missing.length === 1 ? " is" : "s are"} unassigned. Place all existing staff before publishing.`);
    if (!employees.length) errors.add("Add staff in People setup before publishing a structure.");
  }
  return [...errors];
}

export function structureFromEmployees(employees: StructureEmployee[]): StructureDocument {
  const ids = new Set(employees.map(e => e.id));
  return { schemaVersion: 1, theme: "cobalt", layout: "vertical", positions: employees.map(e => ({
    id: `staff-${e.id}`, title: e.role || "Staff member", employeeId: e.id,
    parentId: e.line_manager_id && ids.has(e.line_manager_id) ? `staff-${e.line_manager_id}` : null,
    department: e.department || "", team: e.team || "",
    responsibility: RESPONSIBILITIES.includes(e.people_responsibility as Responsibility) ? e.people_responsibility as Responsibility : "none",
  })) };
}

export function applyStructureTemplate(template: StructureTemplate, employees: StructureEmployee[]): StructureDocument {
  const doc = structureFromEmployees(employees);
  if (template === "existing") return doc;
  if (template === "blank") return { ...doc, positions: [] };
  const root: Position = { id: "template-root", title: "Organisation lead", employeeId: null, parentId: null, department: "Leadership", team: "", responsibility: "director" };
  const departments = [...new Set(employees.map(e => e.department || "Unassigned department"))];
  const heads: Position[] = departments.map((name, i) => ({ ...root, id: `template-dept-${i}`, title: `${name} lead`, parentId: root.id, department: name, responsibility: "manager" }));
  return { ...doc, positions: [root, ...heads, ...doc.positions.map(p => ({ ...p, parentId: heads[departments.indexOf(p.department || "Unassigned department")].id }))] };
}

/** Mirrors publishing: ordinary managers gain manager navigation, never HR/admin privileges. */
export function effectiveResponsibility(p: Position, positions: Position[]): Responsibility {
  return p.responsibility === "none" && positions.some(child => child.parentId === p.id && child.employeeId)
    ? "manager" : p.responsibility;
}

/**
 * Vacancies remain visible in the chart, but employees.line_manager_id needs
 * a real employee. A vacant direct manager therefore resolves to the nearest
 * occupied ancestor, which is normally two levels above the employee.
 */
export function effectiveLineManagerId(position: Position, positions: Position[]): string | null {
  const nodes = new Map(positions.map((entry) => [entry.id, entry]));
  const visited = new Set<string>([position.id]);
  let parentId = position.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.get(parentId);
    if (!parent) return null;
    if (parent.employeeId) return parent.employeeId;
    parentId = parent.parentId;
  }
  return null;
}

export function structureChanges(doc: StructureDocument, employees: StructureEmployee[]) {
  return doc.positions.flatMap(p => {
    const employee = employees.find(e => e.id === p.employeeId);
    if (!employee) return [];
    const managerId = effectiveLineManagerId(p, doc.positions);
    const fields = [
      ["Line manager", employee.line_manager_id, managerId], ["Position", employee.role || "", p.title],
      ["Department", employee.department || "", p.department], ["Team", employee.team || "", p.team],
      ["Leadership", employee.people_responsibility || "none", effectiveResponsibility(p, doc.positions)],
    ].filter(([, before, after]) => before !== after).map(([field]) => field);
    return fields.length ? [{ employee, managerId, fields }] : [];
  });
}

/** Forest layout; invalid/cyclic imports remain editable instead of recursing forever. */
export function layoutStructure(doc: StructureDocument, collapsed: Set<string>) {
  const nodes = new Map(doc.positions.map(p => [p.id, p]));
  const children = new Map<string | null, Position[]>();
  for (const p of doc.positions) {
    const key = p.parentId && nodes.has(p.parentId) ? p.parentId : null;
    children.set(key, [...(children.get(key) ?? []), p]);
  }
  const seen = new Set<string>();
  const placed: Array<{ position: Position; x: number; y: number }> = [];
  let cursor = 0;
  function walk(p: Position, depth: number): number {
    if (seen.has(p.id)) return cursor;
    seen.add(p.id);
    const descendants = collapsed.has(p.id) ? [] : (children.get(p.id) ?? []).filter(c => !seen.has(c.id));
    const coordinates = descendants.map(c => walk(c, depth + 1));
    const cross = coordinates.length ? (coordinates[0] + coordinates[coordinates.length - 1]) / 2 : cursor++;
    placed.push({ position: p, x: doc.layout === "vertical" ? cross * 260 + 24 : depth * 290 + 24,
      y: doc.layout === "vertical" ? depth * 180 + 24 : cross * 156 + 24 });
    return cross;
  }
  for (const root of children.get(null) ?? []) walk(root, 0);
  // Don't resurrect children intentionally hidden by a collapsed ancestor.
  for (const p of doc.positions) {
    if (seen.has(p.id)) continue;
    let parent = p.parentId;
    const ancestors = new Set<string>();
    let hidden = false;
    while (parent && !ancestors.has(parent)) {
      if (collapsed.has(parent)) { hidden = true; break; }
      ancestors.add(parent); parent = nodes.get(parent)?.parentId ?? null;
    }
    if (!hidden) walk(p, 0);
  }
  return { placed, width: Math.max(600, ...placed.map(p => p.x + 260)), height: Math.max(420, ...placed.map(p => p.y + 160)) };
}
