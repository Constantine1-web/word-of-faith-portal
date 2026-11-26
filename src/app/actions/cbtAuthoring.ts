"use server";

import crypto from "crypto";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog, can } from "@/lib/authz";
import { validateInput, rateLimit } from "@/lib/security";
import { mapSubjectNameToCbtCodes } from "@/lib/cbt-constants";
import { extractQuestionsFromDocument, type ScannedCbtQuestionDraft } from "@/lib/cbt-ocr";
import {
  encryptExamVaultString,
  decryptExamVaultString,
  encryptExamOptionsJson,
  decryptExamOptionsJson,
  decryptAnswerKeyValue,
} from "@/lib/exam-vault";
import {
  normalizeCbtSubjectCode,
  parseSchoolCbtQuestionsCsv,
} from "@/lib/cbt-csv";

const CBT_VIEW_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMIN",
  "BURSAR",
  "ADMISSIONS",
  "TEACHER",
  "FORM_MASTER",
  "Admin",
  "Teacher",
];

const CBT_AUTHOR_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMIN",
  "TEACHER",
  "FORM_MASTER",
  "Admin",
  "Teacher",
];

function isCbtAdminActor(actor: { roles: Set<string>; capabilities?: Set<any> }): boolean {
  return (
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL") ||
    actor.roles.has("ADMIN") ||
    actor.roles.has("Admin") ||
    can(actor, "MANAGE_CBT")
  );
}

async function getTeacherAllowedCbtSubjects(userId: number): Promise<Set<string>> {
  const allocations = await prisma.teacher_Subject_Map.findMany({
    where: { TeacherID: userId },
    include: {
      Subject: { select: { SubjectName: true, SubjectCode: true } },
    },
  });
  const allowed = new Set<string>();
  for (const alloc of allocations) {
    for (const code of mapSubjectNameToCbtCodes(alloc.Subject?.SubjectName)) {
      allowed.add(code);
    }
    if (alloc.Subject?.SubjectCode) {
      allowed.add(normalizeCbtSubjectCode(alloc.Subject.SubjectCode));
    }
  }
  return allowed;
}

async function assertCanManageSubjectCode(
  actor: { UserID: number; roles: Set<string>; capabilities?: Set<any> },
  subjectCode: string
) {
  if (isCbtAdminActor(actor)) return;
  const allowed = await getTeacherAllowedCbtSubjects(actor.UserID);
  if (allowed.size > 0 && !allowed.has(normalizeCbtSubjectCode(subjectCode))) {
    throw new Error(
      `Authorization denied: You are only assigned to teach ${Array.from(allowed).join(", ").toUpperCase()}. Ask Admin if you need access to "${subjectCode}".`
    );
  }
}

export interface SchoolInternalQuestionRow {
  id: string;
  subjectCode: string;
  examBody: string;
  bankScope: "OPEN_BANK" | "EXAM_ONLY";
  targetClassLevel: string | null;
  authoredById: number | null;
  submissionId?: string | null;
  isEncrypted?: boolean;
  topic: string;
  stem: string;
  imageUrl: string | null;
  options: Array<{ key: string; text: string }>;
  correctKey: "a" | "b" | "c" | "d";
  explanation: string;
  isActive: boolean;
  authorLabel: string;
  usageCount: number;
  createdAt: string;
}

export interface CbtSubjectAnalyticsRow {
  subjectCode: string;
  totalAttempts: number;
  submittedCount: number;
  terminatedCount: number;
  avgScorePct: number;
  highestScorePct: number;
  passRatePct: number;
  avgStrikes: number;
}

