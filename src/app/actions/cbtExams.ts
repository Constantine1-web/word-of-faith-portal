"use server";

import crypto from "crypto";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser, requireRole, writeAuditLog, can } from "@/lib/authz";
import { rateLimit, validateInput } from "@/lib/security";
import { mapSubjectNameToCbtCodes } from "@/lib/cbt-constants";
import { normalizeCbtSubjectCode } from "@/lib/cbt-csv";
import {
  evaluateExamWindow,
  getExamPostSubmitVisibility,
  hashExamPin,
  scaleCbtTenthsToComponent,
  seededShuffle,
  verifyExamPin,
} from "@/lib/cbt-exam-policy";
import { getLagosDayKey, submitAttempt } from "@/app/actions/cbt";

const EXAM_STAFF_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMIN",
  "TEACHER",
  "FORM_MASTER",
  "Admin",
  "Teacher",
] as const;

function isExamSupervisor(actor: { roles: Set<string>; capabilities?: Set<any> }): boolean {
  return (
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL") ||
    actor.roles.has("ADMIN") ||
    actor.roles.has("Admin") ||
    can(actor, "MANAGE_CBT")
  );
}

async function assertCanManageClassExam(
  actor: { UserID: number; roles: Set<string>; capabilities?: Set<any> },
  classId: number,
  subjectId?: number | null
) {
  if (isExamSupervisor(actor)) {
    return { isSupervisory: true };
  }

  const [assignment, cls] = await Promise.all([
    prisma.teacher_Subject_Map.findFirst({
      where: {
        TeacherID: actor.UserID,
        ClassID: classId,
        ...(subjectId ? { SubjectID: subjectId } : {}),
      },
    }),
    prisma.class.findUnique({
      where: { ClassID: classId },
      select: { FormMasterID: true },
    }),
  ]);

  if (!assignment && cls?.FormMasterID !== actor.UserID) {
    throw new Error("Forbidden: You are not assigned to teach or manage CBT exams for this class.");
  }

  return { isSupervisory: false };
}

