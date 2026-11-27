/**
 * Authoritative Hybrid CBT Objective + Handwritten Paper 2 Theory Scoring Engine.
 * Browser-safe and server-authoritative: shared by server actions, broadsheets,
 * report cards, and teacher gradebook UI without duplicating formulas.
 *
 * All internal arithmetic uses integer tenths (e.g., 34.5 marks = 345 tenths).
 */

export type ExamModeValue = "COMBINED" | "HYBRID";
export type ExamResultStatusValue = "PENDING" | "PARTIALLY_MARKED" | "COMPLETED" | "APPROVED";

export const CA_MAX_TENTHS = 400; // 40.0 marks
export const EXAM_MAX_TENTHS = 600; // 60.0 marks
export const DEFAULT_HYBRID_CBT_MAX_TENTHS = 400; // 40.0 marks
export const DEFAULT_HYBRID_THEORY_MAX_TENTHS = 200; // 20.0 marks

/**
 * Converts a numeric mark to integer tenths while strictly distinguishing
 * missing (`null` / `undefined` / `""`) from an actual `0` score.
 */
export function toScoreTenths(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 10);
  }
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10);
}

export function fromScoreTenths(tenths: number | null | undefined): number | null {
  if (tenths === null || tenths === undefined || !Number.isFinite(tenths)) return null;
  return Math.round(tenths) / 10;
}

export function validateHybridAllocationTenths(
  cbtMaxTenths: number,
  theoryMaxTenths: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(cbtMaxTenths) || !Number.isInteger(theoryMaxTenths)) {
    return { valid: false, error: "CBT and Theory allocations must be integer tenths." };
  }
  if (cbtMaxTenths <= 0 || theoryMaxTenths <= 0) {
    return { valid: false, error: "Both CBT Objective and Paper 2 Theory allocations must be greater than 0." };
  }
  if (cbtMaxTenths + theoryMaxTenths !== EXAM_MAX_TENTHS) {
    return {
      valid: false,
      error: `Hybrid allocations must sum to ${EXAM_MAX_TENTHS / 10} marks (received ${cbtMaxTenths / 10} + ${theoryMaxTenths / 10} = ${(cbtMaxTenths + theoryMaxTenths) / 10}).`,
    };
  }
  return { valid: true };
}

export interface HybridExamComputationInput {
  examMode: ExamModeValue;
  cbtTenths?: number | null;
  theoryTenths?: number | null;
  cbtMaxTenths?: number | null;
  theoryMaxTenths?: number | null;
  combinedExamTenths?: number | null;
  scoreStatus?: "PENDING" | "ENTERED" | "ABSENT" | "EXEMPT" | string | null;
  preserveApprovedStatus?: boolean;
}

export interface HybridExamComputationResult {
  valid: boolean;
  error?: string;
  examMode: ExamModeValue;
  examResultStatus: ExamResultStatusValue;
  examCbtTenths: number | null;
  examTheoryTenths: number | null;
  examCbtMaxTenths: number | null;
  examTheoryMaxTenths: number | null;
  examScoreTenths: number | null; // null whenever incomplete (never coerced to 0)
  provisionalExamTenths: number | null;
  isComplete: boolean;
}

/**
 * Authoritative server-side scoring invariant calculator.
 * Never truncates invalid scores and never coerces missing (`null`) components to `0`.
 */
