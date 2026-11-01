import prisma from "@/lib/db";
import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  ALL_CAPABILITIES,
  CAPABILITY_METADATA,
  CAPABILITY_PRESETS,
  resolveActorCapabilities,
  isFullCapabilitySet,
  assertSeparationOfDuties,
  type Capability,
  type CapabilityPresetName,
} from "@/server/security/capabilities";

export {
  ALL_CAPABILITIES,
  CAPABILITY_METADATA,
  CAPABILITY_PRESETS,
  resolveActorCapabilities,
  isFullCapabilitySet,
  assertSeparationOfDuties,
  type Capability,
  type CapabilityPresetName,
};

/**
 * Normalizes login IDs (Unicode NFKC, trimmed, lowercase) before storing or comparing (Section 3).
 */
export function normalizeLoginId(input: string): string {
  return String(input || "").normalize("NFKC").trim().toLowerCase();
}

export type PolicyAction =
  | Capability
  | "user:manage"
  | "term:freeze"
  | "grade:score"
  | "grade:approve"
  | "grade:unlock"
  | "payment:approve"
  | "card:generate"
  | "card:issue"
  | "card:unlock"
  | "cbt:lift_lock"
  | "admissions:review"
  | "broadsheet:export";

const LEGACY_ACTION_TO_CAPABILITY: Partial<Record<PolicyAction, Capability>> = {
  "user:manage": "MANAGE_USERS",
  "term:freeze": "FREEZE_TERM",
  "grade:unlock": "UNLOCK_SHEETS",
  "payment:approve": "APPROVE_PAYMENTS",
  "card:generate": "MANAGE_CARDS",
  "card:issue": "MANAGE_CARDS",
  "card:unlock": "MANAGE_CARDS",
  "admissions:review": "MANAGE_STUDENTS",
};

/**
 * Centralized Data-Access Layer (DAL) Policy Evaluator (Section B.2, Section 1 & 2).
 * Evaluates both Section B.2 Capabilities and PolicyAction identifiers.
 */
export function can(
  actor: {
    roles: Set<string> | RoleSetWithArrayHelpers;
    capabilities?: Set<Capability> | Capability[];
    UserID?: number;
  },
  action: PolicyAction
): boolean {
  const r = actor.roles;
  const capSet =
    actor.capabilities instanceof Set
      ? actor.capabilities
      : Array.isArray(actor.capabilities)
      ? new Set<Capability>(actor.capabilities)
      : resolveActorCapabilities(undefined, Array.from(r));

  if (ALL_CAPABILITIES.includes(action as Capability)) {
    return capSet.has(action as Capability);
  }

  const mappedCap = LEGACY_ACTION_TO_CAPABILITY[action];
  if (mappedCap && capSet.has(mappedCap)) {
    return true;
  }

  switch (action) {
    case "user:manage":
      return capSet.has("MANAGE_USERS") || r.has("SUPER_ADMIN") || r.has("PRINCIPAL");
    case "term:freeze":
      return capSet.has("FREEZE_TERM") || r.has("PRINCIPAL");
    case "grade:unlock":
      // Section B.2 & Section 1: Requires UNLOCK_SHEETS (Principal), never ICT-only SUPER_ADMIN
      return capSet.has("UNLOCK_SHEETS") || r.has("PRINCIPAL");
    case "grade:approve":
      return capSet.has("APPROVE_RESULTS") || r.has("FORM_MASTER") || r.has("PRINCIPAL");
    case "grade:score":
      return capSet.has("CORRECT_SCORES") || r.has("TEACHER") || r.has("FORM_MASTER") || r.has("PRINCIPAL");
    case "payment:approve":
      return capSet.has("APPROVE_PAYMENTS") || r.has("BURSAR") || r.has("PRINCIPAL");
    case "card:generate":
    case "card:issue":
    case "card:unlock":
      return capSet.has("MANAGE_CARDS") || r.has("BURSAR") || r.has("PRINCIPAL");
    case "cbt:lift_lock":
      return capSet.has("MANAGE_CBT") || r.has("TEACHER") || r.has("FORM_MASTER") || r.has("PRINCIPAL");
    case "admissions:review":
      return capSet.has("MANAGE_STUDENTS") || r.has("ADMISSIONS") || r.has("PRINCIPAL") || r.has("SUPER_ADMIN");
    case "broadsheet:export":
      return capSet.has("APPROVE_RESULTS") || r.has("FORM_MASTER") || r.has("PRINCIPAL");
    default:
      return false;
  }
}

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
  const assignedRoleList = Array.isArray(user.RoleAssignments)
    ? user.RoleAssignments.map((ra: { Role: string }) => ra.Role)
    : [];
  const capabilities = resolveActorCapabilities(
    user.Capabilities as string[] | undefined,
    assignedRoleList,
    user.Role?.RoleName
  );

  return {
    user,
    UserID: user.UserID as number,
    Email: user.Email as string,
    roles,
    capabilities,
    Capabilities: Array.from(capabilities),
    session,
  };
}