export async function getTeacherExamStudioData() {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    const supervisor = isExamSupervisor(actor);

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });

    if (!activeTerm) {
      return { success: false, error: "No active academic term is configured." };
    }

    const allocations = await prisma.teacher_Subject_Map.findMany({
      where: supervisor ? {} : { TeacherID: actor.UserID },
      include: {
        Class: { select: { ClassID: true, ClassName: true, Level: true, Arm: true } },
        Subject: { select: { SubjectID: true, SubjectName: true, SubjectCode: true, ClassLevel: true } },
      },
      orderBy: [{ Class: { ClassName: "asc" } }, { Subject: { SubjectName: "asc" } }],
    });

    const allowedClassIds = Array.from(new Set(allocations.map((a) => a.ClassID)));

    const [scheduledExams, bankGroups] = await Promise.all([
      prisma.cbtScheduledExam.findMany({
        where: {
          termId: activeTerm.TermID,
          ...(supervisor
            ? {}
            : {
                OR: [
                  { createdById: actor.UserID },
                  ...(allowedClassIds.length > 0 ? [{ classId: { in: allowedClassIds } }] : []),
                ],
              }),
        },
        include: {
          classArm: { select: { ClassID: true, ClassName: true, Level: true } },
          subject: { select: { SubjectID: true, SubjectName: true, SubjectCode: true } },
          _count: { select: { questions: true, attempts: true } },
          attempts: {
            where: { isRetakeCleared: false },
            select: { status: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 80,
      }),
      prisma.cbtQuestion.groupBy({
        by: ["subjectCode", "bankScope"],
        where: {
          provider: "SCHOOL_INTERNAL",
          isActive: true,
          answerKey: { isNot: null },
        },
        _count: { id: true },
      }),
    ]);

    const bankSummaryMap: Record<string, { examOnlyCount: number; openBankCount: number }> = {};
    for (const row of bankGroups) {
      if (!bankSummaryMap[row.subjectCode]) {
        bankSummaryMap[row.subjectCode] = { examOnlyCount: 0, openBankCount: 0 };
      }
      if (row.bankScope === "EXAM_ONLY") {
        bankSummaryMap[row.subjectCode].examOnlyCount = row._count.id;
      } else {
        bankSummaryMap[row.subjectCode].openBankCount = row._count.id;
      }
    }

    return {
      success: true,
      activeTerm: {
        TermID: activeTerm.TermID,
        SessionName: activeTerm.SessionName,
        TermName: activeTerm.TermName,
      },
      isSupervisor: supervisor,
      allocations: allocations.map((a) => ({
        id: a.id,
        classId: a.ClassID,
        className: a.Class?.ClassName || "",
        classLevel: a.Class?.Level || "",
        subjectId: a.SubjectID,
        subjectName: a.Subject?.SubjectName || "",
        cbtCodes: mapSubjectNameToCbtCodes(a.Subject?.SubjectName || a.Subject?.SubjectCode),
      })),
      bankSummaryMap,
      scheduledExams: scheduledExams.map((ex) => ({
        id: ex.id,
        title: ex.title,
        subjectCode: ex.subjectCode,
        subjectId: ex.subjectId,
        subjectName: ex.subject?.SubjectName || ex.subjectCode.toUpperCase(),
        classId: ex.classId,
        className: ex.classArm?.ClassName || "",
        termId: ex.termId,
        examType: ex.examType,
        status: ex.status,
        strictMode: ex.strictMode,
        maxStrikes: ex.maxStrikes,
        questionCount: ex.questionCount,
        durationMinutes: ex.durationMinutes,
        startsAt: ex.startsAt ? ex.startsAt.toISOString() : null,
        endsAt: ex.endsAt ? ex.endsAt.toISOString() : null,
        requireAccessCode: ex.requireAccessCode,
        revealScoreAfterSubmit: ex.revealScoreAfterSubmit,
        answersReleased: ex.answersReleased,
        pinnedQuestionCount: ex._count.questions,
        totalAttempts: ex.attempts.length,
        activeCount: ex.attempts.filter((a) => a.status === "ACTIVE").length,
        submittedCount: ex.attempts.filter((a) => a.status === "SUBMITTED" || a.status === "EXPIRED").length,
        terminatedCount: ex.attempts.filter((a) => a.status === "TERMINATED").length,
        createdAt: ex.createdAt.toISOString(),
      })),
    };
  } catch (error: unknown) {
    console.error("getTeacherExamStudioData error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load Strict Exam studio data.",
    };
  }
}

const SaveScheduledExamSchema = z.object({
  id: z.string().trim().optional(),
  title: z.string().trim().min(3, "Exam title must be at least 3 characters.").max(120),
  classId: z.number().int().positive(),
  subjectId: z.number().int().positive().optional().nullable(),
  subjectCode: z.string().trim().min(2).max(48),
  examType: z.enum(["CA_TEST", "MIDTERM", "TERMINAL_EXAM"]).default("TERMINAL_EXAM"),
  strictMode: z.boolean().default(true),
  maxStrikes: z.number().int().min(1).max(3).default(2),
  questionCount: z.number().int().min(1).max(100),
  durationMinutes: z.number().int().min(5).max(180),
  startsAt: z.string().trim().optional().nullable(),
  endsAt: z.string().trim().optional().nullable(),
  accessCode: z.string().trim().max(24).optional().nullable(),
  clearAccessCode: z.boolean().optional().default(false),
  revealScoreAfterSubmit: z.boolean().default(false),
  answersReleased: z.boolean().default(false),
  status: z.enum(["DRAFT", "SCHEDULED", "LIVE", "CLOSED"]).default("DRAFT"),
  pinnedQuestionIds: z.array(z.string().trim()).max(150).optional(),
});

export async function saveScheduledExam(rawInput: z.infer<typeof SaveScheduledExamSchema>) {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    const data = validateInput(SaveScheduledExamSchema, rawInput);
    const subjectCode = normalizeCbtSubjectCode(data.subjectCode);
    if (!subjectCode) {
      return { success: false, error: "Invalid subject code." };
    }

    await assertCanManageClassExam(actor, data.classId, data.subjectId ?? null);

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });
    if (!activeTerm) {
      return { success: false, error: "No active academic term found." };
    }

    let startsAtDate: Date | null = null;
    let endsAtDate: Date | null = null;
    if (data.startsAt) {
      const d = new Date(data.startsAt);
      if (Number.isNaN(d.getTime())) return { success: false, error: "Invalid start date/time." };
      startsAtDate = d;
    }
    if (data.endsAt) {
      const d = new Date(data.endsAt);
      if (Number.isNaN(d.getTime())) return { success: false, error: "Invalid end date/time." };
      endsAtDate = d;
    }
    if (startsAtDate && endsAtDate && endsAtDate <= startsAtDate) {
      return { success: false, error: "Exam end time must be after start time." };
    }

    const existing = data.id
      ? await prisma.cbtScheduledExam.findUnique({
          where: { id: data.id },
          include: { questions: { select: { questionId: true } } },
        })
      : null;

    if (data.id && !existing) {
      return { success: false, error: "Scheduled exam not found." };
    }

    // Verify sufficient questions exist in EXAM_ONLY bank or pinned selection before SCHEDULED/LIVE
    if (data.status === "SCHEDULED" || data.status === "LIVE") {
      const targetPinned = data.pinnedQuestionIds ?? existing?.questions.map((q) => q.questionId) ?? [];
      if (targetPinned.length > 0) {
        if (targetPinned.length < data.questionCount) {
          return {
            success: false,
            error: `You pinned ${targetPinned.length} question(s), which is fewer than the configured ${data.questionCount} questions per student.`,
          };
        }
      } else {
        const availableExamOnlyCount = await prisma.cbtQuestion.count({
          where: {
            provider: "SCHOOL_INTERNAL",
            bankScope: "EXAM_ONLY",
            subjectCode,
            isActive: true,
            answerKey: { isNot: null },
          },
        });
        if (availableExamOnlyCount < data.questionCount) {
          return {
            success: false,
            error: `Only ${availableExamOnlyCount} active EXAM-ONLY question(s) exist for "${subjectCode}", but this exam requires ${data.questionCount}. Scan or author more questions into the Exam Question Bank first.`,
          };
        }
      }
    }

    let nextAccessHash = existing?.accessCodeHash ?? null;
    let nextRequireAccess = existing?.requireAccessCode ?? false;

    if (data.clearAccessCode) {
      nextAccessHash = null;
      nextRequireAccess = false;
    } else if (data.accessCode && data.accessCode.trim().length > 0) {
      nextAccessHash = hashExamPin(data.accessCode);
      nextRequireAccess = true;
    }

    const supervisor = isExamSupervisor(actor);

    const saved = await prisma.$transaction(async (tx) => {
      const examRecord = existing
        ? await tx.cbtScheduledExam.update({
            where: { id: existing.id },
            data: {
              title: data.title,
              subjectCode,
              subjectId: data.subjectId ?? null,
              classId: data.classId,
              examType: data.examType,
              status: data.status,
              strictMode: data.strictMode,
              maxStrikes: data.maxStrikes,
              questionCount: data.questionCount,
              durationMinutes: data.durationMinutes,
              startsAt: startsAtDate,
              endsAt: endsAtDate,
              accessCodeHash: nextAccessHash,
              requireAccessCode: nextRequireAccess,
              revealScoreAfterSubmit: data.revealScoreAfterSubmit,
              answersReleased: data.answersReleased,
              ...(supervisor && (data.status === "LIVE" || data.status === "SCHEDULED")
                ? { approvedById: actor.UserID, approvedAt: new Date() }
                : {}),
            },
          })
        : await tx.cbtScheduledExam.create({
            data: {
              title: data.title,
              subjectCode,
              subjectId: data.subjectId ?? null,
              classId: data.classId,
              termId: activeTerm.TermID,
              examType: data.examType,
              status: data.status,
              strictMode: data.strictMode,
              maxStrikes: data.maxStrikes,
              questionCount: data.questionCount,
              durationMinutes: data.durationMinutes,
              startsAt: startsAtDate,
              endsAt: endsAtDate,
              accessCodeHash: nextAccessHash,
              requireAccessCode: nextRequireAccess,
              revealScoreAfterSubmit: data.revealScoreAfterSubmit,
              answersReleased: data.answersReleased,
              createdById: actor.UserID,
              ...(supervisor && (data.status === "LIVE" || data.status === "SCHEDULED")
                ? { approvedById: actor.UserID, approvedAt: new Date() }
                : {}),
            },
          });

      if (data.pinnedQuestionIds) {
        await tx.cbtScheduledExamQuestion.deleteMany({
          where: { scheduledExamId: examRecord.id },
        });

        const validQs = await tx.cbtQuestion.findMany({
          where: {
            id: { in: data.pinnedQuestionIds },
            provider: "SCHOOL_INTERNAL",
            isActive: true,
            answerKey: { isNot: null },
          },
          select: { id: true },
        });
        const validSet = new Set(validQs.map((v) => v.id));
        const orderedIds = data.pinnedQuestionIds.filter((id) => validSet.has(id));

        for (let idx = 0; idx < orderedIds.length; idx++) {
          await tx.cbtScheduledExamQuestion.create({
            data: {
              scheduledExamId: examRecord.id,
              questionId: orderedIds[idx],
              sortOrder: idx + 1,
            },
          });
        }
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: existing ? "CBT_SCHEDULED_EXAM_UPDATED" : "CBT_SCHEDULED_EXAM_CREATED",
        entity: "CbtScheduledExam",
        entityId: examRecord.id,
        newValue: {
          title: examRecord.title,
          classId: examRecord.classId,
          subjectCode: examRecord.subjectCode,
          status: examRecord.status,
          strictMode: examRecord.strictMode,
          questionCount: examRecord.questionCount,
          durationMinutes: examRecord.durationMinutes,
        },
      });

      return examRecord;
    });

    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/cbt");
    return { success: true, examId: saved.id };
  } catch (error: unknown) {
    console.error("saveScheduledExam error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save scheduled CBT exam.",
    };
  }
}

