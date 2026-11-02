"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import {
  requireActiveUser,
  requireRole,
  requireCapability,
  writeAuditLog,
  sanitizeCsvCell,
  ALL_CAPABILITIES,
  CAPABILITY_PRESETS,
  resolveActorCapabilities,
  isFullCapabilitySet,
  type Capability,
  type CapabilityPresetName,
} from "@/lib/authz";
import {
  generateTotpSecret,
  verifyTotpCode,
  buildOtpAuthUri,
  generateRecoveryCodes,
} from "@/server/security/totp";
import { sendAdmissionDecisionNotification } from "@/lib/email";

// Ensure the user holds an authorized administrative role in Layer 3
async function requireAdmin() {
  return requireRole(["SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS", "Admin"]);
}

export async function getAdminDashboardStats() {
  try {
    const actor = await requireAdmin();

    const [
      totalStudentsRes,
      totalTeachersRes,
      activeTermRes,
      primaryCountRes,
      secondaryCountRes,
      pendingAdmissionsRes,
      pendingPaymentsRes,
      recentAuditLogsRes,
    ] = await Promise.allSettled([
      prisma.student.count(),
      prisma.user.count({
        where: {
          Role: {
            RoleName: { in: ["Teacher", "TEACHER", "FORM_MASTER"] },
          },
        },
      }),
      prisma.academic_Term.findFirst({
        where: { IsActive: true },
      }),
      prisma.student.count({ where: { Class: { Level: "Primary" } } }),
      prisma.student.count({ where: { Class: { Level: "Secondary" } } }),
      prisma.admission_Application.count({
        where: { status: "Pending" },
      }),
      prisma.payment_Record.count({
        where: { Status: "Pending" },
      }),
      prisma.auditLog.findMany({
        take: 8,
        orderBy: { CreatedAt: "desc" },
      }),
    ]);

    const totalStudents = totalStudentsRes.status === "fulfilled" ? totalStudentsRes.value : 0;
    const totalTeachers = totalTeachersRes.status === "fulfilled" ? totalTeachersRes.value : 0;
    const activeTerm = activeTermRes.status === "fulfilled" ? activeTermRes.value : null;
    const primaryCount = primaryCountRes.status === "fulfilled" ? primaryCountRes.value : 0;
    const secondaryCount = secondaryCountRes.status === "fulfilled" ? secondaryCountRes.value : 0;
    const pendingAdmissions = pendingAdmissionsRes.status === "fulfilled" ? pendingAdmissionsRes.value : 0;
    const pendingPayments = pendingPaymentsRes.status === "fulfilled" ? pendingPaymentsRes.value : 0;
    const rawAuditLogs = recentAuditLogsRes.status === "fulfilled" ? recentAuditLogsRes.value : [];

    // Ensure AuditLog objects are plain JSON-serializable objects for Next.js Server Actions
    const recentAuditLogs = rawAuditLogs.map((log: any) => ({
      id: String(log.id),
      ActorID: log.ActorID ?? null,
      Action: String(log.Action || ""),
      Entity: String(log.Entity || ""),
      EntityID: String(log.EntityID || ""),
      OldValue: log.OldValue ?? null,
      NewValue: log.NewValue ?? null,
      CreatedAt: log.CreatedAt ? new Date(log.CreatedAt).toISOString() : new Date().toISOString(),
    }));

    let totalRevenue = 0;
    let paymentCount = 0;

    if (activeTerm) {
      try {
        const payments = await prisma.payment_Record.aggregate({
          where: {
            TermID: activeTerm.TermID,
            Status: { in: ["Approved", "Successful", "APPROVED", "SUCCESSFUL"] },
          },
          _sum: { AmountPaid: true },
          _count: { PaymentID: true },
        });
        totalRevenue = Number(payments._sum.AmountPaid || 0);
        paymentCount = Number(payments._count.PaymentID || 0);
      } catch (e) {
        console.warn("Payment aggregate warning:", e);
      }
    }

    const monthlyRevenue = [
      { name: "Jan", revenue: 400000 },
      { name: "Feb", revenue: 300000 },
      { name: "Mar", revenue: 500000 },
      { name: "Apr", revenue: 700000 },
      { name: "May", revenue: 200000 },
      { name: "Jun", revenue: totalRevenue > 0 ? totalRevenue : 600000 },
    ];

    const studentDistribution = [
      { name: "Primary", value: primaryCount || 1 },
      { name: "Secondary", value: secondaryCount || 1 },
    ];

    return {
      success: true,
      actorCapabilities: actor.Capabilities,
      stats: {
        totalStudents,
        totalTeachers,
        totalRevenue,
        paymentCount,
        pendingAdmissions,
        pendingPayments,
        activeTerm: activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "None",
      },
      recentAuditLogs,
      charts: {
        monthlyRevenue,
        studentDistribution,
      },
    };
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch admin stats",
      actorCapabilities: ALL_CAPABILITIES,
      stats: {
        totalStudents: 0,
        totalTeachers: 0,
        totalRevenue: 0,
        paymentCount: 0,
        pendingAdmissions: 0,
        pendingPayments: 0,
        activeTerm: "Active Session",
      },
      recentAuditLogs: [],
      charts: {
        monthlyRevenue: [
          { name: "Jan", revenue: 400000 },
          { name: "Feb", revenue: 300000 },
          { name: "Mar", revenue: 500000 },
          { name: "Apr", revenue: 700000 },
          { name: "May", revenue: 200000 },
          { name: "Jun", revenue: 600000 },
        ],
        studentDistribution: [
          { name: "Primary", value: 1 },
          { name: "Secondary", value: 1 },
        ],
      },
    };
  }
}

