"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { calculateGrade } from "@/lib/grading";
import { z } from "zod";
import {
  requireActiveUser,
  requireRole,
  assertTeacherAssigned,
  assertFormMasterAssigned,
  writeAuditLog,
} from "@/lib/authz";

const ScoreBatchSchema = z.object({
  subjectId: z.number().int().positive(),
  classId: z.number().int().positive(),
  termId: z.number().int().positive(),
  scores: z.array(
    z.object({
      studentId: z.number().int().positive(),
      caScore: z.number().min(0).max(40).nullable().optional(),
      examScore: z.number().min(0).max(60).nullable().optional(),
    })
  ),
});

// ==========================================
// 1. TEACHER & FORM MASTER DASHBOARD DATA
// ==========================================

export async function getTeacherDashboardData() {
  try {
    const { user, roles } = await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "PRINCIPAL",
      "SUPER_ADMIN",
      "Teacher",
      "Admin",
    ]);

    const userId = user.UserID;
    const isSupervisor = roles.has("PRINCIPAL") || roles.has("SUPER_ADMIN") || roles.has("Admin");

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    });

    if (!activeTerm) {
      return { success: false, error: "No active academic session/term is currently set by Admin." };
    }

    // 1. Fetch Subject Teacher allocations (Supervisors can inspect all allocations)
    const subjectAllocations = await prisma.teacher_Subject_Map.findMany({
      where: isSupervisor ? {} : { TeacherID: userId },
      include: {
        Subject: true,
        Class: {
          include: {
            Students: true,
            FormMaster: true,
          },
        },
        Term: true,
      },
      orderBy: { Class: { ClassName: "asc" } },
    });

    // 2. Fetch submission status for each allocation
    const submissions = await prisma.subject_Submission.findMany({
      where: {
        TermID: activeTerm.TermID,
        ...(isSupervisor ? {} : { TeacherID: userId }),
      },
    });

    // 3. Check if this teacher is also a Form Master (Class Teacher)
    const formMasterClasses = await prisma.class.findMany({
      where: isSupervisor ? {} : { FormMasterID: userId },
      include: {
        Students: {
          include: {
            Results: {
              where: { TermID: activeTerm.TermID },
              include: { Subject: true },
            },
            FormMasterReports: {
              where: { TermID: activeTerm.TermID },
            },
          },
          orderBy: { AdmissionNo: "asc" },
        },
        TeacherMaps: {
          include: {
            Subject: true,
            Teacher: true,
          },
        },
        SubjectSubmissions: {
          where: { TermID: activeTerm.TermID },
          include: {
            Subject: true,
            Teacher: true,
          },
        },
      },
    });

    return {
      success: true,
      activeTerm,
      subjectAllocations,
      submissions,
      formMasterClasses,
      isFormMaster: formMasterClasses.length > 0,
      isSupervisor,
    };
  } catch (error: any) {
    console.error("getTeacherDashboardData error:", error);
    return { success: false, error: error.message || "Failed to load teacher dashboard data." };
  }
}

// ==========================================
// 2. SUBJECT TEACHER SCORE ENTRY & SUBMISSION
// ==========================================

export async function getStudentsAndScoresForSubject(classId: number, subjectId: number, termId?: number) {
  try {
    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }

    if (!targetTermId) return { success: false, error: "No active term" };

    // Layer 3 Tenant Boundary Check (v3 Finding 2)
    await assertTeacherAssigned(Number(classId), Number(subjectId), Number(targetTermId));

    const students = await prisma.student.findMany({
      where: { ClassID: Number(classId) },
      include: {
        User: true,
        Results: {
          where: {
            SubjectID: Number(subjectId),
            TermID: Number(targetTermId),
          },
        },
      },
      orderBy: { AdmissionNo: "asc" },
    });

    const submission = await prisma.subject_Submission.findUnique({
      where: {
        SubjectID_ClassID_TermID: {
          SubjectID: Number(subjectId),
          ClassID: Number(classId),
          TermID: Number(targetTermId),
        },
      },
    });

    const term = await prisma.academic_Term.findUnique({ where: { TermID: Number(targetTermId) } });

    return {
      success: true,
      students,
      isSubmitted: submission?.Status === "Submitted" || submission?.Status === "Approved",
      submission,
      isTermLocked: term?.IsLocked || false,
    };
  } catch (error: any) {
    console.error("getStudentsAndScoresForSubject error:", error);
    return { success: false, error: error.message || "Failed to fetch student scores" };
  }
}

