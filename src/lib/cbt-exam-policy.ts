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
