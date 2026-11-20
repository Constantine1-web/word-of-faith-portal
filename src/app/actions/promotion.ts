"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireCapability,
  requireClassTeacherOrAdmin,
  requireRole,
  writeAuditLog,
} from "@/lib/authz";
import { SAFE_USER_SELECT, validateInput } from "@/lib/security";
import {
  computeCumulativeBroadsheet,
  resolveTermOrdinal,
  type CumulativeDivisorMode,
} from "@/lib/cumulative-broadsheet";

function inferNextClassSuggestion(
  sourceClassName: string,
  allClasses: Array<{ ClassID: number; ClassName: string; Level: string; Arm: string }>
): { targetClassId: number | null; isGraduatingClass: boolean } {
  const norm = (sourceClassName || "").trim();
  const patterns: Array<{ regex: RegExp; nextPrefix: (m: RegExpMatchArray) => string | null; graduating?: boolean }> = [
    { regex: /^(Creche|KG\s*1)/i, nextPrefix: () => "KG 2" },
    { regex: /^KG\s*2/i, nextPrefix: () => "Nursery 1" },
    { regex: /^Nursery\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 3 ? `Nursery ${Number(m[1]) + 1}` : "Primary 1") },
    { regex: /^Primary\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 6 ? `Primary ${Number(m[1]) + 1}` : null), graduating: false },
    { regex: /^Pry\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 6 ? `Pry ${Number(m[1]) + 1}` : null), graduating: false },
    { regex: /^JSS\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 3 ? `JSS ${Number(m[1]) + 1}` : "SS 1") },
    { regex: /^JS\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 3 ? `JS ${Number(m[1]) + 1}` : "SS 1") },
    { regex: /^SS\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 3 ? `SS ${Number(m[1]) + 1}` : null) },
    { regex: /^SSS\s*(\d+)/i, nextPrefix: (m) => (Number(m[1]) < 3 ? `SSS ${Number(m[1]) + 1}` : null) },
  ];

  for (const pat of patterns) {
    const match = norm.match(pat.regex);
    if (match) {
      const nextBase = pat.nextPrefix(match);
      if (!nextBase) {
        return { targetClassId: null, isGraduatingClass: true };
      }
      // Try matching same arm first (e.g. JSS 1 Gold -> JSS 2 Gold)
      const sourceObj = allClasses.find((c) => c.ClassName === sourceClassName);
      const armLower = (sourceObj?.Arm || "").trim().toLowerCase();
      const candidateWithArm = allClasses.find((c) => {
        const cn = c.ClassName.toLowerCase();
        return cn.startsWith(nextBase.toLowerCase()) && (!armLower || cn.includes(armLower));
      });
      if (candidateWithArm) {
        return { targetClassId: candidateWithArm.ClassID, isGraduatingClass: false };
      }
      const anyMatch = allClasses.find((c) =>
        c.ClassName.toLowerCase().startsWith(nextBase.toLowerCase())
      );
      if (anyMatch) {
        return { targetClassId: anyMatch.ClassID, isGraduatingClass: false };
      }
    }
  }

  return { targetClassId: null, isGraduatingClass: false };
}

function suggestNextAcademicSession(currentSession: string): string {
  const match = (currentSession || "").match(/(\d{4})\s*\/\s*(\d{4})/);
  if (!match) return "2027/2028";
  const y1 = Number(match[1]) + 1;
  const y2 = Number(match[2]) + 1;
  return `${y1}/${y2}`;
}