export async function getAdminCbtBankAndAnalytics(filters?: {
  subjectCode?: string;
  bankScope?: "ALL" | "OPEN_BANK" | "EXAM_ONLY";
  search?: string;
  includeInactive?: boolean;
}) {
  try {
    await requireRole(CBT_VIEW_ROLES);

    const subjectFilter = filters?.subjectCode
      ? normalizeCbtSubjectCode(filters.subjectCode)
      : "";
    const scopeFilter =
      filters?.bankScope === "OPEN_BANK" || filters?.bankScope === "EXAM_ONLY"
        ? filters.bankScope
        : null;
    const q = (filters?.search || "").trim();

    const [questions, attempts, distinctInternalSubjects] = await Promise.all([
      prisma.cbtQuestion.findMany({
        where: {
          provider: "SCHOOL_INTERNAL",
          ...(filters?.includeInactive ? {} : { isActive: true }),
          ...(scopeFilter ? { bankScope: scopeFilter } : {}),
          ...(subjectFilter && subjectFilter !== "all" ? { subjectCode: subjectFilter } : {}),
          ...(q
            ? {
                OR: [
                  { stem: { contains: q, mode: "insensitive" } },
                  { topic: { contains: q, mode: "insensitive" } },
                  { subjectCode: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          answerKey: true,
          _count: { select: { attemptItems: true } },
        },
        orderBy: { fetchedAt: "desc" },
        take: 250,
      }),
      prisma.cbtAttempt.findMany({
        select: {
          id: true,
          subjectCode: true,
          examBody: true,
          mode: true,
          status: true,
          scoreTenths: true,
          hardStrikes: true,
          questionCount: true,
          startedAt: true,
          submittedAt: true,
          student: {
            select: {
              AdmissionNo: true,
              PreferredName: true,
              FirstName: true,
              LastName: true,
              Class: { select: { ClassName: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: 1000,
      }),
      prisma.cbtQuestion.groupBy({
        by: ["subjectCode"],
        where: { provider: "SCHOOL_INTERNAL", isActive: true },
        _count: { id: true },
      }),
    ]);

    const questionRows: SchoolInternalQuestionRow[] = questions.map((row) => {
      return {
        id: row.id,
        subjectCode: row.subjectCode,
        examBody: row.examBody,
        bankScope: row.bankScope === "EXAM_ONLY" ? "EXAM_ONLY" : "OPEN_BANK",
        targetClassLevel: row.targetClassLevel || null,
        authoredById: row.authoredById ?? null,
        submissionId: row.submissionId ?? null,
        isEncrypted: row.isEncrypted,
        topic: row.topic || "School Assessment",
        stem: decryptExamVaultString(row.stem),
        imageUrl: row.imageUrl || null,
        options: decryptExamOptionsJson(row.optionsJson),
        correctKey: decryptAnswerKeyValue(row.answerKey?.correctKey),
        explanation: decryptExamVaultString(row.answerKey?.explanation),
        isActive: row.isActive,
        authorLabel: row.licenseRef?.includes(":")
          ? row.licenseRef.split(":").slice(2).join(":") || "Academic Staff"
          : "Academic Staff",
        usageCount: row._count.attemptItems,
        createdAt: row.fetchedAt.toISOString(),
      };
    });

    // Compute per-subject CBT analytics
    const bySubj = new Map<
      string,
      {
        subjectCode: string;
        totalAttempts: number;
        submittedCount: number;
        terminatedCount: number;
        scores: number[];
        strikesSum: number;
      }
    >();

    for (const att of attempts) {
      const bucket = bySubj.get(att.subjectCode) || {
        subjectCode: att.subjectCode,
        totalAttempts: 0,
        submittedCount: 0,
        terminatedCount: 0,
        scores: [],
        strikesSum: 0,
      };
      bucket.totalAttempts += 1;
      bucket.strikesSum += att.hardStrikes || 0;
      if (att.status === "SUBMITTED") bucket.submittedCount += 1;
      if (att.status === "TERMINATED") bucket.terminatedCount += 1;
      if (typeof att.scoreTenths === "number") {
        bucket.scores.push(Number((att.scoreTenths / 10).toFixed(1)));
      }
      bySubj.set(att.subjectCode, bucket);
    }

    const subjectAnalytics: CbtSubjectAnalyticsRow[] = Array.from(bySubj.values())
      .map((b) => {
        const avgScorePct =
          b.scores.length > 0
            ? Number((b.scores.reduce((acc, s) => acc + s, 0) / b.scores.length).toFixed(1))
            : 0;
        const highestScorePct = b.scores.length > 0 ? Math.max(...b.scores) : 0;
        const passed = b.scores.filter((s) => s >= 50).length;
        const passRatePct =
          b.scores.length > 0 ? Math.round((passed / b.scores.length) * 100) : 0;
        return {
          subjectCode: b.subjectCode,
          totalAttempts: b.totalAttempts,
          submittedCount: b.submittedCount,
          terminatedCount: b.terminatedCount,
          avgScorePct,
          highestScorePct,
          passRatePct,
          avgStrikes: Number((b.strikesSum / Math.max(1, b.totalAttempts)).toFixed(2)),
        };
      })
      .sort((a, b) => b.totalAttempts - a.totalAttempts);

    const attemptRows = attempts.slice(0, 200).map((a) => ({
      id: a.id,
      studentName:
        a.student?.PreferredName ||
        `${a.student?.FirstName || ""} ${a.student?.LastName || ""}`.trim() ||
        a.student?.AdmissionNo ||
        "Student",
      wofsStudentId: a.student?.AdmissionNo || "",
      className: a.student?.Class?.ClassName || "",
      subjectCode: a.subjectCode,
      examBody: a.examBody,
      mode: a.mode,
      status: a.status,
      scorePct:
        typeof a.scoreTenths === "number" ? Number((a.scoreTenths / 10).toFixed(1)) : null,
      hardStrikes: a.hardStrikes,
      questionCount: a.questionCount,
      startedAt: a.startedAt.toISOString(),
    }));

    return {
      success: true,
      questions: questionRows,
      internalSubjectCounts: distinctInternalSubjects.map((r) => ({
        subjectCode: r.subjectCode,
        count: r._count.id,
      })),
      subjectAnalytics,
      attemptRows,
    };
  } catch (error: unknown) {
    console.error("getAdminCbtBankAndAnalytics error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load CBT question bank.",
      questions: [],
      internalSubjectCounts: [],
      subjectAnalytics: [],
      attemptRows: [],
    };
  }
}

const UpsertCbtQuestionSchema = z.object({
  id: z.string().trim().optional(),
  subjectCode: z.string().trim().min(2, "Subject code is required.").max(48),
  examBody: z.string().trim().min(2).max(32).default("SCHOOL_INTERNAL"),
  bankScope: z.enum(["OPEN_BANK", "EXAM_ONLY"]).optional().default("OPEN_BANK"),
  targetClassLevel: z.string().trim().max(40).optional().nullable(),
  submissionId: z.string().trim().optional().nullable(),
  topic: z.string().trim().max(120).optional().default("School Assessment"),
  stem: z.string().trim().min(5, "Question stem must be at least 5 characters.").max(3000),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  optionA: z.string().trim().min(1, "Option A is required.").max(800),
  optionB: z.string().trim().min(1, "Option B is required.").max(800),
  optionC: z.string().trim().min(1, "Option C is required.").max(800),
  optionD: z.string().trim().min(1, "Option D is required.").max(800),
  correctKey: z.enum(["a", "b", "c", "d", "A", "B", "C", "D"]),
  explanation: z.string().trim().max(2000).optional().default(""),
});

function sanitizeQuestionImageUrl(raw?: string | null): string | null {
  const clean = (raw || "").trim();
  if (!clean) return null;
  if (clean.startsWith("/") && !clean.startsWith("//")) return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return clean;
  } catch {
    return null;
  }
  return null;
}

export async function upsertSchoolCbtQuestion(
  rawInput: z.infer<typeof UpsertCbtQuestionSchema>
) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);
    const data = validateInput(UpsertCbtQuestionSchema, rawInput);

    const subjectCode = normalizeCbtSubjectCode(data.subjectCode);
    if (!subjectCode) {
      return { success: false, error: "Invalid subject code." };
    }

    await assertCanManageSubjectCode(actor, subjectCode);

    const examBody = data.examBody.toUpperCase().replace(/-/g, "_").trim() || "SCHOOL_INTERNAL";
    const bankScope = data.bankScope === "EXAM_ONLY" ? "EXAM_ONLY" : "OPEN_BANK";
    const targetClassLevel = data.targetClassLevel?.trim() || null;
    const correctKey = data.correctKey.toLowerCase() as "a" | "b" | "c" | "d";
    const imageUrl = sanitizeQuestionImageUrl(data.imageUrl);
    const optionsArr = [
      { key: "a", text: data.optionA },
      { key: "b", text: data.optionB },
      { key: "c", text: data.optionC },
      { key: "d", text: data.optionD },
    ];
    const normalizedStem = data.stem.replace(/\s+/g, " ").toLowerCase();
    const contentHash = crypto
      .createHash("sha256")
      .update(`${subjectCode}:${normalizedStem}:${JSON.stringify(optionsArr)}`)
      .digest("hex");

    const shouldEncrypt = bankScope === "EXAM_ONLY";
    const storedStem = shouldEncrypt ? encryptExamVaultString(data.stem) : data.stem;
    const storedOptions = encryptExamOptionsJson(optionsArr, shouldEncrypt);
    const storedCorrectKey = shouldEncrypt ? encryptExamVaultString(correctKey) : correctKey;
    const storedExplanation = data.explanation
      ? shouldEncrypt
        ? encryptExamVaultString(data.explanation)
        : data.explanation
      : null;

    const isAdmin = isCbtAdminActor(actor);

    const saved = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const existing = await tx.cbtQuestion.findUnique({
          where: { id: data.id },
          select: {
            id: true,
            provider: true,
            authoredById: true,
            licenseRef: true,
            submission: { select: { status: true } },
          },
        });
        if (!existing || existing.provider !== "SCHOOL_INTERNAL") {
          throw new Error("Only SCHOOL_INTERNAL questions can be edited here.");
        }
        const ownsRow =
          existing.authoredById === actor.UserID ||
          Boolean(existing.licenseRef?.startsWith(`STAFF:${actor.UserID}:`)) ||
          Boolean(existing.licenseRef?.startsWith(`TEACHER:${actor.UserID}:`));
        if (!isAdmin && !ownsRow) {
          throw new Error("Forbidden: You can only edit questions you authored.");
        }
        if (
          !isAdmin &&
          existing.submission &&
          existing.submission.status !== "DRAFT" &&
          existing.submission.status !== "REVISION_REQUESTED"
        ) {
          throw new Error(
            `Submission Locked: Questions cannot be edited while the packet status is ${existing.submission.status}. Wait for Exam Officer review or revision request.`
          );
        }

        const updatedQ = await tx.cbtQuestion.update({
          where: { id: existing.id },
          data: {
            subjectCode,
            examBody,
            bankScope,
            targetClassLevel,
            ...(data.submissionId !== undefined ? { submissionId: data.submissionId } : {}),
            isEncrypted: shouldEncrypt,
            topic: data.topic || "School Assessment",
            stem: storedStem,
            imageUrl,
            optionsJson: storedOptions,
            contentHash,
            isActive: true,
          },
        });

        await tx.cbtAnswerKey.upsert({
          where: { questionId: updatedQ.id },
          update: {
            correctKey: storedCorrectKey,
            explanation: storedExplanation,
          },
          create: {
            questionId: updatedQ.id,
            correctKey: storedCorrectKey,
            explanation: storedExplanation,
          },
        });

        return updatedQ;
      }

      const idPrefix = bankScope === "EXAM_ONLY" ? "wof-exam" : "wof-custom";
      const externalId = `${idPrefix}-${contentHash.slice(0, 16)}`;
      const createdQ = await tx.cbtQuestion.upsert({
        where: {
          provider_externalId: {
            provider: "SCHOOL_INTERNAL",
            externalId,
          },
        },
        update: {
          subjectCode,
          examBody,
          bankScope,
          targetClassLevel,
          ...(data.submissionId ? { submissionId: data.submissionId } : {}),
          isEncrypted: shouldEncrypt,
          authoredById: actor.UserID,
          topic: data.topic || "School Assessment",
          stem: storedStem,
          imageUrl,
          optionsJson: storedOptions,
          contentHash,
          isActive: true,
          licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
        },
        create: {
          provider: "SCHOOL_INTERNAL",
          externalId,
          examBody,
          subjectCode,
          bankScope,
          targetClassLevel,
          submissionId: data.submissionId || null,
          isEncrypted: shouldEncrypt,
          authoredById: actor.UserID,
          examYear: new Date().getFullYear(),
          topic: data.topic || "School Assessment",
          stem: storedStem,
          imageUrl,
          optionsJson: storedOptions,
          contentHash,
          licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
          isActive: true,
        },
      });

      await tx.cbtAnswerKey.upsert({
        where: { questionId: createdQ.id },
        update: {
          correctKey: storedCorrectKey,
          explanation: storedExplanation,
        },
        create: {
          questionId: createdQ.id,
          correctKey: storedCorrectKey,
          explanation: storedExplanation,
        },
      });

      return createdQ;
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: data.id ? "CBT_INTERNAL_QUESTION_UPDATED" : "CBT_INTERNAL_QUESTION_CREATED",
      entity: "CbtQuestion",
      entityId: saved.id,
      newValue: { subjectCode, examBody, bankScope, topic: saved.topic },
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/cbt");
    return { success: true, questionId: saved.id };
  } catch (error: unknown) {
    console.error("upsertSchoolCbtQuestion error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save CBT question.",
    };
  }
}

export async function bulkImportSchoolCbtQuestionsCsv(params: {
  csvText: string;
  defaultSubjectCode?: string;
  defaultExamBody?: string;
  bankScope?: "OPEN_BANK" | "EXAM_ONLY";
  targetClassLevel?: string;
}) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);
    const parsed = parseSchoolCbtQuestionsCsv(params.csvText, {
      subjectCode: params.defaultSubjectCode,
      examBody: params.defaultExamBody,
    });

    if (parsed.validRows.length === 0) {
      return {
        success: false,
        importedCount: 0,
        skippedCount: parsed.errors.length,
        errors: parsed.errors,
        error: parsed.errors[0]?.error || "No valid CBT question rows found in CSV.",
      };
    }

    const batchRows = parsed.validRows.slice(0, 250);
    const distinctSubjects = Array.from(new Set(batchRows.map((r) => r.subjectCode)));
    for (const sc of distinctSubjects) {
      await assertCanManageSubjectCode(actor, sc);
    }

    const bankScope = params.bankScope === "EXAM_ONLY" ? "EXAM_ONLY" : "OPEN_BANK";
    const shouldEncrypt = bankScope === "EXAM_ONLY";
    const targetClassLevel = params.targetClassLevel?.trim() || null;
    const idPrefix = bankScope === "EXAM_ONLY" ? "wof-exam" : "wof-custom";
    let importedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of batchRows) {
        const optionsArr = [
          { key: "a", text: row.optionA },
          { key: "b", text: row.optionB },
          { key: "c", text: row.optionC },
          { key: "d", text: row.optionD },
        ];
        const normalizedStem = row.stem.replace(/\s+/g, " ").toLowerCase();
        const contentHash = crypto
          .createHash("sha256")
          .update(`${row.subjectCode}:${normalizedStem}:${JSON.stringify(optionsArr)}`)
          .digest("hex");
        const externalId = `${idPrefix}-${contentHash.slice(0, 16)}`;
        const storedStem = shouldEncrypt ? encryptExamVaultString(row.stem) : row.stem;
        const storedOptions = encryptExamOptionsJson(optionsArr, shouldEncrypt);
        const storedCorrect = shouldEncrypt ? encryptExamVaultString(row.correctKey) : row.correctKey;
        const storedExp = row.explanation
          ? shouldEncrypt
            ? encryptExamVaultString(row.explanation)
            : row.explanation
          : null;

        const q = await tx.cbtQuestion.upsert({
          where: {
            provider_externalId: {
              provider: "SCHOOL_INTERNAL",
              externalId,
            },
          },
          update: {
            examBody: row.examBody,
            subjectCode: row.subjectCode,
            bankScope,
            isEncrypted: shouldEncrypt,
            targetClassLevel,
            authoredById: actor.UserID,
            topic: row.topic,
            stem: storedStem,
            optionsJson: storedOptions,
            contentHash,
            isActive: true,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
          },
          create: {
            provider: "SCHOOL_INTERNAL",
            externalId,
            examBody: row.examBody,
            subjectCode: row.subjectCode,
            bankScope,
            isEncrypted: shouldEncrypt,
            targetClassLevel,
            authoredById: actor.UserID,
            examYear: new Date().getFullYear(),
            topic: row.topic,
            stem: storedStem,
            optionsJson: storedOptions,
            contentHash,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
            isActive: true,
          },
        });

        await tx.cbtAnswerKey.upsert({
          where: { questionId: q.id },
          update: {
            correctKey: storedCorrect,
            explanation: storedExp,
          },
          create: {
            questionId: q.id,
            correctKey: storedCorrect,
            explanation: storedExp,
          },
        });

        importedCount++;
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CBT_INTERNAL_QUESTIONS_BULK_IMPORT",
        entity: "CbtQuestion",
        entityId: `BATCH-${Date.now()}`,
        newValue: {
          importedCount,
          rejectedCount: parsed.errors.length,
          bankScope,
        },
      });
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/cbt");
    return {
      success: true,
      importedCount,
      skippedCount: parsed.errors.length,
      errors: parsed.errors,
    };
  } catch (error: unknown) {
    console.error("bulkImportSchoolCbtQuestionsCsv error:", error);
    return {
      success: false,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      error: error instanceof Error ? error.message : "Bulk CBT question import failed.",
    };
  }
}

