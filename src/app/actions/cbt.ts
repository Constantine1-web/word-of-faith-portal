"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { fetchQuestions } from "@/lib/cbt-api";
import {
  requireActiveUser,
  can,
  writeAuditLog,
} from "@/lib/authz";
import { IntegrityEventType, AttemptMode } from "@prisma/client";

// Decision 10.3: 2 Hard Strikes before terminating attempt & locking for the current Lagos day
const CBT_HARD_STRIKES_BEFORE_LOCK = Number(process.env.CBT_HARD_STRIKES_BEFORE_LOCK || 2);
const DAILY_ATTEMPT_CAP = 5;

const HARD_EVENTS = new Set<IntegrityEventType>([
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "MULTI_SESSION",
]);

/**
 * Returns the current date string (YYYY-MM-DD) in the Africa/Lagos timezone (UTC+1).
 */
export async function getLagosDayKey(date: Date = new Date()): Promise<string> {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Resolves the Student profile for the currently authenticated user, creating a default practice profile
 * if a staff member is testing the CBT environment.
 */
async function resolveCurrentStudent() {
  const actor = await requireActiveUser();

  let student = await prisma.student.findFirst({
    where: { UserID: actor.UserID },
    include: { Class: true },
  });

  if (!student && (actor.roles.has("TEACHER") || actor.roles.has("PRINCIPAL") || actor.roles.has("SUPER_ADMIN"))) {
    // Allow staff to test CBT using the first enrolled student profile or a staff sandbox check
    student = await prisma.student.findFirst({
      include: { Class: true },
      orderBy: { StudentID: "asc" },
    });
  }

  if (!student) {
    throw new Error("No student profile is linked to this account.");
  }

  return { actor, student };
}

/**
 * Checks if the student has an active (unlifted) CbtDayLock for today's Lagos date.
 */
async function assertNotDayLocked(studentId: number) {
  const dayKey = await getLagosDayKey();
  const lock = await prisma.cbtDayLock.findUnique({
    where: {
      studentId_dayKey: {
        studentId,
        dayKey,
      },
    },
  });

  if (lock && !lock.liftedAt) {
    return {
      isLocked: true,
      lock,
      dayKey,
    };
  }

  return {
    isLocked: false,
    lock: null,
    dayKey,
  };
}

/**
 *Deterministic Fisher-Yates shuffle seeded by string.
 */
function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    hash ^= i + 1;
    hash = Math.imul(hash, 16777619);
    const j = Math.abs(hash) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Section 7.6: Fetches current student CBT status, active attempt, and day-lock status.
 */
export async function getCbtStudentStatus() {
  try {
    const { actor, student } = await resolveCurrentStudent();
    const { isLocked, lock, dayKey } = await assertNotDayLocked(student.StudentID);

    const activeAttempt = await prisma.cbtAttempt.findFirst({
      where: {
        studentId: student.StudentID,
        status: "ACTIVE",
      },
      orderBy: { startedAt: "desc" },
    });

    // If activeAttempt has expired past grace period, auto-expire it
    if (activeAttempt && new Date() > new Date(activeAttempt.expiresAt.getTime() + 5000)) {
      await submitAttempt(activeAttempt.id);
    }

    const recentAttempts = await prisma.cbtAttempt.findMany({
      where: { studentId: student.StudentID },
      orderBy: { startedAt: "desc" },
      take: 8,
    });

    return {
      success: true,
      student: {
        studentId: student.StudentID,
        name: student.PreferredName || `${student.FirstName || ""} ${student.LastName || ""}`.trim() || student.AdmissionNo,
        admissionNo: student.AdmissionNo,
        className: student.Class?.ClassName || "General",
      },
      dayKey,
      isLocked,
      lockReason: lock?.reason || null,
      activeAttemptId:
        activeAttempt && new Date() <= new Date(activeAttempt.expiresAt.getTime() + 5000)
          ? activeAttempt.id
          : null,
      recentAttempts,
      isStaffSupervisor:
        actor.roles.has("TEACHER") ||
        actor.roles.has("FORM_MASTER") ||
        actor.roles.has("PRINCIPAL") ||
        actor.roles.has("SUPER_ADMIN"),
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to load CBT status" };
  }
}

/**
 * Section 7.4 & 7.6: Starts a server-authoritative CBT attempt.
 * Ingests questions into CbtQuestion and isolates the answer key in CbtAnswerKey.
 * Never returns answer keys to the client.
 */
export async function startAttempt(params: {
  subjectCode: string;
  examBody?: string;
  mode?: "PRACTICE" | "MOCK";
  questionCount?: number;
}) {
  try {
    const { actor, student } = await resolveCurrentStudent();
    const { isLocked, lock, dayKey } = await assertNotDayLocked(student.StudentID);

    if (isLocked) {
      return {
        success: false,
        dayLocked: true,
        error: `CBT access is locked for today (${dayKey}) due to exam integrity violations: ${lock?.reason}. Contact your Subject Teacher or Principal to lift this lock.`,
      };
    }

    const subjectCode = params.subjectCode.toLowerCase().trim();
    const examBody = (params.examBody || "WASSCE").toUpperCase().trim();
    const mode: AttemptMode = params.mode === "MOCK" ? "MOCK" : "PRACTICE";
    const requestedCount = Math.min(Math.max(5, Number(params.questionCount || 10)), 50);

    // Check if an ACTIVE attempt already exists for this student
    const existingActive = await prisma.cbtAttempt.findFirst({
      where: {
        studentId: student.StudentID,
        status: "ACTIVE",
      },
    });

    if (existingActive) {
      if (new Date() <= existingActive.expiresAt) {
        return {
          success: true,
          attemptId: existingActive.id,
          expiresAt: existingActive.expiresAt.toISOString(),
          questionCount: existingActive.questionCount,
          resumed: true,
        };
      } else {
        // Auto-submit expired active attempt before starting a new one
        await submitAttempt(existingActive.id);
      }
    }

    // Check daily cap
    const todayAttemptCount = await prisma.cbtAttempt.count({
      where: {
        studentId: student.StudentID,
        dayKey,
      },
    });

    if (todayAttemptCount >= DAILY_ATTEMPT_CAP && !actor.roles.has("PRINCIPAL") && !actor.roles.has("TEACHER")) {
      return {
        success: false,
        error: `Daily attempt limit (${DAILY_ATTEMPT_CAP} attempts per day) reached for ${dayKey}. Please resume tomorrow.`,
      };
    }

    // Ensure question bank has items for this subject; ingest from provider if needed
    const rawFetched = await fetchQuestions(subjectCode, requestedCount, examBody);
    if (!rawFetched || rawFetched.length === 0) {
      return {
        success: false,
        error: `No verified CBT questions available for ${subjectCode.toUpperCase()} (${examBody}).`,
      };
    }

    // Persist questions into CbtQuestion and isolate answers in CbtAnswerKey
    const storedQuestionIds: string[] = [];
    for (const item of rawFetched) {
      const externalId = String(item.id || crypto.createHash("md5").update(item.question).digest("hex"));
      const optionsArr = Object.entries(item.option || {})
        .filter(([, val]) => Boolean(val))
        .map(([key, text]) => ({
          key: key.toLowerCase(),
          text: String(text),
        }));

      const contentHash = crypto
        .createHash("sha256")
        .update(`${subjectCode}:${item.question}:${JSON.stringify(optionsArr)}`)
        .digest("hex");

      const upsertedQ = await prisma.cbtQuestion.upsert({
        where: {
          provider_externalId: {
            provider: "SDASH_ALOC",
            externalId: `${subjectCode}-${externalId}`,
          },
        },
        update: {
          stem: item.question,
          optionsJson: optionsArr,
          imageUrl: item.image || null,
        },
        create: {
          provider: "SDASH_ALOC",
          externalId: `${subjectCode}-${externalId}`,
          examBody,
          subjectCode,
          examYear: item.examyear ? parseInt(item.examyear, 10) || null : null,
          stem: item.question,
          imageUrl: item.image || null,
          optionsJson: optionsArr,
          contentHash,
          licenseRef: "WOF-CBT-EDU-2026",
          isActive: true,
        },
      });

      await prisma.cbtAnswerKey.upsert({
        where: { questionId: upsertedQ.id },
        update: {
          correctKey: (item.answer || "a").toLowerCase().trim(),
          explanation: item.solution || null,
        },
        create: {
          questionId: upsertedQ.id,
          correctKey: (item.answer || "a").toLowerCase().trim(),
          explanation: item.solution || null,
        },
      });

      storedQuestionIds.push(upsertedQ.id);
    }

    const seed = crypto.randomBytes(8).toString("hex");
    const shuffledIds = seededShuffle(storedQuestionIds, seed).slice(0, requestedCount);
    const durationSec = shuffledIds.length * 60; // 60 seconds per question
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationSec * 1000);

    const attempt = await prisma.$transaction(async (tx) => {
      const createdAttempt = await tx.cbtAttempt.create({
        data: {
          studentId: student.StudentID,
          subjectCode,
          examBody,
          mode,
          status: "ACTIVE",
          seed,
          questionCount: shuffledIds.length,
          durationSec,
          startedAt,
          expiresAt,
          dayKey,
          hardStrikes: 0,
          sessionId: String(actor.UserID),
        },
      });

      for (let idx = 0; idx < shuffledIds.length; idx++) {
        const qId = shuffledIds[idx];
        const optionKeys = seededShuffle(["a", "b", "c", "d"], `${seed}:${idx}`);
        await tx.cbtAttemptQuestion.create({
          data: {
            attemptId: createdAttempt.id,
            questionId: qId,
            position: idx + 1,
            optionOrder: optionKeys,
          },
        });
      }

      return createdAttempt;
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "CBT_ATTEMPT_START",
      entity: "CbtAttempt",
      entityId: attempt.id,
      newValue: {
        studentId: student.StudentID,
        subjectCode,
        examBody,
        mode,
        questionCount: attempt.questionCount,
        expiresAt: attempt.expiresAt,
      },
    });

    return {
      success: true,
      attemptId: attempt.id,
      expiresAt: attempt.expiresAt.toISOString(),
      questionCount: attempt.questionCount,
      resumed: false,
    };
  } catch (error: any) {
    console.error("startAttempt error:", error);
    return { success: false, error: error.message || "Failed to start CBT attempt" };
  }
}

/**
 * Section 7.4 & 7.6: Returns ONLY question `position` (1-indexed) of an ACTIVE attempt.
 * Never returns CbtAnswerKey or prefetches other questions.
 */
export async function getQuestion(attemptId: string, position: number) {
  try {
    const { student } = await resolveCurrentStudent();
    const { isLocked, lock, dayKey } = await assertNotDayLocked(student.StudentID);

    if (isLocked) {
      return {
        success: false,
        dayLocked: true,
        error: `CBT access is locked for ${dayKey}: ${lock?.reason}`,
      };
    }

    const attempt = await prisma.cbtAttempt.findUnique({
      where: { id: attemptId },
      include: {
        items: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            selectedKey: true,
          },
        },
      },
    });

    if (!attempt || attempt.studentId !== student.StudentID) {
      return { success: false, error: "Forbidden: Attempt does not belong to current student." };
    }

    if (attempt.status === "TERMINATED") {
      return {
        success: false,
        terminated: true,
        error: attempt.terminationReason || "Exam attempt was terminated due to integrity policy violation.",
      };
    }

    if (attempt.status !== "ACTIVE") {
      return {
        success: false,
        submitted: true,
        error: "This exam attempt has already been submitted.",
      };
    }

    if (new Date() > new Date(attempt.expiresAt.getTime() + 5000)) {
      await submitAttempt(attempt.id);
      return {
        success: false,
        expired: true,
        error: "Exam time has expired. Your attempt has been automatically submitted.",
      };
    }

    const pos = Math.min(Math.max(1, Number(position)), attempt.questionCount);

    const item = await prisma.cbtAttemptQuestion.findUnique({
      where: {
        attemptId_position: {
          attemptId: attempt.id,
          position: pos,
        },
      },
      include: {
        question: {
          // Strictly select question fields ONLY — never include answerKey
          select: {
            id: true,
            examBody: true,
            subjectCode: true,
            examYear: true,
            stem: true,
            imageUrl: true,
            optionsJson: true,
          },
        },
      },
    });

    if (!item) {
      return { success: false, error: "Question slot not found." };
    }

    const rawOptions = Array.isArray(item.question.optionsJson)
      ? (item.question.optionsJson as { key: string; text: string }[])
      : [];
    const order = Array.isArray(item.optionOrder) ? (item.optionOrder as string[]) : ["a", "b", "c", "d"];

    const orderedOptions = order
      .map((k) => rawOptions.find((o) => o.key === k))
      .filter((o): o is { key: string; text: string } => Boolean(o));

    return {
      success: true,
      attempt: {
        id: attempt.id,
        subjectCode: attempt.subjectCode,
        examBody: attempt.examBody,
        mode: attempt.mode,
        questionCount: attempt.questionCount,
        expiresAt: attempt.expiresAt.toISOString(),
        hardStrikes: attempt.hardStrikes,
        maxStrikes: CBT_HARD_STRIKES_BEFORE_LOCK,
        answeredMap: attempt.items.reduce(
          (acc, cur) => {
            acc[cur.position] = Boolean(cur.selectedKey);
            return acc;
          },
          {} as Record<number, boolean>
        ),
      },
      watermark: {
        studentName:
          student.PreferredName ||
          `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
          student.AdmissionNo,
        admissionNo: student.AdmissionNo,
        attemptId: attempt.id.slice(-8).toUpperCase(),
        timestamp: new Date().toISOString(),
      },
      question: {
        position: item.position,
        stem: item.question.stem,
        imageUrl: item.question.imageUrl,
        examBody: item.question.examBody,
        examYear: item.question.examYear,
        options: orderedOptions.length > 0 ? orderedOptions : rawOptions,
        selectedKey: item.selectedKey,
      },
    };
  } catch (error: any) {
    console.error("getQuestion error:", error);
    return { success: false, error: error.message || "Failed to load question" };
  }
}

/**
 * Section 7.6: Saves a student's answer for a single question position.
 * Accepts answers until expiresAt + 5 seconds grace window.
 */
export async function saveAnswer(params: {
  attemptId: string;
  position: number;
  selectedKey: string;
  timeSpentMs?: number;
}) {
  try {
    const { student } = await resolveCurrentStudent();
    const { isLocked } = await assertNotDayLocked(student.StudentID);
    if (isLocked) {
      return { success: false, dayLocked: true, error: "CBT access is locked for today." };
    }

    const attempt = await prisma.cbtAttempt.findUnique({
      where: { id: params.attemptId },
    });

    if (!attempt || attempt.studentId !== student.StudentID || attempt.status !== "ACTIVE") {
      return { success: false, error: "Attempt is no longer active." };
    }

    // 5-second grace period on network transit
    if (new Date() > new Date(attempt.expiresAt.getTime() + 5000)) {
      await submitAttempt(attempt.id);
      return { success: false, expired: true, error: "Exam timer expired." };
    }

    const cleanKey = params.selectedKey.toLowerCase().trim();
    if (!["a", "b", "c", "d", "e"].includes(cleanKey)) {
      return { success: false, error: "Invalid option key." };
    }

    await prisma.cbtAttemptQuestion.update({
      where: {
        attemptId_position: {
          attemptId: attempt.id,
          position: Number(params.position),
        },
      },
      data: {
        selectedKey: cleanKey,
        answeredAt: new Date(),
        timeSpentMs: params.timeSpentMs ? Math.max(0, Math.round(params.timeSpentMs)) : undefined,
      },
    });

    // Log SOFT FAST_ANSWER signal if answered in under 1.2 seconds
    if (typeof params.timeSpentMs === "number" && params.timeSpentMs > 0 && params.timeSpentMs < 1200) {
      await prisma.cbtIntegrityEvent.create({
        data: {
          attemptId: attempt.id,
          type: "FAST_ANSWER",
          isHard: false,
          meta: { position: params.position, timeSpentMs: params.timeSpentMs },
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to save answer" };
  }
}

/**
 * Section 7.3 & 7.6: Server-authoritative Heartbeat & Integrity Event Processor.
 * Implements the 2-Strike policy:
 * - Strike 1: 10-second full-screen warning banner
 * - Strike 2: Immediate attempt termination + CbtDayLock for current Africa/Lagos day
 */
export async function reportIntegrityEvent(params: {
  attemptId: string;
  type: IntegrityEventType;
  durationMs?: number;
  meta?: Record<string, unknown>;
}) {
  try {
    const { actor, student } = await resolveCurrentStudent();
    const attempt = await prisma.cbtAttempt.findUnique({
      where: { id: params.attemptId },
    });

    if (!attempt || attempt.studentId !== student.StudentID || attempt.status !== "ACTIVE") {
      return { success: false, status: attempt?.status || "INACTIVE" };
    }

    // Ignore tab/blur durations shorter than 3 seconds per Section 7.3
    const isHardCandidate = HARD_EVENTS.has(params.type);
    const qualifiesAsHard =
      isHardCandidate &&
      (params.type === "FULLSCREEN_EXIT" ||
        params.type === "MULTI_SESSION" ||
        (params.durationMs ?? 3500) >= 3000);

    await prisma.cbtIntegrityEvent.create({
      data: {
        attemptId: attempt.id,
        type: params.type,
        isHard: qualifiesAsHard,
        clientAt: new Date(),
        meta: params.meta ? JSON.parse(JSON.stringify(params.meta)) : undefined,
      },
    });

    if (!qualifiesAsHard) {
      await prisma.cbtAttempt.update({
        where: { id: attempt.id },
        data: { lastHeartbeatAt: new Date() },
      });
      return {
        success: true,
        status: "ACTIVE",
        hardStrikes: attempt.hardStrikes,
        maxStrikes: CBT_HARD_STRIKES_BEFORE_LOCK,
      };
    }

    const nextStrikes = attempt.hardStrikes + 1;
    const shouldTerminate = nextStrikes >= CBT_HARD_STRIKES_BEFORE_LOCK;

    if (shouldTerminate) {
      const reason = `Terminated after ${nextStrikes}/${CBT_HARD_STRIKES_BEFORE_LOCK} hard integrity violations (last event: ${params.type}).`;

      await prisma.$transaction(async (tx) => {
        await tx.cbtAttempt.update({
          where: { id: attempt.id },
          data: {
            hardStrikes: nextStrikes,
            status: "TERMINATED",
            terminationReason: reason,
            submittedAt: new Date(),
          },
        });

        await tx.cbtDayLock.upsert({
          where: {
            studentId_dayKey: {
              studentId: student.StudentID,
              dayKey: attempt.dayKey,
            },
          },
          update: {
            attemptId: attempt.id,
            reason,
            liftedAt: null,
            liftedById: null,
            liftReason: null,
          },
          create: {
            studentId: student.StudentID,
            dayKey: attempt.dayKey,
            attemptId: attempt.id,
            reason,
          },
        });

        await writeAuditLog({
          tx,
          actorId: actor.UserID,
          action: "CBT_ATTEMPT_TERMINATED_AND_DAY_LOCKED",
          entity: "CbtAttempt",
          entityId: attempt.id,
          reason,
          newValue: {
            studentId: student.StudentID,
            dayKey: attempt.dayKey,
            hardStrikes: nextStrikes,
            event: params.type,
          },
        });
      });

      return {
        success: true,
        status: "TERMINATED",
        dayLocked: true,
        hardStrikes: nextStrikes,
        maxStrikes: CBT_HARD_STRIKES_BEFORE_LOCK,
        message: reason,
      };
    }

    // Strike 1 Warning
    await prisma.cbtAttempt.update({
      where: { id: attempt.id },
      data: {
        hardStrikes: nextStrikes,
        lastHeartbeatAt: new Date(),
      },
    });

    return {
      success: true,
      status: "WARNING",
      hardStrikes: nextStrikes,
      maxStrikes: CBT_HARD_STRIKES_BEFORE_LOCK,
      message: `STRIKE ${nextStrikes} OF ${CBT_HARD_STRIKES_BEFORE_LOCK}: Focus loss or fullscreen exit detected (${params.type}). Return to the exam immediately—one more violation will terminate your attempt and lock your CBT access for today.`,
    };
  } catch (error: any) {
    console.error("reportIntegrityEvent error:", error);
    return { success: false, error: error.message };
  }
}

export async function sendAttemptHeartbeat(attemptId: string) {
  try {
    const { student } = await resolveCurrentStudent();
    const attempt = await prisma.cbtAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentId !== student.StudentID || attempt.status !== "ACTIVE") {
      return { success: false, status: attempt?.status || "INACTIVE" };
    }

    const now = new Date();
    if (now > new Date(attempt.expiresAt.getTime() + 5000)) {
      await submitAttempt(attempt.id);
      return { success: true, status: "EXPIRED" };
    }

    // If gap since lastHeartbeatAt > 45s without a client HARD event, log as DISCONNECT (Section 7.3)
    if (attempt.lastHeartbeatAt && now.getTime() - attempt.lastHeartbeatAt.getTime() > 45000) {
      await prisma.cbtIntegrityEvent.create({
        data: {
          attemptId: attempt.id,
          type: "DISCONNECT",
          isHard: false,
          meta: { gapMs: now.getTime() - attempt.lastHeartbeatAt.getTime() },
        },
      });
    }

    await prisma.cbtAttempt.update({
      where: { id: attempt.id },
      data: { lastHeartbeatAt: now },
    });

    return {
      success: true,
      status: "ACTIVE",
      serverTime: now.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      hardStrikes: attempt.hardStrikes,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Section 7.4 & 7.6: Grades an attempt inside a single transaction by joining CbtAnswerKey ONLY at submission.
 */
export async function submitAttempt(attemptId: string) {
  try {
    const { actor, student } = await resolveCurrentStudent();

    const attempt = await prisma.cbtAttempt.findUnique({
      where: { id: attemptId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            question: {
              include: {
                answerKey: true,
              },
            },
          },
        },
      },
    });

    if (!attempt || attempt.studentId !== student.StudentID) {
      return { success: false, error: "Attempt not found." };
    }

    if (attempt.status === "TERMINATED") {
      return {
        success: false,
        terminated: true,
        error: attempt.terminationReason || "Attempt was terminated due to integrity violations.",
      };
    }

    let correctCount = 0;
    const reviewItems: {
      position: number;
      stem: string;
      imageUrl: string | null;
      options: { key: string; text: string }[];
      selectedKey: string | null;
      correctKey: string;
      isCorrect: boolean;
      explanation: string | null;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of attempt.items) {
        const correctKey = (item.question.answerKey?.correctKey || "a").toLowerCase().trim();
        const isCorrect = Boolean(item.selectedKey && item.selectedKey.toLowerCase() === correctKey);
        if (isCorrect) correctCount++;

        if (attempt.status === "ACTIVE") {
          await tx.cbtAttemptQuestion.update({
            where: { id: item.id },
            data: { isCorrect },
          });
        }

        const rawOptions = Array.isArray(item.question.optionsJson)
          ? (item.question.optionsJson as { key: string; text: string }[])
          : [];

        reviewItems.push({
          position: item.position,
          stem: item.question.stem,
          imageUrl: item.question.imageUrl,
          options: rawOptions,
          selectedKey: item.selectedKey,
          correctKey,
          isCorrect,
          explanation: item.question.answerKey?.explanation || null,
        });
      }

      const percentageTenths =
        attempt.questionCount > 0 ? Math.trunc((correctCount / attempt.questionCount) * 1000) : 0;

      if (attempt.status === "ACTIVE") {
        await tx.cbtAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "SUBMITTED",
            submittedAt: new Date(),
            scoreTenths: percentageTenths,
          },
        });

        await writeAuditLog({
          tx,
          actorId: actor.UserID,
          action: "CBT_ATTEMPT_SUBMITTED",
          entity: "CbtAttempt",
          entityId: attempt.id,
          newValue: {
            studentId: student.StudentID,
            correctCount,
            questionCount: attempt.questionCount,
            scoreTenths: percentageTenths,
          },
        });
      }
    });

    return {
      success: true,
      summary: {
        attemptId: attempt.id,
        subjectCode: attempt.subjectCode,
        examBody: attempt.examBody,
        correctCount,
        questionCount: attempt.questionCount,
        percentage: attempt.questionCount > 0 ? Math.trunc((correctCount / attempt.questionCount) * 100) : 0,
        hardStrikes: attempt.hardStrikes,
      },
      reviewItems,
    };
  } catch (error: any) {
    console.error("submitAttempt error:", error);
    return { success: false, error: error.message || "Failed to submit attempt" };
  }
}

// ==========================================
// ADMIN / TEACHER: CBT INTEGRITY & DAY-LOCK MANAGEMENT (Section 7.3 & 7.6)
// ==========================================

export async function getCbtIntegrityDashboard() {
  try {
    const actor = await requireActiveUser();
    if (!can(actor, "cbt:lift_lock") && !actor.roles.has("SUPER_ADMIN")) {
      return { success: false, error: "Forbidden: Staff privileges required." };
    }

    const activeLocks = await prisma.cbtDayLock.findMany({
      include: {
        student: {
          include: { Class: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const recentEvents = await prisma.cbtIntegrityEvent.findMany({
      include: {
        attempt: {
          include: {
            student: {
              include: { Class: true },
            },
          },
        },
      },
      orderBy: { serverAt: "desc" },
      take: 40,
    });

    return {
      success: true,
      activeLocks,
      recentEvents,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch CBT integrity logs" };
  }
}

export async function liftCbtDayLock(lockId: string, reason: string) {
  try {
    const actor = await requireActiveUser();
    if (!can(actor, "cbt:lift_lock")) {
      return {
        success: false,
        error: "Forbidden: Only a Subject Teacher, Form Master, or the Principal may lift a CBT Day Lock.",
      };
    }

    if (!reason || reason.trim().length < 5) {
      return {
        success: false,
        error: "A written reason (minimum 5 characters) is mandatory to lift a CBT Day Lock.",
      };
    }

    const updated = await prisma.cbtDayLock.update({
      where: { id: lockId },
      data: {
        liftedById: actor.UserID,
        liftedAt: new Date(),
        liftReason: reason.trim(),
      },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "CBT_DAY_LOCK_LIFTED",
      entity: "CbtDayLock",
      entityId: updated.id,
      reason: reason.trim(),
      newValue: {
        studentId: updated.studentId,
        dayKey: updated.dayKey,
        liftedById: actor.UserID,
      },
    });

    revalidatePath("/portal/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to lift CBT day lock" };
  }
}
