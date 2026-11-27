/**
 * Browser-safe pure helpers for CBT examination window scheduling & student timetable display.
 * Keep free of Node built-ins (crypto, redis, dns) so Client Components can import safely.
 */

export function shouldAutoCloseScheduledExam(
  exam: { status: string; endsAt?: Date | string | null },
  now: Date = new Date(),
  graceMs: number = 15_000
): boolean {
  if (exam.status !== "LIVE" && exam.status !== "SCHEDULED") {
    return false;
  }
  if (!exam.endsAt) return false;
  const end = new Date(exam.endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < now.getTime() - graceMs;
}

export interface StudentDashboardExamInput {
  id: string;
  title: string;
  subjectCode: string;
  subjectName: string;
  examType: string;
  status: string;
  questionCount: number;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  feeEligible: boolean;
  myAttempt: { status: string } | null;
}

export interface StudentDashboardExamAlert {
  id: string;
  title: string;
  subjectName: string;
  examType: string;
  status: "LIVE_NOW" | "UPCOMING" | "COMPLETED";
  questionCount: number;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  feeEligible: boolean;
  startsInMinutes: number | null;
}

/**
 * Builds a student-safe upcoming & live examination alert list for StudentDashboard.
 * Strictly strips room codes/hashes and surfaces only timetable visibility.
 */
export function summarizeUpcomingExamsForDashboard(
  exams: StudentDashboardExamInput[],
  now: Date = new Date(),
  limit: number = 4
): StudentDashboardExamAlert[] {
  const activeOrUpcoming = exams
    .filter((ex) => {
      if (ex.status === "CLOSED" || ex.status === "DRAFT") return false;
      if (ex.endsAt) {
        const end = new Date(ex.endsAt);
        if (!Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) {
          return false;
        }
      }
      return ex.status === "LIVE" || ex.status === "SCHEDULED";
    })
    .map((ex): StudentDashboardExamAlert => {
      const attemptDone =
        ex.myAttempt?.status === "SUBMITTED" ||
        ex.myAttempt?.status === "EXPIRED" ||
        ex.myAttempt?.status === "TERMINATED";

      let alertStatus: "LIVE_NOW" | "UPCOMING" | "COMPLETED" = "UPCOMING";
      if (attemptDone) {
        alertStatus = "COMPLETED";
      } else if (ex.status === "LIVE") {
        const start = ex.startsAt ? new Date(ex.startsAt) : null;
        alertStatus =
          !start || Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()
            ? "LIVE_NOW"
            : "UPCOMING";
      }

      let startsInMinutes: number | null = null;
      if (ex.startsAt) {
        const start = new Date(ex.startsAt);
        if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
          startsInMinutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
        }
      }

      return {
        id: ex.id,
        title: ex.title,
        subjectName: ex.subjectName,
        examType: ex.examType,
        status: alertStatus,
        questionCount: ex.questionCount,
        durationMinutes: ex.durationMinutes,
        startsAt: ex.startsAt,
        endsAt: ex.endsAt,
        feeEligible: ex.feeEligible,
        startsInMinutes,
      };
    });

  const priority: Record<StudentDashboardExamAlert["status"], number> = {
    LIVE_NOW: 0,
    UPCOMING: 1,
    COMPLETED: 2,
  };

  return activeOrUpcoming
    .sort((a, b) => {
      const pDiff = priority[a.status] - priority[b.status];
      if (pDiff !== 0) return pDiff;
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, Math.max(1, limit));
}