export function computeHybridExamOutcome(
  input: HybridExamComputationInput
): HybridExamComputationResult {
  const examMode: ExamModeValue = input.examMode === "HYBRID" ? "HYBRID" : "COMBINED";
  const isAbsentOrExempt =
    input.scoreStatus === "ABSENT" || input.scoreStatus === "EXEMPT";

  if (isAbsentOrExempt) {
    return {
      valid: true,
      examMode,
      examResultStatus: input.preserveApprovedStatus ? "APPROVED" : "COMPLETED",
      examCbtTenths: null,
      examTheoryTenths: null,
      examCbtMaxTenths:
        examMode === "HYBRID"
          ? input.cbtMaxTenths ?? DEFAULT_HYBRID_CBT_MAX_TENTHS
          : null,
      examTheoryMaxTenths:
        examMode === "HYBRID"
          ? input.theoryMaxTenths ?? DEFAULT_HYBRID_THEORY_MAX_TENTHS
          : null,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: true,
    };
  }

  if (examMode === "COMBINED") {
    const combined =
      input.combinedExamTenths === undefined ? null : input.combinedExamTenths;
    if (combined !== null) {
      if (!Number.isInteger(combined) || combined < 0 || combined > EXAM_MAX_TENTHS) {
        return {
          valid: false,
          error: `Combined Exam score must be between 0 and ${EXAM_MAX_TENTHS / 10} marks.`,
          examMode,
          examResultStatus: "PENDING",
          examCbtTenths: null,
          examTheoryTenths: null,
          examCbtMaxTenths: null,
          examTheoryMaxTenths: null,
          examScoreTenths: null,
          provisionalExamTenths: null,
          isComplete: false,
        };
      }
      return {
        valid: true,
        examMode,
        examResultStatus: input.preserveApprovedStatus ? "APPROVED" : "COMPLETED",
        examCbtTenths: null,
        examTheoryTenths: null,
        examCbtMaxTenths: null,
        examTheoryMaxTenths: null,
        examScoreTenths: combined,
        provisionalExamTenths: combined,
        isComplete: true,
      };
    }

    return {
      valid: true,
      examMode,
      examResultStatus: "PENDING",
      examCbtTenths: null,
      examTheoryTenths: null,
      examCbtMaxTenths: null,
      examTheoryMaxTenths: null,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  // HYBRID Mode
  const cbtMax = input.cbtMaxTenths ?? DEFAULT_HYBRID_CBT_MAX_TENTHS;
  const theoryMax = input.theoryMaxTenths ?? DEFAULT_HYBRID_THEORY_MAX_TENTHS;
  const allocCheck = validateHybridAllocationTenths(cbtMax, theoryMax);
  if (!allocCheck.valid) {
    return {
      valid: false,
      error: allocCheck.error,
      examMode,
      examResultStatus: "PENDING",
      examCbtTenths: null,
      examTheoryTenths: null,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  const cbt = input.cbtTenths === undefined ? null : input.cbtTenths;
  const theory = input.theoryTenths === undefined ? null : input.theoryTenths;

  if (cbt !== null && (!Number.isInteger(cbt) || cbt < 0 || cbt > cbtMax)) {
    return {
      valid: false,
      error: `CBT Objective score (${(cbt ?? 0) / 10}) exceeds allocated maximum of ${cbtMax / 10} marks.`,
      examMode,
      examResultStatus: "PENDING",
      examCbtTenths: cbt,
      examTheoryTenths: theory,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  if (theory !== null && (!Number.isInteger(theory) || theory < 0 || theory > theoryMax)) {
    return {
      valid: false,
      error: `Paper 2 Theory score (${(theory ?? 0) / 10}) exceeds allocated maximum of ${theoryMax / 10} marks.`,
      examMode,
      examResultStatus: "PENDING",
      examCbtTenths: cbt,
      examTheoryTenths: theory,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  if (cbt === null && theory === null) {
    return {
      valid: true,
      examMode,
      examResultStatus: "PENDING",
      examCbtTenths: null,
      examTheoryTenths: null,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  if (cbt === null || theory === null) {
    return {
      valid: true,
      examMode,
      examResultStatus: "PARTIALLY_MARKED",
      examCbtTenths: cbt,
      examTheoryTenths: theory,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: cbt !== null ? cbt : theory,
      isComplete: false,
    };
  }

  const combined = cbt + theory;
  if (combined > EXAM_MAX_TENTHS) {
    return {
      valid: false,
      error: `Combined Hybrid Exam score (${combined / 10}) exceeds maximum of ${EXAM_MAX_TENTHS / 10} marks.`,
      examMode,
      examResultStatus: "PARTIALLY_MARKED",
      examCbtTenths: cbt,
      examTheoryTenths: theory,
      examCbtMaxTenths: cbtMax,
      examTheoryMaxTenths: theoryMax,
      examScoreTenths: null,
      provisionalExamTenths: null,
      isComplete: false,
    };
  }

  return {
    valid: true,
    examMode,
    examResultStatus: input.preserveApprovedStatus ? "APPROVED" : "COMPLETED",
    examCbtTenths: cbt,
    examTheoryTenths: theory,
    examCbtMaxTenths: cbtMax,
    examTheoryMaxTenths: theoryMax,
    examScoreTenths: combined,
    provisionalExamTenths: combined,
    isComplete: true,
  };
}

/**
 * Formats an examination score for Broadsheets and Student Report Cards
 * without relying on hover-only tooltips for printed documents.
 */
export function formatExamScoreForReport(
  result: {
    ExamScore?: number | null;
    ExamScoreTenths?: number | null;
    ExamCbtTenths?: number | null;
    ExamTheoryTenths?: number | null;
    ExamCbtMaxTenths?: number | null;
    ExamTheoryMaxTenths?: number | null;
    ExamResultStatus?: string | null;
  },
  showBreakdown: boolean = true
): {
  primaryText: string;
  breakdownText: string | null;
  isIncomplete: boolean;
} {
  const status = result.ExamResultStatus || "COMPLETED";
  const isIncomplete = status === "PENDING" || status === "PARTIALLY_MARKED";

  const hasHybridParts =
    result.ExamCbtTenths !== null &&
    result.ExamCbtTenths !== undefined &&
    result.ExamTheoryTenths !== null &&
    result.ExamTheoryTenths !== undefined;

  if (isIncomplete) {
    if (result.ExamCbtTenths !== null && result.ExamCbtTenths !== undefined) {
      const cbtMax = (result.ExamCbtMaxTenths ?? DEFAULT_HYBRID_CBT_MAX_TENTHS) / 10;
      return {
        primaryText: "Pending",
        breakdownText: `CBT: ${result.ExamCbtTenths / 10}/${cbtMax} · Theory Pending`,
        isIncomplete: true,
      };
    }
    if (result.ExamTheoryTenths !== null && result.ExamTheoryTenths !== undefined) {
      const theoryMax = (result.ExamTheoryMaxTenths ?? DEFAULT_HYBRID_THEORY_MAX_TENTHS) / 10;
      return {
        primaryText: "Pending",
        breakdownText: `Theory: ${result.ExamTheoryTenths / 10}/${theoryMax} · CBT Pending`,
        isIncomplete: true,
      };
    }
    return {
      primaryText: "Pending",
      breakdownText: "Awaiting exam marks",
      isIncomplete: true,
    };
  }

  const finalScore =
    result.ExamScoreTenths !== null && result.ExamScoreTenths !== undefined
      ? result.ExamScoreTenths / 10
      : Number(result.ExamScore ?? 0);

  if (showBreakdown && hasHybridParts) {
    const cbtVal = (result.ExamCbtTenths as number) / 10;
    const theoryVal = (result.ExamTheoryTenths as number) / 10;
    return {
      primaryText: String(finalScore),
      breakdownText: `(CBT: ${cbtVal} + Theory: ${theoryVal})`,
      isIncomplete: false,
    };
  }

  return {
    primaryText: String(finalScore),
    breakdownText: null,
    isIncomplete: false,
  };
}
