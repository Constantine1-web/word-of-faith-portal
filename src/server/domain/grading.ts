export interface GradeBandRule {
    grade: string;
    minTenths: number;
    remark: string;
}

/**
 * WAEC Secondary Scale (Section B.5 & Section 6.1):
 * Minimum total in tenths (0..1000). No rounding anywhere: 74.5 -> 745 tenths -> B2.
 */
export const WAEC_SECONDARY_BANDS: GradeBandRule[] = [
    { grade: "A1", minTenths: 750, remark: "Excellent" },
    { grade: "B2", minTenths: 700, remark: "Very Good" },
    { grade: "B3", minTenths: 650, remark: "Good" },
    { grade: "C4", minTenths: 600, remark: "Credit" },
    { grade: "C5", minTenths: 550, remark: "Credit" },
    { grade: "C6", minTenths: 500, remark: "Credit" },
    { grade: "D7", minTenths: 450, remark: "Pass" },
    { grade: "E8", minTenths: 400, remark: "Pass" },
    { grade: "F9", minTenths: 0, remark: "Fail" },
];

export const PRIMARY_BANDS: GradeBandRule[] = [
    { grade: "A1", minTenths: 750, remark: "Distinction" },
    { grade: "B2", minTenths: 700, remark: "Very Good" },
    { grade: "B3", minTenths: 650, remark: "Good" },
    { grade: "C4", minTenths: 600, remark: "Credit" },
    { grade: "C5", minTenths: 550, remark: "Credit" },
    { grade: "C6", minTenths: 500, remark: "Credit" },
    { grade: "D7", minTenths: 450, remark: "Pass" },
    { grade: "E8", minTenths: 400, remark: "Fair" },
    { grade: "F9", minTenths: 0, remark: "Needs Improvement" },
];

/**
 * Section B.4.4: gradeFor(totalTenths, bands) reads the bands of the sheet's grade scale.
 * Never rounds totalTenths before comparison.
 */
export function gradeFor(
    totalTenths: number,
    bands: GradeBandRule[] = WAEC_SECONDARY_BANDS
): { grade: string; remark: string } {
    const sorted = [...(bands.length > 0 ? bands : WAEC_SECONDARY_BANDS)].sort(
        (a, b) => b.minTenths - a.minTenths
    );
    for (const band of sorted) {
        if (totalTenths >= band.minTenths) {
            return { grade: band.grade, remark: band.remark };
        }
    }
    return { grade: "F9", remark: "Fail" };
}

/**
 * Section B.4.4: Subject class statistics over ENTERED rows only.
 */
export function computeSubjectStats(enteredTotalsTenths: number[]): {
    count: number;
    averageTenths: number;
    highestTenths: number;
    lowestTenths: number;
} {
    if (enteredTotalsTenths.length === 0) {
        return { count: 0, averageTenths: 0, highestTenths: 0, lowestTenths: 0 };
    }
    let sum = 0;
    let highest = enteredTotalsTenths[0];
    let lowest = enteredTotalsTenths[0];
    for (const val of enteredTotalsTenths) {
        sum += val;
        if (val > highest) highest = val;
        if (val < lowest) lowest = val;
    }
    return {
        count: enteredTotalsTenths.length,
        averageTenths: Math.trunc(sum / enteredTotalsTenths.length),
        highestTenths: highest,
        lowestTenths: lowest,
    };
}

export interface BroadsheetStudentInput {
    studentId: number;
    isWithdrawn?: boolean;
    hasPendingSubject?: boolean;
    enteredSubjectTotalsTenths: number[];
}

export interface BroadsheetStudentRanked {
    studentId: number;
    totalTenths: number;
    averageTenths: number;
    enteredCount: number;
    isIncomplete: boolean;
    position: number | null;
}

/**
 * Section B.4.4:
 * - Student term total is the sum of ENTERED subject totals (ABSENT and EXEMPT are excluded from average denominator by default).
 * - Position uses competition ranking (1, 2, 2, 4) and excludes withdrawn students.
 * - A student with any PENDING subject is marked incomplete and not ranked (position = null).
 */
export function computeBroadsheetRankings(
    students: BroadsheetStudentInput[]
): BroadsheetStudentRanked[] {
    const computed: BroadsheetStudentRanked[] = students.map((s) => {
        const enteredCount = s.enteredSubjectTotalsTenths.length;
        const totalTenths = s.enteredSubjectTotalsTenths.reduce((acc, v) => acc + v, 0);
        const averageTenths = enteredCount > 0 ? Math.trunc(totalTenths / enteredCount) : 0;
        const isIncomplete = Boolean(s.hasPendingSubject) || enteredCount === 0;
        return {
            studentId: s.studentId,
            totalTenths,
            averageTenths,
            enteredCount,
            isIncomplete,
            position: null,
        };
    });

    // Rank only active (non-withdrawn) and complete students by averageTenths DESC, then totalTenths DESC
    const rankable = computed
        .filter((s, idx) => !students[idx].isWithdrawn && !s.isIncomplete)
        .sort((a, b) => {
            if (b.averageTenths !== a.averageTenths) return b.averageTenths - a.averageTenths;
            return b.totalTenths - a.totalTenths;
        });

    let currentPosition = 1;
    for (let i = 0; i < rankable.length; i++) {
        if (
            i > 0 &&
            (rankable[i].averageTenths !== rankable[i - 1].averageTenths ||
                rankable[i].totalTenths !== rankable[i - 1].totalTenths)
        ) {
            currentPosition = i + 1;
        }
        rankable[i].position = currentPosition;
    }

    return computed;
}
