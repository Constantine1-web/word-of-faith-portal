import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export class AuthorizationError extends Error {
  public statusCode: number;
  constructor(message: string = "Access denied: Unauthorized operational attempt.", statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export type GranularRole =
  | "SUPER_ADMIN"
  | "PRINCIPAL"
  | "BURSAR"
  | "ADMISSIONS"
  | "TEACHER"
  | "FORM_MASTER"
  | "STUDENT"
  | "PARENT"
  | "Admin"
  | "Teacher"
  | "Student";

export type RoleSetWithArrayHelpers = Set<string> & {
  some: (predicate: (role: string) => boolean) => boolean;
  join: (separator?: string) => string;
};

/**
 * Normalizes legacy role names ("Admin", "Teacher", "Student") and v3 enum roles
 * into a unified set of effective permissions for a user.
 */
export function resolveUserRoles(user: {
  Role?: { RoleName: string } | null;
  RoleAssignments?: { Role: string }[];
}): RoleSetWithArrayHelpers {
  const roles = new Set<string>();

  if (user.Role?.RoleName) {
    const primary = user.Role.RoleName.trim();
    roles.add(primary);
    roles.add(primary.toUpperCase());
    if (primary.toLowerCase() === "admin") {
      roles.add("SUPER_ADMIN");
      roles.add("PRINCIPAL");
      roles.add("BURSAR");
      roles.add("ADMISSIONS");
    } else if (primary.toLowerCase() === "teacher") {
      roles.add("TEACHER");
    } else if (primary.toLowerCase() === "student") {
      roles.add("STUDENT");
    }
  }

  if (user.RoleAssignments) {
    for (const ra of user.RoleAssignments) {
      roles.add(ra.Role);
    }
  }

  const enriched = roles as RoleSetWithArrayHelpers;
  enriched.some = (predicate: (role: string) => boolean) => Array.from(roles).some(predicate);
  enriched.join = (separator: string = ",") => Array.from(roles).join(separator);

  return enriched;
}

/**
 * Layer 3 Active User & TokenVersion Verification.
 * Fails closed if session is missing, user is deactivated, account is locked, or tokenVersion was bumped.
 */
export async function requireActiveUser() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    throw new AuthorizationError("Unauthenticated request. Please sign in.", 401);
  }

  const rawId = Number(session.user.id);
  const userEmail = session.user.email?.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let user: any = null;

  try {
    if (Number.isInteger(rawId) && rawId > 0) {
      user = await prisma.user.findUnique({
        where: { UserID: rawId },
        include: {
          Role: true,
          RoleAssignments: true,
        },
      });
    } else if (userEmail) {
      user = await prisma.user.findFirst({
        where: {
          Email: { equals: userEmail, mode: "insensitive" },
        },
        include: {
          Role: true,
          RoleAssignments: true,
        },
      });
    }
  } catch {
    // Fallback if RoleAssignments relation is not yet migrated on target DB
    if (Number.isInteger(rawId) && rawId > 0) {
      user = await prisma.user.findUnique({
        where: { UserID: rawId },
        include: { Role: true },
      });
    } else if (userEmail) {
      user = await prisma.user.findFirst({
        where: {
          Email: { equals: userEmail, mode: "insensitive" },
        },
        include: { Role: true },
      });
    }
  }

  if (!user || !user.IsActive) {
    throw new AuthorizationError("Your account has been deactivated or does not exist.", 403);
  }

  if (user.LockedUntil && new Date(user.LockedUntil) > new Date()) {
    throw new AuthorizationError("Account is temporarily locked due to security policy.", 403);
  }

  // Verify tokenVersion if present in session token and greater than session version
  const sessionTokenVersion = (session.user as { tokenVersion?: number }).tokenVersion;
  if (
    typeof sessionTokenVersion === "number" &&
    typeof user.TokenVersion === "number" &&
    user.TokenVersion > sessionTokenVersion
  ) {
    throw new AuthorizationError("Session expired due to security credential update. Please sign in again.", 401);
  }

  const roles = resolveUserRoles(user);

  return {
    user,
    UserID: user.UserID as number,
    Email: user.Email as string,
    roles,
    session,
  };
}

/**
 * Verifies that the active user possesses at least one of the allowed roles.
 */
export async function requireRole(allowedRoles: GranularRole[]) {
  const { user, UserID, Email, roles, session } = await requireActiveUser();

  const isAuthorized = allowedRoles.some((allowed) => roles.has(allowed) || roles.has(allowed.toUpperCase()));
  if (!isAuthorized) {
    throw new AuthorizationError(
      `Forbidden: This operation requires ${allowedRoles.join(" or ")} authority.`,
      403
    );
  }

  return { user, UserID, Email, roles, session };
}

/**
 * Enforces teacher tenant boundaries (IDOR prevention).
 * Confirms the teacher is assigned to the specified Class and Subject in the active term,
 * or is acting under Principal / Super Admin supervisory authority (which is explicitly flagged).
 */
