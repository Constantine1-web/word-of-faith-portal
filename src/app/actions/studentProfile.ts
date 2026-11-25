"use server";

import prisma from "@/lib/db";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import {
  requireActiveUser,
  checkStudentFeeClearance,
  requireStudentOwnershipOrAdmin,
} from "@/lib/authz";
import { SAFE_USER_SELECT } from "@/lib/security";
import { summarizeStudentAttendance } from "@/lib/attendance-summary";
import { getFeeScheduleForClass } from "@/lib/fee-schedule";
import { formatCbtSubjectLabel } from "@/lib/cbt-constants";
import { signStudentVerificationToken } from "@/lib/qr-verify";
import { APPROVED_PAYMENT_STATUSES } from "@/lib/payment-ledger";

export async function getStudentProfile(userId: number, targetStudentId?: number) {
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
    const cleanTargetId =
      targetStudentId && Number.isInteger(Number(targetStudentId)) && Number(targetStudentId) > 0
        ? Number(targetStudentId)
        : null;
    const cacheKey = cleanTargetId
      ? `profile:${userId}:ward:${cleanTargetId}`
      : `profile:${userId}`;
    const cachedProfile = await getCachedData<any>(cacheKey);

    if (cachedProfile && cachedProfile.success) {
      return cachedProfile as {
        success: true;
        wards: Array<{
          studentId: number;
          admissionNo: string;
          fullName: string;
          className: string;
        }>;
        student: {
          id: number;
          uuid: string | null;
          wofsStudentId: string;
          admissionNo: string;
          verificationSig: string;
          fullName: string;
          firstName: string | null;
          lastName: string | null;
          middleName: string | null;
          className: string;
          level: string;
          sessionName: string;
          email: string;
          preferredName: string | null;
          dob: Date | null;
          parentName: string | null;
          parentContact: string;
          avatarUrl: string | null;
          identityVerified: boolean;
          registrationStatus: string;
        };
        academics: any[];
        payments: any[];
        overview: {
          termLabel: string;
          attendance: {
            totalMarked: number;
            present: number;
            late: number;
            absent: number;
            excused: number;
            attendanceRatePct: number | null;
          };
          fees: {
            expectedNaira: number;
            paidNaira: number;
            balanceNaira: number;
            isCleared: boolean;
          };
          cbt: {
            completedAttempts: number;
            averageScorePct: number;
            bestScorePct: number;
            subjectTrends: Array<{
              subjectCode: string;
              subjectLabel: string;
              attempts: number;
              averageScorePct: number;
              bestScorePct: number;
            }>;
          };
        };
      };
    }

    // Collect all linked wards if actor is a parent/guardian
    const wardsList: Array<{
      studentId: number;
      admissionNo: string;
      fullName: string;
      className: string;
    }> = [];
    const seenWardIds = new Set<number>();

    let student = cleanTargetId
      ? null
      : await prisma.student.findUnique({
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

    if (actor.UserID === Number(userId)) {
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
            orderBy: { StudentID: "asc" },
          },
        },
      });
      if (parent) {
        for (const link of parent.Children) {
          if (link.Student && !seenWardIds.has(link.Student.StudentID)) {
            seenWardIds.add(link.Student.StudentID);
            wardsList.push({
              studentId: link.Student.StudentID,
              admissionNo: link.Student.AdmissionNo,
              fullName:
                link.Student.PreferredName ||
                `${link.Student.FirstName || ""} ${link.Student.LastName || ""}`.trim() ||
                link.Student.AdmissionNo,
              className: link.Student.Class?.ClassName || "Assigned Class",
            });
            if (cleanTargetId && link.Student.StudentID === cleanTargetId) {
              student = link.Student;
            } else if (!student && !cleanTargetId) {
              student = link.Student;
            }
          }
        }
      }
      if (actor.Email) {
        const byEmail = await prisma.student.findMany({
          where: {
            ParentEmail: { equals: actor.Email.trim(), mode: "insensitive" },
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
          orderBy: { StudentID: "asc" },
        });
        for (const st of byEmail) {
          if (!seenWardIds.has(st.StudentID)) {
            seenWardIds.add(st.StudentID);
            wardsList.push({
              studentId: st.StudentID,
              admissionNo: st.AdmissionNo,
              fullName:
                st.PreferredName ||
                `${st.FirstName || ""} ${st.LastName || ""}`.trim() ||
                st.AdmissionNo,
              className: st.Class?.ClassName || "Assigned Class",
            });
          }
          if (cleanTargetId && st.StudentID === cleanTargetId && !student) {
            student = st;
          } else if (!student && !cleanTargetId) {
            student = st;
          }
        }
      }
    }

    if (!student && cleanTargetId) {
      // Allow authorized admin or verified owner lookup
      const checked = await requireStudentOwnershipOrAdmin(cleanTargetId, { allowFinance: true });
      const fetched = await prisma.student.findUnique({
        where: { StudentID: checked.student.StudentID },
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
      student = fetched;
    }

    if (!student) {
      if (actor.UserID === Number(userId)) {
        const parentRow = await prisma.parent.findUnique({ where: { UserID: actor.UserID } });
        return {
          success: true as const,
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
      return { success: false as const, error: "Student profile not found" };
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
    const approvedSet = new Set<string>(APPROVED_PAYMENT_STATUSES);
    const paidNaira = payments
      .filter(
        (p) =>
          approvedSet.has(p.Status) &&
          (!activeTerm || p.TermID === activeTerm.TermID)
      )
      .reduce((acc, p) => {
        const naira = p.AmountKobo && Number(p.AmountKobo) > 0 ? Number(p.AmountKobo) / 100 : Number(p.AmountPaid) || 0;
        return acc + Math.max(0, naira);
      }, 0);
    const clearance = activeTerm
      ? await checkStudentFeeClearance(student.StudentID, activeTerm.TermID).catch(() => null)
      : null;
    const balanceNaira = clearance
      ? Number(clearance.balanceKobo) / 100
      : Math.max(0, expectedNaira - paidNaira);
    const isFeeCleared = clearance
      ? clearance.isCleared
      : expectedNaira > 0 && paidNaira >= expectedNaira;

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
      wards: wardsList,
      student: {
        id: student.StudentID,
        uuid: student.Uuid,
        wofsStudentId: student.AdmissionNo,
        admissionNo: student.AdmissionNo,
        verificationSig: signStudentVerificationToken(student.AdmissionNo),
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
          expectedNaira: clearance ? Number(clearance.totalBilledKobo) / 100 : expectedNaira,
          paidNaira: clearance ? Number(clearance.totalPaidKobo) / 100 : paidNaira,
          balanceNaira,
          isCleared: isFeeCleared,
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
  } catch (error: unknown) {
    console.error("Failed to get student profile", error);
    return { success: false as const, error: "Internal server error" };
  }
}

