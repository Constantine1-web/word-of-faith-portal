/**
 * Shared grading utility — importable from both server actions and client components.
 */

export function calculateGrade(totalScore: number): { grade: string; remark: string } {
  if (totalScore >= 70) return { grade: "A", remark: "Distinction / Excellent" };
  if (totalScore >= 60) return { grade: "B", remark: "Very Good" };
  if (totalScore >= 50) return { grade: "C", remark: "Good / Credit" };
  if (totalScore >= 45) return { grade: "D", remark: "Pass" };
  if (totalScore >= 40) return { grade: "E", remark: "Fair / Weak Pass" };
  return { grade: "F", remark: "Fail" };
}
