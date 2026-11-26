"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  requireActiveUser,
  requireRole,
  writeAuditLog,
  can,
} from "@/lib/authz";
import {
  encryptExamVaultString,
  decryptExamVaultString,
  encryptExamOptionsJson,
  decryptExamOptionsJson,
  decryptAnswerKeyValue,
} from "@/lib/exam-vault";

import { mapSubjectNameToCbtCodes } from "@/lib/cbt-constants";
import { normalizeCbtSubjectCode } from "@/lib/cbt-csv";

// ============================================================================
// TRACK A: TEACHER-CREATED CUSTOM CBT QUESTIONS & CLASS QUIZZES
// ============================================================================

export async function createCustomCbtQuestion(data: {
  subjectCode: string;
  examBody?: string;
  bankScope?: "OPEN_BANK" | "EXAM_ONLY";
  targetClassLevel?: string;
  submissionId?: string;
  topic?: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctKey: "a" | "b" | "c" | "d" | "A" | "B" | "C" | "D";
  explanation?: string;
}) {
  try {
    const actor = await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
      "SUPER_ADMIN",
      "PRINCIPAL",
      "Admin",
    ]);

    const isSupervisor =
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("ADMIN") ||
      actor.roles.has("Admin") ||
      can(actor, "MANAGE_CBT");

    const subjectCode = normalizeCbtSubjectCode(data.subjectCode || "english") || "english";
    if (!isSupervisor) {
      const allocations = await prisma.teacher_Subject_Map.findMany({
        where: { TeacherID: actor.UserID },
        include: { Subject: { select: { SubjectName: true, SubjectCode: true } } },
      });
      const allowedCodes = new Set<string>();
      for (const a of allocations) {
        for (const c of mapSubjectNameToCbtCodes(a.Subject?.SubjectName)) allowedCodes.add(c);
        if (a.Subject?.SubjectCode) allowedCodes.add(normalizeCbtSubjectCode(a.Subject.SubjectCode));
      }
      if (allowedCodes.size === 0 || !allowedCodes.has(subjectCode)) {
        return {
          success: false,
          error: "Authorization denied: You can only author CBT questions for subjects assigned to you.",
        };
      }
    }
    const examBody = (data.examBody || "WASSCE").trim().toUpperCase();
    const stem = (data.stem || "").trim();
    const optA = (data.optionA || "").trim();
    const optB = (data.optionB || "").trim();
    const optC = (data.optionC || "").trim();
    const optD = (data.optionD || "").trim();
    const correctKey = (data.correctKey || "a").toLowerCase().trim();

    if (!stem || stem.length < 8) {
      return { success: false, error: "Question stem must be at least 8 characters long." };
    }
    if (!optA || !optB || !optC || !optD) {
      return { success: false, error: "All four options (A, B, C, and D) are required." };
    }
    if (!["a", "b", "c", "d"].includes(correctKey)) {
      return { success: false, error: "Correct option must be A, B, C, or D." };
    }

    const optionsArr = [
      { key: "a", text: optA },
      { key: "b", text: optB },
      { key: "c", text: optC },
      { key: "d", text: optD },
    ];

    const normalizedStem = stem.replace(/\s+/g, " ").toLowerCase();
    const contentHash = crypto
      .createHash("sha256")
      .update(`${subjectCode}:${normalizedStem}:${JSON.stringify(optionsArr)}`)
      .digest("hex");

    const bankScope = data.bankScope === "EXAM_ONLY" ? "EXAM_ONLY" : "OPEN_BANK";
    const shouldEncrypt = bankScope === "EXAM_ONLY";
    const storedStem = shouldEncrypt ? encryptExamVaultString(stem) : stem;
    const storedOptions = encryptExamOptionsJson(optionsArr, shouldEncrypt);
    const storedCorrectKey = shouldEncrypt ? encryptExamVaultString(correctKey) : correctKey;
    const storedExp = data.explanation?.trim()
      ? shouldEncrypt
        ? encryptExamVaultString(data.explanation.trim())
        : data.explanation.trim()
      : null;
    const idPrefix = bankScope === "EXAM_ONLY" ? "wof-exam" : "wof-custom";
    const externalId = `${idPrefix}-u${actor.UserID}-${contentHash.slice(0, 14)}`;

    if (data.submissionId) {
      const targetSub = await prisma.cbtQuestionSubmission.findUnique({
        where: { id: data.submissionId },
        select: { id: true, teacherId: true, status: true },
      });
      if (!targetSub) {
        return { success: false, error: "Question submission packet not found." };
      }
      if (!isSupervisor && targetSub.teacherId !== actor.UserID) {
        return { success: false, error: "Forbidden: Packet belongs to another teacher." };
      }
      if (!isSupervisor && targetSub.status !== "DRAFT" && targetSub.status !== "REVISION_REQUESTED") {
        return {
          success: false,
          error: `Submission Locked: Cannot attach questions while packet is ${targetSub.status}.`,
        };
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.cbtQuestion.findUnique({
        where: {
          provider_externalId: {
            provider: "SCHOOL_INTERNAL",
            externalId,
          },
        },
        include: { submission: { select: { status: true } } },
      });
      if (
        existing &&
        !isSupervisor &&
        existing.submission &&
        existing.submission.status !== "DRAFT" &&
        existing.submission.status !== "REVISION_REQUESTED"
      ) {
        throw new Error(
          `Submission Locked: Question cannot be overwritten while packet status is ${existing.submission.status}.`
        );
      }

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
          ...(data.submissionId ? { submissionId: data.submissionId } : {}),
          targetClassLevel: data.targetClassLevel?.trim() || null,
          authoredById: actor.UserID,
          topic: data.topic?.trim() || "School Class Quiz",
          stem: storedStem,
          optionsJson: storedOptions,
          isActive: true,
          licenseRef: `TEACHER:${actor.UserID}:${actor.Email}`,
        },
        create: {
          provider: "SCHOOL_INTERNAL",
          externalId,
          examBody,
          subjectCode,
          bankScope,
          isEncrypted: shouldEncrypt,
          submissionId: data.submissionId || null,
          targetClassLevel: data.targetClassLevel?.trim() || null,
          authoredById: actor.UserID,
          examYear: new Date().getFullYear(),
          topic: data.topic?.trim() || "School Class Quiz",
          stem: storedStem,
          optionsJson: storedOptions,
          contentHash,
          licenseRef: `TEACHER:${actor.UserID}:${actor.Email}`,
          isActive: true,
        },
      });

      await tx.cbtAnswerKey.upsert({
        where: { questionId: q.id },
        update: {
          correctKey: storedCorrectKey,
          explanation: storedExp,
        },
        create: {
          questionId: q.id,
          correctKey: storedCorrectKey,
          explanation: storedExp,
        },
      });

      return q;
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CBT_CUSTOM_QUESTION_CREATED",
      targetTable: "CbtQuestion",
      targetId: created.id,
      afterState: { subjectCode, examBody, topic: created.topic },
    });

    revalidatePath("/portal/cbt");
    revalidatePath("/portal/dashboard");

    return { success: true, question: created };
  } catch (error: any) {
    console.error("createCustomCbtQuestion error:", error);
    return {
      success: false,
      error: error.message || "Failed to save custom CBT question",
    };
  }
}

