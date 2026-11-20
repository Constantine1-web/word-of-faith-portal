"use server";

import prisma from "@/lib/db";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import {
  requireActiveUser,
  requireStudentOwnershipOrAdmin,
  writeAuditLog,
} from "@/lib/authz";
import { SAFE_USER_SELECT } from "@/lib/security";
import { summarizeStudentAttendance } from "@/lib/attendance-summary";
import { getFeeScheduleForClass } from "@/lib/fee-schedule";
import { formatCbtSubjectLabel } from "@/lib/cbt-constants";

export async function getStudentProfile(userId: number) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const isAdmin =
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL") ||
    actor.roles.has("ADMISSIONS") ||
    actor.roles.has("BURSAR") ||
    actor.roles.has("Admin") ||
    actor.capabilities.has("MANAGE_STUDENTS");

  if (actor.UserID !== Number(userId) && !isAdmin) {
    return { success: false, error: "Forbidden. You cannot view another student's profile." };
  }

  try {
    const cacheKey = `profile:${userId}`;
    const cachedProfile = await getCachedData<any>(cacheKey);

    if (cachedProfile) {
      return cachedProfile;
    }

    let student = await prisma.student.findUnique({
      where: { UserID: Number(userId) },
      include: {
        User: { select: SAFE_USER_SELECT },
        Class: {
          include: {
            TeacherMaps: {
              include: {
                Subject: true,
                Teacher: { select: SAFE_USER_SELECT },
              },
            },
          },
        },
        PaymentRecords: {
          include: { Term: true },
          orderBy: { PaymentDate: "desc" },
        },
      },
    });

    if (!student && actor.UserID === Number(userId)) {
      const parent = await prisma.parent.findUnique({
        where: { UserID: actor.UserID },
        include: {
          Children: {
            include: {
              Student: {
                include: {
                  User: { select: SAFE_USER_SELECT },
                  Class: {
                    include: {
                      TeacherMaps: {
                        include: {
                          Subject: true,
                          Teacher: { select: SAFE_USER_SELECT },
                        },
                      },
                    },
                  },
                  PaymentRecords: {
                    include: { Term: true },
                    orderBy: { PaymentDate: "desc" },
                  },
                },
              },
            },
          },
        },
      });
      if (parent && parent.Children.length > 0) {
        student = parent.Children[0].Student as any;
      } else if (actor.Email) {
        student = await prisma.student.findFirst({
          where: {
            ParentEmail: {
              equals: actor.Email.trim(),
              mode: "insensitive",
            },
          },
          include: {
            User: { select: SAFE_USER_SELECT },
            Class: {
              include: {
                TeacherMaps: {
                  include: {
                    Subject: true,
                    Teacher: { select: SAFE_USER_SELECT },
                  },
                },
              },
            },
            PaymentRecords: {
              include: { Term: true },
              orderBy: { PaymentDate: "desc" },
            },
          },
        });
      }
    }

    if (!student) {
      if (actor.UserID === Number(userId)) {
        const parentRow = await prisma.parent.findUnique({ where: { UserID: actor.UserID } });
        return {
          success: true,
          student: {
            id: actor.UserID,
            admissionNo: `STAFF-${String(actor.UserID).padStart(4, "0")}`,
            fullName: actor.Email.split("@")[0],
            className: Array.from(actor.roles).join(" · "),
            level: "Staff",
            email: actor.Email,
            preferredName: actor.Email.split("@")[0],
            dob: null,
            parentContact: parentRow?.Phone || "",
            avatarUrl: null,
          },
          academics: [],
          payments: [],
        };
      }
      return { success: false, error: "Student profile not found" };
    }

    const academics = student.Class.TeacherMaps;
    const payments = student.PaymentRecords;

    const safeAcademics = academics.map((a) => ({
      subject: a.Subject.SubjectName,
      teacher: a.Teacher.Email,
      SubjectName: a.Subject.SubjectName,
      TeacherName: a.Teacher.Email,
    }));

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      select: { TermID: true, SessionName: true, TermName: true },
    });

    const [attendanceRows, submittedAttempts, classFeeSchedule] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          StudentID: student.StudentID,
          ...(activeTerm ? { TermID: activeTerm.TermID } : {}),
        },
        select: { Status: true },
      }),
      prisma.cbtAttempt.findMany({
        where: {
          studentId: student.StudentID,
          status: "SUBMITTED",
          scoreTenths: { not: null },
        },
        select: {
          subjectCode: true,
          scoreTenths: true,
          submittedAt: true,
        },
        orderBy: { submittedAt: "desc" },
        take: 60,
      }),
      getFeeScheduleForClass(student.Class.ClassName, student.Class.Level).catch(() => null),
    ]);

    const attendanceSummary = summarizeStudentAttendance(attendanceRows);

    const expectedNaira = classFeeSchedule ? Number(classFeeSchedule.totalNaira || 0) : 0;
    const paidNaira = payments
      .filter(
        (p) =>
          (p.Status === "Approved" || p.Status === "Successful") &&
          (!activeTerm || p.TermID === activeTerm.TermID)
      )
      .reduce((acc, p) => acc + Math.max(0, Number(p.AmountPaid) || 0), 0);
    const balanceNaira = student.HasPaidFees ? 0 : Math.max(0, expectedNaira - paidNaira);

    const scoresPct = submittedAttempts.map((a) =>
      Number(((a.scoreTenths || 0) / 10).toFixed(1))
    );
    const completedAttempts = scoresPct.length;
    const averageScorePct =
      completedAttempts > 0
        ? Number((scoresPct.reduce((sum, v) => sum + v, 0) / completedAttempts).toFixed(1))
        : 0;
    const bestScorePct = completedAttempts > 0 ? Math.max(...scoresPct) : 0;

    const bySubj = new Map<
      string,
      { subjectCode: string; scores: number[] }
    >();
    for (const att of submittedAttempts) {
      const score = Number(((att.scoreTenths || 0) / 10).toFixed(1));
      const existing = bySubj.get(att.subjectCode);
      if (existing) existing.scores.push(score);
      else bySubj.set(att.subjectCode, { subjectCode: att.subjectCode, scores: [score] });
    }
    const subjectTrends = Array.from(bySubj.values())
      .map((entry) => ({
        subjectCode: entry.subjectCode,
        subjectLabel: formatCbtSubjectLabel(entry.subjectCode),
        attempts: entry.scores.length,
        averageScorePct: Number(
          (entry.scores.reduce((s, v) => s + v, 0) / entry.scores.length).toFixed(1)
        ),
        bestScorePct: Math.max(...entry.scores),
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 6);

    const fullName =
      student.PreferredName ||
      `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
      student.AdmissionNo;

    const finalResponse = {
      success: true,
      student: {
        id: student.StudentID,
        uuid: student.Uuid,
        wofsStudentId: student.AdmissionNo,
        admissionNo: student.AdmissionNo,
        fullName,
        firstName: student.FirstName,
        lastName: student.LastName,
        middleName: student.MiddleName,
        className: student.Class.ClassName,
        level: student.Class.Level,
        sessionName: activeTerm?.SessionName || "2026/2027",
        email: student.User?.Email || actor.Email,
        preferredName: student.PreferredName,
        dob: student.DateOfBirth,
        parentName: student.ParentName,
        parentContact: student.ParentContact,
        avatarUrl: student.AvatarUrl || null,
        identityVerified: student.IdentityVerified,
        registrationStatus: student.RegistrationStatus || "CLAIMED",
      },
      academics: safeAcademics,
      payments: payments.map((p) => ({
        id: p.PaymentID,
        uuid: p.Uuid,
        reference: p.Reference || `WOF-REC-${String(p.PaymentID).padStart(6, "0")}`,
        channel: p.Channel || "BANK_TELLER",
        term: p.Term.TermName,
        session: p.Term.SessionName,
        amount: p.AmountPaid,
        description: p.Description,
        status: p.Status,
        date: p.PaymentDate,
        reviewedAt: p.ReviewedAt,
      })),
      overview: {
        termLabel: activeTerm
          ? `${activeTerm.SessionName} · ${activeTerm.TermName}`
          : "Current Academic Session",
        attendance: attendanceSummary,
        fees: {
          expectedNaira,
          paidNaira,
          balanceNaira,
          isCleared: student.HasPaidFees || (expectedNaira > 0 && balanceNaira <= 0),
        },
        cbt: {
          completedAttempts,
          averageScorePct,
          bestScorePct,
          subjectTrends,
        },
      },
    };

    await setCachedData(cacheKey, finalResponse, 300);

    return finalResponse;
  } catch (error: any) {
    console.error("Failed to get student profile", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function uploadPaymentReceipt(
  studentId: number,
  termId: number,
  description: string,
  amount: number
) {
  let actor;
  let student;
  try {
    const res = await requireStudentOwnershipOrAdmin(Number(studentId), { allowFinance: true });
    actor = res.actor;
    student = res.student;
  } catch (err: any) {
    return { success: false, error: err?.message || "FORBIDDEN: You cannot submit a receipt for this student." };
  }

  const rateLimitResult = await rateLimit(`uploadReceipt:${actor.UserID}`, 3, 60);
  if (!rateLimitResult.success) {
    return { success: false, error: "Upload rate limit exceeded. Please wait a minute." };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 10_000_000) {
    return { success: false, error: "Invalid payment amount." };
  }

  const cleanDesc = String(description || "School Fees").trim().slice(0, 200);

  try {
    const record = await prisma.payment_Record.create({
      data: {
        StudentID: student.StudentID,
        TermID: Number(termId),
        Description: cleanDesc,
        AmountPaid: numericAmount,
        AmountKobo: BigInt(Math.round(numericAmount * 100)),
        ReceiptUrl: "/uploads/teller-receipt.pdf",
        Status: "Pending",
        SubmittedBy: actor.UserID,
      },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "PAYMENT_RECEIPT_SUBMITTED",
      entity: "Payment_Record",
      entityId: record.PaymentID,
      newValue: {
        studentId: student.StudentID,
        termId: Number(termId),
        amount: numericAmount,
      },
    });

    if (student.UserID) {
      await invalidateCache(`profile:${student.UserID}`);
    }

    return {
      success: true,
      message: "Receipt uploaded successfully and is pending admin verification.",
    };
  } catch (error: any) {
    console.error("Failed to upload receipt", error);
    return { success: false, error: "Internal server error" };
  }
}