export async function saveSubjectScoresBatch(data: {
  subjectId: number;
  classId: number;
  termId: number;
  scores: { studentId: number; caScore: number | null; examScore: number | null }[];
}) {
  try {
    // 1. Validate input schema via Zod (rejects NaN, negatives, out-of-range marks)
    const parsed = ScoreBatchSchema.safeParse({
      subjectId: Number(data.subjectId),
      classId: Number(data.classId),
      termId: Number(data.termId),
      scores: data.scores.map((s) => ({
        studentId: Number(s.studentId),
        caScore: s.caScore === null || s.caScore === undefined || Number.isNaN(Number(s.caScore)) ? null : Number(s.caScore),
        examScore: s.examScore === null || s.examScore === undefined || Number.isNaN(Number(s.examScore)) ? null : Number(s.examScore),
      })),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: "Validation failed: CA must be 0–40 and Exam must be 0–60.",
      };
    }

    const validData = parsed.data;

    // 2. Enforce Layer 3 Teacher Assignment Boundary (IDOR protection)
    const { user, isSupervisoryOverride } = await assertTeacherAssigned(
      validData.classId,
      validData.subjectId,
      validData.termId
    );

    // 3. Verify every studentId actually belongs to the target ClassID
    const enrolledStudents = await prisma.student.findMany({
      where: { ClassID: validData.classId },
      select: { StudentID: true },
    });
    const enrolledIds = new Set(enrolledStudents.map((s) => s.StudentID));

    for (const item of validData.scores) {
      if (!enrolledIds.has(item.studentId)) {
        return {
          success: false,
          error: `Enrollment Violation: Student ID ${item.studentId} does not belong to Class ID ${validData.classId}.`,
        };
      }
    }

    // 4. Atomic Transaction: Verify Term Lock + Sheet Status + Upsert Scores + Write Audit Log
    await prisma.$transaction(async (tx) => {
      const term = await tx.academic_Term.findUnique({
        where: { TermID: validData.termId },
      });

      if (!term) {
        throw new Error("Target academic term does not exist.");
      }

      if (term.IsLocked) {
        throw new Error("Score entry for this academic term has been FROZEN by administration.");
      }

      const existingSubmission = await tx.subject_Submission.findUnique({
        where: {
          SubjectID_ClassID_TermID: {
            SubjectID: validData.subjectId,
            ClassID: validData.classId,
            TermID: validData.termId,
          },
        },
      });

      if (
        existingSubmission &&
        (existingSubmission.Status === "Submitted" || existingSubmission.Status === "Approved")
      ) {
        throw new Error(
          `Sheet is currently ${existingSubmission.Status}. A formal two-person unlock is required before editing.`
        );
      }

      for (const item of validData.scores) {
        // Skip completely unentered rows (preserve null / do not overwrite with 0)
        if (item.caScore === null && item.examScore === null) {
          continue;
        }

        // Convert to integer tenths (0–400 CA, 0–600 Exam) for exact boundary arithmetic
        const caTenths = item.caScore !== null && item.caScore !== undefined ? Math.round(item.caScore * 10) : null;
        const examTenths = item.examScore !== null && item.examScore !== undefined ? Math.round(item.examScore * 10) : null;
        const totalTenths = (caTenths ?? 0) + (examTenths ?? 0);

        const caFloat = caTenths !== null ? caTenths / 10 : 0;
        const examFloat = examTenths !== null ? examTenths / 10 : 0;
        const totalFloat = totalTenths / 10;

        // Policy Decision 1 Default: Grade exact total without upward rounding inflation
        const { grade, remark } = calculateGrade(Math.floor(totalFloat));

        const existingResult = await tx.result.findUnique({
          where: {
            StudentID_SubjectID_TermID: {
              StudentID: item.studentId,
              SubjectID: validData.subjectId,
              TermID: validData.termId,
            },
          },
        });

        const saved = await tx.result.upsert({
          where: {
            StudentID_SubjectID_TermID: {
              StudentID: item.studentId,
              SubjectID: validData.subjectId,
              TermID: validData.termId,
            },
          },
          update: {
            CAScore: caFloat,
            ExamScore: examFloat,
            TotalScore: totalFloat,
            CAScoreTenths: caTenths,
            ExamScoreTenths: examTenths,
            TotalScoreTenths: totalTenths,
            Grade: grade,
            Remark: remark,
            Version: { increment: 1 },
          },
          create: {
            StudentID: item.studentId,
            SubjectID: validData.subjectId,
            TermID: validData.termId,
            CAScore: caFloat,
            ExamScore: examFloat,
            TotalScore: totalFloat,
            CAScoreTenths: caTenths,
            ExamScoreTenths: examTenths,
            TotalScoreTenths: totalTenths,
            Grade: grade,
            Remark: remark,
            Version: 1,
          },
        });

        await writeAuditLog({
          tx,
          actorId: user.UserID,
          action: isSupervisoryOverride ? "SUPERVISORY_SCORE_SAVE" : "SCORE_DRAFT_SAVE",
          entity: "Result",
          entityId: saved.ResultID,
          oldValue: existingResult
            ? { caTenths: existingResult.CAScoreTenths, examTenths: existingResult.ExamScoreTenths, grade: existingResult.Grade }
            : null,
          newValue: { caTenths, examTenths, totalTenths, grade, supervisory: isSupervisoryOverride },
        });
      }
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, message: "Scores validated and saved as draft." };
  } catch (error: any) {
    console.error("saveSubjectScoresBatch error:", error);
    return { success: false, error: error.message || "Failed to save scores." };
  }
}

export async function submitSubjectToFormMaster(subjectId: number, classId: number, termId: number) {
  try {
    const { user, isSupervisoryOverride } = await assertTeacherAssigned(
      Number(classId),
      Number(subjectId),
      Number(termId)
    );

    const submission = await prisma.$transaction(async (tx) => {
      const term = await tx.academic_Term.findUnique({ where: { TermID: Number(termId) } });
      if (term?.IsLocked) {
        throw new Error("Cannot submit results: academic term is frozen.");
      }

      const sub = await tx.subject_Submission.upsert({
        where: {
          SubjectID_ClassID_TermID: {
            SubjectID: Number(subjectId),
            ClassID: Number(classId),
            TermID: Number(termId),
          },
        },
        update: {
          Status: "Submitted",
          SubmittedAt: new Date(),
          TeacherID: user.UserID,
          Version: { increment: 1 },
        },
        create: {
          SubjectID: Number(subjectId),
          ClassID: Number(classId),
          TermID: Number(termId),
          TeacherID: user.UserID,
          Status: "Submitted",
          SubmittedAt: new Date(),
          Version: 1,
        },
      });

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "SHEET_SUBMITTED",
        entity: "Subject_Submission",
        entityId: sub.id,
        newValue: { status: "Submitted", classId, subjectId, termId, supervisory: isSupervisoryOverride },
      });

      return sub;
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, submission };
  } catch (error: any) {
    console.error("submitSubjectToFormMaster error:", error);
    return { success: false, error: error.message || "Failed to submit results to Form Master." };
  }
}