export async function toggleSchoolCbtQuestionActive(questionId: string, isActive: boolean) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);
    const existing = await prisma.cbtQuestion.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        provider: true,
        isActive: true,
        subjectCode: true,
        authoredById: true,
        licenseRef: true,
        submission: { select: { status: true } },
      },
    });
    if (!existing || existing.provider !== "SCHOOL_INTERNAL") {
      return { success: false, error: "Only SCHOOL_INTERNAL questions can be modified." };
    }

    const isAdmin = isCbtAdminActor(actor);
    const ownsRow =
      existing.authoredById === actor.UserID ||
      Boolean(existing.licenseRef?.startsWith(`STAFF:${actor.UserID}:`)) ||
      Boolean(existing.licenseRef?.startsWith(`TEACHER:${actor.UserID}:`));
    if (!isAdmin && !ownsRow) {
      return { success: false, error: "Forbidden: You can only archive or restore questions you authored." };
    }
    if (
      !isAdmin &&
      existing.submission &&
      existing.submission.status !== "DRAFT" &&
      existing.submission.status !== "REVISION_REQUESTED"
    ) {
      return {
        success: false,
        error: `Submission Locked: Questions cannot be removed while the packet is ${existing.submission.status}.`,
      };
    }

    await prisma.cbtQuestion.update({
      where: { id: questionId },
      data: { isActive: Boolean(isActive) },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: isActive ? "CBT_INTERNAL_QUESTION_RESTORED" : "CBT_INTERNAL_QUESTION_ARCHIVED",
      entity: "CbtQuestion",
      entityId: questionId,
      newValue: { isActive: Boolean(isActive), subjectCode: existing.subjectCode },
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/cbt");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update question status.",
    };
  }
}

