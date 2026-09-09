import test from "node:test";
import assert from "node:assert/strict";
import { applyStructureTemplate, effectiveResponsibility, layoutStructure, parseStructure, structureChanges,
  structureFromEmployees, validateStructure, type StructureEmployee } from "./organisationStructure.ts";

const staff: StructureEmployee[] = [
  { id: "a", name: "HR lead", email: "hr@example.test", role: "Director", department: "Leadership", team: null, line_manager_id: null, people_responsibility: "director" },
  { id: "b", name: "Consultant", email: "b@example.test", role: "Consultant", department: "Advisory", team: "Delivery", line_manager_id: "a", people_responsibility: "none" },
  { id: "c", name: "Associate", email: "c@example.test", role: "Associate", department: "Advisory", team: "Delivery", line_manager_id: "b", people_responsibility: "none" },
];
test("existing staff import preserves reporting relationships and never duplicates profiles", () => {
  const doc = structureFromEmployees(staff);
  assert.equal(doc.positions[1].parentId, "staff-a");
  assert.equal(doc.positions[2].parentId, "staff-b");
  assert.deepEqual(validateStructure(doc, staff, true), []);
});
test("rejects cross-tenant staff, duplicate assignments, missing managers and circular hierarchies", () => {
  const doc = structureFromEmployees(staff);
  doc.positions[0].parentId = "staff-c";
  assert.match(validateStructure(doc, staff).join(" "), /loop/);
  doc.positions[0].parentId = "missing";
  doc.positions[1].employeeId = "a";
  doc.positions[2].employeeId = "foreign";
  const errors = validateStructure(doc, staff).join(" ");
  assert.match(errors, /no longer exists/);
  assert.match(errors, /more than one/);
  assert.match(errors, /no longer in this organisation/);
});
test("draft vacancies are allowed, publication requires assigned managers and all staff", () => {
  const doc = structureFromEmployees(staff);
  doc.positions[0].employeeId = null;
  assert.deepEqual(validateStructure(doc, staff), []);
  assert.match(validateStructure(doc, staff, true).join(" "), /unassigned/);
  assert.match(validateStructure(doc, staff, true).join(" "), /vacant position/);
});
test("an empty tenant cannot publish a vacant chart", () => {
  assert.match(validateStructure(structureFromEmployees([]), [], true).join(" "), /Add staff/);
});
test("untrusted payloads cannot slip unknown leadership values or oversized titles into the chart", () => {
  const doc = structureFromEmployees(staff);
  assert.throws(() => parseStructure({ ...doc, positions: [{ ...doc.positions[0], responsibility: "super_admin" }] }));
  assert.throws(() => parseStructure({ ...doc, positions: [{ ...doc.positions[0], title: "x".repeat(161) }] }));
  assert.throws(() => parseStructure({ ...doc, positions: Array(1001).fill(doc.positions[0]) }));
  assert.throws(() => parseStructure({ ...doc, positions: [null] }));
});
test("department template groups staff without guessing who the leads are", () => {
  const doc = applyStructureTemplate("departments", staff);
  assert.equal(doc.positions.filter(p => p.employeeId).length, staff.length);
  assert.equal(doc.positions.filter(p => !p.employeeId).length, 3);
  assert.equal(doc.positions.find(p => p.employeeId === "b")?.parentId, doc.positions.find(p => p.employeeId === "c")?.parentId);
  assert.deepEqual(validateStructure(doc, staff), []);
  assert.match(validateStructure(doc, staff, true).join(" "), /vacant/);
});
test("new reporting managers get navigation responsibility without changing access roles", () => {
  const doc = structureFromEmployees(staff);
  assert.equal(effectiveResponsibility(doc.positions[1], doc.positions), "manager");
  doc.positions[1].responsibility = "team_lead";
  assert.equal(effectiveResponsibility(doc.positions[1], doc.positions), "team_lead");
  assert.deepEqual(structureChanges(doc, staff).map(c => c.fields), [["Leadership"]]);
});
test("themes and layout alone do not change employee records", () => {
  const roster = staff.map(e => e.id === "b" ? { ...e, people_responsibility: "manager" } : e);
  const doc = structureFromEmployees(roster);
  doc.theme = "forest"; doc.layout = "horizontal";
  assert.deepEqual(structureChanges(doc, roster), []);
});
test("chart hides collapsed descendants and can still render malformed cyclic imports", () => {
  const doc = structureFromEmployees(staff);
  assert.equal(layoutStructure(doc, new Set(["staff-a"])).placed.length, 1);
  assert.equal(layoutStructure(doc, new Set()).placed.length, 3);
  doc.positions[0].parentId = "staff-c";
  assert.equal(layoutStructure(doc, new Set()).placed.length, 3);
});
test("department is required at publication while unfinished positions can be drafted", () => {
  const doc = structureFromEmployees(staff);
  doc.positions[2].department = "";
  assert.deepEqual(validateStructure(doc, staff), []);
  assert.match(validateStructure(doc, staff, true).join(" "), /department for Associate/);
});