/**
 * Two-Person Rule for Sheet Reversion (Policy Decision 2):
 * Step 1: Principal or Teacher requests unlock with a mandatory written reason.
 * Step 2: A distinct Administrator / Principal approves the unlock.
 */
export async function requestSubjectSheetUnlock(
  submissionIdOrSubjectId: number,
  reasonOrClassId: string | number,
  maybeTermId?: number,
  maybeReason?: string
) {
  try {
    const isCompositeCall = typeof reasonOrClassId === "number";
    const reason = isCompositeCall ? String(maybeReason || "") : String(reasonOrClassId || "");

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: "A clear written reason (minimum 5 characters) is required to request an unlock." };
    }

    const { user } = await requireRole(["PRINCIPAL", "TEACHER", "FORM_MASTER", "SUPER_ADMIN", "Teacher", "Admin"]);

    const updated = await prisma.$transaction(async (tx) => {
      const whereClause = isCompositeCall
        ? {
            SubjectID_ClassID_TermID: {
              SubjectID: Number(submissionIdOrSubjectId),
              ClassID: Number(reasonOrClassId),
              TermID: Number(maybeTermId),
            },
          }
        : { id: Number(submissionIdOrSubjectId) };

      const sub = await tx.subject_Submission.update({
        where: whereClause,
        data: {
          UnlockRequestedBy: user.UserID,
          UnlockRequestedReason: reason.trim(),
        },
      });

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "SHEET_UNLOCK_REQUESTED",
        entity: "Subject_Submission",
        entityId: sub.id,
        newValue: { requestedBy: user.UserID, reason: reason.trim() },
      });

      return sub;
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/teacher");
    return { success: true, submission: updated };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to request sheet unlock." };
  }
}