export async function assertTeacherAssigned(
  classId: number,
  subjectId: number,
  termId?: number
) {
  const { user, roles } = await requireRole([
    "TEACHER",
    "FORM_MASTER",
    "PRINCIPAL",
    "SUPER_ADMIN",
    "Teacher",
    "Admin",
  ]);

  const isSupervisor = roles.has("PRINCIPAL") || roles.has("SUPER_ADMIN") || roles.has("Admin");

  const assignment = await prisma.teacher_Subject_Map.findFirst({
    where: {
      TeacherID: user.UserID,
      ClassID: classId,
      SubjectID: subjectId,
      ...(termId ? { OR: [{ TermID: termId }, { TermID: null }] } : {}),
    },
  });

  if (!assignment && !isSupervisor) {
    throw new AuthorizationError(
      "IDOR Security Violation: You are not assigned to score this class arm and subject.",
      403
    );
  }

  return {
    user,
    roles,
    assignment,
    isSupervisoryOverride: !assignment && isSupervisor,
  };
}

/**
 * Enforces Form Master tenant boundaries for a specific Class.
 */
export async function assertFormMasterAssigned(classId: number) {
  const { user, roles } = await requireRole([
    "TEACHER",
    "FORM_MASTER",
    "PRINCIPAL",
    "SUPER_ADMIN",
    "Teacher",
    "Admin",
  ]);

  const isSupervisor = roles.has("PRINCIPAL") || roles.has("SUPER_ADMIN") || roles.has("Admin");

  const cls = await prisma.class.findUnique({
    where: { ClassID: classId },
  });

  if (!cls) {
    throw new AuthorizationError("Target class arm does not exist.", 404);
  }

  if (cls.FormMasterID !== user.UserID && !isSupervisor) {
    throw new AuthorizationError(
      "IDOR Security Violation: You are not the designated Form Master for this class arm.",
      403
    );
  }

  return {
    user,
    cls,
    isSupervisoryOverride: cls.FormMasterID !== user.UserID && isSupervisor,
  };
}

/**
 * Derived Fee Clearance Check (v3 Specification).
 * Evaluates term invoices minus verified payments in kobo, falling back to approved Payment_Record / HasPaidFees.
 */
export async function checkStudentFeeClearance(studentId: number, termId: number): Promise<{
  isCleared: boolean;
  totalBilledKobo: bigint;
  totalPaidKobo: bigint;
  balanceKobo: bigint;
}> {
  const student = await prisma.student.findUnique({
    where: { StudentID: studentId },
  });

  if (!student) {
    throw new AuthorizationError("Student record not found.", 404);
  }

  const invoices = await prisma.invoice.findMany({
    where: { StudentID: studentId, TermID: termId, IsWaived: false },
  });

  const payments = await prisma.payment_Record.findMany({
    where: {
      StudentID: studentId,
      TermID: termId,
      Status: { in: ["Approved", "Successful", "APPROVED", "SUCCESSFUL"] },
    },
  });

  const totalBilledKobo = invoices.reduce((acc, inv) => acc + inv.AmountKobo, BigInt(0));
  const totalPaidKobo = payments.reduce((acc, pay) => {
    const kobo = pay.AmountKobo > BigInt(0) ? pay.AmountKobo : BigInt(Math.round((pay.AmountPaid || 0) * 100));
    return acc + kobo;
  }, BigInt(0));

  // If term invoices exist, clearance is strictly derived from totalPaidKobo >= totalBilledKobo
  if (invoices.length > 0) {
    const balanceKobo = totalBilledKobo > totalPaidKobo ? totalBilledKobo - totalPaidKobo : BigInt(0);
    return {
      isCleared: totalPaidKobo >= totalBilledKobo,
      totalBilledKobo,
      totalPaidKobo,
      balanceKobo,
    };
  }

  // If no formal invoice rows were generated yet for the term, check verified payments or HasPaidFees
  const isCleared = payments.length > 0 || student.HasPaidFees;
  return {
    isCleared,
    totalBilledKobo: BigInt(0),
    totalPaidKobo,
    balanceKobo: BigInt(0),
  };
}

/**
 * Writes an entry to the append-only AuditLog table.
 */
export async function writeAuditLog(params: {
  actorId?: number | null;
  actorUserId?: number | null;
  actorRoles?: string;
  action: string;
  entity?: string;
  targetTable?: string;
  entityId?: string | number;
  targetId?: string | number;
  oldValue?: unknown;
  beforeState?: unknown;
  newValue?: unknown;
  afterState?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any;
}) {
  const client = params.tx || prisma;
  const resolvedActorId = params.actorId ?? params.actorUserId ?? null;
  const resolvedEntity = params.entity ?? params.targetTable ?? "System";
  const resolvedEntityId = String(params.entityId ?? params.targetId ?? "0");
  const resolvedOld = params.oldValue ?? params.beforeState;
  const resolvedNew = params.newValue ?? params.afterState;

  try {
    await client.auditLog.create({
      data: {
        ActorID: resolvedActorId,
        Action: params.action,
        Entity: resolvedEntity,
        EntityID: resolvedEntityId,
        OldValue: resolvedOld !== undefined ? JSON.parse(JSON.stringify(resolvedOld)) : undefined,
        NewValue:
          resolvedNew !== undefined
            ? JSON.parse(
                JSON.stringify(
                  params.actorRoles || params.reason
                    ? { ...(typeof resolvedNew === "object" && resolvedNew !== null ? resolvedNew : { value: resolvedNew }), actorRoles: params.actorRoles, reason: params.reason }
                    : resolvedNew
                )
              )
            : undefined,
        IpAddress: params.ipAddress ?? null,
        UserAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * Escapes leading characters (=, +, -, @, \t, \r) to neutralize CSV/Excel formula injection.
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? "").replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}
