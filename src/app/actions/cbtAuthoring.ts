"use server";

import crypto from "crypto";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { validateInput } from "@/lib/security";
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

export interface SchoolInternalQuestionRow {
  id: string;
  subjectCode: string;
  examBody: string;
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
  search?: string;
  includeInactive?: boolean;
}) {
  try {
    await requireRole(CBT_VIEW_ROLES);

    const subjectFilter = filters?.subjectCode
      ? normalizeCbtSubjectCode(filters.subjectCode)
      : "";
    const q = (filters?.search || "").trim();

    const [questions, attempts, distinctInternalSubjects] = await Promise.all([
      prisma.cbtQuestion.findMany({
        where: {
          provider: "SCHOOL_INTERNAL",
          ...(filters?.includeInactive ? {} : { isActive: true }),
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
      const optsRaw = Array.isArray(row.optionsJson)
        ? (row.optionsJson as Array<{ key?: string; text?: string }>)
        : [];
      const correct = (row.answerKey?.correctKey || "a").toLowerCase();
      return {
        id: row.id,
        subjectCode: row.subjectCode,
        examBody: row.examBody,
        topic: row.topic || "School Assessment",
        stem: row.stem,
        imageUrl: row.imageUrl || null,
        options: optsRaw.map((o) => ({
          key: String(o.key || "a"),
          text: String(o.text || ""),
        })),
        correctKey: (["a", "b", "c", "d"].includes(correct) ? correct : "a") as
          | "a"
          | "b"
          | "c"
          | "d",
        explanation: row.answerKey?.explanation || "",
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

    const examBody = data.examBody.toUpperCase().replace(/-/g, "_").trim() || "SCHOOL_INTERNAL";
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

    const saved = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const existing = await tx.cbtQuestion.findUnique({
          where: { id: data.id },
          select: { id: true, provider: true },
        });
        if (!existing || existing.provider !== "SCHOOL_INTERNAL") {
          throw new Error("Only SCHOOL_INTERNAL questions can be edited here.");
        }

        const updatedQ = await tx.cbtQuestion.update({
          where: { id: existing.id },
          data: {
            subjectCode,
            examBody,
            topic: data.topic || "School Assessment",
            stem: data.stem,
            imageUrl,
            optionsJson: optionsArr,
            contentHash,
            isActive: true,
          },
        });

        await tx.cbtAnswerKey.upsert({
          where: { questionId: updatedQ.id },
          update: {
            correctKey,
            explanation: data.explanation || null,
          },
          create: {
            questionId: updatedQ.id,
            correctKey,
            explanation: data.explanation || null,
          },
        });

        return updatedQ;
      }

      const externalId = `wof-custom-${contentHash.slice(0, 16)}`;
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
          topic: data.topic || "School Assessment",
          stem: data.stem,
          imageUrl,
          optionsJson: optionsArr,
          contentHash,
          isActive: true,
          licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
        },
        create: {
          provider: "SCHOOL_INTERNAL",
          externalId,
          examBody,
          subjectCode,
          examYear: new Date().getFullYear(),
          topic: data.topic || "School Assessment",
          stem: data.stem,
          imageUrl,
          optionsJson: optionsArr,
          contentHash,
          licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
          isActive: true,
        },
      });

      await tx.cbtAnswerKey.upsert({
        where: { questionId: createdQ.id },
        update: {
          correctKey,
          explanation: data.explanation || null,
        },
        create: {
          questionId: createdQ.id,
          correctKey,
          explanation: data.explanation || null,
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
      newValue: { subjectCode, examBody, topic: saved.topic },
    });

    revalidatePath("/portal/admin/cbt");
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
        const externalId = `wof-custom-${contentHash.slice(0, 16)}`;

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
            topic: row.topic,
            stem: row.stem,
            optionsJson: optionsArr,
            contentHash,
            isActive: true,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
          },
          create: {
            provider: "SCHOOL_INTERNAL",
            externalId,
            examBody: row.examBody,
            subjectCode: row.subjectCode,
            examYear: new Date().getFullYear(),
            topic: row.topic,
            stem: row.stem,
            optionsJson: optionsArr,
            contentHash,
            licenseRef: `STAFF:${actor.UserID}:${actor.Email}`,
            isActive: true,
          },
        });

        await tx.cbtAnswerKey.upsert({
          where: { questionId: q.id },
          update: {
            correctKey: row.correctKey,
            explanation: row.explanation || null,
          },
          create: {
            questionId: q.id,
            correctKey: row.correctKey,
            explanation: row.explanation || null,
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
        },
      });
    });

    revalidatePath("/portal/admin/cbt");
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
      select: { id: true, provider: true, isActive: true, subjectCode: true },
    });
    if (!existing || existing.provider !== "SCHOOL_INTERNAL") {
      return { success: false, error: "Only SCHOOL_INTERNAL questions can be modified." };
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
    revalidatePath("/portal/cbt");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update question status.",
    };
  }
}