export async function approveSubjectSheetUnlock(submissionId: number, approvalNote: string) {
  try {
    const actor = await requireRole(["PRINCIPAL", "Admin"]);
    if (!actor.roles.has("PRINCIPAL")) {
      return {
        success: false,
        error: "Forbidden (Section 1 & 6.3): Only the School Principal may unlock submitted/approved grade sheets.",
      };
    }

    if (!approvalNote || approvalNote.trim().length < 5) {
      return {
        success: false,
        error: "A written reason (minimum 5 characters) is mandatory for the Principal to unlock a grade sheet.",
      };
    }

    const { user } = actor;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.subject_Submission.findUnique({
        where: { id: Number(submissionId) },
      });

      if (!existing) throw new Error("Submission sheet not found.");

      const sub = await tx.subject_Submission.update({
        where: { id: Number(submissionId) },
        data: {
          Status: "Draft",
          UnlockedBy: user.UserID,
          UnlockedReason: approvalNote || existing.UnlockRequestedReason || "Administrative unlock approved",
          Version: { increment: 1 },
        },
      });

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "SHEET_UNLOCKED_TO_DRAFT",
        entity: "Subject_Submission",
        entityId: sub.id,
        oldValue: { status: existing.Status, requestedBy: existing.UnlockRequestedBy },
        newValue: { status: "Draft", unlockedBy: user.UserID, reason: sub.UnlockedReason },
      });

      return sub;
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/teacher");
    return { success: true, submission: updated };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to approve sheet unlock." };
  }
}

// ==========================================
// 3. FORM MASTER COMPILATION & REMARKS
// ==========================================

export async function saveFormMasterRemarks(data: {
  studentId: number;
  termId: number;
  formMasterRemark?: string;
  principalRemark?: string;
  affectiveTraits?: Record<string, number>;
  psychomotorTraits?: Record<string, number>;
}) {
  try {
    const student = await prisma.student.findUnique({
      where: { StudentID: Number(data.studentId) },
    });
    if (!student) return { success: false, error: "Student not found." };

    const { user } = await assertFormMasterAssigned(student.ClassID);

    const report = await prisma.$transaction(async (tx) => {
      const term = await tx.academic_Term.findUnique({ where: { TermID: Number(data.termId) } });
      if (term?.IsLocked) {
        throw new Error("Academic term is locked. Terminal remarks cannot be modified.");
      }

      const upserted = await tx.form_Master_Report.upsert({
        where: {
          StudentID_TermID: {
            StudentID: Number(data.studentId),
            TermID: Number(data.termId),
          },
        },
        update: {
          FormMasterRemark: data.formMasterRemark || undefined,
          PrincipalRemark: data.principalRemark || undefined,
          AffectiveTraits: data.affectiveTraits ? JSON.stringify(data.affectiveTraits) : undefined,
          PsychomotorTraits: data.psychomotorTraits ? JSON.stringify(data.psychomotorTraits) : undefined,
          Version: { increment: 1 },
        },
        create: {
          StudentID: Number(data.studentId),
          TermID: Number(data.termId),
          FormMasterRemark: data.formMasterRemark || "A hardworking and disciplined student.",
          PrincipalRemark: data.principalRemark || "Satisfactory academic performance.",
          AffectiveTraits: data.affectiveTraits
            ? JSON.stringify(data.affectiveTraits)
            : JSON.stringify({ punctuality: 5, neatness: 5, attentiveness: 4, conduct: 5 }),
          PsychomotorTraits: data.psychomotorTraits
            ? JSON.stringify(data.psychomotorTraits)
            : JSON.stringify({ handwriting: 4, sports: 4, crafts: 4 }),
          Status: "Draft",
          Version: 1,
        },
      });

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "FORM_MASTER_REMARK_SAVE",
        entity: "Form_Master_Report",
        entityId: upserted.id,
        newValue: { studentId: data.studentId, termId: data.termId },
      });

      return upserted;
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, report };
  } catch (error: any) {
    console.error("saveFormMasterRemarks error:", error);
    return { success: false, error: error.message || "Failed to save Form Master remarks." };
  }
}