export async function updateScheduledExamStatus(params: {
  examId: string;
  status?: "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED";
  answersReleased?: boolean;
  revealScoreAfterSubmit?: boolean;
}) {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    const exam = await prisma.cbtScheduledExam.findUnique({
      where: { id: params.examId },
      include: { _count: { select: { questions: true } } },
    });
    if (!exam) {
      return { success: false, error: "Scheduled exam not found." };
    }

    await assertCanManageClassExam(actor, exam.classId, exam.subjectId);

    if (params.status === "LIVE" || params.status === "SCHEDULED") {
      if (exam._count.questions > 0) {
        if (exam._count.questions < exam.questionCount) {
          return {
            success: false,
            error: `Exam has ${exam._count.questions} pinned question(s), below required ${exam.questionCount}.`,
          };
        }
      } else {
        const availableCount = await prisma.cbtQuestion.count({
          where: {
            provider: "SCHOOL_INTERNAL",
            bankScope: "EXAM_ONLY",
            subjectCode: exam.subjectCode,
            isActive: true,
            answerKey: { isNot: null },
          },
        });
        if (availableCount < exam.questionCount) {
          return {
            success: false,
            error: `Subject "${exam.subjectCode}" only has ${availableCount} active EXAM-ONLY question(s); ${exam.questionCount} required before going LIVE.`,
          };
        }
      }
    }

    const updated = await prisma.cbtScheduledExam.update({
      where: { id: exam.id },
      data: {
        ...(params.status ? { status: params.status } : {}),
        ...(typeof params.answersReleased === "boolean"
          ? { answersReleased: params.answersReleased }
          : {}),
        ...(typeof params.revealScoreAfterSubmit === "boolean"
          ? { revealScoreAfterSubmit: params.revealScoreAfterSubmit }
          : {}),
        ...(isExamSupervisor(actor) && (params.status === "LIVE" || params.status === "SCHEDULED")
          ? { approvedById: actor.UserID, approvedAt: new Date() }
          : {}),
      },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CBT_SCHEDULED_EXAM_STATUS_UPDATED",
      entity: "CbtScheduledExam",
      entityId: updated.id,
      oldValue: {
        status: exam.status,
        answersReleased: exam.answersReleased,
        revealScoreAfterSubmit: exam.revealScoreAfterSubmit,
      },
      newValue: {
        status: updated.status,
        answersReleased: updated.answersReleased,
        revealScoreAfterSubmit: updated.revealScoreAfterSubmit,
      },
    });

    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/cbt");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update scheduled exam.",
    };
  }
}

