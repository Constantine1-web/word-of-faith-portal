"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { SAFE_USER_SELECT, escapeHtml } from "@/lib/security";
import { sendEmail, dispatchDirectWhatsApp, dispatchDirectSms } from "@/lib/email";
import {
  generateNextWofsStudentId,
  generateStudentInvitationSecrets,
  resolveActiveAcademicYear,
} from "@/lib/student-id";
import { detectPotentialStudentDuplicates } from "@/lib/duplicate-detector";

const ADMIN_REGISTRATION_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "Admin",
];

async function requireRegistrationAdmin() {
  return requireRole(ADMIN_REGISTRATION_ROLES);
}

function hasValidGuardianContact(phone?: string | null, email?: string | null): boolean {
  const digits = (phone || "").replace(/\D/g, "");
  const validPhone = digits.length >= 10 && digits !== "08000000000";
  const validEmail = Boolean(email && email.includes("@") && !email.endsWith("@wordoffaith.edu.ng"));
  return validPhone || validEmail;
}

function buildWhatsAppInviteLink(phone: string, message: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits || digits === "08000000000" || digits.length < 10) return null;
  const intl = digits.startsWith("0") && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

/**
 * Ensures existing student records have Uuid and RegistrationStatus populated
 * without overwriting existing IDs or breaking active accounts.
 */
export async function ensureExistingStudentIdentityMigration() {
  try {
    const studentsMissingMeta = await prisma.student.findMany({
      where: {
        OR: [{ Uuid: null }, { RegistrationStatus: "UNCLAIMED", UserID: { not: null } }],
      },
      select: {
        StudentID: true,
        Uuid: true,
        UserID: true,
        ParentContact: true,
        ParentEmail: true,
      },
    });

    for (const st of studentsMissingMeta) {
      await prisma.student.update({
        where: { StudentID: st.StudentID },
        data: {
          Uuid: st.Uuid || crypto.randomUUID(),
          RegistrationStatus: st.UserID ? "CLAIMED" : "UNCLAIMED",
          GuardianVerified: Boolean(st.UserID) || hasValidGuardianContact(st.ParentContact, st.ParentEmail),
        },
      });
    }
  } catch (err) {
    console.warn("[StudentMigration] Non-fatal metadata sync warning:", err);
  }
}

/**
 * Fetches complete data for the Admin Student Registration & Identity Management Dashboard.
 */
export async function getStudentRegistrationDashboardData() {
  await requireRegistrationAdmin();
  await ensureExistingStudentIdentityMigration();

  try {
    const [students, classes, terms, verificationRequests, duplicateCases] = await Promise.all([
      prisma.student.findMany({
        include: {
          Class: true,
          User: { select: SAFE_USER_SELECT },
          Claims: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          Enrollments: {
            orderBy: { AcademicYear: "desc" },
            take: 3,
          },
          IdentityVerifications: {
            orderBy: { createdAt: "desc" },
            take: 2,
            select: {
              id: true,
              method: true,
              status: true,
              notes: true,
              createdAt: true,
            },
          },
        },
        orderBy: { StudentID: "desc" },
      }),
      prisma.class.findMany({
        orderBy: { ClassName: "asc" },
      }),
      prisma.academic_Term.findMany({
        orderBy: [{ IsActive: "desc" }, { TermID: "desc" }],
      }),
      prisma.studentVerificationRequest.findMany({
        include: {
          student: {
            include: { Class: true },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
      }),
      prisma.duplicateReviewCase.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
      }),
    ]);

    const now = new Date();
    let awaitingClaim = 0;
    let claimedAccounts = 0;
    let pendingOtp = 0;
    let expiredOrRevokedInvites = 0;
    let missingGuardianContact = 0;

    const enrichedStudents = students.map((st) => {
      const latestClaim = st.Claims?.[0] || null;
      const isClaimed = Boolean(st.UserID && st.User?.IsActive);
      const hasGuardian = hasValidGuardianContact(st.ParentContact, st.ParentEmail);

      let effectiveRegStatus = st.RegistrationStatus || (isClaimed ? "CLAIMED" : "UNCLAIMED");
      if (isClaimed) {
        effectiveRegStatus = "CLAIMED";
        claimedAccounts++;
      } else {
        awaitingClaim++;
        if (latestClaim) {
          if (latestClaim.status === "PENDING_OTP") {
            effectiveRegStatus = "PENDING_OTP";
            pendingOtp++;
          } else if (
            latestClaim.status === "REVOKED" ||
            latestClaim.status === "EXPIRED" ||
            (latestClaim.expiresAt && new Date(latestClaim.expiresAt) < now && !latestClaim.usedAt)
          ) {
            expiredOrRevokedInvites++;
            if (effectiveRegStatus === "INVITED") effectiveRegStatus = "INVITE_EXPIRED";
          } else if (latestClaim.status === "ACTIVE" && !latestClaim.usedAt) {
            effectiveRegStatus = "INVITED";
          }
        }
      }

      if (!hasGuardian) {
        missingGuardianContact++;
      }

      return {
        ...st,
        wofsStudentId: st.AdmissionNo,
        effectiveRegStatus,
        hasGuardianContact: hasGuardian,
        latestClaim: latestClaim
          ? {
              id: latestClaim.id,
              maskedCode: latestClaim.maskedCode || "WOFS-INV-****",
              status:
                !latestClaim.usedAt &&
                latestClaim.status === "ACTIVE" &&
                new Date(latestClaim.expiresAt) < now
                  ? "EXPIRED"
                  : latestClaim.status,
              channel: latestClaim.channel,
              attempts: latestClaim.attempts,
              expiresAt: latestClaim.expiresAt,
              usedAt: latestClaim.usedAt,
              createdAt: latestClaim.createdAt,
            }
          : null,
      };
    });

    const pendingManualVerification = verificationRequests.filter(
      (r) => r.status === "PENDING" || r.status === "IN_PERSON_REQUIRED"
    ).length;
    const openDuplicateCases = duplicateCases.filter((c) => c.status === "OPEN").length;

    return {
      success: true,
      students: enrichedStudents,
      classes,
      terms,
      verificationRequests,
      duplicateCases,
      summary: {
        totalStudents: students.length,
        awaitingClaim,
        claimedAccounts,
        pendingOtp,
        pendingManualVerification,
        openDuplicateCases,
        expiredOrRevokedInvites,
        missingGuardianContact,
      },
    };
  } catch (error: any) {
    console.error("getStudentRegistrationDashboardData error:", error);
    return {
      success: false,
      error: error.message || "Failed to load student registration dashboard.",
    };
  }
}

