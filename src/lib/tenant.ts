export type OrgRole =
  | "super_admin"
  | "hr_admin"
  | "executive_view"
  | "manager"
  | "standard"
  | "reviewer";

export function isOrgAdminRole(role?: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

export function hasOrgAccess(role: string | null | undefined, employeeOrgId?: string | null, targetOrgId?: string | null): boolean {
  if (!employeeOrgId || !targetOrgId) return true;
  if (employeeOrgId === targetOrgId) return true;
  if (role === "super_admin") return true;
  return false;
}

export function canManageAssessmentCycle(role?: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

export function canViewAssessmentWorkspace(role?: string | null): boolean {
  return role === "hr_admin" || role === "super_admin" || role === "executive_view";
}

export function canManageAssessmentWorkspace(role?: string | null): boolean {
  return role === "hr_admin" || role === "super_admin";
}

export function isReviewerRole(role?: string | null): boolean {
  return role === "reviewer" || role === "standard";
}