/**
 * Teacher/Admin handwritten sheet photo, scanned PDF, or pasted exam parser (Scan -> Review -> Bank).
 */
export async function scanDocumentToExamQuestionsAction(formData: FormData) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);

    const rl = await rateLimit(`cbt_ocr_scan:${actor.UserID}`, 20, 600);
    if (!rl.success) {
      return {
        success: false,
        engine: "DETERMINISTIC_TEXT" as const,
        questions: [] as ScannedCbtQuestionDraft[],
        warnings: [] as string[],
        error: "OCR scan rate limit reached (max 20 scans per 10 minutes). Please review your staged questions.",
      };
    }

    const subjectCode = normalizeCbtSubjectCode(String(formData.get("subjectCode") || ""));
    if (!subjectCode) {
      return {
        success: false,
        engine: "DETERMINISTIC_TEXT" as const,
        questions: [] as ScannedCbtQuestionDraft[],
        warnings: [] as string[],
        error: "Please select the target subject before scanning.",
      };
    }
    await assertCanManageSubjectCode(actor, subjectCode);

    const defaultTopic = String(formData.get("defaultTopic") || "Term Exam Question").trim().slice(0, 120);
    const rawText = String(formData.get("rawText") || "").trim();
    const fileEntry = formData.get("file");

    let buffer: Buffer | undefined;
    let declaredMime: string | null = null;
    let filename: string | undefined;

    if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
      const f = fileEntry as File;
      if (f.size > 0) {
        const ab = await f.arrayBuffer();
        buffer = Buffer.from(ab);
        declaredMime = f.type || null;
        filename = f.name || "scan-upload";
      }
    }

    const result = await extractQuestionsFromDocument({
      buffer,
      declaredMime,
      filename,
      rawText: rawText || undefined,
      subjectCode,
      defaultTopic,
    });

    if (result.success && result.questions.length > 0) {
      await writeAuditLog({
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CBT_EXAM_DOCUMENT_SCANNED",
        entity: "CbtQuestion",
        entityId: subjectCode.toUpperCase(),
        newValue: {
          subjectCode,
          engine: result.engine,
          extractedCount: result.questions.length,
          source: filename || "pasted-text",
        },
      });
    }

    return result;
  } catch (error: unknown) {
    console.error("scanDocumentToExamQuestionsAction error:", error);
    return {
      success: false,
      engine: "DETERMINISTIC_TEXT" as const,
      questions: [] as ScannedCbtQuestionDraft[],
      warnings: [] as string[],
      error: error instanceof Error ? error.message : "Failed to scan question document.",
    };
  }
}