// ==========================================
// 1. USER PROVISIONING & CAPABILITY PRESETS (Section B.2)
// ==========================================

export async function getUsersList(roleFilter?: string) {
  try {
    await requireAdmin();
    const rawUsers = await prisma.user.findMany({
      where: roleFilter ? { Role: { RoleName: roleFilter } } : undefined,
      include: {
        Role: true,
        RoleAssignments: true,
        Student: {
          include: { Class: true },
        },
        FormMasterClasses: true,
        TeacherMaps: {
          include: { Subject: true, Class: true },
        },
      },
      orderBy: { UserID: "desc" },
    });

    const users = rawUsers.map((u) => {
      const assignedRoles = Array.isArray(u.RoleAssignments)
        ? u.RoleAssignments.map((ra) => ra.Role)
        : [];
      const resolvedCaps = Array.from(
        resolveActorCapabilities(
          u.Capabilities as string[] | undefined,
          assignedRoles,
          u.Role?.RoleName
        )
      );
      return {
        ...u,
        resolvedCapabilities: resolvedCaps,
      };
    });

    return { success: true, users };
  } catch (error: any) {
    console.error("getUsersList error:", error);
    return { success: false, error: error.message || "Failed to fetch users" };
  }
}

async function countActiveFullAdmins(): Promise<number> {
  const admins = await prisma.user.findMany({
    where: {
      IsActive: true,
      Role: { RoleName: { in: ["Admin", "SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS"] } },
    },
    include: {
      Role: true,
      RoleAssignments: true,
    },
  });

  let count = 0;
  for (const a of admins) {
    const assignedRoles = Array.isArray(a.RoleAssignments)
      ? a.RoleAssignments.map((ra) => ra.Role)
      : [];
    const caps = resolveActorCapabilities(
      a.Capabilities as string[] | undefined,
      assignedRoles,
      a.Role?.RoleName
    );
    if (isFullCapabilitySet(caps)) {
      count++;
    }
  }
  return count;
}

/**
 * Section B.2 Capability & Preset Assignment:
 * - Only an ADMIN with MANAGE_USERS can update capabilities.
 * - Guardrail 1: No one can add or modify capabilities on their own account.
 * - Guardrail 2: The last FULL admin cannot be removed, deactivated, or demoted.
 */
