"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  requireActiveUser,
  requireRole,
  writeAuditLog,
} from "@/lib/authz";

// ============================================================================
// TRACK A: TEACHER-CREATED CUSTOM CBT QUESTIONS & CLASS QUIZZES
// ============================================================================

export async function createCustomCbtQuestion(data: {
  subjectCode: string;
  examBody?: string;
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

    const subjectCode = (data.subjectCode || "english").trim().toLowerCase();
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

    const externalId = `wof-custom-${contentHash.slice(0, 16)}`;

    const created = await prisma.$transaction(async (tx) => {
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
          topic: data.topic?.trim() || "School Class Quiz",
          stem,
          optionsJson: optionsArr,
          isActive: true,
          licenseRef: `TEACHER:${actor.UserID}:${actor.Email}`,
        },
        create: {
          provider: "SCHOOL_INTERNAL",
          externalId,
          examBody,
          subjectCode,
          examYear: new Date().getFullYear(),
          topic: data.topic?.trim() || "School Class Quiz",
          stem,
          optionsJson: optionsArr,
          contentHash,
          licenseRef: `TEACHER:${actor.UserID}:${actor.Email}`,
          isActive: true,
        },
      });

      await tx.cbtAnswerKey.upsert({
        where: { questionId: q.id },
        update: {
          correctKey,
          explanation: data.explanation?.trim() || null,
        },
        create: {
          questionId: q.id,
          correctKey,
          explanation: data.explanation?.trim() || null,
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
    await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
      "SUPER_ADMIN",
      "PRINCIPAL",
      "Admin",
    ]);

    const whereClause: any = {
      provider: "SCHOOL_INTERNAL",
      isActive: true,
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
        topic: q.topic || "School Class Quiz",
        stem: q.stem,
        options: Array.isArray(q.optionsJson) ? q.optionsJson : [],
        correctKey: q.answerKey?.correctKey || "a",
        explanation: q.answerKey?.explanation || "",
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
// TRACK B: DIGITAL LESSON NOTES, STUDY MATERIALS & HOMEWORK HUB
// ============================================================================

export interface CourseMaterialItem {
  id: string;
  subjectName: string;
  classId: number;
  className: string;
  title: string;
  category: "Lesson Note" | "Homework Assignment" | "Revision Summary";
  weekLabel: string;
  content: string;
  dueDate?: string | null;
  teacherEmail: string;
  createdAt: string;
}

export async function publishCourseMaterial(data: {
  subjectName: string;
  classId?: number;
  className: string;
  title: string;
  category: "Lesson Note" | "Homework Assignment" | "Revision Summary";
  weekLabel: string;
  content: string;
  dueDate?: string;
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

    const title = (data.title || "").trim();
    const content = (data.content || "").trim();
    if (!title || !content) {
      return { success: false, error: "Title and lesson/assignment content are required." };
    }

    const materialId = crypto.randomUUID();
    const payload: CourseMaterialItem = {
      id: materialId,
      subjectName: (data.subjectName || "General Studies").trim(),
      classId: Number(data.classId) || 0,
      className: (data.className || "All Classes").trim(),
      title,
      category: data.category || "Lesson Note",
      weekLabel: (data.weekLabel || "Week 1").trim(),
      content,
      dueDate: data.dueDate?.trim() || null,
      teacherEmail: actor.Email,
      createdAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        ActorID: actor.UserID,
        Action: "COURSE_MATERIAL_PUBLISHED",
        Entity: "CourseMaterial",
        EntityID: materialId,
        Reason: `${payload.category}: ${payload.title} (${payload.className})`,
        NewValue: payload as any,
      },
    });

    revalidatePath("/portal/courses");
    revalidatePath("/portal/dashboard");
    return { success: true, material: payload };
  } catch (error: any) {
    console.error("publishCourseMaterial error:", error);
    return { success: false, error: error.message || "Failed to publish course material" };
  }
}

export async function deleteCourseMaterial(materialId: string) {
  try {
    const actor = await requireRole([
      "TEACHER",
      "FORM_MASTER",
      "Teacher",
      "SUPER_ADMIN",
      "PRINCIPAL",
      "Admin",
    ]);

    await prisma.auditLog.deleteMany({
      where: {
        Entity: "CourseMaterial",
        EntityID: materialId,
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "COURSE_MATERIAL_DELETED",
      targetTable: "CourseMaterial",
      targetId: materialId,
    });

    revalidatePath("/portal/courses");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete course material" };
  }
}

export async function getCourseMaterials(classId?: number, className?: string) {
  try {
    await requireActiveUser();

    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "CourseMaterial",
        Action: "COURSE_MATERIAL_PUBLISHED",
      },
      orderBy: { CreatedAt: "desc" },
      take: 100,
    });

    let materials: CourseMaterialItem[] = rows
      .map((r) => r.NewValue as unknown as CourseMaterialItem)
      .filter((m) => Boolean(m && m.title && m.content));

    // Provide default curriculum starter materials if none have been published yet
    if (materials.length === 0) {
      materials = [
        {
          id: "default-math-wk1",
          subjectName: "Mathematics",
          classId: classId || 1,
          className: className || "JSS 1A",
          title: "Indices, Logarithms & Number Bases — Complete Formula Guide",
          category: "Lesson Note",
          weekLabel: "Week 1 & 2",
          content:
            "1. Laws of Indices:\n• xᵃ × xᵇ = xᵃ⁺ᵇ\n• xᵃ ÷ xᵇ = xᵃ⁻ᵇ\n• (xᵃ)ᵇ = xᵃᵇ\n• x⁰ = 1 (where x ≠ 0)\n• x⁻ⁿ = 1 / xⁿ\n\n2. Standard Logarithm Identities:\n• log₁₀(AB) = log₁₀A + log₁₀B\n• log₁₀(A/B) = log₁₀A - log₁₀B\n• log₁₀(Aⁿ) = n·log₁₀A\n\nWorked Example:\nGiven log₁₀2 = 0.3010 and log₁₀3 = 0.4771, evaluate log₁₀18:\n18 = 2 × 3² → log₁₀18 = log₁₀2 + 2·log₁₀3 = 0.3010 + 2(0.4771) = 1.2552.",
          dueDate: null,
          teacherEmail: "teacher.test@wordoffaithschools.edu.ng",
          createdAt: new Date().toISOString(),
        },
        {
          id: "default-eng-wk1",
          subjectName: "English Language",
          classId: classId || 1,
          className: className || "JSS 1A",
          title: "Concord (Subject-Verb Agreement) & Lexis Practice Assignment",
          category: "Homework Assignment",
          weekLabel: "Week 2",
          content:
            "Core Rules of Concord:\n1. Singular subjects joined by 'as well as', 'together with', or 'along with' take a singular verb (e.g., 'The Principal, together with the teachers, IS attending the seminar').\n2. 'Neither... nor' and 'Either... or' agree with the noun closer to the verb (Proximity Concord).\n3. Indefinite pronouns ('everyone', 'each', 'nobody', 'someone') always take singular verbs.\n\nHomework Task:\nComplete a 10-question Self-Paced Practice session in English Language on the CBT Portal (/portal/cbt) and write down the AI Tutor explanation for any question you miss.",
          dueDate: "Friday, This Week",
          teacherEmail: "teacher.test@wordoffaithschools.edu.ng",
          createdAt: new Date().toISOString(),
        },
      ];
    } else if (classId || className) {
      const filtered = materials.filter(
        (m) =>
          (classId && m.classId === Number(classId)) ||
          (className && m.className.toLowerCase() === className.toLowerCase()) ||
          m.className === "All Classes"
      );
      if (filtered.length > 0) {
        materials = filtered;
      }
    }

    return { success: true, materials };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to load course materials", materials: [] };
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

    // Fetch all submitted attempts across the school for leaderboard + current student breakdown
    const allSubmitted = await prisma.cbtAttempt.findMany({
      where: { status: "SUBMITTED" },
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

    for (const att of allSubmitted) {
      if (!att.student) continue;
      const sId = att.student.StudentID;
      const totalQ = Math.max(1, att.questionCount);
      const correctCount = att.items.filter((i) => i.isCorrect === true).length;
      const pct =
        typeof att.scoreTenths === "number"
          ? Math.round(att.scoreTenths / 10)
          : Math.round((correctCount / totalQ) * 100);

      const name =
        att.student.PreferredName ||
        `${att.student.FirstName || ""} ${att.student.LastName || ""}`.trim() ||
        `Student #${sId}`;

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

// ============================================================================
// TRACK D: LIVE SCHOOL-WIDE NOTICEBOARD, CALENDAR & EXAM TIMETABLE
// ============================================================================

export interface SchoolNoticeItem {
  id: string;
  type: string;
  category: string;
  title: string;
  eventDate: string;
  targetAudience: string;
  details: string;
  color: string;
  createdAt: string;
}

const DEFAULT_NOTICES: SchoolNoticeItem[] = [
  {
    id: "default-notice-1",
    type: "Exam Timetable",
    category: "Exam Timetable",
    title: "First Term CBT & Written Examinations",
    eventDate: "Nov 23 – Dec 04, 2026",
    targetAudience: "All Portal Users",
    details:
      "First Term Continuous Assessment (CA 40) closes Nov 18. Terminal CBT & Written Exams (60 Marks) begin Monday, Nov 23 across all JSS and SSS arms.",
    color: "var(--color-navy-blue)",
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-notice-2",
    type: "Upcoming Event",
    category: "Upcoming Event",
    title: "PTA General Assembly & Open Day",
    eventDate: "Nov 14, 2026 • 10:00 AM",
    targetAudience: "Students & Parents",
    details:
      "Main School Auditorium. Parents are invited to review mid-term broadsheets and interact with Form Masters and Subject Teachers.",
    color: "var(--color-primary-green)",
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-notice-3",
    type: "Deadline",
    category: "Deadline",
    title: "First Term Tuition & Bursary Clearance",
    eventDate: "Nov 20, 2026",
    targetAudience: "Students & Parents",
    details:
      "Please complete tuition payment via Paystack or upload verified bank teller receipts in the Fees Portal before terminal result publication.",
    color: "#dc2626",
    createdAt: new Date().toISOString(),
  },
];

export async function getSchoolNotices() {
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "SchoolNotice",
        Action: "SCHOOL_NOTICE_PUBLISHED",
      },
      orderBy: { CreatedAt: "desc" },
      take: 25,
    });

    const customNotices: SchoolNoticeItem[] = rows
      .map((r) => {
        const val = r.NewValue as unknown as SchoolNoticeItem;
        if (!val) return null;
        return {
          ...val,
          type: val.type || val.category || "Academics",
          category: val.category || val.type || "Academics",
        };
      })
      .filter((n): n is SchoolNoticeItem => Boolean(n && n.title && n.details));

    return {
      success: true,
      notices: customNotices.length > 0 ? customNotices : DEFAULT_NOTICES,
    };
  } catch {
    return { success: true, notices: DEFAULT_NOTICES };
  }
}