const BulkReviewedQuestionSchema = z.object({
  subjectCode: z.string().trim().min(2).max(48),
  examBody: z.string().trim().min(2).max(32).default("SCHOOL_INTERNAL"),
  bankScope: z.enum(["OPEN_BANK", "EXAM_ONLY"]).default("EXAM_ONLY"),
  targetClassLevel: z.string().trim().max(40).optional().nullable(),
  questions: z
    .array(
      z.object({
        stem: z.string().trim().min(5).max(3000),
        optionA: z.string().trim().min(1).max(800),
        optionB: z.string().trim().min(1).max(800),
        optionC: z.string().trim().min(1).max(800),
        optionD: z.string().trim().min(1).max(800),
        correctKey: z.enum(["a", "b", "c", "d", "A", "B", "C", "D"]),
        topic: z.string().trim().max(120).optional().default("Exam Question"),
        explanation: z.string().trim().max(2000).optional().default(""),
      })
    )
    .min(1, "Select at least one reviewed question to save.")
    .max(100),
});

/**
 * Commits teacher-verified OCR / scanned questions into the subject's Exam Question Bank (`EXAM_ONLY` by default)
 * or Open Practice Bank (`OPEN_BANK`). Optionally pins saved question IDs directly into a Scheduled Exam if `attachToExamId` is provided.
 */
