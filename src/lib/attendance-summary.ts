/**
 * Deterministic attendance aggregation & truancy threshold helpers shared by
 * Admin Attendance Register, Student Overview, and regression tests.
 */

export interface AttendanceRecordLike {
  Status: string;
}

export interface StudentAttendanceSummary {
  totalMarked: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Attended sessions = Present + Late + Excused; rate = round((attended / totalMarked) * 100). */
  attendanceRatePct: number | null;
}

export function normalizeAttendanceDateKey(input?: string | Date | null): string {
  if (!input) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  const str = input instanceof Date ? input.toISOString() : String(input).trim();
  const datePart = str.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}

export function summarizeStudentAttendance(
  records: AttendanceRecordLike[]
): StudentAttendanceSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  for (const r of records) {
    const status = (r.Status || "").toLowerCase().trim();
    if (status === "present") present += 1;
    else if (status === "late") late += 1;
    else if (status === "absent") absent += 1;
    else if (status === "excused") excused += 1;
  }

  const totalMarked = present + late + absent + excused;
  if (totalMarked === 0) {
    return {
      totalMarked: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      attendanceRatePct: null,
    };
  }

  const attended = present + late + excused;
  const attendanceRatePct = Math.round((attended / totalMarked) * 100);
  return {
    totalMarked,
    present,
    late,
    absent,
    excused,
    attendanceRatePct,
  };
}

export function isAttendanceAtRisk(
  summary: StudentAttendanceSummary,
  thresholdPct: number = 80
): boolean {
  if (summary.totalMarked === 0 || summary.attendanceRatePct === null) {
    return false;
  }
  return summary.absent > 0 && summary.attendanceRatePct < thresholdPct;
}