export async function getTeacherCustomCbtQuestions(subjectCode?: string) {
  try {
    const actor = await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
      "SUPER_ADMIN",
      "PRINCIPAL",
      "ADMIN",
      "Admin",
    ]);

    const isSupervisor =
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("ADMIN") ||
      actor.roles.has("Admin") ||
      can(actor, "MANAGE_CBT");

    const whereClause: any = {
      provider: "SCHOOL_INTERNAL",
      isActive: true,
      ...(!isSupervisor
        ? {
            OR: [
              { authoredById: actor.UserID },
              { licenseRef: { startsWith: `TEACHER:${actor.UserID}:` } },
              { licenseRef: { startsWith: `STAFF:${actor.UserID}:` } },
            ],
          }
        : {}),
    };
    if (subjectCode && subjectCode !== "all") {
      whereClause.subjectCode = subjectCode.toLowerCase().trim();
    }

    const questions = await prisma.cbtQuestion.findMany({
      where: whereClause,
      include: {
        answerKey: true,
      },
      orderBy: { fetchedAt: "desc" },
      take: 100,
    });

    return {
      success: true,
      questions: questions.map((q) => ({
        id: q.id,
        subjectCode: q.subjectCode,
        examBody: q.examBody,
        bankScope: q.bankScope,
        targetClassLevel: q.targetClassLevel || null,
        topic: q.topic || "School Class Quiz",
        stem: decryptExamVaultString(q.stem),
        options: decryptExamOptionsJson(q.optionsJson),
        correctKey: decryptAnswerKeyValue(q.answerKey?.correctKey),
        explanation: decryptExamVaultString(q.answerKey?.explanation),
        author: q.licenseRef?.startsWith("TEACHER:")
          ? q.licenseRef.split(":").slice(2).join(":")
          : "Academic Staff",
        createdAt: q.fetchedAt.toISOString(),
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to load custom CBT questions", questions: [] };
  }
}

export async function deleteCustomCbtQuestion(questionId: string) {
  try {
    const actor = await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
      "SUPER_ADMIN",
      "PRINCIPAL",
      "Admin",
    ]);

    const existing = await prisma.cbtQuestion.findUnique({
      where: { id: questionId },
      include: { submission: { select: { status: true } } },
    });

    if (!existing || existing.provider !== "SCHOOL_INTERNAL") {
      return {
        success: false,
        error: "Only custom school-authored CBT questions can be removed.",
      };
    }

    const isSchoolAdmin =
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("ADMIN") ||
      actor.roles.has("Admin") ||
      can(actor, "MANAGE_CBT");
    const isAuthor =
      existing.authoredById === actor.UserID ||
      Boolean(existing.licenseRef?.startsWith(`TEACHER:${actor.UserID}:`)) ||
      Boolean(existing.licenseRef?.startsWith(`STAFF:${actor.UserID}:`));

    if (!isSchoolAdmin && !isAuthor) {
      return {
        success: false,
        error: "FORBIDDEN: You can only delete custom CBT questions that you authored.",
      };
    }

    if (
      !isSchoolAdmin &&
      existing.submission &&
      existing.submission.status !== "DRAFT" &&
      existing.submission.status !== "REVISION_REQUESTED"
    ) {
      return {
        success: false,
        error: `Submission Locked: Cannot delete a question while its submission packet is ${existing.submission.status}.`,
      };
    }

    await prisma.cbtQuestion.update({
      where: { id: questionId },
      data: { isActive: false },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CBT_CUSTOM_QUESTION_DELETED",
      targetTable: "CbtQuestion",
      targetId: questionId,
    });

    revalidatePath("/portal/cbt");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to remove custom question" };
  }
}