export async function getScheduledExamMonitorData(examId: string) {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    const exam = await prisma.cbtScheduledExam.findUnique({
      where: { id: examId },
      include: {
        classArm: { select: { ClassID: true, ClassName: true } },
        subject: { select: { SubjectID: true, SubjectName: true } },
      },
    });
    if (!exam) return { success: false, error: "Scheduled exam not found." };

    await assertCanManageClassExam(actor, exam.classId, exam.subjectId);

    const [students, attempts] = await Promise.all([
      prisma.student.findMany({
        where: { ClassID: exam.classId },
        select: {
          StudentID: true,
          AdmissionNo: true,
          FirstName: true,
          LastName: true,
          PreferredName: true,
        },
        orderBy: { AdmissionNo: "asc" },
      }),
      prisma.cbtAttempt.findMany({
        where: { scheduledExamId: exam.id, isRetakeCleared: false },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const attemptByStudent = new Map<number, typeof attempts[number]>();
    for (const att of attempts) {
      if (!attemptByStudent.has(att.studentId)) {
        attemptByStudent.set(att.studentId, att);
      }
    }

    const rows = students.map((st) => {
      const att = attemptByStudent.get(st.StudentID);
      return {
        studentId: st.StudentID,
        admissionNo: st.AdmissionNo,
        studentName:
          st.PreferredName || `${st.FirstName || ""} ${st.LastName || ""}`.trim() || st.AdmissionNo,
        attemptId: att?.id || null,
        status: att ? att.status : "NOT_STARTED",
        scorePct:
          att && typeof att.scoreTenths === "number"
            ? Number((att.scoreTenths / 10).toFixed(1))
            : null,
        hardStrikes: att?.hardStrikes || 0,
        terminationReason: att?.terminationReason || null,
        startedAt: att?.startedAt.toISOString() || null,
        submittedAt: att?.submittedAt?.toISOString() || null,
      };
    });

    return {
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        className: exam.classArm?.ClassName || "",
        subjectName: exam.subject?.SubjectName || exam.subjectCode.toUpperCase(),
        status: exam.status,
        maxStrikes: exam.maxStrikes,
        answersReleased: exam.answersReleased,
      },
      rows,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load exam monitor data.",
    };
  }
}

export async function grantExamAttemptRetake(params: { attemptId: string; reason: string }) {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    if (!params.reason || params.reason.trim().length < 5) {
      return { success: false, error: "Provide a clear written reason (min 5 chars) for audit trail." };
    }

    const attempt = await prisma.cbtAttempt.findUnique({
      where: { id: params.attemptId },
      include: { scheduledExam: true },
    });
    if (!attempt || attempt.mode !== "EXAM" || !attempt.scheduledExam) {
      return { success: false, error: "Strict exam attempt not found." };
    }

    await assertCanManageClassExam(
      actor,
      attempt.scheduledExam.classId,
      attempt.scheduledExam.subjectId
    );

    await prisma.$transaction(async (tx) => {
      await tx.cbtAttempt.update({
        where: { id: attempt.id },
        data: { isRetakeCleared: true },
      });

      await tx.cbtDayLock.updateMany({
        where: {
          studentId: attempt.studentId,
          dayKey: attempt.dayKey,
          liftedAt: null,
        },
        data: {
          liftedById: actor.UserID,
          liftedAt: new Date(),
          liftReason: `Retake Cleared: ${params.reason.trim()}`,
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CBT_EXAM_RETAKE_GRANTED",
        entity: "CbtAttempt",
        entityId: attempt.id,
        reason: params.reason.trim(),
        newValue: {
          studentId: attempt.studentId,
          scheduledExamId: attempt.scheduledExamId,
          previousStatus: attempt.status,
        },
      });
    });

    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/cbt");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to grant retake clearance.",
    };
  }
}

export async function previewStrictExamScoresForResultSync(params: {
  examId: string;
  maxWeight?: number;
}) {
  try {
    const actor = await requireRole(EXAM_STAFF_ROLES);
    const exam = await prisma.cbtScheduledExam.findUnique({
      where: { id: params.examId },
      include: {
        classArm: { select: { ClassID: true, ClassName: true } },
        subject: { select: { SubjectID: true, SubjectName: true } },
      },
    });
    if (!exam) return { success: false, error: "Scheduled exam not found." };

    await assertCanManageClassExam(actor, exam.classId, exam.subjectId);

    const defaultWeight = exam.examType === "TERMINAL_EXAM" ? 60 : 20;
    const weight = Math.min(60, Math.max(5, Math.round(Number(params.maxWeight) || defaultWeight)));

    const [students, attempts] = await Promise.all([
      prisma.student.findMany({
        where: { ClassID: exam.classId },
        include: exam.subjectId
          ? { Results: { where: { SubjectID: exam.subjectId, TermID: exam.termId } } }
          : undefined,
        orderBy: { AdmissionNo: "asc" },
      }),
      prisma.cbtAttempt.findMany({
        where: {
          scheduledExamId: exam.id,
          isRetakeCleared: false,
          status: { in: ["SUBMITTED", "EXPIRED"] },
          scoreTenths: { not: null },
        },
        orderBy: { submittedAt: "desc" },
      }),
    ]);

    const bestByStudent = new Map<number, number>();
    for (const att of attempts) {
      if (!bestByStudent.has(att.studentId)) {
        bestByStudent.set(att.studentId, att.scoreTenths ?? 0);
      }
    }

    const items = students.map((st) => {
      const scoreTenths = bestByStudent.get(st.StudentID);
      const hasAttempt = typeof scoreTenths === "number";
      const pct = hasAttempt ? Number((scoreTenths / 10).toFixed(1)) : null;
      const scaled = hasAttempt ? scaleCbtTenthsToComponent(scoreTenths, weight) : null;
      return {
        studentId: st.StudentID,
        admissionNo: st.AdmissionNo,
        studentName:
          st.PreferredName || `${st.FirstName || ""} ${st.LastName || ""}`.trim() || st.AdmissionNo,
        hasAttempt,
        scorePercent: pct,
        scaledScore: scaled,
        currentCaScore: (st as any).Results?.[0]?.CAScore ?? null,
        currentExamScore: (st as any).Results?.[0]?.ExamScore ?? null,
      };
    });

    return {
      success: true,
      examId: exam.id,
      title: exam.title,
      classId: exam.classId,
      subjectId: exam.subjectId,
      termId: exam.termId,
      examType: exam.examType,
      maxWeight: weight,
      matchedCount: items.filter((i) => i.hasAttempt).length,
      totalStudents: items.length,
      items,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to preview strict exam scores.",
    };
  }
}

export async function getAdminScheduledExamsDashboard() {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin"]);
    if (!isExamSupervisor(actor)) {
      return { success: false, error: "Forbidden", exams: [] };
    }

    const exams = await prisma.cbtScheduledExam.findMany({
      include: {
        classArm: { select: { ClassID: true, ClassName: true } },
        subject: { select: { SubjectID: true, SubjectName: true } },
        term: { select: { SessionName: true, TermName: true } },
        _count: { select: { questions: true } },
        attempts: {
          where: { isRetakeCleared: false },
          select: { status: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    return {
      success: true,
      exams: exams.map((ex) => ({
        id: ex.id,
        title: ex.title,
        className: ex.classArm?.ClassName || "",
        subjectName: ex.subject?.SubjectName || ex.subjectCode.toUpperCase(),
        subjectCode: ex.subjectCode,
        termLabel: `${ex.term?.SessionName || ""} · ${ex.term?.TermName || ""}`,
        examType: ex.examType,
        status: ex.status,
        strictMode: ex.strictMode,
        maxStrikes: ex.maxStrikes,
        questionCount: ex.questionCount,
        durationMinutes: ex.durationMinutes,
        requireAccessCode: ex.requireAccessCode,
        revealScoreAfterSubmit: ex.revealScoreAfterSubmit,
        answersReleased: ex.answersReleased,
        pinnedQuestionCount: ex._count.questions,
        activeCount: ex.attempts.filter((a) => a.status === "ACTIVE").length,
        submittedCount: ex.attempts.filter((a) => a.status === "SUBMITTED" || a.status === "EXPIRED").length,
        terminatedCount: ex.attempts.filter((a) => a.status === "TERMINATED").length,
      })),
    };
  } catch (error: unknown) {
    return {
      success: false,
      exams: [],
      error: error instanceof Error ? error.message : "Failed to load admin scheduled exams.",
    };
  }
}

/**
 * Student CBT Hall feed: lists scheduled & live official exams belonging to the signed-in student's class.
 */
export async function getStudentScheduledExams() {
  try {
    const actor = await requireActiveUser();
    const student = await prisma.student.findFirst({
      where: { UserID: actor.UserID },
      select: { StudentID: true, ClassID: true, AdmissionNo: true },
    });

    if (!student) {
      return { success: true, exams: [] };
    }

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });

    const exams = await prisma.cbtScheduledExam.findMany({
      where: {
        classId: student.ClassID,
        ...(activeTerm ? { termId: activeTerm.TermID } : {}),
        status: { in: ["SCHEDULED", "LIVE", "CLOSED"] },
      },
      include: {
        subject: { select: { SubjectName: true } },
        attempts: {
          where: { studentId: student.StudentID, isRetakeCleared: false },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ status: "asc" }, { startsAt: "asc" }, { createdAt: "desc" }],
    });

    return {
      success: true,
      exams: exams.map((ex) => {
        const myAtt = ex.attempts[0] || null;
        const vis = getExamPostSubmitVisibility("EXAM", ex);
        const win = evaluateExamWindow(ex);
        return {
          id: ex.id,
          title: ex.title,
          subjectCode: ex.subjectCode,
          subjectName: ex.subject?.SubjectName || ex.subjectCode.toUpperCase(),
          examType: ex.examType,
          status: ex.status,
          strictMode: ex.strictMode,
          maxStrikes: ex.maxStrikes,
          questionCount: ex.questionCount,
          durationMinutes: ex.durationMinutes,
          startsAt: ex.startsAt ? ex.startsAt.toISOString() : null,
          endsAt: ex.endsAt ? ex.endsAt.toISOString() : null,
          requireAccessCode: ex.requireAccessCode,
          windowEligible: win.eligible,
          windowReason: win.reason || null,
          myAttempt: myAtt
            ? {
                id: myAtt.id,
                status: myAtt.status,
                scorePct:
                  vis.canSeeScore && typeof myAtt.scoreTenths === "number"
                    ? Number((myAtt.scoreTenths / 10).toFixed(1))
                    : null,
                scoreWithheld: !vis.canSeeScore,
                answersReleased: vis.canSeeAnswersAndAi,
                hardStrikes: myAtt.hardStrikes,
              }
            : null,
        };
      }),
    };
  } catch (error: unknown) {
    return {
      success: false,
      exams: [],
      error: error instanceof Error ? error.message : "Failed to load official class exams.",
    };
  }
}

/**
 * Starts or resumes an official scheduled Strict Exam for the authenticated student.
 * Questions come exclusively from pinned exam questions or the subject's confidential EXAM_ONLY bank.
 */
export async function startStrictExamAttempt(params: {
  scheduledExamId: string;
  accessCode?: string;
}) {
  try {
    const actor = await requireActiveUser();
    const student = await prisma.student.findFirst({
      where: { UserID: actor.UserID },
      include: { Class: true },
    });
    if (!student) {
      return { success: false, error: "Official CBT exams are restricted to enrolled students." };
    }

    const rl = await rateLimit(`cbt_strict_exam:${actor.UserID}`, 10, 60);
    if (!rl.success) {
      return { success: false, error: "Too many exam launch requests. Wait 60 seconds and retry." };
    }

    const dayKey = await getLagosDayKey();
    const activeLock = await prisma.cbtDayLock.findUnique({
      where: { studentId_dayKey: { studentId: student.StudentID, dayKey } },
    });
    if (activeLock && !activeLock.liftedAt) {
      return {
        success: false,
        dayLocked: true,
        error: `CBT access is locked for today (${dayKey}): ${activeLock.reason}. See your Invigilator or Principal to lift this lock.`,
      };
    }

    const exam = await prisma.cbtScheduledExam.findUnique({
      where: { id: params.scheduledExamId },
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          include: {
            question: {
              include: { answerKey: true },
            },
          },
        },
      },
    });

    if (!exam) {
      return { success: false, error: "Official exam record not found." };
    }

    if (exam.classId !== student.ClassID) {
      return {
        success: false,
        error: "Forbidden: This examination is scheduled for a different class arm.",
      };
    }

    const windowCheck = evaluateExamWindow(exam);
    if (!windowCheck.eligible) {
      return {
        success: false,
        error: windowCheck.reason || "This examination is not currently open.",
      };
    }

    if (exam.requireAccessCode && !verifyExamPin(params.accessCode, exam.accessCodeHash)) {
      return {
        success: false,
        error: "Invalid exam passcode / invigilator PIN. Ask your exam supervisor for today's code.",
      };
    }

    // Check existing non-cleared attempt for this scheduled exam
    const existingExamAttempt = await prisma.cbtAttempt.findFirst({
      where: {
        studentId: student.StudentID,
        scheduledExamId: exam.id,
        isRetakeCleared: false,
      },
      orderBy: { startedAt: "desc" },
    });

    if (existingExamAttempt) {
      if (existingExamAttempt.status === "ACTIVE") {
        if (new Date() <= new Date(existingExamAttempt.expiresAt.getTime() + 5000)) {
          return {
            success: true,
            attemptId: existingExamAttempt.id,
            sessionToken: existingExamAttempt.sessionId,
            resumed: true,
          };
        }
        await submitAttempt(existingExamAttempt.id);
      }
      return {
        success: false,
        error:
          "You already have a recorded attempt for this official exam. Request Examiner retake clearance if you experienced a technical interruption.",
      };
    }

    // Auto-submit any unrelated open practice/mock attempt before launching the official exam
    const strayActive = await prisma.cbtAttempt.findMany({
      where: { studentId: student.StudentID, status: "ACTIVE" },
      select: { id: true },
    });
    for (const s of strayActive) {
      await submitAttempt(s.id);
    }

    // Build question pool strictly from DB (pinned questions first, else EXAM_ONLY subject bank)
    let candidateIds: string[] = [];
    if (exam.questions.length > 0) {
      candidateIds = exam.questions
        .filter((pq) => pq.question.isActive && pq.question.answerKey !== null)
        .map((pq) => pq.questionId);
    } else {
      const bankRows = await prisma.cbtQuestion.findMany({
        where: {
          provider: "SCHOOL_INTERNAL",
          bankScope: "EXAM_ONLY",
          subjectCode: exam.subjectCode,
          isActive: true,
          answerKey: { isNot: null },
        },
        select: { id: true },
        orderBy: { fetchedAt: "desc" },
        take: 250,
      });
      candidateIds = bankRows.map((r) => r.id);
    }

    if (candidateIds.length === 0) {
      return {
        success: false,
        error: "No active exam questions are ready for this paper yet. Contact your Examiner.",
      };
    }

    const seed = crypto.randomUUID();
    const countToServe = Math.min(exam.questionCount, candidateIds.length);
    const chosenIds = seededShuffle(candidateIds, seed).slice(0, countToServe);
    const durationSec = Math.max(60, exam.durationMinutes * 60);
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationSec * 1000);
    const activeTabToken = `tab:${crypto.randomUUID()}`;

    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.cbtAttempt.create({
        data: {
          studentId: student.StudentID,
          subjectCode: exam.subjectCode,
          examBody: "SCHOOL_INTERNAL",
          mode: "EXAM",
          status: "ACTIVE",
          seed,
          questionCount: chosenIds.length,
          durationSec,
          startedAt,
          expiresAt,
          dayKey,
          hardStrikes: 0,
          sessionId: activeTabToken,
          scheduledExamId: exam.id,
        },
      });

      for (let idx = 0; idx < chosenIds.length; idx++) {
        const optionKeys = seededShuffle(["a", "b", "c", "d"], `${seed}:${idx}`);
        await tx.cbtAttemptQuestion.create({
          data: {
            attemptId: created.id,
            questionId: chosenIds[idx],
            position: idx + 1,
            optionOrder: optionKeys,
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "CBT_STRICT_EXAM_STARTED",
        entity: "CbtAttempt",
        entityId: created.id,
        newValue: {
          studentId: student.StudentID,
          scheduledExamId: exam.id,
          examTitle: exam.title,
          questionCount: chosenIds.length,
          durationMinutes: exam.durationMinutes,
        },
      });

      return created;
    });

    return {
      success: true,
      attemptId: attempt.id,
      sessionToken: attempt.sessionId,
      resumed: false,
    };
  } catch (error: unknown) {
    console.error("startStrictExamAttempt error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start scheduled examination.",
    };
  }
}