export async function publishSchoolNotice(data: {
  type?: string;
  category?: string;
  title: string;
  eventDate: string;
  targetAudience?: string;
  details: string;
}) {
  try {
    const actor = await requireRole([
      "SUPER_ADMIN",
      "PRINCIPAL",
      "BURSAR",
      "ADMISSIONS",
      "Admin",
    ]);

    const title = (data.title || "").trim();
    const details = (data.details || "").trim();
    if (!title || !details) {
      return { success: false, error: "Notice title and details are required." };
    }

    const chosenType = (data.type || data.category || "Upcoming Event").trim();

    const colorMap: Record<string, string> = {
      "Upcoming Event": "var(--color-primary-green)",
      "Exam Timetable": "var(--color-navy-blue)",
      Academics: "var(--color-navy-blue)",
      Deadline: "#dc2626",
      "Principal Broadcast": "#7c3aed",
    };

    const noticeId = crypto.randomUUID();
    const notice: SchoolNoticeItem = {
      id: noticeId,
      type: chosenType,
      category: chosenType,
      title,
      eventDate: (data.eventDate || "Active Term").trim(),
      targetAudience: data.targetAudience || "All Portal Users",
      details,
      color: colorMap[chosenType] || "var(--color-navy-blue)",
      createdAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        ActorID: actor.UserID,
        Action: "SCHOOL_NOTICE_PUBLISHED",
        Entity: "SchoolNotice",
        EntityID: noticeId,
        Reason: `${notice.category}: ${notice.title}`,
        NewValue: notice as any,
      },
    });

    revalidatePath("/portal/dashboard");
    return { success: true, notice };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to publish notice" };
  }
}

export async function deleteSchoolNotice(noticeId: string) {
  try {
    await requireRole(["SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS", "Admin"]);

    await prisma.auditLog.deleteMany({
      where: {
        Entity: "SchoolNotice",
        EntityID: noticeId,
      },
    });

    revalidatePath("/portal/dashboard");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete notice" };
  }
}