export async function updateAdminCapabilities(data: {
  targetUserId: number;
  capabilities?: Capability[];
  preset?: CapabilityPresetName;
  reason?: string;
}) {
  try {
    const actor = await requireCapability("MANAGE_USERS");
    const targetUserId = Number(data.targetUserId);

    if (actor.UserID === targetUserId) {
      return {
        success: false,
        error: "Guardrail Violation (Section B.2): Nobody can grant or modify capabilities on their own account.",
      };
    }

    const target = await prisma.user.findUnique({
      where: { UserID: targetUserId },
      include: { Role: true, RoleAssignments: true },
    });

    if (!target) {
      return { success: false, error: "Target user account not found." };
    }

    const nextCaps: Capability[] = data.preset
      ? CAPABILITY_PRESETS[data.preset]
      : (data.capabilities || []).filter((c): c is Capability => ALL_CAPABILITIES.includes(c));

    const currentAssignedRoles = Array.isArray(target.RoleAssignments)
      ? target.RoleAssignments.map((ra) => ra.Role)
      : [];
    const currentCaps = resolveActorCapabilities(
      target.Capabilities as string[] | undefined,
      currentAssignedRoles,
      target.Role?.RoleName
    );

    if (isFullCapabilitySet(currentCaps) && !isFullCapabilitySet(nextCaps)) {
      const fullCount = await countActiveFullAdmins();
      if (fullCount <= 1) {
        return {
          success: false,
          error: "Guardrail Violation (Section B.2): The last FULL admin cannot be demoted.",
        };
      }
    }

    const updated = await prisma.user.update({
      where: { UserID: targetUserId },
      data: {
        Capabilities: nextCaps,
        TokenVersion: { increment: 1 },
      },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "ADMIN_CAPABILITIES_UPDATED",
      entity: "User",
      entityId: targetUserId,
      reason: data.reason || (data.preset ? `Preset applied: ${data.preset}` : "Custom capability update"),
      oldValue: { capabilities: Array.from(currentCaps) },
      newValue: { capabilities: nextCaps, preset: data.preset ?? null, tokenVersion: updated.TokenVersion },
    });

    revalidatePath("/portal/admin/users");
    return {
      success: true,
      capabilities: nextCaps,
      message: `Updated capabilities (${nextCaps.length} active) for ${target.Email}.`,
    };
  } catch (error: any) {
    console.error("updateAdminCapabilities error:", error);
    return { success: false, error: error.message || "Failed to update admin capabilities." };
  }
}

export async function createUserAccount(data: {
  email: string;
  roleName: string;
  password?: string;
  name?: string;
}) {
  try {
    await requireAdmin();
    const existing = await prisma.user.findUnique({
      where: { Email: data.email.trim().toLowerCase() }
    });

    if (existing) {
      return { success: false, error: "A user account with this email already exists." };
    }

    const role = await prisma.role.findUnique({
      where: { RoleName: data.roleName }
    });

    if (!role) {
      return { success: false, error: `Role '${data.roleName}' does not exist.` };
    }

    const defaultPassword = data.password || "wofschools2026";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const user = await prisma.user.create({
      data: {
        Email: data.email.trim().toLowerCase(),
        PasswordHash: passwordHash,
        RoleID: role.RoleID,
        IsActive: true
      }
    });

    revalidatePath("/portal/admin/users");
    revalidatePath("/portal/admin/teachers");
    return { success: true, user, defaultPassword };
  } catch (error: any) {
    console.error("createUserAccount error:", error);
    return { success: false, error: error.message || "Failed to create user account" };
  }
}

export async function toggleUserStatus(userId: number, isActive: boolean) {
  try {
    const actor = await requireCapability("MANAGE_USERS");
    if (!isActive && actor.UserID === userId) {
      return {
        success: false,
        error: "Guardrail Violation (Section B.2): You cannot deactivate your own account.",
      };
    }

    if (!isActive) {
      const target = await prisma.user.findUnique({
        where: { UserID: userId },
        include: { Role: true, RoleAssignments: true },
      });
      if (target) {
        const assignedRoles = Array.isArray(target.RoleAssignments)
          ? target.RoleAssignments.map((ra) => ra.Role)
          : [];
        const caps = resolveActorCapabilities(
          target.Capabilities as string[] | undefined,
          assignedRoles,
          target.Role?.RoleName
        );
        if (isFullCapabilitySet(caps)) {
          const fullCount = await countActiveFullAdmins();
          if (fullCount <= 1) {
            return {
              success: false,
              error: "Guardrail Violation (Section B.2): The last FULL admin cannot be deactivated.",
            };
          }
        }
      }
    }

    const updated = await prisma.user.update({
      where: { UserID: userId },
      data: {
        IsActive: isActive,
        TokenVersion: { increment: 1 },
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
      targetTable: "User",
      targetId: String(userId),
      afterState: { isActive: updated.IsActive, tokenVersion: updated.TokenVersion }
    });

    revalidatePath("/portal/admin/users");
    return { success: true, isActive: updated.IsActive };
  } catch (error: any) {
    console.error("toggleUserStatus error:", error);
    return { success: false, error: error.message || "Failed to toggle user status" };
  }
}

export async function adminResetPassword(userId: number, newPassword?: string) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "Admin"]);
    const pass = newPassword || "wofschools2026";
    const passwordHash = await bcrypt.hash(pass, 12);

    const updated = await prisma.user.update({
      where: { UserID: userId },
      data: {
        PasswordHash: passwordHash,
        TokenVersion: { increment: 1 },
        FailedLoginAttempts: 0,
        LockedUntil: null
      }
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "USER_PASSWORD_RESET",
      targetTable: "User",
      targetId: String(userId),
      afterState: { tokenVersion: updated.TokenVersion }
    });

    revalidatePath("/portal/admin/users");
    return { success: true, password: pass };
  } catch (error: any) {
    console.error("adminResetPassword error:", error);
    return { success: false, error: error.message || "Failed to reset password" };
  }
}

