/**
 * Role classification helpers for the Admin <-> Teacher Communications system.
 * Strictly isolates portal messaging to Administration and Academic/Teaching staff
 * (excluding Students and Parents).
 */

export const ADMIN_STAFF_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "EXAM_OFFICER",
  "ADMIN",
  "Admin",
] as const;

export const TEACHING_STAFF_ROLES = [
  "TEACHER",
  "FORM_MASTER",
  "Teacher",
] as const;

export const ALL_STAFF_COMM_ROLES = [
  ...ADMIN_STAFF_ROLES,
  ...TEACHING_STAFF_ROLES,
] as const;

const ADMIN_ROLE_SET = new Set<string>(
  ADMIN_STAFF_ROLES.map((r) => r.toUpperCase())
);
const TEACHER_ROLE_SET = new Set<string>(
  TEACHING_STAFF_ROLES.map((r) => r.toUpperCase())
);

export type StaffContactGroup = "ADMINISTRATION" | "TEACHERS";

export function isAuthorizedStaffCommRoleSet(roles: Iterable<string>): boolean {
  for (const r of roles) {
    const up = String(r || "").toUpperCase().trim();
    if (ADMIN_ROLE_SET.has(up) || TEACHER_ROLE_SET.has(up)) {
      return true;
    }
  }
  return false;
}

export function classifyStaffContactGroup(
  roles: Iterable<string>
): StaffContactGroup | null {
  let hasAdmin = false;
  let hasTeacher = false;
  for (const r of roles) {
    const up = String(r || "").toUpperCase().trim();
    if (ADMIN_ROLE_SET.has(up)) hasAdmin = true;
    if (TEACHER_ROLE_SET.has(up)) hasTeacher = true;
  }
  if (hasAdmin) return "ADMINISTRATION";
  if (hasTeacher) return "TEACHERS";
  return null;
}

export function formatStaffRoleLabel(roleName?: string | null): string {
  const up = String(roleName || "").toUpperCase().trim();
  switch (up) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "PRINCIPAL":
      return "Principal";
    case "BURSAR":
      return "Bursar";
    case "ADMISSIONS":
      return "Admissions";
    case "EXAM_OFFICER":
      return "Exam Officer";
    case "FORM_MASTER":
      return "Class Teacher";
    case "TEACHER":
      return "Teacher";
    case "ADMIN":
      return "School Admin";
    default:
      return roleName || "Staff";
  }
}