export async function bulkSaveReviewedExamQuestions(
  rawInput: z.infer<typeof BulkReviewedQuestionSchema> & {
    attachToExamId?: string;
    submissionId?: string;
  }
) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);
    const data = validateInput(BulkReviewedQuestionSchema, rawInput);
    const subjectCode = normalizeCbtSubjectCode(data.subjectCode);
    await assertCanManageSubjectCode(actor, subjectCode);

    const examBody = data.examBody.toUpperCase().replace(/-/g, "_").trim() || "SCHOOL_INTERNAL";
    const bankScope = data.bankScope === "OPEN_BANK" ? "OPEN_BANK" : "EXAM_ONLY";
    const shouldEncrypt = bankScope === "EXAM_ONLY";
    const targetClassLevel = data.targetClassLevel?.trim() || null;
    const idPrefix = bankScope === "EXAM_ONLY" ? "wof-exam" : "wof-custom";

    const savedIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of data.questions) {
        const optionsArr = [
          { key: "a", text: item.optionA },
          { key: "b", text: item.optionB },
          { key: "c", text: item.optionC },
          { key: "d", text: item.optionD },
        ];
        const normalizedStem = item.stem.replace(/\s+/g, " ").toLowerCase();
        const contentHash = crypto
          .createHash("sha256")
          .update(`${subjectCode}:${normalizedStem}:${JSON.stringify(optionsArr)}`)
          .digest("hex");
        const externalId = `${idPrefix}-${contentHash.slice(0, 16)}`;
        const correctKey = item.correctKey.toLowerCase() as "a" | "b" | "c" | "d";
        const storedStem = shouldEncrypt ? encryptExamVaultString(item.stem) : item.stem;
        const storedOptions = encryptExamOptionsJson(optionsArr, shouldEncrypt);
        const storedCorrect = shouldEncrypt ? encryptExamVaultString(correctKey) : correctKey;
        const storedExp = item.explanation
          ? shouldEncrypt
            ? encryptExamVaultString(item.explanation)
            : item.explanation
          : null;

        const q = await tx.cbtQuestion.upsert({
          where: {
            provider_externalId: {
              provider: "SCHOOL_INTERNAL",
              externalId,
            },
          },
          update: {
            examBody,
            subjectCode,
            bankScope,
            isEncrypted: shouldEncrypt,
            ...(rawInput.submissionId ? { submissionId: rawInput.submissionId } : {}),
            targetClassLevel,
            authoredById: actor.UserID,
            topic: item.topic || "Exam Question",
            stem: storedStem,
            optionsJson: storedOptions,
            contentHash,
            isActive: true,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
          },
          create: {
            provider: "SCHOOL_INTERNAL",
            externalId,
            examBody,
            subjectCode,
            bankScope,
            isEncrypted: shouldEncrypt,
            submissionId: rawInput.submissionId || null,
            targetClassLevel,
            authoredById: actor.UserID,
            examYear: new Date().getFullYear(),
            topic: item.topic || "Exam Question",
            stem: storedStem,
            optionsJson: storedOptions,
            contentHash,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
            isActive: true,
          },
        });

        await tx.cbtAnswerKey.upsert({
          where: { questionId: q.id },
          update: {
            correctKey: storedCorrect,
            explanation: storedExp,
          },
          create: {
            questionId: q.id,
            correctKey: storedCorrect,
            explanation: storedExp,
          },
        });

        savedIds.push(q.id);
      }

      if (rawInput.attachToExamId) {
        const exam = await tx.cbtScheduledExam.findUnique({
          where: { id: rawInput.attachToExamId },
          select: { id: true, createdById: true, subjectCode: true },
        });
        if (exam && (isCbtAdminActor(actor) || exam.createdById === actor.UserID)) {
          for (let idx = 0; idx < savedIds.length; idx++) {
            await tx.cbtScheduledExamQuestion.upsert({
              where: {
                scheduledExamId_questionId: {
                  scheduledExamId: exam.id,
                  questionId: savedIds[idx],
                },
              },
              update: { sortOrder: idx + 1 },
              create: {
                scheduledExamId: exam.id,
                questionId: savedIds[idx],
                sortOrder: idx + 1,
              },
            });
          }
        }
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CBT_SCANNED_QUESTIONS_COMMITTED",
        entity: "CbtQuestion",
        entityId: subjectCode.toUpperCase(),
        newValue: {
          subjectCode,
          bankScope,
          savedCount: savedIds.length,
          attachedToExamId: rawInput.attachToExamId || null,
        },
      });
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/cbt");

    return {
      success: true,
      savedCount: savedIds.length,
      savedIds,
    };
  } catch (error: unknown) {
    console.error("bulkSaveReviewedExamQuestions error:", error);
    return {
      success: false,
      savedCount: 0,
      savedIds: [],
      error: error instanceof Error ? error.message : "Failed to save scanned questions.",
    };
  }
}