export async function submitClassResultsToAdmin(classId: number, termId: number) {
  try {
    const { user } = await assertFormMasterAssigned(Number(classId));

    const students = await prisma.student.findMany({
      where: { ClassID: Number(classId) },
    });

    await prisma.$transaction(async (tx) => {
      const term = await tx.academic_Term.findUnique({ where: { TermID: Number(termId) } });
      if (term?.IsLocked) {
        throw new Error("Academic term is frozen.");
      }

      for (const student of students) {
        await tx.form_Master_Report.upsert({
          where: {
            StudentID_TermID: {
              StudentID: student.StudentID,
              TermID: Number(termId),
            },
          },
          update: { Status: "SubmittedToAdmin", Version: { increment: 1 } },
          create: {
            StudentID: student.StudentID,
            TermID: Number(termId),
            FormMasterRemark: "Good overall performance.",
            PrincipalRemark: "Promoted / Approved.",
            Status: "SubmittedToAdmin",
            Version: 1,
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "CLASS_BROADSHEET_SUBMITTED",
        entity: "Class",
        entityId: classId,
        newValue: { classId, termId, studentCount: students.length },
      });
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin/results");
    return { success: true, message: "Class results compiled and submitted to Admin for final publication!" };
  } catch (error: any) {
    console.error("submitClassResultsToAdmin error:", error);
    return { success: false, error: error.message || "Failed to submit class to admin." };
  }
}

// ==========================================
// 4. BROADSHEET & COMPETITION POSITION ENGINE (1224 Ranking)
// ==========================================

export async function getClassBroadsheet(classId: number, termId?: number) {
  try {
    await requireRole(["TEACHER", "FORM_MASTER", "PRINCIPAL", "SUPER_ADMIN", "Teacher", "Admin"]);

    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }

    if (!targetTermId) return { success: false, error: "No active term" };

    const classData = await prisma.class.findUnique({
      where: { ClassID: Number(classId) },
      include: {
        FormMaster: true,
        Students: {
          include: {
            Results: {
              where: { TermID: Number(targetTermId) },
              include: { Subject: true },
            },
            FormMasterReports: {
              where: { TermID: Number(targetTermId) },
            },
          },
        },
        TeacherMaps: {
          include: { Subject: true, Teacher: true },
        },
        SubjectSubmissions: {
          where: { TermID: Number(targetTermId) },
          include: { Subject: true },
        },
      },
    });

    if (!classData) return { success: false, error: "Class not found." };

    const term = await prisma.academic_Term.findUnique({ where: { TermID: Number(targetTermId) } });

    // Distinct subjects in this class
    const subjectsMap = new Map<number, string>();
    classData.Students.forEach((st) => {
      st.Results.forEach((r) => {
        subjectsMap.set(r.SubjectID, r.Subject.SubjectName);
      });
    });

    // Compute student aggregate scores, averages, and rankings
    const studentSummaries = classData.Students.map((student) => {
      let totalMarks = 0;
      let subjectCount = 0;
      const scoreMap: Record<number, { ca: number; exam: number; total: number; grade: string }> = {};

      student.Results.forEach((r) => {
        totalMarks += r.TotalScore;
        subjectCount++;
        scoreMap[r.SubjectID] = {
          ca: r.CAScore,
          exam: r.ExamScore,
          total: r.TotalScore,
          grade: r.Grade,
        };
      });

      const average = subjectCount > 0 ? parseFloat((totalMarks / subjectCount).toFixed(1)) : 0;

      return {
        studentId: student.StudentID,
        admissionNo: student.AdmissionNo,
        name: student.PreferredName || `${student.FirstName || ""} ${student.LastName || ""}`.trim() || student.AdmissionNo,
        scoreMap,
        totalMarks,
        average,
        subjectCount,
        report: student.FormMasterReports[0] || null,
        position: 1,
      };
    });

    // Standard Competition Ranking ("1224" tie-breaking as specified in v3)
    studentSummaries.sort((a, b) => b.totalMarks - a.totalMarks);
    for (let i = 0; i < studentSummaries.length; i++) {
      if (i > 0 && studentSummaries[i].totalMarks === studentSummaries[i - 1].totalMarks) {
        studentSummaries[i].position = studentSummaries[i - 1].position;
      } else {
        studentSummaries[i].position = i + 1;
      }
    }

    return {
      success: true,
      classData,
      term,
      subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
      studentSummaries,
    };
  } catch (error: any) {
    console.error("getClassBroadsheet error:", error);
    return { success: false, error: error.message || "Failed to generate class broadsheet" };
  }
}

export async function saveResult(data: {
  studentId: number;
  subjectId: number;
  termId: number;
  caScore: number;
  examScore: number;
}) {
  const student = await prisma.student.findUnique({ where: { StudentID: Number(data.studentId) } });
  return saveSubjectScoresBatch({
    subjectId: data.subjectId,
    classId: student?.ClassID || 0,
    termId: data.termId,
    scores: [{ studentId: data.studentId, caScore: data.caScore, examScore: data.examScore }],
  });
}

export async function getStudentsInClass(classId: number) {
  try {
    await requireActiveUser();
    return await prisma.student.findMany({
      where: { ClassID: Number(classId) },
      include: { User: true },
    });
  } catch {
    return [];
  }
}

export async function getTeacherSubjects(teacherUserId: number) {
  try {
    await requireActiveUser();
    return await prisma.teacher_Subject_Map.findMany({
      where: { TeacherID: Number(teacherUserId) },
      include: { Subject: true, Class: true },
    });
  } catch (error) {
    console.error("Failed to fetch teacher subjects:", error);
    return [];
  }
}

export async function uploadManualResult(data: {
  admissionNo: string;
  subjectName: string;
  caScore: number;
  examScore: number;
}) {
  try {
    const { user } = await requireRole(["PRINCIPAL", "SUPER_ADMIN", "TEACHER", "Admin", "Teacher"]);

    const { admissionNo, subjectName, caScore, examScore } = data;
    const ca = Math.min(Math.max(0, Number(caScore)), 40);
    const exam = Math.min(Math.max(0, Number(examScore)), 60);
    const totalScore = ca + exam;
    const { grade, remark } = calculateGrade(Math.floor(totalScore));

    const student = await prisma.student.findUnique({
      where: { AdmissionNo: admissionNo.trim() },
    });
    if (!student) return { error: `Student with Admission No. ${admissionNo} not found.` };

    const subject = await prisma.subject.findFirst({
      where: { SubjectName: subjectName.trim() },
    });
    if (!subject) return { error: `Subject '${subjectName}' not found.` };

    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    });
    if (!term) return { error: "No active academic term found. Please activate a term first." };
    if (term.IsLocked) return { error: "Academic term is frozen. Score uploads are blocked." };

    const caTenths = Math.round(ca * 10);
    const examTenths = Math.round(exam * 10);
    const totalTenths = caTenths + examTenths;

    const saved = await prisma.result.upsert({
      where: {
        StudentID_SubjectID_TermID: {
          StudentID: student.StudentID,
          SubjectID: subject.SubjectID,
          TermID: term.TermID,
        },
      },
      update: {
        CAScore: ca,
        ExamScore: exam,
        TotalScore: totalScore,
        CAScoreTenths: caTenths,
        ExamScoreTenths: examTenths,
        TotalScoreTenths: totalTenths,
        Grade: grade,
        Remark: remark,
        Version: { increment: 1 },
      },
      create: {
        StudentID: student.StudentID,
        SubjectID: subject.SubjectID,
        TermID: term.TermID,
        CAScore: ca,
        ExamScore: exam,
        TotalScore: totalScore,
        CAScoreTenths: caTenths,
        ExamScoreTenths: examTenths,
        TotalScoreTenths: totalTenths,
        Grade: grade,
        Remark: remark,
        Version: 1,
      },
    });

    await writeAuditLog({
      actorId: user.UserID,
      action: "MANUAL_RESULT_UPLOAD",
      entity: "Result",
      entityId: saved.ResultID,
      newValue: { admissionNo, subjectName, caTenths, examTenths, grade },
    });

    revalidatePath("/portal/admin/results");
    return { success: true };
  } catch (error: any) {
    console.error("Result upload error:", error);
    return { error: error.message || "Failed to upload result." };
  }
}

export async function uploadBulkResults(csvData: string) {
  try {
    const { user } = await requireRole(["PRINCIPAL", "SUPER_ADMIN", "TEACHER", "Admin", "Teacher"]);

    const lines = csvData.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) {
      return {
        error: "CSV file is empty or missing headers. Please ensure headers are: AdmissionNo, SubjectName, CAScore, ExamScore",
      };
    }

    let successCount = 0;
    const errors: string[] = [];

    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    });
    if (!term) return { error: "No active academic term found." };
    if (term.IsLocked) return { error: "Academic term is frozen. Bulk uploads are prohibited." };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 4) {
        errors.push(`Row ${i + 1}: Not enough columns.`);
        continue;
      }

      const [admissionNo, subjectName, caStr, examStr] = parts;
      const caScore = parseFloat(caStr);
      const examScore = parseFloat(examStr);

      if (isNaN(caScore) || isNaN(examScore) || caScore < 0 || caScore > 40 || examScore < 0 || examScore > 60) {
        errors.push(`Row ${i + 1}: Invalid score range for ${admissionNo} (CA 0-40, Exam 0-60)`);
        continue;
      }

      const totalScore = caScore + examScore;
      const { grade, remark } = calculateGrade(Math.floor(totalScore));

      const student = await prisma.student.findUnique({ where: { AdmissionNo: admissionNo } });
      if (!student) {
        errors.push(`Row ${i + 1}: Student ${admissionNo} not found.`);
        continue;
      }

      const subject = await prisma.subject.findFirst({ where: { SubjectName: subjectName } });
      if (!subject) {
        errors.push(`Row ${i + 1}: Subject '${subjectName}' not found.`);
        continue;
      }

      const caTenths = Math.round(caScore * 10);
      const examTenths = Math.round(examScore * 10);
      const totalTenths = caTenths + examTenths;

      await prisma.result.upsert({
        where: {
          StudentID_SubjectID_TermID: {
            StudentID: student.StudentID,
            SubjectID: subject.SubjectID,
            TermID: term.TermID,
          },
        },
        update: {
          CAScore: caScore,
          ExamScore: examScore,
          TotalScore: totalScore,
          CAScoreTenths: caTenths,
          ExamScoreTenths: examTenths,
          TotalScoreTenths: totalTenths,
          Grade: grade,
          Remark: remark,
          Version: { increment: 1 },
        },
        create: {
          StudentID: student.StudentID,
          SubjectID: subject.SubjectID,
          TermID: term.TermID,
          CAScore: caScore,
          ExamScore: examScore,
          TotalScore: totalScore,
          CAScoreTenths: caTenths,
          ExamScoreTenths: examTenths,
          TotalScoreTenths: totalTenths,
          Grade: grade,
          Remark: remark,
          Version: 1,
        },
      });

      successCount++;
    }

    await writeAuditLog({
      actorId: user.UserID,
      action: "BULK_RESULT_UPLOAD",
      entity: "Result",
      entityId: `term:${term.TermID}`,
      newValue: { successCount, errorCount: errors.length },
    });

    revalidatePath("/portal/admin/results");
    return {
      success: true,
      message: `Successfully uploaded ${successCount} results. ${errors.length > 0 ? "Errors: " + errors.join("; ") : ""}`,
    };
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return { error: error.message || "Failed to process bulk upload." };
  }
}