// ============================================================================
// TRACK C: STUDENT CBT PERFORMANCE ANALYTICS, BADGES & CLASS LEADERBOARD
// ============================================================================

export async function getCbtAnalyticsAndLeaderboard() {
  try {
    const actor = await requireActiveUser();

    const student = await prisma.student.findFirst({
      where: { UserID: actor.UserID },
      include: { Class: true },
    });

    // Fetch submitted attempts (excluding unreleased official EXAM scores until Examiner releases them)
    const allSubmitted = await prisma.cbtAttempt.findMany({
      where: {
        status: "SUBMITTED",
        OR: [
          { mode: { not: "EXAM" } },
          { scheduledExam: { answersReleased: true } },
        ],
      },
      include: {
        student: {
          select: {
            StudentID: true,
            FirstName: true,
            LastName: true,
            PreferredName: true,
            ClassID: true,
            Class: { select: { ClassName: true } },
          },
        },
        items: {
          select: {
            isCorrect: true,
            timeSpentMs: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 300,
    });

    // 1. Current Student Subject Mastery Breakdown
    const myAttempts = student
      ? allSubmitted.filter((a) => a.studentId === student.StudentID)
      : [];

    const subjectMap = new Map<
      string,
      {
        subjectCode: string;
        attempts: number;
        totalQuestions: number;
        totalCorrect: number;
        bestPct: number;
        totalTimeMs: number;
        timedItems: number;
      }
    >();

    let hasPerfectScore = false;
    let hasDistinction = false;
    let hasFastSolver = false;
    let hasPracticeMode = false;

    for (const att of myAttempts) {
      if (att.mode === "PRACTICE") hasPracticeMode = true;
      const totalQ = Math.max(1, att.questionCount);
      const correctCount = att.items.filter((i) => i.isCorrect === true).length;
      const pct =
        typeof att.scoreTenths === "number"
          ? Math.round(att.scoreTenths / 10)
          : Math.round((correctCount / totalQ) * 100);

      if (pct === 100) hasPerfectScore = true;
      if (pct >= 75) hasDistinction = true;

      const existing = subjectMap.get(att.subjectCode) || {
        subjectCode: att.subjectCode,
        attempts: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        bestPct: 0,
        totalTimeMs: 0,
        timedItems: 0,
      };

      existing.attempts += 1;
      existing.totalQuestions += totalQ;
      existing.totalCorrect += correctCount;
      if (pct > existing.bestPct) existing.bestPct = pct;

      for (const item of att.items) {
        if (typeof item.timeSpentMs === "number" && item.timeSpentMs > 0) {
          existing.totalTimeMs += item.timeSpentMs;
          existing.timedItems += 1;
        }
      }

      subjectMap.set(att.subjectCode, existing);
    }

    const subjectMastery = Array.from(subjectMap.values()).map((s) => {
      const avgPct = Math.round((s.totalCorrect / Math.max(1, s.totalQuestions)) * 100);
      const avgSecPerQuestion =
        s.timedItems > 0 ? Math.round(s.totalTimeMs / s.timedItems / 1000) : 35;
      if (avgSecPerQuestion <= 30 && avgPct >= 60) {
        hasFastSolver = true;
      }
      return {
        subject: s.subjectCode,
        subjectCode: s.subjectCode,
        attempts: s.attempts,
        attemptsCount: s.attempts,
        totalQuestions: s.totalQuestions,
        avgPct,
        avgScore: avgPct,
        bestPct: s.bestPct,
        bestScore: s.bestPct,
        avgSecPerQuestion,
        avgSecsPerQuestion: avgSecPerQuestion,
      };
    });

    // 2. Earned Achievement Badges
    const badges = [
      {
        id: "first-attempt",
        title: "CBT Pioneer",
        description: "Completed your first official CBT session",
        icon: "🚀",
        earned: myAttempts.length >= 1,
        color: "#0284c7",
      },
      {
        id: "distinction-master",
        title: "Distinction Scholar",
        description: "Scored 75% or higher in a CBT session",
        icon: "🌟",
        earned: hasDistinction,
        color: "#15803d",
      },
      {
        id: "perfect-score",
        title: "100% Grandmaster",
        description: "Achieved a flawless 100% accuracy score",
        icon: "🏆",
        earned: hasPerfectScore,
        color: "#ca8a04",
      },
      {
        id: "speed-solver",
        title: "Speed & Precision",
        description: "Averaged ≤ 30s per question with ≥ 60% accuracy",
        icon: "⚡",
        earned: hasFastSolver,
        color: "#7c3aed",
      },
      {
        id: "multi-subject",
        title: "Multi-Subject Explorer",
        description: "Practiced across 2 or more academic subjects",
        icon: "🎓",
        earned: subjectMastery.length >= 2,
        color: "#db2777",
      },
      {
        id: "self-paced-scholar",
        title: "Self-Paced Learner",
        description: "Completed a Self-Paced Practice drill",
        icon: "📚",
        earned: hasPracticeMode,
        color: "#0d9488",
      },
    ];

    // 3. School / Class Top Performers Leaderboard
    const studentLeaderboardMap = new Map<
      number,
      {
        studentId: number;
        displayName: string;
        className: string;
        attemptsCount: number;
        totalQuestions: number;
        totalScorePctSum: number;
        bestScorePct: number;
      }
    >();

    const isStaffViewer = [
      "SUPER_ADMIN",
      "PRINCIPAL",
      "ADMIN",
      "Admin",
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
    ].some((r) => actor.roles.has(r));

    for (const att of allSubmitted) {
      if (!att.student) continue;
      const sId = att.student.StudentID;
      const totalQ = Math.max(1, att.questionCount);
      const correctCount = att.items.filter((i) => i.isCorrect === true).length;
      const pct =
        typeof att.scoreTenths === "number"
          ? Math.round(att.scoreTenths / 10)
          : Math.round((correctCount / totalQ) * 100);

      const isSelf = Boolean(student && sId === student.StudentID);
      const rawName =
        att.student.PreferredName ||
        `${att.student.FirstName || ""} ${att.student.LastName || ""}`.trim() ||
        `Student #${sId}`;
      // Privacy protection: never expose other minors' real full names on peer leaderboards
      const name = isStaffViewer
        ? rawName
        : isSelf
        ? `${rawName} (You)`
        : `Scholar #${String(sId).padStart(3, "0")}`;

      const entry = studentLeaderboardMap.get(sId) || {
        studentId: sId,
        displayName: name,
        className: att.student.Class?.ClassName || "Secondary",
        attemptsCount: 0,
        totalQuestions: 0,
        totalScorePctSum: 0,
        bestScorePct: 0,
      };

      entry.attemptsCount += 1;
      entry.totalQuestions += totalQ;
      entry.totalScorePctSum += pct;
      if (pct > entry.bestScorePct) entry.bestScorePct = pct;

      studentLeaderboardMap.set(sId, entry);
    }

    const leaderboard = Array.from(studentLeaderboardMap.values())
      .map((e) => {
        const avgScorePct = Math.round(e.totalScorePctSum / Math.max(1, e.attemptsCount));
        return {
          studentId: e.studentId,
          displayName: e.displayName,
          className: e.className,
          attempts: e.attemptsCount,
          attemptsCount: e.attemptsCount,
          totalQuestions: e.totalQuestions,
          avgPct: avgScorePct,
          avgScorePct,
          bestPct: e.bestScorePct,
          bestScorePct: e.bestScorePct,
          isCurrentUser: Boolean(student && e.studentId === student.StudentID),
        };
      })
      .sort((a, b) => b.avgScorePct - a.avgScorePct || b.totalQuestions - a.totalQuestions)
      .slice(0, 10)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));

    return {
      success: true,
      subjectMastery,
      subjectBreakdown: subjectMastery,
      badges,
      leaderboard,
    };
  } catch (error: any) {
    console.error("getCbtAnalyticsAndLeaderboard error:", error);
    return {
      success: false,
      subjectMastery: [],
      subjectBreakdown: [],
      badges: [],
      leaderboard: [],
    };
  }
}

import {
  computeBroadcastExpiry,
  DEFAULT_SCHOOL_NOTICES,
  isSchoolNoticeExpired,
  mergeSchoolNoticeAuditEvents,
  type BroadcastDurationPreset,
  type SchoolNoticeItem,
} from "@/lib/noticeboard";

// ============================================================================
// TRACK D: LIVE SCHOOL-WIDE NOTICEBOARD, CALENDAR & EXAM TIMETABLE
// ============================================================================

export type { SchoolNoticeItem };

const BROADCAST_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "ADMISSIONS",
  "ADMIN",
  "Admin",
];