/**
 * Returns subject-scoped bank questions for the authenticated Teacher or Supervisor.
 */
export async function getTeacherScopedBankQuestions(filters?: {
  subjectCode?: string;
  bankScope?: "ALL" | "OPEN_BANK" | "EXAM_ONLY";
}) {
  try {
    const actor = await requireRole(CBT_AUTHOR_ROLES);
    const isAdmin = isCbtAdminActor(actor);
    const allowedSubjects = isAdmin ? null : await getTeacherAllowedCbtSubjects(actor.UserID);

    const subjectFilter = filters?.subjectCode
      ? normalizeCbtSubjectCode(filters.subjectCode)
      : "";
    const scopeFilter =
      filters?.bankScope === "OPEN_BANK" || filters?.bankScope === "EXAM_ONLY"
        ? filters.bankScope
        : null;

    const rows = await prisma.cbtQuestion.findMany({
      where: {
        provider: "SCHOOL_INTERNAL",
        isActive: true,
        ...(scopeFilter ? { bankScope: scopeFilter } : {}),
        ...(subjectFilter && subjectFilter !== "all" ? { subjectCode: subjectFilter } : {}),
        ...(!isAdmin
          ? {
              // Teachers can ONLY view EXAM_ONLY questions that they authored themselves,
              // or OPEN_BANK questions in their assigned subjects.
              OR: [
                { authoredById: actor.UserID },
                { licenseRef: { startsWith: `STAFF:${actor.UserID}:` } },
                { licenseRef: { startsWith: `TEACHER:${actor.UserID}:` } },
                ...(allowedSubjects && allowedSubjects.size > 0
                  ? [{ bankScope: "OPEN_BANK" as const, subjectCode: { in: Array.from(allowedSubjects) } }]
                  : []),
              ],
            }
          : {}),
      },
      include: {
        answerKey: true,
        _count: { select: { attemptItems: true } },
      },
      orderBy: { fetchedAt: "desc" },
      take: 250,
    });

    const questions: SchoolInternalQuestionRow[] = rows.map((row) => {
      return {
        id: row.id,
        subjectCode: row.subjectCode,
        examBody: row.examBody,
        bankScope: row.bankScope === "EXAM_ONLY" ? "EXAM_ONLY" : "OPEN_BANK",
        targetClassLevel: row.targetClassLevel || null,
        authoredById: row.authoredById ?? null,
        submissionId: row.submissionId ?? null,
        isEncrypted: row.isEncrypted,
        topic: row.topic || "School Assessment",
        stem: decryptExamVaultString(row.stem),
        imageUrl: row.imageUrl || null,
        options: decryptExamOptionsJson(row.optionsJson),
        correctKey: decryptAnswerKeyValue(row.answerKey?.correctKey),
        explanation: decryptExamVaultString(row.answerKey?.explanation),
        isActive: row.isActive,
        authorLabel: row.licenseRef?.includes(":")
          ? row.licenseRef.split(":").slice(2).join(":") || "Academic Staff"
          : "Academic Staff",
        usageCount: row._count.attemptItems,
        createdAt: row.fetchedAt.toISOString(),
      };
    });

    return {
      success: true,
      questions,
      allowedSubjects: allowedSubjects ? Array.from(allowedSubjects) : [],
      isAdmin,
    };
  } catch (error: unknown) {
    return {
      success: false,
      questions: [] as SchoolInternalQuestionRow[],
      allowedSubjects: [] as string[],
      isAdmin: false,
      error: error instanceof Error ? error.message : "Failed to load teacher question bank.",
    };
  }
}
