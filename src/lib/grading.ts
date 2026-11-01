/**
 * Shared WAEC / Nigerian Grading Engine (Nov 1 Blueprint Section 6.1).
 * Marks are stored as integer tenths (0..1000). No rounding is performed anywhere,
 * so 74.5 (745 tenths) evaluates strictly to B2.
 */

export type WaecGrade = "A1" | "B2" | "B3" | "C4" | "C5" | "C6" | "D7" | "E8" | "F9";

export function calculateGradeFromTenths(totalTenths: number): {
  grade: WaecGrade;
  remark: string;
} {
  const t = Math.trunc(totalTenths);
  if (t >= 750) return { grade: "A1", remark: "Distinction / Excellent" };
  if (t >= 700) return { grade: "B2", remark: "Very Good" };
  if (t >= 650) return { grade: "B3", remark: "Good" };
  if (t >= 600) return { grade: "C4", remark: "Credit" };
  if (t >= 550) return { grade: "C5", remark: "Credit" };
  if (t >= 500) return { grade: "C6", remark: "Credit" };
  if (t >= 450) return { grade: "D7", remark: "Pass" };
  if (t >= 400) return { grade: "E8", remark: "Weak Pass" };
  return { grade: "F9", remark: "Fail" };
}

/**
 * Accepts a score on the 0..100 scale, converts to integer tenths WITHOUT rounding,
 * and returns the official WAEC A1..F9 grade and remark.
 */
export function calculateGrade(totalScore: number): { grade: WaecGrade; remark: string } {
  const safeScore = Number.isFinite(totalScore) ? Math.max(0, totalScore) : 0;
  // Truncate without rounding so 74.5 -> 745 tenths -> B2
  const tenths = Math.trunc(safeScore * 10 + 1e-9);
  return calculateGradeFromTenths(tenths);
}