/**
 * Pre-save duplicate check for the Administrative Student Registration form.
 */
export async function checkDuplicateStudentPreview(data: {
  excludeStudentId?: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: string;
  classId?: number;
  parentContact?: string;
  parentEmail?: string;
  isTwinOrSiblingException?: boolean;
}) {
  await requireRegistrationAdmin();
  const result = await detectPotentialStudentDuplicates(data);
  return {
    success: true,
    ...result,
  };
}

/**
 * Registers an individual student in the WOFS administrative directory.
 * Automatically generates a permanent, unique `WOFS-STU-YYYY-NNNNNN` Student ID
 * and an optional single-use registration invitation.
 */
export async function createAdminStudentRecord(data: {
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: string;
  dateOfBirth: string;
  classId: number;
  academicYear?: string;
  enrolmentStatus?: "ACTIVE" | "PROMOTED" | "REPEATING" | "WITHDRAWN";
  parentName?: string;
  parentContact?: string;
  parentEmail?: string;
  isTwinOrSiblingException?: boolean;
  siblingExceptionNote?: string;
  forceCreateWithDuplicateFlag?: boolean;
  generateInvitation?: boolean;
  invitationExpiryDays?: number;
}) {
  const actor = await requireRegistrationAdmin();

  const firstName = (data.firstName || "").trim();
  const lastName = (data.lastName || "").trim();
  const middleName = (data.middleName || "").trim() || null;
  const gender = (data.gender || "Unspecified").trim();
  const classId = Number(data.classId);
  const parentName = (data.parentName || "").trim() || null;
  const parentContact = (data.parentContact || "").trim() || "08000000000";
  const parentEmail = (data.parentEmail || "").trim().toLowerCase() || null;

  if (!firstName || !lastName || !classId) {
    return {
      success: false,
      error: "First Name, Last Name, and Class assignment are required.",
    };
  }

  const parsedDob = data.dateOfBirth ? new Date(data.dateOfBirth) : new Date("2012-01-01");
  if (Number.isNaN(parsedDob.getTime())) {
    return { success: false, error: "Please provide a valid Date of Birth." };
  }

  // Run multi-signal duplicate detection
  const dupCheck = await detectPotentialStudentDuplicates({
    firstName,
    lastName,
    middleName,
    dateOfBirth: parsedDob,
    classId,
    parentContact,
    parentEmail,
    isTwinOrSiblingException: data.isTwinOrSiblingException,
  });

  if (dupCheck.hasBlockingDuplicate && !data.forceCreateWithDuplicateFlag && !data.isTwinOrSiblingException) {
    return {
      success: false,
      requiresDuplicateConfirmation: true,
      hasSiblingOrTwinSignal: dupCheck.hasSiblingOrTwinSignal,
      duplicateMatches: dupCheck.matches,
      error:
        "Potential duplicate student record detected. Please review the matching student record(s) below, or mark as a Twin/Sibling Exception to proceed.",
    };
  }

  try {
    const expiryDays = Math.min(Math.max(Number(data.invitationExpiryDays) || 14, 1), 90);
    const shouldGenerateInvite = data.generateInvitation !== false;
    const inviteSecrets = shouldGenerateInvite ? generateStudentInvitationSecrets() : null;
    const inviteExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const created = await prisma.$transaction(async (tx) => {
      const targetClass = await tx.class.findUnique({ where: { ClassID: classId } });
      if (!targetClass) {
        throw new Error("Selected class arm does not exist.");
      }

      const activeTerm =
        (await tx.academic_Term.findFirst({ where: { IsActive: true } })) ||
        (await tx.academic_Term.findFirst({ orderBy: { TermID: "desc" } }));

      const sessionYear = await resolveActiveAcademicYear(tx);
      const wofsStudentId = await generateNextWofsStudentId(tx, sessionYear);

      const fullDisplayName = [firstName, middleName, lastName].filter(Boolean).join(" ");
      const hasGuardian = hasValidGuardianContact(parentContact, parentEmail);

      const student = await tx.student.create({
        data: {
          Uuid: crypto.randomUUID(),
          AdmissionNo: wofsStudentId,
          FirstName: firstName,
          LastName: lastName,
          MiddleName: middleName,
          PreferredName: fullDisplayName,
          Gender: gender,
          ClassID: classId,
          DateOfBirth: parsedDob,
          ParentName: parentName,
          ParentContact: parentContact,
          ParentEmail: parentEmail,
          GuardianVerified: hasGuardian,
          RegistrationStatus: shouldGenerateInvite ? "INVITED" : "UNCLAIMED",
          EnrolmentStatus: data.enrolmentStatus || "ACTIVE",
          SiblingExceptionNote: data.isTwinOrSiblingException
            ? data.siblingExceptionNote?.trim() || "Verified Twin / Sibling sharing family guardian contact"
            : null,
          ClaimCodeHash: inviteSecrets ? inviteSecrets.codeHash : null,
          ClaimCodeExpiresAt: inviteSecrets ? inviteExpiresAt : null,
        },
        include: { Class: true },
      });

      if (activeTerm) {
        await tx.enrollment.create({
          data: {
            StudentID: student.StudentID,
            ClassID: classId,
            TermID: activeTerm.TermID,
            AcademicYear: data.academicYear || activeTerm.SessionName || `${sessionYear}/${sessionYear + 1}`,
            Status: (data.enrolmentStatus as any) || "ACTIVE",
          },
        });
      }

      let claimRecord = null;
      if (inviteSecrets) {
        claimRecord = await tx.studentClaim.create({
          data: {
            studentId: student.StudentID,
            codeHash: inviteSecrets.codeHash,
            tokenHash: inviteSecrets.tokenHash,
            maskedCode: inviteSecrets.maskedCode,
            status: "ACTIVE",
            channel: "SLIP",
            createdById: actor.UserID,
            expiresAt: inviteExpiresAt,
          },
        });
      }

      // If created despite duplicate match, record in DuplicateReviewCase for audit/investigation
      if (dupCheck.matches.length > 0) {
        const topMatch = dupCheck.matches[0];
        await tx.duplicateReviewCase.create({
          data: {
            primaryStudentId: topMatch.studentId,
            candidateStudentId: student.StudentID,
            matchType: topMatch.matchType,
            signalsJson: topMatch.signals as any,
            status: data.isTwinOrSiblingException ? "CLEARED_TWIN_SIBLING" : "OPEN",
            resolutionNote: data.isTwinOrSiblingException
              ? data.siblingExceptionNote || "Approved as Twin/Sibling during admin registration"
              : "Flagged during admin creation for review",
            resolvedById: data.isTwinOrSiblingException ? actor.UserID : null,
            resolvedAt: data.isTwinOrSiblingException ? new Date() : null,
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "STUDENT_RECORD_CREATED",
        entity: "Student",
        entityId: student.StudentID,
        newValue: {
          wofsStudentId,
          uuid: student.Uuid,
          fullName: fullDisplayName,
          classId,
          className: targetClass.ClassName,
          invitationIssued: Boolean(inviteSecrets),
          isTwinOrSiblingException: Boolean(data.isTwinOrSiblingException),
        },
      });

      return { student, claimRecord, wofsStudentId, fullDisplayName };
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wofs.vercel.app";
    const inviteUrl = inviteSecrets
      ? `${appUrl}/portal/register?invite=${encodeURIComponent(inviteSecrets.plainCode)}`
      : null;

    const inviteMessage = inviteSecrets
      ? `Word of Faith Schools — Student Portal Registration Invitation\nStudent: ${created.fullDisplayName} (${created.student.Class?.ClassName})\nPermanent WOFS Student ID: ${created.wofsStudentId}\nOne-Time Invitation Code: ${inviteSecrets.plainCode}\nClaim Link: ${inviteUrl}\nExpires: ${inviteExpiresAt.toISOString().split("T")[0]}`
      : "";

    const whatsappUrl =
      inviteSecrets && parentContact
        ? buildWhatsAppInviteLink(parentContact, inviteMessage)
        : null;

    revalidatePath("/portal/admin/students");
    return {
      success: true,
      student: {
        ...created.student,
        wofsStudentId: created.wofsStudentId,
      },
      invitation: inviteSecrets
        ? {
            claimId: created.claimRecord?.id,
            plainCode: inviteSecrets.plainCode,
            maskedCode: inviteSecrets.maskedCode,
            inviteUrl,
            expiresAt: inviteExpiresAt.toISOString(),
            whatsappUrl,
          }
        : null,
    };
  } catch (error: any) {
    console.error("createAdminStudentRecord error:", error);
    return {
      success: false,
      error: error.message || "Failed to register student record.",
    };
  }
}

/**
 * Updates an existing student record's administrative details.
 * Note: `Student.Uuid` and `Student.AdmissionNo` (WOFS-STU-YYYY-NNNNNN) are strictly immutable.
 */
export async function updateAdminStudentRecord(data: {
  studentId: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: string;
  dateOfBirth?: string;
  classId: number;
  enrolmentStatus?: string;
  parentName?: string;
  parentContact?: string;
  parentEmail?: string;
  siblingExceptionNote?: string;
}) {
  const actor = await requireRegistrationAdmin();
  const studentId = Number(data.studentId);

  if (!studentId || !data.firstName?.trim() || !data.lastName?.trim()) {
    return { success: false, error: "Student ID, First Name, and Last Name are required." };
  }

  try {
    const existing = await prisma.student.findUnique({
      where: { StudentID: studentId },
    });
    if (!existing) {
      return { success: false, error: "Student record not found." };
    }

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const middleName = data.middleName?.trim() || null;
    const fullDisplayName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const parentContact = data.parentContact?.trim() || existing.ParentContact;
    const parentEmail = data.parentEmail?.trim().toLowerCase() || null;
    const parsedDob = data.dateOfBirth ? new Date(data.dateOfBirth) : existing.DateOfBirth;

    const updated = await prisma.student.update({
      where: { StudentID: studentId },
      data: {
        FirstName: firstName,
        LastName: lastName,
        MiddleName: middleName,
        PreferredName: fullDisplayName,
        Gender: data.gender?.trim() || existing.Gender,
        DateOfBirth: Number.isNaN(parsedDob.getTime()) ? existing.DateOfBirth : parsedDob,
        ClassID: Number(data.classId) || existing.ClassID,
        EnrolmentStatus: data.enrolmentStatus || existing.EnrolmentStatus,
        ParentName: data.parentName?.trim() ?? existing.ParentName,
        ParentContact: parentContact,
        ParentEmail: parentEmail,
        GuardianVerified: hasValidGuardianContact(parentContact, parentEmail),
        SiblingExceptionNote:
          data.siblingExceptionNote !== undefined
            ? data.siblingExceptionNote.trim() || null
            : existing.SiblingExceptionNote,
      },
      include: { Class: true },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "STUDENT_RECORD_UPDATED",
      entity: "Student",
      entityId: studentId,
      oldValue: {
        firstName: existing.FirstName,
        lastName: existing.LastName,
        classId: existing.ClassID,
        parentContact: existing.ParentContact,
        parentEmail: existing.ParentEmail,
      },
      newValue: {
        wofsStudentId: existing.AdmissionNo,
        firstName,
        lastName,
        classId: updated.ClassID,
        parentContact,
        parentEmail,
      },
    });

    revalidatePath("/portal/admin/students");
    return { success: true, student: updated };
  } catch (error: any) {
    console.error("updateAdminStudentRecord error:", error);
    return { success: false, error: error.message || "Failed to update student record." };
  }
}

/**
 * Generates (or regenerates) a single-use registration invitation for an unclaimed student record.
 * Automatically revokes any prior active invitation for that student.
 */
export async function generateStudentInvitation(params: {
  studentId: number;
  channel?: "SLIP" | "EMAIL" | "WHATSAPP" | "SMS";
  expiryDays?: number;
  sendDispatchNow?: boolean;
}) {
  const actor = await requireRegistrationAdmin();
  const studentId = Number(params.studentId);

  try {
    const student = await prisma.student.findUnique({
      where: { StudentID: studentId },
      include: { Class: true, User: true },
    });

    if (!student) {
      return { success: false, error: "Student record not found." };
    }

    if (student.UserID && student.User?.IsActive) {
      return {
        success: false,
        error: "This student has already claimed and activated their portal account.",
      };
    }

    const expiryDays = Math.min(Math.max(Number(params.expiryDays) || 14, 1), 90);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const secrets = generateStudentInvitationSecrets();
    const channel = params.channel || "SLIP";

    const claim = await prisma.$transaction(async (tx) => {
      // Revoke any existing active invitations for this student
      await tx.studentClaim.updateMany({
        where: {
          studentId,
          usedAt: null,
          status: { in: ["ACTIVE", "PENDING_OTP"] },
        },
        data: {
          status: "REVOKED",
          revokedById: actor.UserID,
          revokedAt: new Date(),
          revokeReason: "Superseded by new invitation",
        },
      });

      const createdClaim = await tx.studentClaim.create({
        data: {
          studentId,
          codeHash: secrets.codeHash,
          tokenHash: secrets.tokenHash,
          maskedCode: secrets.maskedCode,
          status: "ACTIVE",
          channel,
          createdById: actor.UserID,
          expiresAt,
        },
      });

      await tx.student.update({
        where: { StudentID: studentId },
        data: {
          ClaimCodeHash: secrets.codeHash,
          ClaimCodeExpiresAt: expiresAt,
          RegistrationStatus: "INVITED",
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "STUDENT_INVITATION_GENERATED",
        entity: "StudentClaim",
        entityId: createdClaim.id,
        newValue: {
          studentId,
          wofsStudentId: student.AdmissionNo,
          maskedCode: secrets.maskedCode,
          channel,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return createdClaim;
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wofs.vercel.app";
    const inviteUrl = `${appUrl}/portal/register?invite=${encodeURIComponent(secrets.plainCode)}`;
    const studentName =
      student.PreferredName ||
      `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
      student.AdmissionNo;

    const textMessage = `Word of Faith Schools — Student Portal Invitation\nStudent: ${studentName} (${student.Class?.ClassName || "Assigned Class"})\nPermanent WOFS ID: ${student.AdmissionNo}\nOne-Time Invite Code: ${secrets.plainCode}\nClaim Link: ${inviteUrl}\nValid until: ${expiresAt.toISOString().split("T")[0]}`;

    let emailDispatched = false;
    if (params.sendDispatchNow && student.ParentEmail && student.ParentEmail.includes("@")) {
      const mailRes = await sendEmail({
        to: student.ParentEmail.trim(),
        subject: `Student Portal Registration Invitation — ${studentName} (${student.AdmissionNo})`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
            <div style="background: #0A2540; color: #ffffff; padding: 20px 24px; border-bottom: 4px solid #16a34a;">
              <h2 style="margin: 0; font-size: 19px; color: #ffffff;">Word of Faith Schools</h2>
              <p style="margin: 4px 0 0; font-size: 13px; color: #86efac;">Official Student Portal Account Invitation</p>
            </div>
            <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
              <p>Dear Parent / Guardian,</p>
              <p>A student record has been established for <strong>${escapeHtml(studentName)}</strong> in <strong>${escapeHtml(student.Class?.ClassName || "Word of Faith Schools")}</strong>.</p>
              <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 18px; margin: 18px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Permanent WOFS Student ID:</strong> <code style="font-size: 15px; font-weight: bold; color: #0A2540;">${escapeHtml(student.AdmissionNo)}</code></p>
                <p style="margin: 0 0 8px 0;"><strong>Single-Use Invitation Code:</strong> <code style="font-size: 18px; font-weight: 800; color: #15803d; letter-spacing: 1px;">${escapeHtml(secrets.plainCode)}</code></p>
                <p style="margin: 0; font-size: 12px; color: #475569;">Expires on: ${expiresAt.toISOString().split("T")[0]}</p>
              </div>
              <p>Click the button below or visit <strong>/portal/register</strong> and enter the Single-Use Invitation Code above to claim the student portal account:</p>
              <p style="text-align: center; margin: 24px 0;">
                <a href="${inviteUrl}" style="background: #15803d; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">Claim Student Portal Account</a>
              </p>
            </div>
          </div>
        `,
      }).catch(() => ({ success: false }));
      emailDispatched = Boolean(mailRes?.success);
    }

    if (params.sendDispatchNow && student.ParentContact) {
      await dispatchDirectWhatsApp(student.ParentContact, textMessage).catch(() => {});
      await dispatchDirectSms(student.ParentContact, textMessage).catch(() => {});
    }

    const whatsappUrl = buildWhatsAppInviteLink(student.ParentContact, textMessage);

    revalidatePath("/portal/admin/students");
    return {
      success: true,
      invitation: {
        claimId: claim.id,
        studentId,
        studentName,
        wofsStudentId: student.AdmissionNo,
        className: student.Class?.ClassName || "Unassigned",
        plainCode: secrets.plainCode,
        maskedCode: secrets.maskedCode,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        emailDispatched,
        whatsappUrl,
      },
    };
  } catch (error: any) {
    console.error("generateStudentInvitation error:", error);
    return { success: false, error: error.message || "Failed to generate invitation." };
  }
}

/**
 * Revokes an active student registration invitation immediately.
 */
export async function revokeStudentInvitation(claimId: string, reason?: string) {
  const actor = await requireRegistrationAdmin();

  try {
    const existing = await prisma.studentClaim.findUnique({
      where: { id: claimId },
      include: { student: true },
    });

    if (!existing) {
      return { success: false, error: "Invitation record not found." };
    }

    if (existing.usedAt || existing.status === "REDEEMED") {
      return { success: false, error: "This invitation has already been redeemed and cannot be revoked." };
    }

    const cleanReason = (reason || "Revoked by school administrator").trim();

    await prisma.$transaction([
      prisma.studentClaim.update({
        where: { id: claimId },
        data: {
          status: "REVOKED",
          revokedById: actor.UserID,
          revokedAt: new Date(),
          revokeReason: cleanReason,
        },
      }),
      prisma.student.update({
        where: { StudentID: existing.studentId },
        data: {
          ClaimCodeHash: null,
          ClaimCodeExpiresAt: null,
          RegistrationStatus: existing.student.UserID ? "CLAIMED" : "UNCLAIMED",
        },
      }),
    ]);

    await writeAuditLog({
      actorId: actor.UserID,
      action: "STUDENT_INVITATION_REVOKED",
      entity: "StudentClaim",
      entityId: claimId,
      reason: cleanReason,
      newValue: {
        studentId: existing.studentId,
        wofsStudentId: existing.student.AdmissionNo,
        status: "REVOKED",
      },
    });

    revalidatePath("/portal/admin/students");
    return { success: true };
  } catch (error: any) {
    console.error("revokeStudentInvitation error:", error);
    return { success: false, error: error.message || "Failed to revoke invitation." };
  }
}

export interface BulkStudentImportRowInput {
  rowNumber: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: string;
  dateOfBirth: string;
  className: string;
  parentName?: string;
  parentContact?: string;
  parentEmail?: string;
  isTwinOrSiblingException?: boolean;
}

/**
 * Validates and previews a CSV / spreadsheet bulk student import before committing.
 * Does NOT require admission numbers — all imported students receive system-generated WOFS-STU IDs.
 */
export async function previewBulkStudentImport(
  csvText: string,
  defaultClassId?: number
) {
  await requireRegistrationAdmin();

  const lines = (csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { success: false, error: "CSV input is empty. Please paste or upload student records." };
  }

  const classes = await prisma.class.findMany();
  const classByName = new Map<string, { ClassID: number; ClassName: string }>();
  for (const c of classes) {
    classByName.set(c.ClassName.toLowerCase().replace(/\s+/g, ""), c);
  }
  const fallbackClass =
    classes.find((c) => c.ClassID === Number(defaultClassId)) || classes[0];

  // Detect if first line is a header
  const firstLower = lines[0].toLowerCase();
  const hasHeader =
    firstLower.includes("firstname") ||
    firstLower.includes("first_name") ||
    firstLower.includes("first name") ||
    firstLower.includes("surname") ||
    firstLower.includes("lastname");

  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return { success: false, error: "No student rows found below the header line." };
  }
  if (dataLines.length > 500) {
    return { success: false, error: "Bulk import is limited to 500 students per batch." };
  }

  const previewRows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    middleName: string;
    gender: string;
    dateOfBirth: string;
    classId: number | null;
    className: string;
    parentName: string;
    parentContact: string;
    parentEmail: string;
    isTwinOrSiblingException: boolean;
    status: "VALID" | "WARNING_DUPLICATE" | "WARNING_SIBLING_TWIN" | "ERROR";
    errors: string[];
    warnings: string[];
    duplicateMatchSummary?: string;
  }> = [];

  const seenInBatch = new Set<string>();

  for (let idx = 0; idx < dataLines.length; idx++) {
    const rawLine = dataLines[idx];
    const cols = rawLine.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

    // Expected columns: FirstName, LastName, MiddleName, Gender, DateOfBirth (YYYY-MM-DD), ClassName, ParentName, ParentPhone, ParentEmail, TwinOrSibling (YES/NO)
    const firstName = (cols[0] || "").replace(/^[=+\-@]+/, "").trim();
    const lastName = (cols[1] || "").replace(/^[=+\-@]+/, "").trim();
    const middleName = (cols[2] || "").replace(/^[=+\-@]+/, "").trim();
    const gender = (cols[3] || "Unspecified").trim();
    const dobStr = (cols[4] || "2012-01-01").trim();
    const rawClassName = (cols[5] || "").trim();
    const parentName = (cols[6] || "").trim();
    const parentContact = (cols[7] || "").trim();
    const parentEmail = (cols[8] || "").trim().toLowerCase();
    const twinFlag = /^(yes|true|1|twin|sibling)$/i.test((cols[9] || "").trim());

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!firstName) errors.push("Missing First Name");
    if (!lastName) errors.push("Missing Last Name");

    const parsedDob = new Date(dobStr);
    if (Number.isNaN(parsedDob.getTime())) {
      errors.push(`Invalid Date of Birth "${dobStr}" (use YYYY-MM-DD)`);
    }

    let matchedClass = rawClassName
      ? classByName.get(rawClassName.toLowerCase().replace(/\s+/g, ""))
      : fallbackClass;

    if (!matchedClass && rawClassName) {
      // Partial match fallback
      matchedClass = classes.find((c) =>
        c.ClassName.toLowerCase().includes(rawClassName.toLowerCase())
      );
    }
    if (!matchedClass) {
      matchedClass = fallbackClass;
      if (rawClassName) {
        warnings.push(`Class "${rawClassName}" not found; defaulted to ${fallbackClass?.ClassName || "Default"}`);
      }
    }

    const batchKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${dobStr}`;
    if (seenInBatch.has(batchKey) && !twinFlag) {
      errors.push("Duplicate row within this CSV upload (same First Name, Last Name & Date of Birth)");
    }
    seenInBatch.add(batchKey);

    let duplicateMatchSummary: string | undefined;
    let status: "VALID" | "WARNING_DUPLICATE" | "WARNING_SIBLING_TWIN" | "ERROR" =
      errors.length > 0 ? "ERROR" : "VALID";

    if (errors.length === 0) {
      const dupCheck = await detectPotentialStudentDuplicates({
        firstName,
        lastName,
        middleName,
        dateOfBirth: parsedDob,
        classId: matchedClass?.ClassID,
        parentContact,
        parentEmail,
        isTwinOrSiblingException: twinFlag,
      });

      if (dupCheck.matches.length > 0) {
        const top = dupCheck.matches[0];
        duplicateMatchSummary = `${top.fullName} (${top.wofsStudentId}, ${top.className}) — ${Math.round(
          top.confidenceScore * 100
        )}% match`;

        if (dupCheck.hasBlockingDuplicate) {
          status = "WARNING_DUPLICATE";
          warnings.push(`Possible existing student: ${duplicateMatchSummary}`);
        } else {
          status = "WARNING_SIBLING_TWIN";
          warnings.push(`Sibling/Twin signal noted: ${duplicateMatchSummary}`);
        }
      } else if (dupCheck.hasSiblingOrTwinSignal) {
        status = "WARNING_SIBLING_TWIN";
        warnings.push("Shares guardian contact with an existing student (Sibling/Twin permitted).");
      }
    }

    previewRows.push({
      rowNumber: idx + 1,
      firstName,
      lastName,
      middleName,
      gender,
      dateOfBirth: Number.isNaN(parsedDob.getTime())
        ? dobStr
        : parsedDob.toISOString().split("T")[0],
      classId: matchedClass?.ClassID || null,
      className: matchedClass?.ClassName || "Unassigned",
      parentName,
      parentContact,
      parentEmail,
      isTwinOrSiblingException: twinFlag,
      status,
      errors,
      warnings,
      duplicateMatchSummary,
    });
  }

  const validCount = previewRows.filter((r) => r.status !== "ERROR").length;
  const errorCount = previewRows.filter((r) => r.status === "ERROR").length;
  const duplicateWarningCount = previewRows.filter((r) => r.status === "WARNING_DUPLICATE").length;

  return {
    success: true,
    rows: previewRows,
    summary: {
      totalRows: previewRows.length,
      validCount,
      errorCount,
      duplicateWarningCount,
    },
  };
}

/**
 * Commits validated bulk student import rows, generating a unique permanent
 * WOFS Student ID (`WOFS-STU-YYYY-NNNNNN`) and a single-use invitation code for each imported student.
 */
export async function commitBulkStudentImport(
  rows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    gender?: string;
    dateOfBirth: string;
    classId: number;
    parentName?: string;
    parentContact?: string;
    parentEmail?: string;
    isTwinOrSiblingException?: boolean;
    skipIfDuplicate?: boolean;
  }>
) {
  const actor = await requireRegistrationAdmin();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: "No rows provided for import." };
  }

  const importedSlips: Array<{
    rowNumber: number;
    studentId: number;
    wofsStudentId: string;
    fullName: string;
    className: string;
    invitationCode: string;
    inviteUrl: string;
    expiresAt: string;
  }> = [];

  const rejectedRows: Array<{
    rowNumber: number;
    fullName: string;
    reason: string;
  }> = [];

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wofs.vercel.app";
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    for (const row of rows.slice(0, 500)) {
      const firstName = (row.firstName || "").trim();
      const lastName = (row.lastName || "").trim();
      const middleName = (row.middleName || "").trim() || null;
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

      if (!firstName || !lastName || !row.classId) {
        rejectedRows.push({
          rowNumber: row.rowNumber,
          fullName: fullName || `Row #${row.rowNumber}`,
          reason: "Missing First Name, Last Name, or Class assignment.",
        });
        continue;
      }

      const parsedDob = new Date(row.dateOfBirth || "2012-01-01");
      if (Number.isNaN(parsedDob.getTime())) {
        rejectedRows.push({
          rowNumber: row.rowNumber,
          fullName,
          reason: "Invalid Date of Birth.",
        });
        continue;
      }

      const dupCheck = await detectPotentialStudentDuplicates({
        firstName,
        lastName,
        middleName,
        dateOfBirth: parsedDob,
        classId: row.classId,
        parentContact: row.parentContact,
        parentEmail: row.parentEmail,
        isTwinOrSiblingException: row.isTwinOrSiblingException,
      });

      if (dupCheck.hasBlockingDuplicate && row.skipIfDuplicate !== false && !row.isTwinOrSiblingException) {
        rejectedRows.push({
          rowNumber: row.rowNumber,
          fullName,
          reason: `Skipped potential duplicate matching ${dupCheck.matches[0]?.wofsStudentId} (${dupCheck.matches[0]?.fullName})`,
        });
        continue;
      }

      try {
        const secrets = generateStudentInvitationSecrets();

        const created = await prisma.$transaction(async (tx) => {
          const targetClass = await tx.class.findUnique({ where: { ClassID: Number(row.classId) } });
          if (!targetClass) throw new Error("Class not found");

          const activeTerm =
            (await tx.academic_Term.findFirst({ where: { IsActive: true } })) ||
            (await tx.academic_Term.findFirst({ orderBy: { TermID: "desc" } }));

          const sessionYear = await resolveActiveAcademicYear(tx);
          const wofsStudentId = await generateNextWofsStudentId(tx, sessionYear);
          const parentContact = (row.parentContact || "").trim() || "08000000000";
          const parentEmail = (row.parentEmail || "").trim().toLowerCase() || null;

          const st = await tx.student.create({
            data: {
              Uuid: crypto.randomUUID(),
              AdmissionNo: wofsStudentId,
              FirstName: firstName,
              LastName: lastName,
              MiddleName: middleName,
              PreferredName: fullName,
              Gender: (row.gender || "Unspecified").trim(),
              ClassID: targetClass.ClassID,
              DateOfBirth: parsedDob,
              ParentName: (row.parentName || "").trim() || null,
              ParentContact: parentContact,
              ParentEmail: parentEmail,
              GuardianVerified: hasValidGuardianContact(parentContact, parentEmail),
              RegistrationStatus: "INVITED",
              EnrolmentStatus: "ACTIVE",
              SiblingExceptionNote: row.isTwinOrSiblingException
                ? "Verified Twin/Sibling during bulk import"
                : null,
              ClaimCodeHash: secrets.codeHash,
              ClaimCodeExpiresAt: expiresAt,
            },
          });

          if (activeTerm) {
            await tx.enrollment.create({
              data: {
                StudentID: st.StudentID,
                ClassID: targetClass.ClassID,
                TermID: activeTerm.TermID,
                AcademicYear: activeTerm.SessionName || `${sessionYear}/${sessionYear + 1}`,
                Status: "ACTIVE",
              },
            });
          }

          await tx.studentClaim.create({
            data: {
              studentId: st.StudentID,
              codeHash: secrets.codeHash,
              tokenHash: secrets.tokenHash,
              maskedCode: secrets.maskedCode,
              status: "ACTIVE",
              channel: "SLIP",
              createdById: actor.UserID,
              expiresAt,
            },
          });

          return { st, wofsStudentId, className: targetClass.ClassName };
        });

        importedSlips.push({
          rowNumber: row.rowNumber,
          studentId: created.st.StudentID,
          wofsStudentId: created.wofsStudentId,
          fullName,
          className: created.className,
          invitationCode: secrets.plainCode,
          inviteUrl: `${appUrl}/portal/register?invite=${encodeURIComponent(secrets.plainCode)}`,
          expiresAt: expiresAt.toISOString().split("T")[0],
        });
      } catch (rowErr: any) {
        rejectedRows.push({
          rowNumber: row.rowNumber,
          fullName,
          reason: rowErr.message || "Database error on row commit",
        });
      }
    }

    await writeAuditLog({
      actorId: actor.UserID,
      action: "STUDENT_BULK_IMPORT_COMMITTED",
      entity: "Student",
      entityId: "BULK",
      newValue: {
        importedCount: importedSlips.length,
        rejectedCount: rejectedRows.length,
      },
    });

    revalidatePath("/portal/admin/students");
    return {
      success: true,
      importedCount: importedSlips.length,
      rejectedCount: rejectedRows.length,
      importedSlips,
      rejectedRows,
    };
  } catch (error: any) {
    console.error("commitBulkStudentImport error:", error);
    return { success: false, error: error.message || "Bulk import failed." };
  }
}

