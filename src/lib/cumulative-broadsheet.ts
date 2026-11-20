import {
  gradeFor,
  computeBroadsheetRankings,
  PRIMARY_BANDS,
  WAEC_SECONDARY_BANDS,
  type GradeBandRule,
} from "@/server/domain/grading";

export type CumulativeDivisorMode = "ENTERED_TERMS" | "ALL_SESSION_TERMS";

export interface SessionTermMeta {
  TermID: number;
  SessionName: string;
  TermName: string;
  order: 1 | 2 | 3 | 4;
}

export interface CumulativeSubjectCell {
  t1: number | null;
  t2: number | null;
  t3: number | null;
  annualAvg: number | null;
  annualAvgTenths: number | null;
  grade: string | null;
  remark: string | null;
  enteredTerms: number;
}

export interface CumulativeStudentRow {
  studentId: number;
  wofsStudentId: string;
  fullName: string;
  enrolmentStatus: string;
  avatarUrl: string | null;
  subjectCells: Record<number, CumulativeSubjectCell>;
  t1Average: number | null;
  t2Average: number | null;
  t3Average: number | null;
  annualGrandTotal: number;
  annualAverage: number;
  annualAverageTenths: number;
  subjectsCount: number;
  position: number | null;
  standing: "PROMOTE" | "REPEAT" | "NO_SCORES" | "WITHDRAWN";
}

export function resolveTermOrdinal(termName: string): 1 | 2 | 3 | 4 {
  const lower = (termName || "").toLowerCase();
  if (lower.includes("first") || lower.includes("1st") || /\bterm\s*1\b/.test(lower)) return 1;
  if (lower.includes("second") || lower.includes("2nd") || /\bterm\s*2\b/.test(lower)) return 2;
  if (lower.includes("third") || lower.includes("3rd") || /\bterm\s*3\b/.test(lower)) return 3;
  return 4;
}