export async function getCumulativeClassBroadsheetData(params: {
  classId: number;
  sessionName?: string;
  passThresholdPct?: number;
  divisorMode?: CumulativeDivisorMode;
}) {
  try {
    await requireRole(["TEACHER", "FORM_MASTER", "PRINCIPAL", "SUPER_ADMIN", "EXAM_OFFICER", "Teacher", "Admin"]);
    await requireClassTeacherOrAdmin(Number(params.classId));

    const allTerms = await prisma.academic_Term.findMany({
      orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
    });

    const sessionsAvailable = Array.from(new Set(allTerms.map((t) => t.SessionName)));
    const activeTerm = allTerms.find((t) => t.IsActive) || allTerms[0] || null;
    const targetSession =
      params.sessionName && sessionsAvailable.includes(params.sessionName)
        ? params.sessionName
        : activeTerm?.SessionName || sessionsAvailable[0] || "2026/2027";

    const sessionTerms = allTerms
      .filter((t) => t.SessionName === targetSession)
      .map((t) => ({
        TermID: t.TermID,
        SessionName: t.SessionName,
        TermName: t.TermName,
      }));
    const sessionTermIds = sessionTerms.map((t) => t.TermID);

    const classData = await prisma.class.findUnique({
      where: { ClassID: Number(params.classId) },
      include: {
        FormMaster: { select: SAFE_USER_SELECT },
      },
    });

    if (!classData) {
      return { success: false, error: "Class arm not found." };
    }

    // Include students currently in the class OR historically enrolled in this class during this session
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { ClassID: Number(params.classId) },
          ...(sessionTermIds.length > 0
            ? [
                {
                  Enrollments: {
                    some: {
                      ClassID: Number(params.classId),
                      TermID: { in: sessionTermIds },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        Results: {
          where: sessionTermIds.length > 0 ? { TermID: { in: sessionTermIds } } : { TermID: -1 },
          include: { Subject: true },
        },
      },
      orderBy: [{ LastName: "asc" }, { FirstName: "asc" }, { StudentID: "asc" }],
    });

    const threshold = Math.min(Math.max(Number(params.passThresholdPct ?? 50), 0), 100);
    const divisorMode: CumulativeDivisorMode = params.divisorMode === "ALL_SESSION_TERMS" ? "ALL_SESSION_TERMS" : "ENTERED_TERMS";

    const computed = computeCumulativeBroadsheet({
      students,
      sessionTerms,
      classLevel: classData.Level,
      passThresholdPct: threshold,
      divisorMode,
    });

    return {
      success: true,
      classData,
      sessionName: targetSession,
      sessionsAvailable,
      passThresholdPct: threshold,
      divisorMode,
      orderedTerms: computed.orderedTerms,
      subjects: computed.subjects,
      rows: computed.rows,
    };
  } catch (error: unknown) {
    console.error("getCumulativeClassBroadsheetData error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load cumulative broadsheet.",
    };
  }
}

export async function previewClassPromotionBatch(params: {
  sourceClassId: number;
  sourceSessionName?: string;
  passThresholdPct?: number;
  divisorMode?: CumulativeDivisorMode;
}) {
  try {
    await requireRole(["PRINCIPAL", "SUPER_ADMIN", "ADMISSIONS", "Admin"]);
    await requireCapability("MANAGE_STUDENTS");

    const allClasses = await prisma.class.findMany({
      orderBy: [{ Level: "asc" }, { ClassName: "asc" }],
    });
    const allTerms = await prisma.academic_Term.findMany({
      orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
    });

    const sessionsAvailable = Array.from(new Set(allTerms.map((t) => t.SessionName)));
    const activeTerm = allTerms.find((t) => t.IsActive) || allTerms[0] || null;
    const sourceSession =
      params.sourceSessionName && sessionsAvailable.includes(params.sourceSessionName)
        ? params.sourceSessionName
        : activeTerm?.SessionName || sessionsAvailable[0] || "2026/2027";

    const sessionTerms = allTerms.filter((t) => t.SessionName === sourceSession);
    const sessionTermIds = sessionTerms.map((t) => t.TermID);

    const sourceClass = allClasses.find((c) => c.ClassID === Number(params.sourceClassId));
    if (!sourceClass) {
      return { success: false, error: "Source class arm not found." };
    }

    // Only current members of sourceClass are eligible for batch transition
    const currentStudents = await prisma.student.findMany({
      where: {
        ClassID: Number(params.sourceClassId),
      },
      include: {
        Results: {
          where: sessionTermIds.length > 0 ? { TermID: { in: sessionTermIds } } : { TermID: -1 },
          include: { Subject: true },
        },
      },
      orderBy: [{ LastName: "asc" }, { FirstName: "asc" }, { StudentID: "asc" }],
    });

    const threshold = Math.min(Math.max(Number(params.passThresholdPct ?? 50), 0), 100);
    const divisorMode: CumulativeDivisorMode = params.divisorMode === "ALL_SESSION_TERMS" ? "ALL_SESSION_TERMS" : "ENTERED_TERMS";

    const computed = computeCumulativeBroadsheet({
      students: currentStudents,
      sessionTerms,
      classLevel: sourceClass.Level,
      passThresholdPct: threshold,
      divisorMode,
    });

    const suggestion = inferNextClassSuggestion(sourceClass.ClassName, allClasses);
    const nextSessionName = suggestNextAcademicSession(sourceSession);
    const suggestedTargetTerm =
      allTerms.find(
        (t) => t.SessionName === nextSessionName && resolveTermOrdinal(t.TermName) === 1
      ) ||
      allTerms.find((t) => t.SessionName === nextSessionName) ||
      null;

    const previewRows = computed.rows.map((row) => {
      let suggestedDecision: "PROMOTED" | "REPEATING" | "GRADUATED" | "WITHDRAWN" = "PROMOTED";
      if (row.enrolmentStatus.toUpperCase() === "WITHDRAWN" || row.standing === "WITHDRAWN") {
        suggestedDecision = "WITHDRAWN";
      } else if (row.enrolmentStatus.toUpperCase() === "GRADUATED") {
        suggestedDecision = "GRADUATED";
      } else if (row.standing === "REPEAT") {
        suggestedDecision = "REPEATING";
      } else if (suggestion.isGraduatingClass) {
        suggestedDecision = "GRADUATED";
      } else {
        suggestedDecision = "PROMOTED";
      }

      return {
        studentId: row.studentId,
        wofsStudentId: row.wofsStudentId,
        fullName: row.fullName,
        enrolmentStatus: row.enrolmentStatus,
        t1Average: row.t1Average,
        t2Average: row.t2Average,
        t3Average: row.t3Average,
        annualAverage: row.annualAverage,
        subjectsCount: row.subjectsCount,
        position: row.position,
        standing: row.standing,
        suggestedDecision,
      };
    });

    return {
      success: true,
      sourceClass,
      sourceSessionName: sourceSession,
      sessionsAvailable,
      orderedTerms: computed.orderedTerms,
      passThresholdPct: threshold,
      divisorMode,
      allClasses,
      allTerms,
      suggestedTargetClassId: suggestion.targetClassId,
      suggestedIsGraduatingClass: suggestion.isGraduatingClass,
      suggestedTargetSessionName: nextSessionName,
      suggestedTargetTermId: suggestedTargetTerm?.TermID || null,
      rows: previewRows,
    };
  } catch (error: unknown) {
    console.error("previewClassPromotionBatch error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load promotion preview.",
    };
  }
}

const PromotionExecuteSchema = z.object({
  sourceClassId: z.number().int().positive(),
  sourceSessionName: z.string().trim().min(4).max(32),
  targetClassId: z.number().int().positive().nullable().optional(),
  repeatClassId: z.number().int().positive().nullable().optional(),
  targetTermId: z.number().int().positive().nullable().optional(),
  targetSessionName: z.string().trim().max(32).optional(),
  isGraduatingClass: z.boolean().default(false),
  passThresholdPct: z.number().min(0).max(100).default(50),
  reason: z.string().trim().max(300).optional(),
  decisions: z
    .array(
      z.object({
        studentId: z.number().int().positive(),
        decision: z.enum(["PROMOTED", "REPEATING", "GRADUATED", "WITHDRAWN"]),
      })
    )
    .min(1)
    .max(500),
});

export async function executeBatchClassPromotion(rawInput: z.infer<typeof PromotionExecuteSchema>) {
  try {
    const actor = await requireRole(["PRINCIPAL", "SUPER_ADMIN", "ADMISSIONS", "Admin"]);
    await requireCapability("MANAGE_STUDENTS");

    const input = validateInput(PromotionExecuteSchema, rawInput);

    const hasPromoted = input.decisions.some((d) => d.decision === "PROMOTED");
    if (hasPromoted && !input.isGraduatingClass && !input.targetClassId) {
      return {
        success: false,
        error: "Please select a destination Target Class for promoted students (or enable Graduating Class mode).",
      };
    }
    if (
      hasPromoted &&
      !input.isGraduatingClass &&
      input.targetClassId === input.sourceClassId
    ) {
      return {
        success: false,
        error: "Destination Target Class for promoted students cannot be the same as the source class. Select the next class arm or mark students as Repeating.",
      };
    }

    const sourceClass = await prisma.class.findUnique({
      where: { ClassID: input.sourceClassId },
    });
    if (!sourceClass) {
      return { success: false, error: "Source class not found." };
    }

    let targetClass: { ClassID: number; ClassName: string } | null = null;
    if (input.targetClassId) {
      targetClass = await prisma.class.findUnique({
        where: { ClassID: input.targetClassId },
        select: { ClassID: true, ClassName: true },
      });
      if (!targetClass) {
        return { success: false, error: "Destination target class not found." };
      }
    }

    if (input.repeatClassId) {
      const repCls = await prisma.class.findUnique({
        where: { ClassID: input.repeatClassId },
        select: { ClassID: true },
      });
      if (!repCls) {
        return { success: false, error: "Selected repeat class arm not found." };
      }
    }

    let targetTerm: { TermID: number; SessionName: string } | null = null;
    if (input.targetTermId) {
      targetTerm = await prisma.academic_Term.findUnique({
        where: { TermID: input.targetTermId },
        select: { TermID: true, SessionName: true },
      });
    }

    // Resolve closing term in the source session to stamp historical Enrollment records
    const sourceSessionTerms = await prisma.academic_Term.findMany({
      where: { SessionName: input.sourceSessionName },
      orderBy: { TermID: "desc" },
    });
    const orderedSourceTerms = [...sourceSessionTerms].sort(
      (a, b) => resolveTermOrdinal(b.TermName) - resolveTermOrdinal(a.TermName)
    );
    const closingSourceTerm = orderedSourceTerms[0] || null;

    const requestedIds = input.decisions.map((d) => d.studentId);
    const eligibleStudents = await prisma.student.findMany({
      where: {
        ClassID: input.sourceClassId,
        StudentID: { in: requestedIds },
      },
      select: {
        StudentID: true,
        AdmissionNo: true,
        ClassID: true,
        EnrolmentStatus: true,
      },
    });

    const eligibleMap = new Map(eligibleStudents.map((s) => [s.StudentID, s]));
    if (eligibleMap.size === 0) {
      return {
        success: false,
        error: "No matching students remain in the selected source class.",
      };
    }

    const counts = {
      promoted: 0,
      graduated: 0,
      repeating: 0,
      withdrawn: 0,
    };

    const effectiveTargetYear =
      targetTerm?.SessionName ||
      input.targetSessionName?.trim() ||
      suggestNextAcademicSession(input.sourceSessionName);
    const repeatDestClassId = input.repeatClassId || input.sourceClassId;

    await prisma.$transaction(async (tx) => {
      for (const item of input.decisions) {
        const student = eligibleMap.get(item.studentId);
        if (!student) continue;

        const effectiveDecision =
          item.decision === "PROMOTED" && input.isGraduatingClass ? "GRADUATED" : item.decision;

        // 1. Stamp closing session Enrollment record when a source term exists
        if (closingSourceTerm) {
          const closingStatus =
            effectiveDecision === "GRADUATED"
              ? "PROMOTED"
              : effectiveDecision === "REPEATING"
              ? "REPEATING"
              : effectiveDecision === "WITHDRAWN"
              ? "WITHDRAWN"
              : "PROMOTED";

          await tx.enrollment.upsert({
            where: {
              StudentID_ClassID_TermID: {
                StudentID: student.StudentID,
                ClassID: input.sourceClassId,
                TermID: closingSourceTerm.TermID,
              },
            },
            update: {
              Status: closingStatus,
              AcademicYear: input.sourceSessionName,
            },
            create: {
              StudentID: student.StudentID,
              ClassID: input.sourceClassId,
              TermID: closingSourceTerm.TermID,
              AcademicYear: input.sourceSessionName,
              Status: closingStatus,
            },
          });
        }

        // 2. Apply transition while preserving permanent AdmissionNo (WOFS-STU-...)
        if (effectiveDecision === "PROMOTED" && targetClass) {
          await tx.student.update({
            where: { StudentID: student.StudentID },
            data: {
              ClassID: targetClass.ClassID,
              EnrolmentStatus: "ACTIVE",
            },
          });
          if (targetTerm) {
            await tx.enrollment.upsert({
              where: {
                StudentID_ClassID_TermID: {
                  StudentID: student.StudentID,
                  ClassID: targetClass.ClassID,
                  TermID: targetTerm.TermID,
                },
              },
              update: {
                Status: "ACTIVE",
                AcademicYear: effectiveTargetYear,
              },
              create: {
                StudentID: student.StudentID,
                ClassID: targetClass.ClassID,
                TermID: targetTerm.TermID,
                AcademicYear: effectiveTargetYear,
                Status: "ACTIVE",
              },
            });
          }
          counts.promoted++;
        } else if (effectiveDecision === "GRADUATED") {
          await tx.student.update({
            where: { StudentID: student.StudentID },
            data: {
              EnrolmentStatus: "GRADUATED",
            },
          });
          counts.graduated++;
        } else if (effectiveDecision === "REPEATING") {
          await tx.student.update({
            where: { StudentID: student.StudentID },
            data: {
              ClassID: repeatDestClassId,
              EnrolmentStatus: "ACTIVE",
            },
          });
          if (targetTerm) {
            await tx.enrollment.upsert({
              where: {
                StudentID_ClassID_TermID: {
                  StudentID: student.StudentID,
                  ClassID: repeatDestClassId,
                  TermID: targetTerm.TermID,
                },
              },
              update: {
                Status: "REPEATING",
                AcademicYear: effectiveTargetYear,
              },
              create: {
                StudentID: student.StudentID,
                ClassID: repeatDestClassId,
                TermID: targetTerm.TermID,
                AcademicYear: effectiveTargetYear,
                Status: "REPEATING",
              },
            });
          }
          counts.repeating++;
        } else if (effectiveDecision === "WITHDRAWN") {
          await tx.student.update({
            where: { StudentID: student.StudentID },
            data: {
              EnrolmentStatus: "WITHDRAWN",
            },
          });
          counts.withdrawn++;
        }
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "BATCH_CLASS_PROMOTION",
        entity: "Class",
        entityId: String(input.sourceClassId),
        reason: input.reason || `End-of-session class transition (${input.sourceSessionName})`,
        newValue: {
          sourceClassName: sourceClass.ClassName,
          sourceSessionName: input.sourceSessionName,
          targetClassName: targetClass?.ClassName || (input.isGraduatingClass ? "GRADUATED" : null),
          targetTermId: targetTerm?.TermID || null,
          targetSessionName: effectiveTargetYear,
          passThresholdPct: input.passThresholdPct,
          counts,
        },
      });
    });

    revalidatePath("/portal/admin/results");
    revalidatePath("/portal/admin/students");
    revalidatePath("/portal/admin/classes");
    revalidatePath("/portal/dashboard");

    return {
      success: true,
      counts,
      message: `Transition complete for ${sourceClass.ClassName}: ${counts.promoted} promoted${
        targetClass ? ` to ${targetClass.ClassName}` : ""
      }, ${counts.graduated} graduated, ${counts.repeating} repeating, ${counts.withdrawn} withdrawn. All WOFS Student IDs preserved.`,
    };
  } catch (error: unknown) {
    console.error("executeBatchClassPromotion error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to execute batch promotion.",
    };
  }
}