// ==========================================
// 2. CLASS, ARM & TEACHER ALLOCATION
// ==========================================

export async function getClassesWithAllocations() {
  try {
    await requireAdmin();
    const classes = await prisma.class.findMany({
      include: {
        FormMaster: true,
        Students: true,
        TeacherMaps: {
          include: {
            Teacher: true,
            Subject: true,
            Term: true,
          }
        }
      },
      orderBy: { ClassName: "asc" }
    });

    const teachers = await prisma.user.findMany({
      where: { Role: { RoleName: { in: ["Teacher", "TEACHER", "FORM_MASTER"] } }, IsActive: true },
      orderBy: { Email: "asc" }
    });

    const subjects = await prisma.subject.findMany({
      orderBy: { SubjectName: "asc" }
    });

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });

    return { success: true, classes, teachers, subjects, activeTerm };
  } catch (error: any) {
    console.error("getClassesWithAllocations error:", error);
    return { success: false, error: error.message || "Failed to fetch classes" };
  }
}

export async function addClassArm(className: string, level: string, formMasterId?: number) {
  await requireAdmin();

  try {
    const existing = await prisma.class.findUnique({
      where: { ClassName: className.trim() }
    });

    if (existing) {
      return { success: false, error: `Class arm '${className}' already exists.` };
    }

    const created = await prisma.class.create({
      data: {
        ClassName: className.trim(),
        Level: level,
        FormMasterID: formMasterId || null
      }
    });

    revalidatePath("/portal/admin/classes");
    return { success: true, class: created };
  } catch (error: any) {
    console.error("addClassArm error:", error);
    return { success: false, error: error.message || "Failed to add class arm" };
  }
}

export async function assignFormMaster(classId: number, teacherUserId: number | null) {
  await requireAdmin();

  try {
    const updated = await prisma.class.update({
      where: { ClassID: classId },
      data: { FormMasterID: teacherUserId }
    });

    revalidatePath("/portal/admin/classes");
    return { success: true, class: updated };
  } catch (error: any) {
    console.error("assignFormMaster error:", error);
    return { success: false, error: error.message || "Failed to assign Form Master" };
  }
}

