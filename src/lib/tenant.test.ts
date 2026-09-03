import test from "node:test";
import assert from "node:assert/strict";

import { canManageAssessmentWorkspace, canViewAssessmentWorkspace, hasOrgAccess, isOrgAdminRole, type OrgRole } from "./tenant.ts";

test("org access permits role-based scoping for HR and executives", () => {
  assert.equal(hasOrgAccess("hr_admin" as OrgRole, "tenant-1", "tenant-1"), true);
  assert.equal(hasOrgAccess("executive_view" as OrgRole, "tenant-1", "tenant-1"), true);
  assert.equal(hasOrgAccess("standard" as OrgRole, "tenant-1", "tenant-2"), false);
});

test("org admin helper recognises HR and super admin roles", () => {
  assert.equal(isOrgAdminRole("hr_admin" as OrgRole), true);
  assert.equal(isOrgAdminRole("super_admin" as OrgRole), true);
  assert.equal(isOrgAdminRole("standard" as OrgRole), false);
});

test("assessment workspace access is limited to HR, super admins, and executive viewers", () => {
  assert.equal(canViewAssessmentWorkspace("hr_admin" as OrgRole), true);
  assert.equal(canViewAssessmentWorkspace("super_admin" as OrgRole), true);
  assert.equal(canViewAssessmentWorkspace("executive_view" as OrgRole), true);
  assert.equal(canViewAssessmentWorkspace("standard" as OrgRole), false);
  assert.equal(canViewAssessmentWorkspace(null), false);
});

test("assessment management rights stay with HR and super admins only", () => {
  assert.equal(canManageAssessmentWorkspace("hr_admin" as OrgRole), true);
  assert.equal(canManageAssessmentWorkspace("super_admin" as OrgRole), true);
  assert.equal(canManageAssessmentWorkspace("executive_view" as OrgRole), false);
  assert.equal(canManageAssessmentWorkspace("standard" as OrgRole), false);
});
