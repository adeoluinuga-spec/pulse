import test from "node:test";
import assert from "node:assert/strict";

import {
  canReadPayslip,
  decideRunAction,
  fingerprint,
  nextStatus,
  payrollCapabilities,
  type PayrollActor,
  type RunState,
} from "./payrollWorkflow.ts";

const hr: PayrollActor = { employeeId: "hr", platformRole: "hr_admin", grant: null };
const ceo: PayrollActor = {
  employeeId: "ceo",
  platformRole: "executive_view",
  grant: { canPrepare: false, canApprove: true, canViewAll: false },
};
const staff: PayrollActor = { employeeId: "staff", platformRole: "standard", grant: null };

const readyToSubmit: RunState = {
  status: "draft",
  contributorIds: ["hr"],
  blockerCount: 0,
  calculationIsCurrent: true,
  hasBeenCalculated: true,
};

const submitted: RunState = { ...readyToSubmit, status: "submitted" };

test("HR prepares and sees everything, but approval is never implied by role", () => {
  const can = payrollCapabilities(hr);
  assert.equal(can.canPrepare, true);
  assert.equal(can.canViewAll, true);
  assert.equal(can.canApprove, false, "an organisation must name its approver deliberately");
});

test("an ordinary employee has no access to payroll at all", () => {
  const can = payrollCapabilities(staff);
  assert.equal(can.canAccessPayroll, false);
  assert.equal(can.canViewAll, false);
});

test("a named approver can see the run they are asked to approve", () => {
  assert.equal(payrollCapabilities(ceo).canViewAll, true);
});

test("the preparer submits a calculated, clean run", () => {
  assert.deepEqual(decideRunAction({ action: "submit", actor: hr, run: readyToSubmit }), { allowed: true });
  assert.equal(nextStatus("submit", "draft"), "submitted");
});

test("a run cannot be submitted before it is calculated", () => {
  const decision = decideRunAction({ action: "submit", actor: hr, run: { ...readyToSubmit, hasBeenCalculated: false } });
  assert.equal(decision.allowed, false);
});

test("a run whose inputs changed since calculation cannot be submitted", () => {
  const decision = decideRunAction({ action: "submit", actor: hr, run: { ...readyToSubmit, calculationIsCurrent: false } });
  assert.equal(decision.allowed, false);
  assert.match(decision.allowed ? "" : decision.reason, /Recalculate/);
});

test("blockers stop a submission and say how many", () => {
  const decision = decideRunAction({ action: "submit", actor: hr, run: { ...readyToSubmit, blockerCount: 2 } });
  assert.match(decision.allowed ? "" : decision.reason, /2 problems need fixing/);
});

test("a different, named approver approves", () => {
  assert.deepEqual(decideRunAction({ action: "approve", actor: ceo, run: submitted }), { allowed: true });
  assert.equal(nextStatus("approve", "submitted"), "approved");
});

test("MAKER-CHECKER: anyone who worked on the run cannot approve it, even with the approval grant", () => {
  const hrWhoCanAlsoApprove: PayrollActor = { ...hr, grant: { canPrepare: true, canApprove: true, canViewAll: true } };
  const decision = decideRunAction({ action: "approve", actor: hrWhoCanAlsoApprove, run: submitted });
  assert.equal(decision.allowed, false);
  assert.match(decision.allowed ? "" : decision.reason, /cannot also approve/);
});

test("MAKER-CHECKER: having added one adjustment is enough to disqualify an approver", () => {
  const decision = decideRunAction({
    action: "approve",
    actor: ceo,
    run: { ...submitted, contributorIds: ["hr", "ceo"] },
  });
  assert.equal(decision.allowed, false);
});

test("returning a run needs a reason the preparer can act on", () => {
  assert.equal(decideRunAction({ action: "return", actor: ceo, run: submitted, returnReason: "  " }).allowed, false);
  assert.equal(decideRunAction({ action: "return", actor: ceo, run: submitted, returnReason: "Ada's bonus is wrong" }).allowed, true);
  assert.equal(nextStatus("return", "submitted"), "draft");
});

test("an approved run cannot be touched, and says how to correct it instead", () => {
  const approved: RunState = { ...submitted, status: "approved" };
  for (const action of ["calculate", "adjust", "submit", "return", "approve", "void"] as const) {
    const decision = decideRunAction({ action, actor: hr, run: approved });
    assert.equal(decision.allowed, false, `${action} on an approved run`);
    assert.match(decision.allowed ? "" : decision.reason, /adjustment in a later run/);
  }
});

test("a submitted run cannot be quietly edited by its preparer", () => {
  assert.equal(decideRunAction({ action: "adjust", actor: hr, run: submitted }).allowed, false);
  assert.equal(decideRunAction({ action: "calculate", actor: hr, run: submitted }).allowed, false);
});

test("an employee cannot prepare or approve", () => {
  assert.equal(decideRunAction({ action: "calculate", actor: staff, run: readyToSubmit }).allowed, false);
  assert.equal(decideRunAction({ action: "approve", actor: staff, run: submitted }).allowed, false);
});

test("an approver cannot approve a run whose inputs moved after submission", () => {
  const decision = decideRunAction({ action: "approve", actor: ceo, run: { ...submitted, calculationIsCurrent: false } });
  assert.equal(decision.allowed, false);
});

test("an employee reads their own payslip only once the run is approved", () => {
  assert.equal(canReadPayslip({ actor: staff, lineEmployeeId: "staff", runStatus: "approved" }), true);
  assert.equal(canReadPayslip({ actor: staff, lineEmployeeId: "staff", runStatus: "draft" }), false);
  assert.equal(canReadPayslip({ actor: staff, lineEmployeeId: "staff", runStatus: "submitted" }), false);
  assert.equal(canReadPayslip({ actor: staff, lineEmployeeId: "someone-else", runStatus: "approved" }), false);
});

test("the fingerprint ignores key order and catches any real change", () => {
  const a = fingerprint({ b: 2, a: [{ y: 1, x: 2 }] });
  const b = fingerprint({ a: [{ x: 2, y: 1 }], b: 2 });
  assert.equal(a, b);
  assert.notEqual(a, fingerprint({ a: [{ x: 2, y: 1 }], b: 3 }));
  assert.notEqual(a, fingerprint({ a: [{ x: 2, y: 1 }, { x: 0 }], b: 2 }));
});