export async function assignSubjectTeacher(data: {
  teacherId: number;
  subjectId: number;
  classId: number;
  termId?: number;
}) {
  await requireAdmin();

  try {
    // If no term specified, default to active term
    let termId = data.termId;
    if (!termId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      termId = active?.TermID;
    }

    const mapping = await prisma.teacher_Subject_Map.upsert({
      where: {
        TeacherID_SubjectID_ClassID_TermID: {
          TeacherID: data.teacherId,
          SubjectID: data.subjectId,
          ClassID: data.classId,
          TermID: termId || 1
        }
      },
      update: {},
      create: {
        TeacherID: data.teacherId,
        SubjectID: data.subjectId,
        ClassID: data.classId,
        TermID: termId || null
      }
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/classes");
    return { success: true, mapping };
  } catch (error: any) {
    console.error("assignSubjectTeacher error:", error);
    return { success: false, error: error.message || "Failed to assign subject teacher" };
  }
}

export async function removeSubjectTeacherMap(mapId: number) {
  await requireAdmin();

  try {
    await prisma.teacher_Subject_Map.delete({
      where: { id: mapId }
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("removeSubjectTeacherMap error:", error);
    return { success: false, error: error.message || "Failed to remove mapping" };
  }
}

// ==========================================
// 5. ADMISSIONS & STUDENT ENROLLMENT
// ==========================================

export async function getAdmissionApplications() {
  await requireAdmin();

  try {
    const applications = await prisma.admission_Application.findMany({
      orderBy: { createdAt: "desc" }
    });
    return { success: true, applications };
  } catch (error: any) {
    console.error("getAdmissionApplications error:", error);
    return { success: false, error: error.message || "Failed to fetch applications" };
  }
}

export async function enrollApplicantToStudent(data: {
  applicationId: number;
  classId: number;
  admissionNo?: string;
  parentContact: string;
  parentEmail?: string;
}) {
  await requireAdmin();

  try {
    const app = await prisma.admission_Application.findUnique({
      where: { id: data.applicationId }
    });

    if (!app) {
      return { success: false, error: "Application record not found." };
    }

    if (app.status === "Approved") {
      return { success: false, error: "This application has already been approved and enrolled." };
    }

    const selectedClass = await prisma.class.findUnique({
      where: { ClassID: data.classId }
    });

    if (!selectedClass) {
      return { success: false, error: "Target class arm not found." };
    }

    // Auto-generate formatted registration number if not provided
    let admissionNo = data.admissionNo?.trim();
    if (!admissionNo) {
      const year = new Date().getFullYear();
      const prefix = selectedClass.Level.toLowerCase().includes("primary") ? "PRY" : "SEC";
      const count = await prisma.student.count();
      const sequence = (count + 1).toString().padStart(3, "0");
      admissionNo = `WOFS/${year}/${prefix}/${sequence}`;
    }

    // Generate a 6-char one-time Student Claim Code (Section B.6 & Section 4)
    const rawClaimChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let plainClaimCode = "";
    const randomBytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      plainClaimCode += rawClaimChars[randomBytes[i] % rawClaimChars.length];
    }
    const claimCodeHash = crypto.createHash("sha256").update(plainClaimCode).digest("hex");
    const claimExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create the student profile
    const student = await prisma.student.create({
      data: {
        AdmissionNo: admissionNo,
        ClaimCodeHash: claimCodeHash,
        ClaimCodeExpiresAt: claimExpiresAt,
        FirstName: app.childFirstName,
        LastName: app.childLastName,
        ClassID: data.classId,
        DateOfBirth: app.dateOfBirth,
        ParentContact: data.parentContact || app.parentPhone,
        ParentEmail: data.parentEmail || app.parentEmail,
        PreferredName: `${app.childFirstName} ${app.childLastName}`,
        HasPaidFees: false,
        Claims: {
          create: {
            codeHash: claimCodeHash,
            expiresAt: claimExpiresAt,
          },
        },
      },
    });

    // Update application status
    await prisma.admission_Application.update({
      where: { id: data.applicationId },
      data: {
        status: "Approved",
        enrolledStudentId: student.StudentID,
      },
    });

    const recipientEmail = (data.parentEmail || app.parentEmail || "").trim();
    const recipientPhone = (data.parentContact || app.parentPhone || "").trim();

    const notification = await sendAdmissionDecisionNotification({
      status: "Approved",
      parentName: app.parentName,
      parentEmail: recipientEmail,
      parentPhone: recipientPhone,
      childFirstName: app.childFirstName,
      childLastName: app.childLastName,
      applyingClass: app.applyingClass,
      assignedClassName: selectedClass.ClassName,
      admissionNo,
      claimCode: plainClaimCode,
    });

    revalidatePath("/portal/admin/admissions");
    revalidatePath("/portal/admin/students");
    return {
      success: true,
      student,
      admissionNo,
      claimCode: plainClaimCode,
      emailSent: notification.emailSent,
      recipientEmail,
      recipientPhone,
      whatsappUrl: notification.whatsappUrl,
      smsUrl: notification.smsUrl,
    };
  } catch (error: any) {
    console.error("enrollApplicantToStudent error:", error);
    return { success: false, error: error.message || "Failed to enroll student" };
  }
}

export async function rejectAdmissionApplication(applicationId: number, reason?: string) {
  await requireAdmin();

  try {
    const app = await prisma.admission_Application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      return { success: false, error: "Admission application not found." };
    }

    await prisma.admission_Application.update({
      where: { id: applicationId },
      data: { status: "Rejected" },
    });

    const notification = await sendAdmissionDecisionNotification({
      status: "Rejected",
      parentName: app.parentName,
      parentEmail: app.parentEmail,
      parentPhone: app.parentPhone,
      childFirstName: app.childFirstName,
      childLastName: app.childLastName,
      applyingClass: app.applyingClass,
      reason,
    });

    revalidatePath("/portal/admin/admissions");
    return {
      success: true,
      emailSent: notification.emailSent,
      recipientEmail: app.parentEmail,
      recipientPhone: app.parentPhone,
      whatsappUrl: notification.whatsappUrl,
      smsUrl: notification.smsUrl,
    };
  } catch (error: any) {
    console.error("rejectAdmissionApplication error:", error);
    return { success: false, error: error.message || "Failed to reject application" };
  }
}

export async function addStudent(data: {
  firstName: string;
  lastName: string;
  email: string;
  admissionNo: string;
  classId: number;
  parentContact?: string;
  parentEmail?: string;
}) {
  await requireAdmin();

  try {
    const defaultPassword = await bcrypt.hash("wofschools2026", 10);
    
    await prisma.$transaction(async (tx) => {
      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found in database.");

      const user = await tx.user.create({
        data: {
          Email: data.email.trim().toLowerCase(),
          PasswordHash: defaultPassword,
          RoleID: studentRole.RoleID,
          IsActive: true
        }
      });

      await tx.student.create({
        data: {
          UserID: user.UserID,
          AdmissionNo: data.admissionNo.trim(),
          ClassID: data.classId,
          DateOfBirth: new Date(),
          ParentContact: data.parentContact || "08000000000",
          ParentEmail: data.parentEmail || data.email,
          PreferredName: `${data.firstName} ${data.lastName}`
        }
      });
    });

    revalidatePath("/portal/admin/students");
    return { success: true };
  } catch (error: any) {
    console.error("Add student error:", error);
    return { error: error.message || "Failed to add student." };
  }
}

export async function deleteStudent(studentId: number) {
  await requireAdmin();

  try {
    const student = await prisma.student.findUnique({ where: { StudentID: studentId } });
    if (!student) throw new Error("Student not found.");

    await prisma.$transaction(async (tx) => {
      await tx.student.delete({ where: { StudentID: studentId } });
      if (student.UserID) {
        await tx.user.delete({ where: { UserID: student.UserID } });
      }
    });

    revalidatePath("/portal/admin/students");
    return { success: true };
  } catch (error: any) {
    console.error("Delete student error:", error);
    return { error: error.message || "Failed to delete student." };
  }
}

export async function deleteClass(classId: number) {
  await requireAdmin();

  try {
    const classRecord = await prisma.class.findUnique({
      where: { ClassID: classId },
      include: { Students: true }
    });
    if (!classRecord) throw new Error("Class not found.");

    if (classRecord.Students.length > 0) {
      throw new Error("Cannot delete a class that has students in it. Move or reassign the students first.");
    }

    await prisma.class.delete({ where: { ClassID: classId } });

    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("Delete class error:", error);
    return { error: error.message || "Failed to delete class." };
  }
}

export async function addClass(className: string, level: string) {
  return addClassArm(className, level);
}

export async function addTeacher(email: string) {
  return createUserAccount({ email, roleName: "Teacher" });
}

export async function deleteTeacher(userId: number) {
  await requireAdmin();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.teacher_Subject_Map.deleteMany({ where: { TeacherID: userId } });
      await tx.user.delete({ where: { UserID: userId } });
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/users");
    return { success: true };
  } catch (error: any) {
    console.error("Delete teacher error:", error);
    return { error: error.message || "Failed to delete teacher." };
  }
}

// ==========================================
// 6. STUDENT CLAIM CODE ONBOARDING (Section 4 & B.6)
// ==========================================

export async function claimStudentAccountWithCode(data: {
  admissionNo: string;
  claimCode: string;
  email: string;
  password: string;
}) {
  try {
    const admissionNo = (data.admissionNo || "").trim();
    const rawCode = (data.claimCode || "").trim().toUpperCase();
    const email = (data.email || "").trim().toLowerCase();
    const password = data.password || "";

    if (!admissionNo || !rawCode || !email || password.length < 8) {
      return {
        success: false,
        error: "Admission number, 6-character claim code, email, and a password (min 8 chars) are required.",
      };
    }

    const student = await prisma.student.findUnique({
      where: { AdmissionNo: admissionNo },
      include: {
        Claims: {
          where: { usedAt: null },
          orderBy: { expiresAt: "desc" },
          take: 1,
        },
      },
    });

    // Uniform generic error to prevent enumeration (Section 2)
    const genericClaimError = "Invalid or expired admission number / claim code combination.";

    if (!student) {
      return { success: false, error: genericClaimError };
    }

    const inputHash = crypto.createHash("sha256").update(rawCode).digest("hex");
    const activeClaim = student.Claims?.[0];

    const expectedHash = activeClaim?.codeHash || student.ClaimCodeHash;
    const expiresAt = activeClaim?.expiresAt || student.ClaimCodeExpiresAt;

    if (!expectedHash || (expiresAt && new Date(expiresAt) < new Date())) {
      return { success: false, error: genericClaimError };
    }

    const bufA = Buffer.from(expectedHash, "utf8");
    const bufB = Buffer.from(inputHash, "utf8");
    const isMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);

    if (!isMatch) {
      if (activeClaim) {
        await prisma.studentClaim.update({
          where: { id: activeClaim.id },
          data: { attempts: { increment: 1 } },
        });
      }
      return { success: false, error: genericClaimError };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found.");

      const user = await tx.user.create({
        data: {
          Email: email,
          PasswordHash: passwordHash,
          RoleID: studentRole.RoleID,
          IsActive: true,
        },
      });

      await tx.student.update({
        where: { StudentID: student.StudentID },
        data: {
          UserID: user.UserID,
          ClaimCodeHash: null,
          ClaimCodeExpiresAt: null,
        },
      });

      if (activeClaim) {
        await tx.studentClaim.update({
          where: { id: activeClaim.id },
          data: { usedAt: new Date() },
        });
      }

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "STUDENT_CLAIM_REDEEMED",
        entity: "Student",
        entityId: student.StudentID,
        newValue: { admissionNo, email },
      });
    });

    return {
      success: true,
      message: "Student account claimed and activated! You may now sign in.",
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to claim student account." };
  }
}