export async function getSchoolNotices(options?: { includeExpired?: boolean }) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized", notices: [] as SchoolNoticeItem[], expiredNotices: [] as SchoolNoticeItem[] };
  }

  const canSeeExpired =
    Boolean(options?.includeExpired) &&
    BROADCAST_ADMIN_ROLES.some((r) => actor.roles.has(r));

  try {
    const dbRows = await prisma.schoolNotice.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 250,
    });

    let allItems: SchoolNoticeItem[] = dbRows.map((row) => ({
      id: row.id,
      type: row.type,
      category: row.category,
      title: row.title,
      eventDate: row.eventDate,
      targetAudience: row.targetAudience,
      details: row.details,
      color: row.color,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      durationPreset: (row.durationPreset as BroadcastDurationPreset) || "7d",
      durationLabel: row.durationLabel || undefined,
    }));

    // Backwards-compatible fallback ONLY when the dedicated SchoolNotice table is completely unseeded
    if (allItems.length === 0) {
      const legacyAuditRows = await prisma.auditLog.findMany({
        where: {
          Entity: "SchoolNotice",
          Action: { in: ["SCHOOL_NOTICE_PUBLISHED", "SCHOOL_NOTICE_DELETED"] },
        },
        orderBy: { CreatedAt: "desc" },
        take: 100,
      });
      allItems = mergeSchoolNoticeAuditEvents(legacyAuditRows);
    }

    const nowMs = Date.now();
    const activeNotices = allItems.filter((n) => !isSchoolNoticeExpired(n, nowMs));
    const expiredNotices = canSeeExpired
      ? allItems.filter((n) => isSchoolNoticeExpired(n, nowMs))
      : [];

    return {
      success: true,
      notices: activeNotices.length > 0 ? activeNotices : DEFAULT_SCHOOL_NOTICES,
      expiredNotices,
    };
  } catch {
    return {
      success: true,
      notices: DEFAULT_SCHOOL_NOTICES,
      expiredNotices: [] as SchoolNoticeItem[],
    };
  }
}

