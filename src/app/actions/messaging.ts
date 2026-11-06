"use server";

import prisma from "@/lib/db";
import { sendDirectStudentCommunication } from "@/lib/email";
import {
  requireActiveUser,
  requireRole,
  requireClassTeacherOrAdmin,
  writeAuditLog,
} from "@/lib/authz";
import { rateLimit } from "@/lib/security";

const STAFF_MESSAGING_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "EXAM_OFFICER",
  "FORM_MASTER",
  "TEACHER",
  "Admin",
  "Teacher",
];

function isSchoolAdminOrSupervisor(actor: Awaited<ReturnType<typeof requireActiveUser>>): boolean {
  return (
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL") ||
    actor.roles.has("ADMISSIONS") ||
    actor.roles.has("BURSAR") ||
    actor.roles.has("EXAM_OFFICER") ||
    actor.roles.has("Admin") ||
    actor.capabilities.has("MANAGE_STUDENTS")
  );
}

export async function sendMessage(receiverId: number, content: string) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const rl = await rateLimit(`msg:internal:${actor.UserID}`, 30, 60);
  if (!rl.success) {
    return { success: false, error: "Too many messages sent. Please wait a moment." };
  }

  const senderId = actor.UserID;
  const cleanContent = (content || "").trim().slice(0, 2000);
  if (!cleanContent) return { success: false, error: "Message content cannot be empty" };

  const targetReceiverId = Number(receiverId);
  if (!Number.isInteger(targetReceiverId) || targetReceiverId <= 0) {
    return { success: false, error: "Invalid recipient." };
  }

  try {
    const message = await prisma.message.create({
      data: {
        SenderID: senderId,
        ReceiverID: targetReceiverId,
        Content: cleanContent,
      },
    });
    return { success: true, message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function getConversation(otherUserId: number) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserId = actor.UserID;
  const targetId = Number(otherUserId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { success: false, error: "Invalid user ID" };
  }

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { SenderID: currentUserId, ReceiverID: targetId },
          { SenderID: targetId, ReceiverID: currentUserId },
        ],
      },
      orderBy: { CreatedAt: "asc" },
    });

    // Mark received messages as read
    await prisma.message.updateMany({
      where: {
        ReceiverID: currentUserId,
        SenderID: targetId,
        IsRead: false,
      },
      data: { IsRead: true },
    });

    return { success: true, messages };
  } catch (error) {
    console.error("Failed to fetch conversation:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function getMessageContacts() {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserId = actor.UserID;
  const isStaff = STAFF_MESSAGING_ROLES.some((r) => actor.roles.has(r));

  try {
    // Non-staff (Students/Parents) can only see active Staff/Admin contacts and never other students' PII
    const whereClause: any = isStaff
      ? { UserID: { not: currentUserId }, IsActive: true }
      : {
          UserID: { not: currentUserId },
          IsActive: true,
          Role: { RoleName: { in: ["Admin", "Teacher", "SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS"] } },
        };

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        UserID: true,
        Email: true,
        Role: {
          select: { RoleName: true },
        },
        Student: isStaff
          ? {
              select: {
                StudentID: true,
                AdmissionNo: true,
                PreferredName: true,
                FirstName: true,
                LastName: true,
                ParentContact: true,
                ParentEmail: true,
                Class: {
                  select: { ClassName: true },
                },
              },
            }
          : false,
      },
      take: 100,
    });

    return { success: true, contacts: users };
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return { success: false, error: "Internal server error" };
  }
}

/**
 * Resolves a student record by their portal registration email (User.Email),
 * ParentEmail, or AdmissionNo so authorized staff can message them via Email, WhatsApp, or SMS.
 */