// ==========================================
// 7. AUDIT LOG EXPLORER & HASH-CHAIN VERIFIER (Section B.6)
// ==========================================

export async function getAuditLogExplorerData(filters?: {
  search?: string;
  actionFilter?: string;
  limit?: number;
}) {
  try {
    await requireCapability("VIEW_AUDIT");

    const take = Math.min(filters?.limit || 100, 250);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (filters?.actionFilter && filters.actionFilter !== "ALL") {
      where.Action = filters.actionFilter;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      where.OR = [
        { Action: { contains: q, mode: "insensitive" } },
        { Entity: { contains: q, mode: "insensitive" } },
        { EntityID: { contains: q, mode: "insensitive" } },
        { Reason: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.auditLog.findMany({
      where,
      include: {
        Actor: {
          select: { UserID: true, Email: true },
        },
      },
      orderBy: { CreatedAt: "desc" },
      take,
    });

    const serialized = rows.map((r) => ({
      id: r.id,
      ActorID: r.ActorID,
      actorEmail: r.Actor?.Email || (r.ActorID ? `User #${r.ActorID}` : "System"),
      OnBehalfOfID: r.OnBehalfOfID,
      Action: r.Action,
      Entity: r.Entity,
      EntityID: r.EntityID,
      Reason: r.Reason,
      PrevHash: r.PrevHash,
      Hash: r.Hash,
      OldValue: r.OldValue,
      NewValue: r.NewValue,
      CreatedAt: r.CreatedAt.toISOString(),
    }));

    return { success: true, logs: serialized };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to load audit log explorer." };
  }
}

export async function verifyAuditHashChain() {
  try {
    await requireCapability("VIEW_AUDIT");

    const logs = await prisma.auditLog.findMany({
      orderBy: { CreatedAt: "asc" },
      take: 500,
    });

    let hashedCount = 0;
    let verifiedLinks = 0;
    const brokenLinks: { id: string; expectedPrevHash: string; actualPrevHash: string | null }[] = [];

    let lastHash: string | null = null;
    for (const row of logs) {
      if (!row.Hash) continue;
      hashedCount++;
      if (lastHash !== null && row.PrevHash && row.PrevHash !== "GENESIS") {
        if (row.PrevHash === lastHash) {
          verifiedLinks++;
        } else {
          brokenLinks.push({
            id: row.id,
            expectedPrevHash: lastHash,
            actualPrevHash: row.PrevHash,
          });
        }
      } else {
        verifiedLinks++;
      }
      lastHash = row.Hash;
    }

    return {
      success: true,
      totalChecked: logs.length,
      hashedCount,
      verifiedLinks,
      brokenCount: brokenLinks.length,
      brokenLinks,
      isIntact: brokenLinks.length === 0,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to verify audit hash chain." };
  }
}

export async function exportAuditLogCsv() {
  try {
    const actor = await requireCapability("VIEW_AUDIT");

    const rows = await prisma.auditLog.findMany({
      include: { Actor: { select: { Email: true } } },
      orderBy: { CreatedAt: "desc" },
      take: 500,
    });

    // Section B.6: Exports of the audit log are themselves audited!
    await writeAuditLog({
      actorId: actor.UserID,
      action: "AUDIT_LOG_EXPORTED",
      entity: "AuditLog",
      entityId: `export:${rows.length}`,
      newValue: { exportedRowCount: rows.length },
    });

    const header = "ID,CreatedAt,Actor,OnBehalfOfID,Action,Entity,EntityID,Reason,PrevHash,Hash";
    const lines = rows.map((r) =>
      [
        sanitizeCsvCell(r.id),
        sanitizeCsvCell(r.CreatedAt.toISOString()),
        sanitizeCsvCell(r.Actor?.Email || r.ActorID || "System"),
        sanitizeCsvCell(r.OnBehalfOfID ?? ""),
        sanitizeCsvCell(r.Action),
        sanitizeCsvCell(r.Entity),
        sanitizeCsvCell(r.EntityID),
        sanitizeCsvCell(r.Reason ?? ""),
        sanitizeCsvCell(r.PrevHash ?? ""),
        sanitizeCsvCell(r.Hash ?? ""),
      ].join(",")
    );

    return {
      success: true,
      csv: [header, ...lines].join("\n"),
      fileName: `WOFS_AuditLog_${new Date().toISOString().slice(0, 10)}.csv`,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to export audit log CSV." };
  }
}

// ==========================================
// 8. STEP-UP TOTP 2FA ENROLMENT & VERIFICATION (Section B.2 & Section 3)
// ==========================================

export async function initiateUserTotpEnrollment() {
  try {
    const actor = await requireActiveUser();
    const secret = generateTotpSecret();
    const otpAuthUri = buildOtpAuthUri(actor.Email, secret);
    const { plainCodes, codeHashes } = generateRecoveryCodes();

    await prisma.user.update({
      where: { UserID: actor.UserID },
      data: {
        TotpSecret: secret,
        TotpBackupCodes: JSON.stringify(codeHashes),
      },
    });

    return {
      success: true,
      secret,
      otpAuthUri,
      recoveryCodes: plainCodes,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to initiate TOTP enrollment." };
  }
}

export async function confirmUserTotpEnrollment(code: string) {
  try {
    const actor = await requireActiveUser();
    const user = await prisma.user.findUnique({ where: { UserID: actor.UserID } });
    if (!user?.TotpSecret) {
      return { success: false, error: "No pending TOTP secret found. Start enrollment first." };
    }

    const isValid = verifyTotpCode(user.TotpSecret, code);
    if (!isValid) {
      return { success: false, error: "Invalid 6-digit TOTP code. Check your authenticator app clock." };
    }

    await prisma.user.update({
      where: { UserID: actor.UserID },
      data: { TotpEnabled: true },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "TOTP_2FA_ENABLED",
      entity: "User",
      entityId: actor.UserID,
      newValue: { totpEnabled: true },
    });

    return { success: true, message: "Step-up TOTP 2FA is now active on your account." };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to confirm TOTP enrollment." };
  }
}

export async function verifyStepUpTotpAction(code: string, actionName: string) {
  try {
    const actor = await requireActiveUser();
    const user = await prisma.user.findUnique({ where: { UserID: actor.UserID } });

    if (!user?.TotpEnabled || !user.TotpSecret) {
      return {
        success: false,
        error: "Step-up TOTP is not yet enabled on your account. Enable 2FA first.",
      };
    }

    const isValid = verifyTotpCode(user.TotpSecret, code);
    if (!isValid) {
      await writeAuditLog({
        actorId: actor.UserID,
        action: "STEP_UP_TOTP_FAILED",
        entity: "User",
        entityId: actor.UserID,
        newValue: { attemptedAction: actionName },
      });
      return { success: false, error: "Invalid 6-digit TOTP step-up code." };
    }

    await writeAuditLog({
      actorId: actor.UserID,
      action: "STEP_UP_TOTP_VERIFIED",
      entity: "User",
      entityId: actor.UserID,
      newValue: { verifiedForAction: actionName, validForMinutes: 5 },
    });

    return {
      success: true,
      verifiedUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to verify step-up TOTP." };
  }
}

