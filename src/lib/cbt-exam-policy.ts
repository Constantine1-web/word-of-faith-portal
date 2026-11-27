import { hashTokenSha256, timingSafeCompare } from "@/lib/security";

export type BankScopeValue = "OPEN_BANK" | "EXAM_ONLY";

/**
 * Normalizes an optional invigilator exam PIN / access code before hashing or verification.
 */
export function normalizeExamPin(pin?: string | null): string {
  return String(pin ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();
}

/**
 * Hashes an exam access PIN using SHA-256 with the project pepper when present.
 */
export function hashExamPin(pin: string): string {
  const normalized = normalizeExamPin(pin);
  if (!normalized || normalized.length < 4) {
    throw new Error("Invigilator exam passcode must be at least 4 characters.");
  }
  const pepper = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "wofs-cbt-exam-pin";
  return hashTokenSha256(`${pepper}:EXAM_PIN:${normalized}`);
}

/**
 * Constant-time PIN verification for Strict Exam entry.
 */
export function verifyExamPin(candidatePin: string | null | undefined, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return true;
  const normalized = normalizeExamPin(candidatePin);
  if (!normalized) return false;
  const candidateHash = hashTokenSha256(
    `${process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "wofs-cbt-exam-pin"}:EXAM_PIN:${normalized}`
  );
  return timingSafeCompare(candidateHash, expectedHash);
}

/**
 * Evaluates whether a scheduled CBT exam is currently live and within its configured time window.
 */
export function evaluateExamWindow(
  exam: {
    status: string;
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
  },
  now: Date = new Date()
): { eligible: boolean; reason?: string } {
  if (exam.status === "CLOSED") {
    return { eligible: false, reason: "This examination has been closed by the Examiner." };
  }
  if (exam.status === "DRAFT") {
    return { eligible: false, reason: "This examination is still a draft and has not been published." };
  }
  if (exam.status !== "LIVE") {
    return { eligible: false, reason: "This examination has not been opened by the Examiner / Invigilator yet." };
  }

  if (exam.startsAt) {
    const start = new Date(exam.startsAt);
    if (!Number.isNaN(start.getTime()) && now < start) {
      return {
        eligible: false,
        reason: `This examination opens at ${start.toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}.`,
      };
    }
  }

  if (exam.endsAt) {
    const end = new Date(exam.endsAt);
    if (!Number.isNaN(end.getTime()) && now > end) {
      return {
        eligible: false,
        reason: "The official examination window has ended.",
      };
    }
  }

  return { eligible: true };
}

/**
 * Enforces Exam Strict Mode confidentiality rules:
 * - Official EXAM mode NEVER exposes correct answers, explanations, or AI solutions
 *   until `answersReleased === true`.
 * - Numeric percentage/score is revealed immediately only if `revealScoreAfterSubmit === true`
 *   OR once `answersReleased === true`.
 */
export function getExamPostSubmitVisibility(
  attemptMode: string,
  scheduledExam?: {
    revealScoreAfterSubmit?: boolean;
    answersReleased?: boolean;
  } | null
): {
  canSeeScore: boolean;
  canSeeAnswersAndAi: boolean;
} {
  if (attemptMode !== "EXAM") {
    return { canSeeScore: true, canSeeAnswersAndAi: true };
  }

  const answersReleased = Boolean(scheduledExam?.answersReleased);
  const revealScore = Boolean(scheduledExam?.revealScoreAfterSubmit) || answersReleased;

  return {
    canSeeScore: revealScore,
    canSeeAnswersAndAi: answersReleased,
  };
}

export function normalizeTargetColumnWeight(
  targetColumn: "ca" | "exam",
  maxWeight?: number | null
): number {
  const cap = targetColumn === "ca" ? 40 : 60;
  const fallback = targetColumn === "ca" ? 20 : 60;
  const parsed = Number(maxWeight);
  const raw = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
  return Math.min(cap, Math.max(5, raw));
}

export type SyncTarget = "EXAM_TOTAL" | "EXAM_CBT_COMPONENT" | "CA";
export type CommitMode = "FULL_EXAM" | "HYBRID_CBT_COMPONENT";

export interface GradebookSyncCandidate {
  studentId: number;
  attemptId?: string | null;
  scoreTenths: number | null;
  existingCaScore: number | null;
  existingExamScore: number | null;
  existingExamCbtTenths?: number | null;
  existingExamTheoryTenths?: number | null;
  existingLastSyncAttemptId?: string | null;
  existingStatus?: string | null;
}

export interface GradebookSyncPlannedRow {
  studentId: number;
  attemptId?: string | null;
  willUpdate: boolean;
  skipReason?:
    | "NO_ATTEMPT"
    | "PRESERVED_EXISTING"
    | "EXEMPT_OR_ABSENT"
    | "UNCHANGED"
    | "INVALID_OVER_MAX";
  nextCaScore: number | null;
  nextExamScore: number | null;
  nextExamCbtTenths?: number | null;
  preservedTheoryTenths?: number | null;
  resultingHybridTotalTenths?: number | null;
  hybridResultStatus?: "PENDING" | "PARTIALLY_MARKED" | "COMPLETED";
  scaledScore: number | null;
}

export type GradebookOverwriteMode = "OVERWRITE_MATCHED" | "FILL_BLANKS_ONLY";

/**
 * Pure deterministic planner for syncing official scheduled CBT exam scores
 * into the Result gradebook (`CAScore` up to 40, `ExamScore` up to 60, or
 * Hybrid `ExamCbtTenths` while strictly preserving handwritten `ExamTheoryTenths`).
 */
export function planStrictExamGradebookSync(params: {
  candidates: GradebookSyncCandidate[];
  targetColumn: "ca" | "exam";
  syncTarget?: SyncTarget;
  maxWeight: number;
  examCbtMaxTenths?: number;
  examTheoryMaxTenths?: number;
  overwriteMode?: GradebookOverwriteMode;
}): {
  targetColumn: "ca" | "exam";
  syncTarget: SyncTarget;
  maxWeight: number;
  overwriteMode: GradebookOverwriteMode;
  updatedCount: number;
  skippedCount: number;
  unchangedCount: number;
  preservedCount: number;
  partiallyMarkedCount: number;
  blockedCount: number;
  absentOrExemptCount: number;
  rows: GradebookSyncPlannedRow[];
} {
  const syncTarget: SyncTarget =
    params.syncTarget ?? (params.targetColumn === "ca" ? "CA" : "EXAM_TOTAL");
  const targetColumn: "ca" | "exam" = syncTarget === "CA" ? "ca" : "exam";
  const cbtMaxTenths =
    syncTarget === "EXAM_CBT_COMPONENT"
      ? params.examCbtMaxTenths ?? Math.round(params.maxWeight * 10)
      : undefined;
  const theoryMaxTenths =
    syncTarget === "EXAM_CBT_COMPONENT"
      ? params.examTheoryMaxTenths ?? Math.max(0, 600 - (cbtMaxTenths ?? 400))
      : undefined;

  const maxWeight =
    syncTarget === "EXAM_CBT_COMPONENT" && cbtMaxTenths !== undefined
      ? cbtMaxTenths / 10
      : normalizeTargetColumnWeight(targetColumn, params.maxWeight);

  const overwriteMode: GradebookOverwriteMode =
    params.overwriteMode === "FILL_BLANKS_ONLY" ? "FILL_BLANKS_ONLY" : "OVERWRITE_MATCHED";

  let updatedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;
  let preservedCount = 0;
  let partiallyMarkedCount = 0;
  let blockedCount = 0;
  let absentOrExemptCount = 0;

  const rows: GradebookSyncPlannedRow[] = params.candidates.map((c) => {
    const savedTheoryTenths =
      c.existingExamTheoryTenths === undefined ? null : c.existingExamTheoryTenths;

    if (c.existingStatus === "ABSENT" || c.existingStatus === "EXEMPT") {
      absentOrExemptCount++;
      skippedCount++;
      return {
        studentId: c.studentId,
        attemptId: c.attemptId ?? null,
        willUpdate: false,
        skipReason: "EXEMPT_OR_ABSENT",
        nextCaScore: c.existingCaScore,
        nextExamScore: c.existingExamScore,
        nextExamCbtTenths: c.existingExamCbtTenths ?? null,
        preservedTheoryTenths: savedTheoryTenths,
        scaledScore: null,
      };
    }

    if (typeof c.scoreTenths !== "number" || !Number.isFinite(c.scoreTenths)) {
      skippedCount++;
      return {
        studentId: c.studentId,
        attemptId: c.attemptId ?? null,
        willUpdate: false,
        skipReason: "NO_ATTEMPT",
        nextCaScore: c.existingCaScore,
        nextExamScore: c.existingExamScore,
        nextExamCbtTenths: c.existingExamCbtTenths ?? null,
        preservedTheoryTenths: savedTheoryTenths,
        scaledScore: null,
      };
    }

    const scaled = scaleCbtTenthsToComponent(c.scoreTenths, maxWeight);
    const scaledTenths = Math.round(scaled * 10);

    // Hybrid Component-Only Sync: update ONLY CBT Objective, strictly preserving Theory!
    if (syncTarget === "EXAM_CBT_COMPONENT") {
      const capTenths = cbtMaxTenths ?? Math.round(maxWeight * 10);
      if (scaledTenths > capTenths || (savedTheoryTenths !== null && scaledTenths + savedTheoryTenths > 600)) {
        blockedCount++;
        skippedCount++;
        return {
          studentId: c.studentId,
          attemptId: c.attemptId ?? null,
          willUpdate: false,
          skipReason: "INVALID_OVER_MAX",
          nextCaScore: c.existingCaScore,
          nextExamScore: c.existingExamScore,
          nextExamCbtTenths: scaledTenths,
          preservedTheoryTenths: savedTheoryTenths,
          scaledScore: scaled,
        };
      }

      if (
        overwriteMode === "FILL_BLANKS_ONLY" &&
        c.existingExamCbtTenths !== null &&
        c.existingExamCbtTenths !== undefined
      ) {
        preservedCount++;
        skippedCount++;
        return {
          studentId: c.studentId,
          attemptId: c.attemptId ?? null,
          willUpdate: false,
          skipReason: "PRESERVED_EXISTING",
          nextCaScore: c.existingCaScore,
          nextExamScore: c.existingExamScore,
          nextExamCbtTenths: c.existingExamCbtTenths,
          preservedTheoryTenths: savedTheoryTenths,
          scaledScore: scaled,
        };
      }

      // Idempotency guard: skip if exact CBT tenths and attemptId are already recorded
      if (
        c.existingExamCbtTenths === scaledTenths &&
        (!c.attemptId || c.existingLastSyncAttemptId === c.attemptId)
      ) {
        unchangedCount++;
        skippedCount++;
        const existingCombined =
          savedTheoryTenths !== null ? scaledTenths + savedTheoryTenths : null;
        return {
          studentId: c.studentId,
          attemptId: c.attemptId ?? null,
          willUpdate: false,
          skipReason: "UNCHANGED",
          nextCaScore: c.existingCaScore,
          nextExamScore: existingCombined !== null ? existingCombined / 10 : null,
          nextExamCbtTenths: scaledTenths,
          preservedTheoryTenths: savedTheoryTenths,
          resultingHybridTotalTenths: existingCombined,
          hybridResultStatus: existingCombined !== null ? "COMPLETED" : "PARTIALLY_MARKED",
          scaledScore: scaled,
        };
      }

      const resultingHybridTotalTenths =
        savedTheoryTenths !== null ? scaledTenths + savedTheoryTenths : null;
      const hybridResultStatus =
        resultingHybridTotalTenths !== null ? "COMPLETED" : "PARTIALLY_MARKED";
      if (hybridResultStatus === "PARTIALLY_MARKED") {
        partiallyMarkedCount++;
      }
      updatedCount++;

      // Sanity check unused theoryMaxTenths reference
      void theoryMaxTenths;

      return {
        studentId: c.studentId,
        attemptId: c.attemptId ?? null,
        willUpdate: true,
        nextCaScore: c.existingCaScore,
        nextExamScore:
          resultingHybridTotalTenths !== null ? resultingHybridTotalTenths / 10 : null,
        nextExamCbtTenths: scaledTenths,
        preservedTheoryTenths: savedTheoryTenths,
        resultingHybridTotalTenths,
        hybridResultStatus,
        scaledScore: scaled,
      };
    }

    // Legacy Combined Exam Total or CA sync
    const existingTargetVal =
      targetColumn === "ca" ? c.existingCaScore : c.existingExamScore;

    if (
      overwriteMode === "FILL_BLANKS_ONLY" &&
      typeof existingTargetVal === "number" &&
      existingTargetVal > 0
    ) {
      preservedCount++;
      skippedCount++;
      return {
        studentId: c.studentId,
        attemptId: c.attemptId ?? null,
        willUpdate: false,
        skipReason: "PRESERVED_EXISTING",
        nextCaScore: c.existingCaScore,
        nextExamScore: c.existingExamScore,
        scaledScore: scaled,
      };
    }

    updatedCount++;
    const nextCaScore = targetColumn === "ca" ? scaled : c.existingCaScore ?? 0;
    const nextExamScore = targetColumn === "exam" ? scaled : c.existingExamScore ?? 0;

    return {
      studentId: c.studentId,
      attemptId: c.attemptId ?? null,
      willUpdate: true,
      nextCaScore,
      nextExamScore,
      scaledScore: scaled,
    };
  });

  return {
    targetColumn,
    syncTarget,
    maxWeight,
    overwriteMode,
    updatedCount,
    skippedCount,
    unchangedCount,
    preservedCount,
    partiallyMarkedCount,
    blockedCount,
    absentOrExemptCount,
    rows,
  };
}

/**
 * Scales a student's server-graded CBT score (stored in integer tenths, e.g., 850 = 85.0%)
 * onto either a CA column (max 40) or Examination column (max 60), rounded to 1 decimal place.
 */
export function scaleCbtTenthsToComponent(scoreTenths: number, maxComponentMarks: number): number {
  const safeMax = Math.min(60, Math.max(5, Math.round(maxComponentMarks)));
  const clampedTenths = Math.min(1000, Math.max(0, Number(scoreTenths) || 0));
  const raw = (clampedTenths / 1000) * safeMax;
  return Math.min(safeMax, Math.max(0, Math.round(raw * 10) / 10));
}

/**
 * Builds the strict Prisma bank-scope clause for student practice/mock sessions
 * so EXAM_ONLY questions can never leak before or after an official exam.
 */
export function getPracticePoolBankScope(): "OPEN_BANK" {
  return "OPEN_BANK";
}

/**
 * Deterministic Fisher-Yates shuffle seeded per student attempt ID / seed string.
 */
export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 1664525 + 1013904223) | 0;
    const j = Math.abs(hash) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export {
  shouldAutoCloseScheduledExam,
  summarizeUpcomingExamsForDashboard,
  type StudentDashboardExamInput,
  type StudentDashboardExamAlert,
} from "./cbt-exam-schedule";