export async function lookupStudentByEmail(query: string) {
  let actor;
  try {
    actor = await requireRole(STAFF_MESSAGING_ROLES);
  } catch (err: any) {
    return { success: false, error: err?.message || "FORBIDDEN: Staff authorization required." };
  }

  const clean = (query || "").trim().slice(0, 160);
  if (!clean) return { success: false, error: "Please enter a student email or registration number." };

  try {
    const student = await prisma.student.findFirst({
      where: {
        OR: [
          { User: { Email: { equals: clean, mode: "insensitive" } } },
          { ParentEmail: { equals: clean, mode: "insensitive" } },
          { AdmissionNo: { equals: clean, mode: "insensitive" } },
        ],
      },
      include: {
        User: {
          select: { UserID: true, Email: true, IsActive: true },
        },
        Class: {
          select: { ClassID: true, ClassName: true },
        },
      },
    });

    if (!student) {
      return {
        success: false,
        error: `No student found matching email or admission number "${clean}".`,
      };
    }

    // If caller is a Teacher/FormMaster without school-wide admin rights, enforce class assignment
    if (!isSchoolAdminOrSupervisor(actor)) {
      await requireClassTeacherOrAdmin(student.ClassID);
    }

    const registrationEmail = student.User?.Email || student.ParentEmail || "";
    const studentPhone = student.ParentContact || "";
    const studentName =
      student.PreferredName ||
      `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
      student.AdmissionNo;

    return {
      success: true,
      student: {
        studentId: student.StudentID,
        userId: student.User?.UserID || null,
        admissionNo: student.AdmissionNo,
        studentName,
        className: student.Class?.ClassName || "General",
        registrationEmail,
        studentPhone,
      },
    };
  } catch (err: any) {
    console.error("lookupStudentByEmail error:", err);
    return { success: false, error: err?.message || "Failed to look up student." };
  }
}

/**
 * Sends a direct message to a student using their registered student email address as the lookup key:
 * - Direct Email is dispatched to the email address used at portal registration (User.Email / ParentEmail).
 * - Direct WhatsApp & SMS are dispatched to the student's phone number (ParentContact).
 */
export async function sendDirectStudentMessage(params: {
  studentIdentifier: string | number;
  subject?: string;
  message: string;
  channels: ("EMAIL" | "WHATSAPP" | "SMS")[];
  phoneOverride?: string;
}) {
  let actor;
  try {
    actor = await requireRole(STAFF_MESSAGING_ROLES);
  } catch (err: any) {
    return { success: false, error: err?.message || "FORBIDDEN: Only authorized staff can dispatch direct student communications." };
  }

  const rl = await rateLimit(`msg:direct:${actor.UserID}`, 20, 300);
  if (!rl.success) {
    return { success: false, error: "Rate limit exceeded for direct messaging. Please wait a few minutes." };
  }

  const senderId = actor.UserID;
  const cleanMsg = (params.message || "").trim().slice(0, 2000);
  const cleanSubject = (params.subject || "Official Notice from Word of Faith Schools").trim().slice(0, 180);

  if (!cleanMsg) {
    return { success: false, error: "Message content cannot be empty." };
  }

  const validChannels = (Array.isArray(params.channels) ? params.channels : []).filter(
    (c): c is "EMAIL" | "WHATSAPP" | "SMS" => c === "EMAIL" || c === "WHATSAPP" || c === "SMS"
  );

  try {
    const idStr = String(params.studentIdentifier).trim().slice(0, 160);
    const numericId = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null;

    let student = await prisma.student.findFirst({
      where: numericId
        ? { OR: [{ StudentID: numericId }, { UserID: numericId }] }
        : {
            OR: [
              { User: { Email: { equals: idStr, mode: "insensitive" } } },
              { ParentEmail: { equals: idStr, mode: "insensitive" } },
              { AdmissionNo: { equals: idStr, mode: "insensitive" } },
            ],
          },
      include: {
        User: {
          select: { UserID: true, Email: true },
        },
        Class: {
          select: { ClassID: true, ClassName: true },
        },
      },
    });

    if (!student) {
      return {
        success: false,
        error: `Could not find a student matching "${idStr}". Verify the student's registration email or admission number.`,
      };
    }

    // Enforce class assignment for teachers who do not hold school-wide admin roles
    if (!isSchoolAdminOrSupervisor(actor)) {
      await requireClassTeacherOrAdmin(student.ClassID);
    }

    let studentPhone = (params.phoneOverride || student.ParentContact || "").trim();
    if (studentPhone && !/^\+?[0-9\s\-]{7,20}$/.test(studentPhone)) {
      return { success: false, error: "Invalid phone number format." };
    }

    // Only persist phoneOverride to database if the actor has MANAGE_STUDENTS / Admin privilege
    const canModifyStudentRecord =
      actor.capabilities.has("MANAGE_STUDENTS") ||
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("ADMISSIONS") ||
      actor.roles.has("Admin");

    if (
      canModifyStudentRecord &&
      params.phoneOverride &&
      params.phoneOverride.trim() &&
      params.phoneOverride.trim() !== student.ParentContact
    ) {
      student = await prisma.student.update({
        where: { StudentID: student.StudentID },
        data: { ParentContact: params.phoneOverride.trim().slice(0, 30) },
        include: {
          User: { select: { UserID: true, Email: true } },
          Class: { select: { ClassID: true, ClassName: true } },
        },
      });
      studentPhone = student.ParentContact;
    }

    const registrationEmail = (student.User?.Email || student.ParentEmail || "").trim().toLowerCase();
    const studentName =
      student.PreferredName ||
      `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
      student.AdmissionNo;

    const dispatch = await sendDirectStudentCommunication({
      studentName,
      admissionNo: student.AdmissionNo,
      className: student.Class?.ClassName,
      registrationEmail,
      studentPhone,
      subject: cleanSubject,
      message: cleanMsg,
      senderName: actor.Email || "School Administration",
      channels: validChannels.length > 0 ? validChannels : ["EMAIL", "WHATSAPP", "SMS"],
    });

    // Also record in internal portal messages if student has a claimed User account
    if (student.User?.UserID && student.User.UserID !== senderId) {
      await prisma.message
        .create({
          data: {
            SenderID: senderId,
            ReceiverID: student.User.UserID,
            Content: `[${cleanSubject}] ${cleanMsg}`,
          },
        })
        .catch(() => {});
    }

    await writeAuditLog({
      actorId: senderId,
      actorRoles: Array.from(actor.roles).join(","),
      action: "STUDENT_DIRECT_COMMUNICATION",
      entity: "Student",
      entityId: student.StudentID,
      newValue: {
        admissionNo: student.AdmissionNo,
        registrationEmail,
        studentPhone,
        channels: validChannels,
        emailSent: dispatch.emailSent,
        whatsappApiDispatched: dispatch.whatsappApiDispatched,
        smsApiDispatched: dispatch.smsApiDispatched,
      },
    });

    return {
      success: true,
      studentName,
      admissionNo: student.AdmissionNo,
      registrationEmail,
      studentPhone,
      emailSent: dispatch.emailSent,
      whatsappApiDispatched: dispatch.whatsappApiDispatched,
      smsApiDispatched: dispatch.smsApiDispatched,
      whatsappUrl: dispatch.whatsappUrl,
      smsUrl: dispatch.smsUrl,
    };
  } catch (err: any) {
    console.error("sendDirectStudentMessage error:", err);
    return {
      success: false,
      error: err?.message || "Failed to dispatch direct student communication.",
    };
  }
}