export function computeCumulativeBroadsheet(params: {
  students: Array<{
    StudentID: number;
    AdmissionNo: string;
    PreferredName?: string | null;
    FirstName?: string | null;
    MiddleName?: string | null;
    LastName?: string | null;
    EnrolmentStatus?: string | null;
    AvatarUrl?: string | null;
    Results: Array<{
      SubjectID: number;
      TermID: number;
      TotalScore: number;
      TotalScoreTenths?: number | null;
      Status?: string | null;
      Subject: { SubjectID: number; SubjectName: string };
    }>;
  }>;
  sessionTerms: Array<{ TermID: number; SessionName: string; TermName: string }>;
  classLevel?: string;
  passThresholdPct?: number;
  divisorMode?: CumulativeDivisorMode;
}): {
  orderedTerms: SessionTermMeta[];
  subjects: Array<{ id: number; name: string }>;
  rows: CumulativeStudentRow[];
} {
  const threshold = params.passThresholdPct ?? 50;
  const divisorMode = params.divisorMode ?? "ENTERED_TERMS";
  const bands: GradeBandRule[] =
    (params.classLevel || "").toLowerCase() === "primary"
      ? PRIMARY_BANDS
      : WAEC_SECONDARY_BANDS;

  const orderedTerms: SessionTermMeta[] = [...params.sessionTerms]
    .map((t) => ({
      ...t,
      order: resolveTermOrdinal(t.TermName),
    }))
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.TermID - b.TermID));

  const termOrderById = new Map<number, 1 | 2 | 3 | 4>();
  for (const t of orderedTerms) {
    termOrderById.set(t.TermID, t.order);
  }
  const sessionTermCount = Math.max(1, orderedTerms.filter((t) => t.order <= 3).length || orderedTerms.length);

  // Collect all unique subjects across all students in this session
  const subjectMap = new Map<number, string>();
  for (const st of params.students) {
    for (const r of st.Results) {
      if (r.Subject?.SubjectName) {
        subjectMap.set(r.SubjectID, r.Subject.SubjectName);
      }
    }
  }
  const subjects = Array.from(subjectMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const preliminary = params.students.map((st) => {
    const isWithdrawn = (st.EnrolmentStatus || "ACTIVE").toUpperCase() === "WITHDRAWN";
    const fullName =
      `${st.FirstName || ""} ${st.MiddleName || ""} ${st.LastName || ""}`.replace(/\s+/g, " ").trim() ||
      st.PreferredName ||
      st.AdmissionNo;

    const subjectCells: Record<number, CumulativeSubjectCell> = {};
    const rankingSubjectTenths: number[] = [];

    const termSums = { 1: 0, 2: 0, 3: 0 };
    const termCounts = { 1: 0, 2: 0, 3: 0 };

    // Index student results by SubjectID -> termOrdinal -> scoreTenths
    const bySubject = new Map<number, { 1?: number; 2?: number; 3?: number }>();
    for (const r of st.Results) {
      const ord = termOrderById.get(r.TermID);
      if (!ord || ord === 4) continue;
      const status = (r.Status || "ENTERED").toUpperCase();
      if (status !== "ENTERED") continue;

      const tenths = r.TotalScoreTenths ?? Math.round((Number(r.TotalScore) || 0) * 10);
      const bucket = bySubject.get(r.SubjectID) || {};
      bucket[ord] = tenths;
      bySubject.set(r.SubjectID, bucket);

      termSums[ord] += tenths;
      termCounts[ord] += 1;
    }

    let annualGrandTenths = 0;

    for (const subj of subjects) {
      const bucket = bySubject.get(subj.id);
      if (!bucket) {
        subjectCells[subj.id] = {
          t1: null,
          t2: null,
          t3: null,
          annualAvg: null,
          annualAvgTenths: null,
          grade: null,
          remark: null,
          enteredTerms: 0,
        };
        continue;
      }

      const vals = [bucket[1], bucket[2], bucket[3]].filter((v): v is number => v !== undefined);
      const enteredTerms = vals.length;
      const sumTenths = vals.reduce((acc, v) => acc + v, 0);
      const denom = divisorMode === "ALL_SESSION_TERMS" ? sessionTermCount : Math.max(1, enteredTerms);
      const annualAvgTenths = enteredTerms > 0 ? Math.round(sumTenths / denom) : null;

      if (annualAvgTenths !== null) {
        rankingSubjectTenths.push(annualAvgTenths);
        annualGrandTenths += annualAvgTenths;
      }

      const graded = annualAvgTenths !== null ? gradeFor(annualAvgTenths, bands) : null;

      subjectCells[subj.id] = {
        t1: bucket[1] !== undefined ? Number((bucket[1] / 10).toFixed(1)) : null,
        t2: bucket[2] !== undefined ? Number((bucket[2] / 10).toFixed(1)) : null,
        t3: bucket[3] !== undefined ? Number((bucket[3] / 10).toFixed(1)) : null,
        annualAvg: annualAvgTenths !== null ? Number((annualAvgTenths / 10).toFixed(1)) : null,
        annualAvgTenths,
        grade: graded?.grade ?? null,
        remark: graded?.remark ?? null,
        enteredTerms,
      };
    }

    const subjectsCount = rankingSubjectTenths.length;
    const annualAverageTenths = subjectsCount > 0 ? Math.trunc(annualGrandTenths / subjectsCount) : 0;
    const annualAverage = Number((annualAverageTenths / 10).toFixed(1));
    const annualGrandTotal = Number((annualGrandTenths / 10).toFixed(1));

    const standing: CumulativeStudentRow["standing"] = isWithdrawn
      ? "WITHDRAWN"
      : subjectsCount === 0
      ? "NO_SCORES"
      : annualAverage >= threshold
      ? "PROMOTE"
      : "REPEAT";

    return {
      studentId: st.StudentID,
      wofsStudentId: st.AdmissionNo,
      fullName,
      enrolmentStatus: st.EnrolmentStatus || "ACTIVE",
      avatarUrl: st.AvatarUrl || null,
      subjectCells,
      t1Average: termCounts[1] > 0 ? Number((termSums[1] / termCounts[1] / 10).toFixed(1)) : null,
      t2Average: termCounts[2] > 0 ? Number((termSums[2] / termCounts[2] / 10).toFixed(1)) : null,
      t3Average: termCounts[3] > 0 ? Number((termSums[3] / termCounts[3] / 10).toFixed(1)) : null,
      annualGrandTotal,
      annualAverage,
      annualAverageTenths,
      subjectsCount,
      standing,
      isWithdrawn,
      rankingSubjectTenths,
    };
  });

  const ranked = computeBroadsheetRankings(
    preliminary.map((p) => ({
      studentId: p.studentId,
      isWithdrawn: p.isWithdrawn,
      hasPendingSubject: p.subjectsCount === 0,
      enteredSubjectTotalsTenths: p.rankingSubjectTenths,
    }))
  );
  const rankMap = new Map(ranked.map((r) => [r.studentId, r.position]));

  const rows: CumulativeStudentRow[] = preliminary.map((p) => ({
    studentId: p.studentId,
    wofsStudentId: p.wofsStudentId,
    fullName: p.fullName,
    enrolmentStatus: p.enrolmentStatus,
    avatarUrl: p.avatarUrl,
    subjectCells: p.subjectCells,
    t1Average: p.t1Average,
    t2Average: p.t2Average,
    t3Average: p.t3Average,
    annualGrandTotal: p.annualGrandTotal,
    annualAverage: p.annualAverage,
    annualAverageTenths: p.annualAverageTenths,
    subjectsCount: p.subjectsCount,
    position: rankMap.get(p.studentId) ?? null,
    standing: p.standing,
  }));

  rows.sort((a, b) => {
    if (a.position !== null && b.position !== null && a.position !== b.position) {
      return a.position - b.position;
    }
    if (a.position !== null && b.position === null) return -1;
    if (a.position === null && b.position !== null) return 1;
    return b.annualAverageTenths - a.annualAverageTenths;
  });

  return { orderedTerms, subjects, rows };
}