/**
 * Verifies that the active user possesses at least one of the required Section B.2 Capabilities.
 */
export async function requireCapability(required: Capability | Capability[]) {
  const actor = await requireActiveUser();
  const list = Array.isArray(required) ? required : [required];
  const allowed = list.some((cap) => can(actor, cap));
  if (!allowed) {
    throw new AuthorizationError(
      `Forbidden: This operation requires ${list.join(" or ")} capability.`,
      403
    );
  }
  return actor;
}

/**
 * Verifies that the active user possesses at least one of the allowed roles.
 */
export async function requireRole(allowedRoles: GranularRole[]) {
  const actor = await requireActiveUser();
  const { roles } = actor;

  const isAuthorized = allowedRoles.some((allowed) => roles.has(allowed) || roles.has(allowed.toUpperCase()));
  if (!isAuthorized) {
    throw new AuthorizationError(
      `Forbidden: This operation requires ${allowedRoles.join(" or ")} authority.`,
      403
    );
  }

  return actor;
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
 * Writes a cryptographically hash-chained entry to the append-only AuditLog table (Section 1 & 4).
 * Computes SHA-256(prevHash + canonicalJson) so tampering or row gaps are mathematically detectable.
 */
export async function writeAuditLog(params: {
  actorId?: number | null;
  actorUserId?: number | null;
  actorRoles?: string;
  onBehalfOfId?: number | null;
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
    const lastEntry = await client.auditLog
      .findFirst({
        orderBy: { CreatedAt: "desc" },
        select: { Hash: true, id: true },
      })
      .catch(() => null);

    const prevHash = lastEntry?.Hash || "GENESIS";
    const canonicalPayload = JSON.stringify({
      actorId: resolvedActorId,
      onBehalfOfId: params.onBehalfOfId ?? null,
      action: params.action,
      entity: resolvedEntity,
      entityId: resolvedEntityId,
      oldValue: resolvedOld ?? null,
      newValue: resolvedNew ?? null,
      reason: params.reason ?? null,
    });
    const hash = crypto
      .createHash("sha256")
      .update(`${prevHash}:${canonicalPayload}`)
      .digest("hex");

    await client.auditLog.create({
      data: {
        ActorID: resolvedActorId,
        OnBehalfOfID: params.onBehalfOfId ?? null,
        Action: params.action,
        Entity: resolvedEntity,
        EntityID: resolvedEntityId,
        Reason: params.reason ?? null,
        PrevHash: prevHash,
        Hash: hash,
        OldValue: resolvedOld !== undefined ? JSON.parse(JSON.stringify(resolvedOld)) : undefined,
        NewValue:
          resolvedNew !== undefined
            ? JSON.parse(
                JSON.stringify(
                  params.actorRoles || params.reason
                    ? {
                        ...(typeof resolvedNew === "object" && resolvedNew !== null
                          ? resolvedNew
                          : { value: resolvedNew }),
                        actorRoles: params.actorRoles,
                        reason: params.reason,
                      }
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