export async function publishSchoolNotice(data: {
  id?: string;
  type?: string;
  category?: string;
  title: string;
  eventDate: string;
  targetAudience?: string;
  details: string;
  durationPreset?: BroadcastDurationPreset;
  customExpiresAt?: string | null;
}) {
  try {
    const actor = await requireRole(BROADCAST_ADMIN_ROLES);

    const title = (data.title || "").trim().slice(0, 160);
    const details = (data.details || "").trim().slice(0, 2000);
    if (!title || !details) {
      return { success: false, error: "Notice title and details are required." };
    }

    const chosenType = (data.type || data.category || "Upcoming Event").trim();
    const preset: BroadcastDurationPreset = data.durationPreset || "7d";
    const expiryInfo = computeBroadcastExpiry(preset, data.customExpiresAt);
    if (expiryInfo.error) {
      return { success: false, error: expiryInfo.error };
    }

    const colorMap: Record<string, string> = {
      "Upcoming Event": "var(--color-primary-green)",
      "Exam Timetable": "var(--color-navy-blue)",
      Academics: "var(--color-navy-blue)",
      Deadline: "#dc2626",
      "Principal Broadcast": "#7c3aed",
    };

    const noticeId = (data.id || "").trim() || crypto.randomUUID();
    const eventDateVal = (data.eventDate || "Active Term").trim().slice(0, 60);
    const targetAudVal = (data.targetAudience || "All Portal Users").trim().slice(0, 80);
    const colorVal = colorMap[chosenType] || "var(--color-navy-blue)";

    const saved = await prisma.schoolNotice.upsert({
      where: { id: noticeId },
      update: {
        type: chosenType,
        category: chosenType,
        title,
        eventDate: eventDateVal,
        targetAudience: targetAudVal,
        details,
        color: colorVal,
        durationPreset: expiryInfo.durationPreset,
        durationLabel: expiryInfo.durationLabel,
        expiresAt: expiryInfo.expiresAt ? new Date(expiryInfo.expiresAt) : null,
        isDeleted: false,
      },
      create: {
        id: noticeId,
        type: chosenType,
        category: chosenType,
        title,
        eventDate: eventDateVal,
        targetAudience: targetAudVal,
        details,
        color: colorVal,
        durationPreset: expiryInfo.durationPreset,
        durationLabel: expiryInfo.durationLabel,
        expiresAt: expiryInfo.expiresAt ? new Date(expiryInfo.expiresAt) : null,
        isDeleted: false,
        createdById: actor.UserID,
      },
    });

    const notice: SchoolNoticeItem = {
      id: saved.id,
      type: saved.type,
      category: saved.category,
      title: saved.title,
      eventDate: saved.eventDate,
      targetAudience: saved.targetAudience,
      details: saved.details,
      color: saved.color,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
      expiresAt: saved.expiresAt ? saved.expiresAt.toISOString() : null,
      durationPreset: (saved.durationPreset as BroadcastDurationPreset) || expiryInfo.durationPreset,
      durationLabel: saved.durationLabel || expiryInfo.durationLabel,
    };

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "SCHOOL_NOTICE_PUBLISHED",
      entity: "SchoolNotice",
      entityId: noticeId,
      reason: `${data.id ? "Updated" : "Published"} broadcast (${expiryInfo.durationLabel}): ${notice.title}`,
      newValue: { id: notice.id, title: notice.title, expiresAt: notice.expiresAt },
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/admin");
    return { success: true, notice };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish notice",
    };
  }
}

export async function deleteSchoolNotice(noticeId: string, reason?: string) {
  try {
    const actor = await requireRole(BROADCAST_ADMIN_ROLES);
    const cleanId = String(noticeId || "").trim();
    if (!cleanId) {
      return { success: false, error: "Notice ID is required." };
    }

    await prisma.schoolNotice.updateMany({
      where: { id: cleanId },
      data: { isDeleted: true },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "SCHOOL_NOTICE_DELETED",
      entity: "SchoolNotice",
      entityId: cleanId,
      reason: reason?.trim() || "Removed broadcast from active noticeboard",
      newValue: {
        deleted: true,
        deletedBy: actor.Email,
        deletedAt: new Date().toISOString(),
      },
    });

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/admin");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete notice",
    };
  }
}