/**
 * Reviews a Manual Student Registration Verification Request (Pathway 4).
 * Supports APPROVED, IN_PERSON_REQUIRED, or DECLINED with a mandatory recorded reason.
 */
export async function reviewManualVerificationRequest(params: {
  requestId: string;
  decision: "APPROVED" | "IN_PERSON_REQUIRED" | "DECLINED";
  reason: string;
  targetStudentId?: number;
  assignClassId?: number;
}) {
  const actor = await requireRegistrationAdmin();
  const cleanReason = (params.reason || "").trim();

  if (!cleanReason) {
    return {
      success: false,
      error: "A recorded verification reason or review note is required.",
    };
  }

  try {
    const reqRecord = await prisma.studentVerificationRequest.findUnique({
      where: { id: params.requestId },
    });

    if (!reqRecord) {
      return { success: false, error: "Verification request not found." };
    }

    if (reqRecord.status === "APPROVED" || reqRecord.status === "DECLINED") {
      return {
        success: false,
        error: `This request has already been ${reqRecord.status.toLowerCase()}.`,
      };
    }

    if (params.decision === "IN_PERSON_REQUIRED" || params.decision === "DECLINED") {
      const updated = await prisma.studentVerificationRequest.update({
        where: { id: params.requestId },
        data: {
          status: params.decision,
          reviewedById: actor.UserID,
          reviewedAt: new Date(),
          decisionReason: cleanReason,
        },
      });

      await writeAuditLog({
        actorId: actor.UserID,
        action: `MANUAL_VERIFICATION_${params.decision}`,
        entity: "StudentVerificationRequest",
        entityId: reqRecord.id,
        reason: cleanReason,
        newValue: {
          referenceCode: reqRecord.referenceCode,
          status: params.decision,
        },
      });

      if (reqRecord.contactEmail && reqRecord.contactEmail.includes("@")) {
        const subject =
          params.decision === "IN_PERSON_REQUIRED"
            ? `In-Person Verification Required — Word of Faith Schools (${reqRecord.referenceCode})`
            : `Registration Verification Update — Word of Faith Schools (${reqRecord.referenceCode})`;
        await sendEmail({
          to: reqRecord.contactEmail,
          subject,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px;">
              <h2 style="color: #0A2540; margin-top: 0;">Word of Faith Schools — Verification Update</h2>
              <p>Hello <strong>${escapeHtml(reqRecord.firstName)} ${escapeHtml(reqRecord.lastName)}</strong>,</p>
              <p>Your manual registration verification request (<strong>${escapeHtml(reqRecord.referenceCode)}</strong>) has been reviewed by the school administration:</p>
              <p><strong>Status:</strong> ${escapeHtml(params.decision.replace(/_/g, " "))}</p>
              <p><strong>Administrative Note:</strong> ${escapeHtml(cleanReason)}</p>
            </div>
          `,
        }).catch(() => {});
      }

      revalidatePath("/portal/admin/students");
      return { success: true, request: updated };
    }

    // APPROVED: Link to targetStudentId (or reqRecord.studentId) OR create a fresh Student record,
    // then activate the User account with the student's pre-hashed password (or generate an invite).
    const outcome = await prisma.$transaction(async (tx) => {
      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found in database.");

      const targetId = Number(params.targetStudentId || reqRecord.studentId || 0);
      let student = targetId
        ? await tx.student.findUnique({ where: { StudentID: targetId }, include: { Class: true } })
        : null;

      if (student && student.UserID) {
        throw new Error("The selected student record is already linked to a claimed user account.");
      }

      const activeTerm =
        (await tx.academic_Term.findFirst({ where: { IsActive: true } })) ||
        (await tx.academic_Term.findFirst({ orderBy: { TermID: "desc" } }));
      const sessionYear = await resolveActiveAcademicYear(tx);

      if (!student) {
        const classIdToUse =
          Number(params.assignClassId || reqRecord.requestedClassId) ||
          (await tx.class.findFirst())?.ClassID ||
          1;
        const wofsStudentId = await generateNextWofsStudentId(tx, sessionYear);
        const fullDisplayName = [reqRecord.firstName, reqRecord.middleName, reqRecord.lastName]
          .filter(Boolean)
          .join(" ");

        student = await tx.student.create({
          data: {
            Uuid: crypto.randomUUID(),
            AdmissionNo: wofsStudentId,
            FirstName: reqRecord.firstName,
            LastName: reqRecord.lastName,
            MiddleName: reqRecord.middleName,
            PreferredName: fullDisplayName,
            Gender: reqRecord.gender || "Unspecified",
            ClassID: classIdToUse,
            DateOfBirth: reqRecord.dateOfBirth,
            ParentName: reqRecord.guardianName,
            ParentContact: reqRecord.guardianPhone || reqRecord.contactPhone || "08000000000",
            ParentEmail: reqRecord.contactEmail,
            GuardianVerified: true,
            RegistrationStatus: "CLAIMED",
            EnrolmentStatus: "ACTIVE",
            IdentityVerified: true,
            IdentityVerifiedAt: new Date(),
            IdentityVerifiedBy: actor.UserID,
          },
          include: { Class: true },
        });

        if (activeTerm) {
          await tx.enrollment.create({
            data: {
              StudentID: student.StudentID,
              ClassID: classIdToUse,
              TermID: activeTerm.TermID,
              AcademicYear: activeTerm.SessionName || `${sessionYear}/${sessionYear + 1}`,
              Status: "ACTIVE",
            },
          });
        }
      }

      // Check if contactEmail is already in use by another user
      const existingEmailUser = await tx.user.findFirst({
        where: {
          Email: {
            equals: reqRecord.contactEmail.trim().toLowerCase(),
            mode: "insensitive",
          },
        },
      });

      if (existingEmailUser) {
        throw new Error(
          `The email address ${reqRecord.contactEmail} is already linked to an existing portal account.`
        );
      }

      let activatedUser = null;
      if (reqRecord.passwordHash) {
        activatedUser = await tx.user.create({
          data: {
            Email: reqRecord.contactEmail.trim().toLowerCase(),
            PasswordHash: reqRecord.passwordHash,
            RoleID: studentRole.RoleID,
            IsActive: true,
          },
        });

        student = await tx.student.update({
          where: { StudentID: student.StudentID },
          data: {
            UserID: activatedUser.UserID,
            RegistrationStatus: "CLAIMED",
            IdentityVerified: true,
            IdentityVerifiedAt: new Date(),
            IdentityVerifiedBy: actor.UserID,
            ClaimCodeHash: null,
            ClaimCodeExpiresAt: null,
          },
          include: { Class: true },
        });
      }

      if (reqRecord.verificationPhotoData) {
        await tx.identityVerificationRecord.create({
          data: {
            studentId: student.StudentID,
            method: "IN_PERSON",
            captureDataUrl: reqRecord.verificationPhotoData,
            status: "VERIFIED",
            reviewedById: actor.UserID,
            reviewedAt: new Date(),
            notes: cleanReason,
          },
        });
      }

      await tx.studentVerificationRequest.update({
        where: { id: reqRecord.id },
        data: {
          studentId: student.StudentID,
          status: "APPROVED",
          reviewedById: actor.UserID,
          reviewedAt: new Date(),
          decisionReason: cleanReason,
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "MANUAL_VERIFICATION_APPROVED",
        entity: "StudentVerificationRequest",
        entityId: reqRecord.id,
        reason: cleanReason,
        newValue: {
          studentId: student.StudentID,
          wofsStudentId: student.AdmissionNo,
          email: reqRecord.contactEmail,
        },
      });

      return { student, activatedUser };
    });

    if (reqRecord.contactEmail && reqRecord.contactEmail.includes("@")) {
      await sendEmail({
        to: reqRecord.contactEmail,
        subject: `Portal Account Approved — ${outcome.student.AdmissionNo} (Word of Faith Schools)`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #86efac; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #14532D; margin-top: 0;">Student Portal Account Approved!</h2>
            <p>Hello <strong>${escapeHtml(reqRecord.firstName)} ${escapeHtml(reqRecord.lastName)}</strong>,</p>
            <p>Your manual registration verification request has been approved by the school administration.</p>
            <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 6px 0;"><strong>Permanent WOFS Student ID:</strong> <code style="font-size: 16px; font-weight: bold;">${escapeHtml(outcome.student.AdmissionNo)}</code></p>
              <p style="margin: 0 0 6px 0;"><strong>Login Email:</strong> ${escapeHtml(reqRecord.contactEmail)}</p>
              <p style="margin: 0;"><strong>Review Note:</strong> ${escapeHtml(cleanReason)}</p>
            </div>
            <p>You can now sign in at <strong>/portal/login</strong> using either your email address or your WOFS Student ID and the password you created.</p>
          </div>
        `,
      }).catch(() => {});
    }

    revalidatePath("/portal/admin/students");
    return {
      success: true,
      wofsStudentId: outcome.student.AdmissionNo,
      student: outcome.student,
    };
  } catch (error: any) {
    console.error("reviewManualVerificationRequest error:", error);
    return {
      success: false,
      error: error.message || "Failed to process manual verification decision.",
    };
  }
}

/**
 * Resolves a flagged DuplicateReviewCase (e.g., clearing legitimate twins/siblings or confirming duplicate).
 */
export async function resolveDuplicateReviewCase(params: {
  caseId: string;
  resolution: "CLEARED_TWIN_SIBLING" | "CLEARED_DISTINCT" | "CONFIRMED_DUPLICATE";
  resolutionNote: string;
}) {
  const actor = await requireRegistrationAdmin();
  const note = (params.resolutionNote || "").trim();

  if (!note) {
    return { success: false, error: "Please provide a resolution note for the audit log." };
  }

  try {
    const existing = await prisma.duplicateReviewCase.findUnique({
      where: { id: params.caseId },
    });
    if (!existing) {
      return { success: false, error: "Duplicate review case not found." };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.duplicateReviewCase.update({
        where: { id: params.caseId },
        data: {
          status: params.resolution,
          resolutionNote: note,
          resolvedById: actor.UserID,
          resolvedAt: new Date(),
        },
      });

      if (existing.candidateStudentId) {
        if (params.resolution === "CLEARED_TWIN_SIBLING" || params.resolution === "CLEARED_DISTINCT") {
          const cand = await tx.student.findUnique({
            where: { StudentID: existing.candidateStudentId },
          });
          if (cand) {
            await tx.student.update({
              where: { StudentID: cand.StudentID },
              data: {
                RegistrationStatus: cand.UserID ? "CLAIMED" : "UNCLAIMED",
                SiblingExceptionNote:
                  params.resolution === "CLEARED_TWIN_SIBLING" ? note : cand.SiblingExceptionNote,
              },
            });
          }
        } else if (params.resolution === "CONFIRMED_DUPLICATE") {
          await tx.student.update({
            where: { StudentID: existing.candidateStudentId },
            data: {
              RegistrationStatus: "SUSPENDED",
              EnrolmentStatus: "SUSPENDED",
            },
          });
        }
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: `DUPLICATE_CASE_${params.resolution}`,
        entity: "DuplicateReviewCase",
        entityId: params.caseId,
        reason: note,
        newValue: {
          primaryStudentId: existing.primaryStudentId,
          candidateStudentId: existing.candidateStudentId,
          resolution: params.resolution,
        },
      });

      return c;
    });

    revalidatePath("/portal/admin/students");
    return { success: true, duplicateCase: updated };
  } catch (error: any) {
    console.error("resolveDuplicateReviewCase error:", error);
    return { success: false, error: error.message || "Failed to resolve duplicate case." };
  }
}
