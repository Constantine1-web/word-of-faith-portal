"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  calculateGrade,
  calculateGradeFromTenths,
  gradeFor,
  computeSubjectStats,
  computeBroadsheetRankings,
  WAEC_SECONDARY_BANDS,
  PRIMARY_BANDS,
  type GradeBandRule,
} from "@/lib/grading";
import { z } from "zod";
import {
  requireActiveUser,
  requireRole,
  requireCapability,
  can,
  assertSeparationOfDuties,
  assertTeacherAssigned,
  assertFormMasterAssigned,
  writeAuditLog,
  sanitizeCsvCell,
} from "@/lib/authz";

const ScoreRowSchema = z.object({
  studentId: z.number().int().positive(),
  caScore: z.number().min(0).max(40).nullable().optional(),
  examScore: z.number().min(0).max(60).nullable().optional(),
  status: z.enum(["PENDING", "ENTERED", "ABSENT", "EXEMPT"]).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const ScoreBatchSchema = z.object({
  subjectId: z.number().int().positive(),
  classId: z.number().int().positive(),
  termId: z.number().int().positive(),
  scores: z.array(ScoreRowSchema),
});

async function resolveSheetGradeBands(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  scaleId?: string | null,
  classLevel?: string | null
): Promise<GradeBandRule[]> {
  if (scaleId) {
    const scale = await tx.gradeScale
      .findUnique({
        where: { id: scaleId },
        include: { bands: true },
      })
      .catch(() => null);
    if (scale?.bands?.length) {
      return scale.bands.map((b: { grade: string; minTenths: number; remark: string }) => ({
        grade: b.grade,
        minTenths: b.minTenths,
        remark: b.remark,
      }));
    }
  }
  if (classLevel && /primary|nursery|creche/i.test(classLevel)) {
    return PRIMARY_BANDS;
  }
  return WAEC_SECONDARY_BANDS;
}

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
// 2. SINGLE WRITE PATH FOR SCORES (Section B.4.2)
// ==========================================

export async function getStudentsAndScoresForSubject(classId: number, subjectId: number, termId?: number) {
  try {
    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }

    if (!targetTermId) return { success: false, error: "No active term" };

    // Layer 3 Tenant Boundary Check
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
      include: {
        ImportBatches: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { rows: true },
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

/**
 * Section B.4.2 Single Write Path:
 * All score mutations (Teacher Grid, Excel/CSV Import Commit, and Admin Score Correction)
 * flow through this single transactional function.
 */
async function upsertSheetScoresInternal(params: {
  subjectId: number;
  classId: number;
  termId: number;
  scores: {
    studentId: number;
    caScore: number | null;
    examScore: number | null;
    status?: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT";
    expectedVersion?: number;
  }[];
  source: "GRID" | "IMPORT" | "ADMIN_CORRECTION";
  importBatchId?: string;
  adminCorrectionReason?: string;
}) {
  const parsed = ScoreBatchSchema.safeParse({
    subjectId: Number(params.subjectId),
    classId: Number(params.classId),
    termId: Number(params.termId),
    scores: params.scores.map((s) => ({
      studentId: Number(s.studentId),
      caScore:
        s.caScore === null || s.caScore === undefined || Number.isNaN(Number(s.caScore))
          ? null
          : Number(s.caScore),
      examScore:
        s.examScore === null || s.examScore === undefined || Number.isNaN(Number(s.examScore))
          ? null
          : Number(s.examScore),
      status: s.status,
      expectedVersion: s.expectedVersion,
    })),
  });

  if (!parsed.success) {
    throw new Error("Validation failed: CA must be 0–40 and Exam must be 0–60.");
  }

  const validData = parsed.data;
  const actor = await requireActiveUser();

  let isSupervisoryOverride = false;
  if (params.source === "ADMIN_CORRECTION") {
    if (!can(actor, "CORRECT_SCORES")) {
      throw new Error("Forbidden: Admin score correction requires the CORRECT_SCORES capability.");
    }
    if (!params.adminCorrectionReason || params.adminCorrectionReason.trim().length < 5) {
      throw new Error("A written reason (minimum 5 characters) is mandatory for an admin score correction.");
    }
    isSupervisoryOverride = true;
  } else {
    const teacherAuth = await assertTeacherAssigned(
      validData.classId,
      validData.subjectId,
      validData.termId
    );
    isSupervisoryOverride = teacherAuth.isSupervisoryOverride;
  }

  const enrolledStudents = await prisma.student.findMany({
    where: { ClassID: validData.classId },
    select: { StudentID: true },
  });
  const enrolledIds = new Set(enrolledStudents.map((s) => s.StudentID));

  for (const item of validData.scores) {
    if (!enrolledIds.has(item.studentId)) {
      throw new Error(
        `Enrollment Violation: Student ID ${item.studentId} does not belong to Class ID ${validData.classId}.`
      );
    }
  }

  const conflicts: { studentId: number; expectedVersion: number; actualVersion: number }[] = [];

  await prisma.$transaction(async (tx) => {
    // Section B.4.2 & 6.2: Lock term row with FOR SHARE so term freeze and score saves cannot interleave
    const lockedRows = await tx.$queryRaw<{ IsLocked: boolean }[]>`
      SELECT "IsLocked" FROM "Academic_Term" WHERE "TermID" = ${validData.termId} FOR SHARE
    `;
    const termLocked = lockedRows?.[0]?.IsLocked ?? false;

    if (termLocked && params.source !== "ADMIN_CORRECTION") {
      throw new Error("Score entry for this academic term has been FROZEN by administration.");
    }

    const cls = await tx.class.findUnique({ where: { ClassID: validData.classId } });

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
      params.source !== "ADMIN_CORRECTION" &&
      existingSubmission &&
      (existingSubmission.Status === "Submitted" || existingSubmission.Status === "Approved")
    ) {
      const windowOpen =
        existingSubmission.WindowEndsAt && new Date(existingSubmission.WindowEndsAt) > new Date();
      if (!windowOpen) {
        throw new Error(
          `Sheet is currently ${existingSubmission.Status}. An approved unlock request is required before editing.`
        );
      }
    }

    const bands = await resolveSheetGradeBands(tx, existingSubmission?.ScaleID, cls?.Level);

    for (const item of validData.scores) {
      const status = item.status || (item.caScore === null && item.examScore === null ? "PENDING" : "ENTERED");

      if (status === "PENDING" && item.caScore === null && item.examScore === null) {
        continue;
      }

      const existingResult = await tx.result.findUnique({
        where: {
          StudentID_SubjectID_TermID: {
            StudentID: item.studentId,
            SubjectID: validData.subjectId,
            TermID: validData.termId,
          },
        },
      });

      if (
        item.expectedVersion !== undefined &&
        existingResult &&
        existingResult.Version !== item.expectedVersion
      ) {
        conflicts.push({
          studentId: item.studentId,
          expectedVersion: item.expectedVersion,
          actualVersion: existingResult.Version,
        });
        continue;
      }

      const isAbsentOrExempt = status === "ABSENT" || status === "EXEMPT";
      const caTenths =
        !isAbsentOrExempt && item.caScore !== null && item.caScore !== undefined
          ? Math.round(item.caScore * 10)
          : null;
      const examTenths =
        !isAbsentOrExempt && item.examScore !== null && item.examScore !== undefined
          ? Math.round(item.examScore * 10)
          : null;
      const totalTenths = isAbsentOrExempt ? 0 : (caTenths ?? 0) + (examTenths ?? 0);

      const caFloat = caTenths !== null ? caTenths / 10 : 0;
      const examFloat = examTenths !== null ? examTenths / 10 : 0;
      const totalFloat = totalTenths / 10;

      const { grade, remark } =
        status === "ABSENT"
          ? { grade: "ABS", remark: "Absent" }
          : status === "EXEMPT"
          ? { grade: "EXM", remark: "Exempt" }
          : gradeFor(totalTenths, bands);

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
          Status: status,
          Source: params.source,
          ImportBatchID: params.importBatchId ?? null,
          UpdatedByID: actor.UserID,
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
          Status: status,
          Source: params.source,
          ImportBatchID: params.importBatchId ?? null,
          UpdatedByID: actor.UserID,
          Version: 1,
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        onBehalfOfId: isSupervisoryOverride ? existingSubmission?.TeacherID ?? null : null,
        action:
          params.source === "ADMIN_CORRECTION"
            ? "ADMIN_SCORE_CORRECTION"
            : params.source === "IMPORT"
            ? "SCORE_IMPORT_COMMIT"
            : isSupervisoryOverride
            ? "SUPERVISORY_SCORE_SAVE"
            : "SCORE_DRAFT_SAVE",
        entity: "Result",
        entityId: saved.ResultID,
        reason: params.adminCorrectionReason,
        oldValue: existingResult
          ? {
              caTenths: existingResult.CAScoreTenths,
              examTenths: existingResult.ExamScoreTenths,
              grade: existingResult.Grade,
              status: existingResult.Status,
            }
          : null,
        newValue: {
          caTenths,
          examTenths,
          totalTenths,
          grade,
          status,
          source: params.source,
          supervisory: isSupervisoryOverride,
        },
      });
    }

    // Increment sheet version and mark any computed ClassBroadsheet as stale (Section B.4.6)
    if (existingSubmission) {
      await tx.subject_Submission.update({
        where: { id: existingSubmission.id },
        data: { Version: { increment: 1 } },
      });
    }

    await tx.classBroadsheet
      .updateMany({
        where: {
          classArmId: validData.classId,
          termId: validData.termId,
          status: { in: ["COMPUTED", "SIGNED_OFF", "PUBLISHED"] },
        },
        data: { isStale: true },
      })
      .catch(() => null);
  });

  return { conflicts };
}

export async function saveSubjectScoresBatch(data: {
  subjectId: number;
  classId: number;
  termId: number;
  scores: {
    studentId: number;
    caScore: number | null;
    examScore: number | null;
    status?: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT";
    expectedVersion?: number;
  }[];
}) {
  try {
    const { conflicts } = await upsertSheetScoresInternal({
      subjectId: data.subjectId,
      classId: data.classId,
      termId: data.termId,
      scores: data.scores,
      source: "GRID",
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return {
      success: true,
      conflicts,
      message:
        conflicts.length > 0
          ? `Saved with ${conflicts.length} version conflict(s). Refresh to inspect.`
          : "Scores validated and saved as draft.",
    };
  } catch (error: any) {
    console.error("saveSubjectScoresBatch error:", error);
    return { success: false, error: error.message || "Failed to save scores." };
  }
}

/**
 * Section B.4.6 Admin Score Correction via the Single Write Path (`scores.upsert` with `ADMIN_CORRECTION`).
 */
export async function adminCorrectScore(data: {
  studentId: number;
  subjectId: number;
  classId: number;
  termId: number;
  caScore: number | null;
  examScore: number | null;
  status?: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT";
  reason: string;
}) {
  try {
    await upsertSheetScoresInternal({
      subjectId: data.subjectId,
      classId: data.classId,
      termId: data.termId,
      scores: [
        {
          studentId: data.studentId,
          caScore: data.caScore,
          examScore: data.examScore,
          status: data.status || "ENTERED",
        },
      ],
      source: "ADMIN_CORRECTION",
      adminCorrectionReason: data.reason,
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/dashboard");
    return {
      success: true,
      message: "Score corrected via audited single write path. Class broadsheet marked for recomputation.",
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to apply admin score correction." };
  }
}

// ==========================================
// 2B. EXCEL / CSV IMPORT PIPELINE (Section B.4.3)
// ==========================================

export async function generateScoreSheetTemplateCsv(
  classId: number,
  subjectId: number,
  termId?: number
) {
  try {
    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }
    if (!targetTermId) return { success: false, error: "No active term found." };

    await assertTeacherAssigned(Number(classId), Number(subjectId), Number(targetTermId));

    const [cls, subject, students, submission] = await Promise.all([
      prisma.class.findUnique({ where: { ClassID: Number(classId) } }),
      prisma.subject.findUnique({ where: { SubjectID: Number(subjectId) } }),
      prisma.student.findMany({
        where: { ClassID: Number(classId) },
        include: {
          Results: {
            where: { SubjectID: Number(subjectId), TermID: Number(targetTermId) },
          },
        },
        orderBy: { AdmissionNo: "asc" },
      }),
      prisma.subject_Submission.findUnique({
        where: {
          SubjectID_ClassID_TermID: {
            SubjectID: Number(subjectId),
            ClassID: Number(classId),
            TermID: Number(targetTermId),
          },
        },
      }),
    ]);

    const sheetVersion = submission?.Version ?? 1;
    const header = "AdmissionNo,StudentName,CAScore,ExamScore,Status,SheetVersion";
    const rows = students.map((s) => {
      const r = s.Results[0];
      const fullName = `${s.FirstName || ""} ${s.LastName || ""}`.trim() || s.AdmissionNo;
      const ca = r && r.CAScoreTenths !== null ? String(r.CAScore) : "";
      const exam = r && r.ExamScoreTenths !== null ? String(r.ExamScore) : "";
      const status = r?.Status || "ENTERED";
      return [
        sanitizeCsvCell(s.AdmissionNo),
        sanitizeCsvCell(fullName),
        ca,
        exam,
        status,
        String(sheetVersion),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    return {
      success: true,
      csv,
      fileName: `WOFS_${(cls?.ClassName || "Class").replace(/\s+/g, "_")}_${(subject?.SubjectName || "Subject").replace(/\s+/g, "_")}_v${sheetVersion}.csv`,
      sheetVersion,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to generate score sheet template." };
  }
}

export async function stageScoreSheetImportCsv(data: {
  classId: number;
  subjectId: number;
  termId: number;
  csvContent: string;
  fileName?: string;
}) {
  try {
    const classId = Number(data.classId);
    const subjectId = Number(data.subjectId);
    const termId = Number(data.termId);

    const { user } = await assertTeacherAssigned(classId, subjectId, termId);

    const rawBytes = Buffer.byteLength(data.csvContent || "", "utf8");
    if (rawBytes > 2 * 1024 * 1024) {
      return { success: false, error: "File exceeds the 2 MB import limit (Section B.4.3)." };
    }
    if (data.fileName && /\.xlsm$/i.test(data.fileName)) {
      return { success: false, error: "Macro-enabled workbooks (.xlsm) are strictly rejected." };
    }

    const lines = (data.csvContent || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return { success: false, error: "Import file is empty or missing student rows." };
    }
    if (lines.length - 1 > 500) {
      return { success: false, error: "Import file exceeds the 500-row cap (Section B.4.3)." };
    }

    // Ensure Subject_Submission sheet exists so ImportBatch can attach to it
    const sheet = await prisma.subject_Submission.upsert({
      where: {
        SubjectID_ClassID_TermID: {
          SubjectID: subjectId,
          ClassID: classId,
          TermID: termId,
        },
      },
      update: {},
      create: {
        SubjectID: subjectId,
        ClassID: classId,
        TermID: termId,
        TeacherID: user.UserID,
        Status: "Draft",
        Version: 1,
      },
    });

    const fileSha256 = crypto.createHash("sha256").update(data.csvContent).digest("hex");

    // Check if identical file already staged for this sheet
    const existingBatch = await prisma.importBatch.findUnique({
      where: {
        sheetId_fileSha256: {
          sheetId: sheet.id,
          fileSha256,
        },
      },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });

    if (existingBatch && existingBatch.status !== "COMMITTED") {
      return {
        success: true,
        batch: existingBatch,
        isStaleTemplate: existingBatch.sheetVersionAtDownload < sheet.Version,
      };
    }

    const enrolledStudents = await prisma.student.findMany({
      where: { ClassID: classId },
      include: {
        Results: {
          where: { SubjectID: subjectId, TermID: termId },
        },
      },
    });

    const studentByAdmission = new Map(
      enrolledStudents.map((s) => [s.AdmissionNo.trim().toUpperCase(), s])
    );

    const seenAdmissions = new Set<string>();
    const stagedRows: {
      rowNumber: number;
      admissionNo: string;
      caTenths: number | null;
      examTenths: number | null;
      status: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT";
      error: string | null;
      changes: boolean;
    }[] = [];

    let detectedVersion = sheet.Version;

    for (let i = 1; i < lines.length; i++) {
      const rawCols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, "").replace(/^'/, ""));
      const admissionNo = (rawCols[0] || "").trim();
      const caStr = rawCols[2] ?? "";
      const examStr = rawCols[3] ?? "";
      const rawStatus = (rawCols[4] || "ENTERED").toUpperCase();
      const verStr = rawCols[5];

      if (verStr && !Number.isNaN(Number(verStr))) {
        detectedVersion = Number(verStr);
      }

      let rowError: string | null = null;
      const normAdm = admissionNo.toUpperCase();

      if (!admissionNo) {
        rowError = "Missing admission number.";
      } else if (seenAdmissions.has(normAdm)) {
        rowError = `Duplicate admission number (${admissionNo}) in file.`;
      } else if (!studentByAdmission.has(normAdm)) {
        rowError = `Student ${admissionNo} is not enrolled in this class arm.`;
      }
      seenAdmissions.add(normAdm);

      // Reject formulas in score cells (Section B.4.3)
      if (/^[=+\-@]/.test(caStr) || /^[=+\-@]/.test(examStr)) {
        rowError = rowError || "Formula expressions in score cells are prohibited.";
      }

      const status: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT" =
        rawStatus === "ABSENT" || rawStatus === "EXEMPT" || rawStatus === "PENDING"
          ? (rawStatus as "PENDING" | "ABSENT" | "EXEMPT")
          : "ENTERED";

      let caTenths: number | null = null;
      let examTenths: number | null = null;

      if (status === "ENTERED") {
        const caVal = caStr === "" ? null : Number(caStr);
        const examVal = examStr === "" ? null : Number(examStr);

        if (caVal === null || examVal === null || Number.isNaN(caVal) || Number.isNaN(examVal)) {
          rowError = rowError || "CA and Exam scores must be valid numbers for ENTERED rows.";
        } else if (caVal < 0 || caVal > 40 || examVal < 0 || examVal > 60) {
          rowError = rowError || "Out of range: CA must be 0–40 and Exam must be 0–60.";
        } else {
          caTenths = Math.round(caVal * 10);
          examTenths = Math.round(examVal * 10);
        }
      }

      const matchedStudent = studentByAdmission.get(normAdm);
      const existingRes = matchedStudent?.Results?.[0];
      const changes =
        !existingRes ||
        existingRes.CAScoreTenths !== caTenths ||
        existingRes.ExamScoreTenths !== examTenths ||
        existingRes.Status !== status;

      stagedRows.push({
        rowNumber: i,
        admissionNo: admissionNo || `ROW_${i}`,
        caTenths,
        examTenths,
        status,
        error: rowError,
        changes,
      });
    }

    const errorCount = stagedRows.filter((r) => r.error !== null).length;

    const batch = await prisma.importBatch.upsert({
      where: {
        sheetId_fileSha256: {
          sheetId: sheet.id,
          fileSha256,
        },
      },
      update: {
        status: errorCount === 0 ? "VALIDATED" : "UPLOADED",
        rowCount: stagedRows.length,
        errorCount,
        sheetVersionAtDownload: detectedVersion,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        rows: {
          deleteMany: {},
          create: stagedRows,
        },
      },
      create: {
        sheetId: sheet.id,
        uploadedById: user.UserID,
        fileKey: data.fileName || `sheet_${sheet.id}_${Date.now()}.csv`,
        fileSha256,
        sheetVersionAtDownload: detectedVersion,
        status: errorCount === 0 ? "VALIDATED" : "UPLOADED",
        rowCount: stagedRows.length,
        errorCount,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        rows: {
          create: stagedRows,
        },
      },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });

    return {
      success: true,
      batch,
      isStaleTemplate: detectedVersion < sheet.Version,
    };
  } catch (error: any) {
    console.error("stageScoreSheetImportCsv error:", error);
    return { success: false, error: error.message || "Failed to stage score import." };
  }
}

export async function commitScoreSheetImportBatch(batchId: string) {
  try {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        sheet: true,
        rows: { orderBy: { rowNumber: "asc" } },
      },
    });

    if (!batch) return { success: false, error: "Import batch not found." };
    if (batch.status === "COMMITTED") {
      return { success: false, error: "This import batch has already been committed." };
    }
    if (new Date(batch.expiresAt) < new Date()) {
      return { success: false, error: "Import batch has expired (24-hour limit). Please re-upload." };
    }
    if (batch.errorCount > 0 || batch.rows.some((r) => r.error)) {
      return {
        success: false,
        error: "Cannot commit import batch while validation errors exist. Fix the file and re-upload.",
      };
    }

    const students = await prisma.student.findMany({
      where: { ClassID: batch.sheet.ClassID },
      select: { StudentID: true, AdmissionNo: true },
    });
    const studentMap = new Map(
      students.map((s) => [s.AdmissionNo.trim().toUpperCase(), s.StudentID])
    );

    const scoresToUpsert = batch.rows
      .map((r) => {
        const studentId = studentMap.get(r.admissionNo.trim().toUpperCase());
        if (!studentId) return null;
        return {
          studentId,
          caScore: r.caTenths !== null ? r.caTenths / 10 : null,
          examScore: r.examTenths !== null ? r.examTenths / 10 : null,
          status: (r.status || "ENTERED") as "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Call the Single Write Path with source = IMPORT
    await upsertSheetScoresInternal({
      subjectId: batch.sheet.SubjectID,
      classId: batch.sheet.ClassID,
      termId: batch.sheet.TermID,
      scores: scoresToUpsert,
      source: "IMPORT",
      importBatchId: batch.id,
    });

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMMITTED",
        committedAt: new Date(),
      },
    });

    revalidatePath("/portal/teacher");
    revalidatePath("/portal/dashboard");
    return {
      success: true,
      message: `Committed ${scoresToUpsert.length} imported score rows through the verified single write path.`,
    };
  } catch (error: any) {
    console.error("commitScoreSheetImportBatch error:", error);
    return { success: false, error: error.message || "Failed to commit import batch." };
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
          WindowEndsAt: null,
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
 * Section B.4.1 & B.5 Two-Person Sheet Unlock with Separation of Duties (`unlock_sod`):
 * Step 1: Teacher or Form Master requests unlock with a mandatory written reason.
 * Step 2: A distinct ADMIN with `UNLOCK_SHEETS` capability approves the unlock (24-hour window).
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
      return {
        success: false,
        error: "A clear written reason (minimum 5 characters) is required to request an unlock.",
      };
    }

    const { user } = await requireRole([
      "PRINCIPAL",
      "TEACHER",
      "FORM_MASTER",
      "SUPER_ADMIN",
      "Teacher",
      "Admin",
    ]);

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

      // Record structured UnlockRequest row if not already open for this sheet
      const openReq = await tx.unlockRequest.findFirst({
        where: {
          sheetId: sub.id,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
      });

      if (!openReq) {
        await tx.unlockRequest.create({
          data: {
            sheetId: sub.id,
            requestedById: user.UserID,
            reason: reason.trim(),
            status: "REQUESTED",
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "SHEET_UNLOCK_REQUESTED",
        entity: "Subject_Submission",
        entityId: sub.id,
        reason: reason.trim(),
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
    const actor = await requireCapability("UNLOCK_SHEETS");

    if (!approvalNote || approvalNote.trim().length < 5) {
      return {
        success: false,
        error: "A written reason (minimum 5 characters) is mandatory to unlock a grade sheet.",
      };
    }

    const { user } = actor;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.subject_Submission.findUnique({
        where: { id: Number(submissionId) },
      });

      if (!existing) throw new Error("Submission sheet not found.");

      // Section B.2 & B.5 Separation of Duties: Requester cannot approve their own unlock request
      assertSeparationOfDuties(user.UserID, existing.UnlockRequestedBy, "sheet unlock request");

      const windowEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24h window (B.4.1)

      const sub = await tx.subject_Submission.update({
        where: { id: Number(submissionId) },
        data: {
          Status: "Draft",
          UnlockedBy: user.UserID,
          UnlockedReason: approvalNote.trim(),
          WindowEndsAt: windowEndsAt,
          Version: { increment: 1 },
        },
      });

      await tx.unlockRequest.updateMany({
        where: {
          sheetId: sub.id,
          status: "REQUESTED",
        },
        data: {
          status: "APPROVED",
          decidedById: user.UserID,
          decidedAt: new Date(),
          decisionNote: approvalNote.trim(),
          windowEndsAt,
        },
      });

      await writeAuditLog({
        tx,
        actorId: user.UserID,
        action: "SHEET_UNLOCKED_TO_DRAFT",
        entity: "Subject_Submission",
        entityId: sub.id,
        reason: approvalNote.trim(),
        oldValue: { status: existing.Status, requestedBy: existing.UnlockRequestedBy },
        newValue: {
          status: "Draft",
          unlockedBy: user.UserID,
          reason: sub.UnlockedReason,
          windowEndsAt: windowEndsAt.toISOString(),
        },
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

      // Mark all Submitted sheets in this class arm as Approved by the Form Master (Section B.4.1)
      await tx.subject_Submission.updateMany({
        where: {
          ClassID: Number(classId),
          TermID: Number(termId),
          Status: "Submitted",
        },
        data: {
          Status: "Approved",
          ApprovedBy: user.UserID,
          ApprovedAt: new Date(),
        },
      });

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
    return {
      success: true,
      message: "Class sheets approved and compiled for Admin sign-off and publication!",
    };
  } catch (error: any) {
    console.error("submitClassResultsToAdmin error:", error);
    return { success: false, error: error.message || "Failed to submit class to admin." };
  }
}

// ==========================================
// 4. BROADSHEET, SIGN-OFF & REPORT CARD VERSIONING (Section B.4.4 – B.4.6)
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
        Broadsheets: {
          where: { termId: Number(targetTermId) },
        },
        Students: {
          include: {
            Results: {
              where: { TermID: Number(targetTermId) },
              include: { Subject: true },
            },
            FormMasterReports: {
              where: { TermID: Number(targetTermId) },
            },
            ReportCards: {
              where: { termId: Number(targetTermId), supersededAt: null },
              take: 1,
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

    // Compute rankings via pure domain function (Section B.4.4)
    const rankingInputs = classData.Students.map((student) => {
      const enteredTotals: number[] = [];
      let hasPendingSubject = false;

      for (const r of student.Results) {
        if (r.Status === "PENDING") {
          hasPendingSubject = true;
        } else if (r.Status === "ENTERED" || !r.Status) {
          enteredTotals.push(r.TotalScoreTenths ?? Math.round(r.TotalScore * 10));
        }
      }

      return {
        studentId: student.StudentID,
        isWithdrawn: false,
        hasPendingSubject,
        enteredSubjectTotalsTenths: enteredTotals,
      };
    });

    const ranked = computeBroadsheetRankings(rankingInputs);
    const rankedByStudentId = new Map(ranked.map((r) => [r.studentId, r]));

    const studentSummaries = classData.Students.map((student) => {
      const scoreMap: Record<
        number,
        { ca: number; exam: number; total: number; grade: string; status: string }
      > = {};

      student.Results.forEach((r) => {
        scoreMap[r.SubjectID] = {
          ca: r.CAScore,
          exam: r.ExamScore,
          total: r.TotalScore,
          grade: r.Grade,
          status: r.Status || "ENTERED",
        };
      });

      const rnk = rankedByStudentId.get(student.StudentID);
      const totalMarks = rnk ? rnk.totalTenths / 10 : 0;
      const average = rnk ? parseFloat((rnk.averageTenths / 10).toFixed(1)) : 0;

      return {
        studentId: student.StudentID,
        admissionNo: student.AdmissionNo,
        name:
          student.PreferredName ||
          `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
          student.AdmissionNo,
        scoreMap,
        totalMarks,
        average,
        subjectCount: rnk?.enteredCount ?? 0,
        isIncomplete: rnk?.isIncomplete ?? false,
        report: student.FormMasterReports[0] || null,
        currentReportCardVersion: student.ReportCards?.[0]?.version ?? null,
        position: rnk?.position ?? 1,
      };
    });

    studentSummaries.sort((a, b) => {
      if ((a.position ?? 9999) !== (b.position ?? 9999)) {
        return (a.position ?? 9999) - (b.position ?? 9999);
      }
      return b.totalMarks - a.totalMarks;
    });

    return {
      success: true,
      classData,
      broadsheetState: classData.Broadsheets?.[0] || null,
      term,
      subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
      studentSummaries,
    };
  } catch (error: any) {
    console.error("getClassBroadsheet error:", error);
    return { success: false, error: error.message || "Failed to generate class broadsheet" };
  }
}

/**
 * Section B.4.5: Compute Class Broadsheet (`OPEN` -> `COMPUTED`), increment `computeVersion`, clear `isStale`.
 */
export async function computeClassBroadsheetAction(classId: number, termId: number) {
  try {
    const actor = await requireCapability("APPROVE_RESULTS");
    const bsRes = await getClassBroadsheet(classId, termId);
    if (!bsRes.success || !bsRes.studentSummaries) {
      return { success: false, error: bsRes.error || "Failed to compute class broadsheet." };
    }

    const subjectStats: Record<
      number,
      { count: number; averageTenths: number; highestTenths: number; lowestTenths: number }
    > = {};

    for (const subj of bsRes.subjects || []) {
      const enteredTenths: number[] = [];
      for (const st of bsRes.studentSummaries) {
        const sc = st.scoreMap[subj.id];
        if (sc && sc.status !== "ABSENT" && sc.status !== "EXEMPT" && sc.status !== "PENDING") {
          enteredTenths.push(Math.round(sc.total * 10));
        }
      }
      subjectStats[subj.id] = computeSubjectStats(enteredTenths);
    }

    const broadsheet = await prisma.$transaction(async (tx) => {
      const upserted = await tx.classBroadsheet.upsert({
        where: {
          classArmId_termId: {
            classArmId: Number(classId),
            termId: Number(termId),
          },
        },
        update: {
          status: "COMPUTED",
          computeVersion: { increment: 1 },
          isStale: false,
          computedAt: new Date(),
          computedById: actor.UserID,
          statsJson: {
            subjectStats,
            studentCount: bsRes.studentSummaries.length,
          },
        },
        create: {
          classArmId: Number(classId),
          termId: Number(termId),
          status: "COMPUTED",
          computeVersion: 1,
          isStale: false,
          computedAt: new Date(),
          computedById: actor.UserID,
          statsJson: {
            subjectStats,
            studentCount: bsRes.studentSummaries.length,
          },
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "BROADSHEET_COMPUTED",
        entity: "ClassBroadsheet",
        entityId: upserted.id,
        newValue: {
          classId,
          termId,
          computeVersion: upserted.computeVersion,
        },
      });

      return upserted;
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/teacher");
    return {
      success: true,
      broadsheet,
      message: `Broadsheet computed (v${broadsheet.computeVersion}). Ready for Principal sign-off.`,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to compute broadsheet." };
  }
}

/**
 * Section B.4.5: Sign off Class Broadsheet (`COMPUTED` -> `SIGNED_OFF`) and record Principal's remark.
 */
export async function signOffClassBroadsheetAction(
  classId: number,
  termId: number,
  principalNote: string
) {
  try {
    const actor = await requireCapability("APPROVE_RESULTS");
    const note = (principalNote || "Satisfactory academic performance. Approved for publication.").trim();

    const broadsheet = await prisma.$transaction(async (tx) => {
      const upserted = await tx.classBroadsheet.upsert({
        where: {
          classArmId_termId: {
            classArmId: Number(classId),
            termId: Number(termId),
          },
        },
        update: {
          status: "SIGNED_OFF",
          signedOffAt: new Date(),
          signedOffById: actor.UserID,
          principalNote: note,
        },
        create: {
          classArmId: Number(classId),
          termId: Number(termId),
          status: "SIGNED_OFF",
          computeVersion: 1,
          computedAt: new Date(),
          computedById: actor.UserID,
          signedOffAt: new Date(),
          signedOffById: actor.UserID,
          principalNote: note,
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "BROADSHEET_SIGNED_OFF",
        entity: "ClassBroadsheet",
        entityId: upserted.id,
        reason: note,
        newValue: { classId, termId, principalNote: note },
      });

      return upserted;
    });

    revalidatePath("/portal/admin/results");
    return { success: true, broadsheet, message: "Broadsheet signed off by Principal." };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to sign off broadsheet." };
  }
}

/**
 * Section B.4.5 & B.4.6: Publish Class Broadsheet (`SIGNED_OFF` -> `PUBLISHED`) and generate versioned
 * `ReportCard` snapshots (superseding any earlier active version with `changeReason`).
 */
export async function publishClassBroadsheetAction(
  classId: number,
  termId: number,
  changeReason?: string
) {
  try {
    const actor = await requireCapability("PUBLISH_RESULTS");
    const bsRes = await getClassBroadsheet(classId, termId);
    if (!bsRes.success || !bsRes.studentSummaries) {
      return { success: false, error: bsRes.error || "Failed to load class broadsheet for publishing." };
    }

    let publishedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const st of bsRes.studentSummaries) {
        const currentActive = await tx.reportCard.findFirst({
          where: {
            studentId: st.studentId,
            termId: Number(termId),
            supersededAt: null,
          },
          orderBy: { version: "desc" },
        });

        const nextVersion = currentActive ? currentActive.version + 1 : 1;

        if (currentActive) {
          await tx.reportCard.update({
            where: { id: currentActive.id },
            data: {
              supersededAt: new Date(),
              changeReason: changeReason || "Re-published after approved score update",
            },
          });
        }

        const snapshotPayload = {
          studentId: st.studentId,
          admissionNo: st.admissionNo,
          studentName: st.name,
          className: bsRes.classData.ClassName,
          termName: bsRes.term?.TermName,
          sessionName: bsRes.term?.SessionName,
          version: nextVersion,
          totalMarks: st.totalMarks,
          average: st.average,
          position: st.position,
          scores: st.scoreMap,
          formMasterRemark: st.report?.FormMasterRemark || "Good conduct and effort.",
          principalRemark:
            bsRes.broadsheetState?.principalNote ||
            st.report?.PrincipalRemark ||
            "Approved and published.",
          publishedAt: new Date().toISOString(),
        };

        const dataSha256 = crypto
          .createHash("sha256")
          .update(JSON.stringify(snapshotPayload))
          .digest("hex");

        await tx.reportCard.create({
          data: {
            studentId: st.studentId,
            termId: Number(termId),
            version: nextVersion,
            dataJson: snapshotPayload,
            dataSha256,
            publishedAt: new Date(),
            publishedById: actor.UserID,
            changeReason: nextVersion > 1 ? changeReason || "Updated publication" : null,
          },
        });

        await tx.form_Master_Report.upsert({
          where: {
            StudentID_TermID: {
              StudentID: st.studentId,
              TermID: Number(termId),
            },
          },
          update: { Status: "Published", Version: { increment: 1 } },
          create: {
            StudentID: st.studentId,
            TermID: Number(termId),
            FormMasterRemark: "Good overall performance.",
            PrincipalRemark: "Approved and published.",
            Status: "Published",
            Version: 1,
          },
        });

        publishedCount++;
      }

      const bs = await tx.classBroadsheet.upsert({
        where: {
          classArmId_termId: {
            classArmId: Number(classId),
            termId: Number(termId),
          },
        },
        update: {
          status: "PUBLISHED",
          isStale: false,
          publishedAt: new Date(),
          publishedById: actor.UserID,
        },
        create: {
          classArmId: Number(classId),
          termId: Number(termId),
          status: "PUBLISHED",
          computeVersion: 1,
          isStale: false,
          computedAt: new Date(),
          computedById: actor.UserID,
          publishedAt: new Date(),
          publishedById: actor.UserID,
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        action: "BROADSHEET_PUBLISHED",
        entity: "ClassBroadsheet",
        entityId: bs.id,
        reason: changeReason,
        newValue: { classId, termId, publishedCount },
      });
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/results");
    return {
      success: true,
      message: `Published versioned report cards for ${publishedCount} students in ${bsRes.classData.ClassName}.`,
    };
  } catch (error: any) {
    console.error("publishClassBroadsheetAction error:", error);
    return { success: false, error: error.message || "Failed to publish broadsheet." };
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
    await requireRole(["PRINCIPAL", "SUPER_ADMIN", "TEACHER", "Admin", "Teacher"]);

    const { admissionNo, subjectName, caScore, examScore } = data;
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

    await upsertSheetScoresInternal({
      subjectId: subject.SubjectID,
      classId: student.ClassID,
      termId: term.TermID,
      scores: [
        {
          studentId: student.StudentID,
          caScore: Math.min(Math.max(0, Number(caScore)), 40),
          examScore: Math.min(Math.max(0, Number(examScore)), 60),
          status: "ENTERED",
        },
      ],
      source: "GRID",
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
        error:
          "CSV file is empty or missing headers. Please ensure headers are: AdmissionNo, SubjectName, CAScore, ExamScore",
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
      if (/^[=+\-@]/.test(caStr) || /^[=+\-@]/.test(examStr)) {
        errors.push(`Row ${i + 1}: Formula expressions are prohibited.`);
        continue;
      }

      const caScore = parseFloat(caStr);
      const examScore = parseFloat(examStr);

      if (
        isNaN(caScore) ||
        isNaN(examScore) ||
        caScore < 0 ||
        caScore > 40 ||
        examScore < 0 ||
        examScore > 60
      ) {
        errors.push(`Row ${i + 1}: Invalid score range for ${admissionNo} (CA 0-40, Exam 0-60)`);
        continue;
      }

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
      const { grade, remark } = calculateGradeFromTenths(totalTenths);

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
          TotalScore: totalTenths / 10,
          CAScoreTenths: caTenths,
          ExamScoreTenths: examTenths,
          TotalScoreTenths: totalTenths,
          Grade: grade,
          Remark: remark,
          Status: "ENTERED",
          Source: "IMPORT",
          UpdatedByID: user.UserID,
          Version: { increment: 1 },
        },
        create: {
          StudentID: student.StudentID,
          SubjectID: subject.SubjectID,
          TermID: term.TermID,
          CAScore: caScore,
          ExamScore: examScore,
          TotalScore: totalTenths / 10,
          CAScoreTenths: caTenths,
          ExamScoreTenths: examTenths,
          TotalScoreTenths: totalTenths,
          Grade: grade,
          Remark: remark,
          Status: "ENTERED",
          Source: "IMPORT",
          UpdatedByID: user.UserID,
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
      message: `Successfully uploaded ${successCount} results. ${
        errors.length > 0 ? "Errors: " + errors.join("; ") : ""
      }`,
    };
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return { error: error.message || "Failed to process bulk upload." };
  }
}
