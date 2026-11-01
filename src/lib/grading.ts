import {
    gradeFor,
    computeSubjectStats,
    computeBroadsheetRankings,
    WAEC_SECONDARY_BANDS,
    PRIMARY_BANDS,
    type GradeBandRule,
    type BroadsheetStudentInput,
    type BroadsheetStudentRanked,
} from "../server/domain/grading";

export {
    gradeFor,
    computeSubjectStats,
    computeBroadsheetRankings,
    WAEC_SECONDARY_BANDS,
    PRIMARY_BANDS,
    type GradeBandRule,
    type BroadsheetStudentInput,
    type BroadsheetStudentRanked,
};

/**
 * WAEC A1–F9 Grading Engine (Nov 1 Blueprint Section B.4.4 & 6.1)
 * - Stores marks in integer tenths (0..400 CA + 0..600 Exam = 0..1000 Total)
 * - No rounding anywhere: 74.5 -> 745 tenths -> B2
 */
export function calculateGradeFromTenths(
    totalTenths: number,
    bands: GradeBandRule[] = WAEC_SECONDARY_BANDS
): { grade: string; remark: string } {
    return gradeFor(totalTenths, bands);
}

/**
 * Legacy helper accepting display marks (0.0 to 100.0) and converting to integer tenths without upward rounding.
 */
export function calculateGrade(
    totalScore: number,
    bands: GradeBandRule[] = WAEC_SECONDARY_BANDS
): { grade: string; remark: string } {
    const totalTenths = Math.trunc(Math.round(totalScore * 10));
    return gradeFor(totalTenths, bands);
}
