"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { requireClassTeacherOrAdmin, requireRole } from "@/lib/authz";
import { escapeHtml } from "@/lib/security";
import {
  isAttendanceAtRisk,
  normalizeAttendanceDateKey,
  summarizeStudentAttendance,
} from "@/lib/attendance-summary";

const ALLOWED_ATTENDANCE_ROLES = [
  "TEACHER",
  "FORM_MASTER",
  "ADMIN",
  "SUPER_ADMIN",
  "PRINCIPAL",
  "Teacher",
  "Admin",
];

const VALID_ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Excused"] as const;

export async function markAttendance(
  studentId: number,
  termId: number,
  dateStr: string,
  status: string,
  notes?: string
) {
  try {
    await requireRole(ALLOWED_ATTENDANCE_ROLES);

    const student = await prisma.student.findUnique({
      where: { StudentID: Number(studentId) },
      include: { Class: true },
    });

    if (!student) {
      return { success: false, error: "Student not found." };
    }

    // Verify the teacher/form master is assigned to this student's class (or is school admin)
    await requireClassTeacherOrAdmin(student.ClassID);

    const cleanStatus = VALID_ATTENDANCE_STATUSES.includes(
      status as (typeof VALID_ATTENDANCE_STATUSES)[number]
    )
      ? status
      : "Present";
    const cleanNotes = notes ? String(notes).trim().slice(0, 400) : null;
    const dateKey = normalizeAttendanceDateKey(dateStr);
    const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
    const canonicalDate = new Date(`${dateKey}T08:00:00.000Z`);

    const existingForDay = await prisma.attendance.findFirst({
      where: {
        StudentID: student.StudentID,
        Date: { gte: dayStart, lte: dayEnd },
      },
      select: { AttendanceID: true },
    });

    const attendance = existingForDay
      ? await prisma.attendance.update({
          where: { AttendanceID: existingForDay.AttendanceID },
          data: { Status: cleanStatus, Notes: cleanNotes },
        })
      : await prisma.attendance.create({
          data: {
            StudentID: student.StudentID,
            TermID: Number(termId),
            Date: canonicalDate,
            Status: cleanStatus,
            Notes: cleanNotes,
          },
        });

    if (cleanStatus === "Absent") {
      try {
        if (student.ParentEmail && student.ParentEmail.includes("@")) {
          const studentDisplayName =
            student.PreferredName ||
            `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
            student.AdmissionNo;
          const safeName = escapeHtml(studentDisplayName);
          const safeAdmNo = escapeHtml(student.AdmissionNo);
          const safeClass = escapeHtml(student.Class?.ClassName || "N/A");
          const safeDate = escapeHtml(dateStr);
          const safeNotes = cleanNotes ? escapeHtml(cleanNotes) : "";

          await sendEmail({
            to: student.ParentEmail.trim(),
            subject: `Daily Attendance Alert: ${studentDisplayName} marked Absent (${dateStr})`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
                <div style="background: #143424; color: #ffffff; padding: 20px 24px; border-bottom: 4px solid #D4AF37;">
                  <h2 style="margin: 0; font-size: 19px;">Word of Faith Group of Schools</h2>
                  <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Student Daily Attendance Alert</p>
                </div>
                <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
                  <p style="margin-top: 0;">Dear Parent / Guardian,</p>
                  <p>This is an automated notification from the school portal regarding your ward:</p>
                  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 18px 0;">
                    <p style="margin: 0 0 6px 0;"><strong>Student Name:</strong> ${safeName}</p>
                    <p style="margin: 0 0 6px 0;"><strong>Admission Number:</strong> ${safeAdmNo}</p>
                    <p style="margin: 0 0 6px 0;"><strong>Class:</strong> ${safeClass}</p>
                    <p style="margin: 0 0 6px 0;"><strong>Date:</strong> ${safeDate}</p>
                    <p style="margin: 0; color: #b91c1c; font-weight: bold;">Status: ABSENT</p>
                    ${safeNotes ? `<p style="margin: 8px 0 0 0; font-style: italic; color: #6b7280;"><strong>Teacher's Note:</strong> ${safeNotes}</p>` : ""}
                  </div>
                  <p style="font-size: 14px; color: #4b5563;">If this absence is unexcused or if you have any questions, please contact the class teacher or the school office.</p>
                  <p style="margin-bottom: 0;">Warm regards,<br/><strong>School Administration Desk</strong><br/>Word of Faith Group of Schools</p>
                </div>
              </div>
            `,
          });
        }
      } catch (mailErr) {
        console.warn("[Attendance Alert] Could not send parent alert email:", mailErr);
      }
    }

    revalidatePath("/portal/admin/attendance");
    return { success: true, attendance };
  } catch (error: any) {
    console.error("Failed to mark attendance:", error);
    return { success: false, error: error?.message || "Internal server error" };
  }
}

export async function getAttendanceForClass(classId: number, dateStr: string) {
  try {
    await requireClassTeacherOrAdmin(Number(classId));

    const dayOnly = String(dateStr).split("T")[0];
    const startOfDay = new Date(`${dayOnly}T00:00:00.000Z`);
    const endOfDay = new Date(`${dayOnly}T23:59:59.999Z`);
    if (isNaN(startOfDay.getTime())) {
      return { success: false, error: "Invalid date." };
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        Student: { ClassID: Number(classId) },
        Date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    return { success: true, attendances };
  } catch (error: any) {
    console.error("Failed to fetch attendance:", error);
    return { success: false, error: error?.message || "Unauthorized or failed to fetch attendance" };
  }
}

export async function markClassAttendanceBatch(params: {
  classId: number;
  termId: number;
  dateStr: string;
  entries: { studentId: number; status: string; notes?: string }[];
}) {
  try {
    await requireRole(ALLOWED_ATTENDANCE_ROLES);
    await requireClassTeacherOrAdmin(Number(params.classId));

    const dayOnly = String(params.dateStr).split("T")[0];
    const canonicalDate = new Date(`${dayOnly}T08:00:00.000Z`);
    if (isNaN(canonicalDate.getTime())) {
      return { success: false, error: "Invalid attendance date." };
    }

    let savedCount = 0;
    for (const entry of params.entries) {
      const res = await markAttendance(
        Number(entry.studentId),
        Number(params.termId),
        canonicalDate.toISOString(),
        entry.status,
        entry.notes
      );
      if (res.success) savedCount++;
    }

    return {
      success: true,
      savedCount,
      message: `Recorded daily attendance for ${savedCount} student(s) on ${dayOnly}.`,
    };
  } catch (error: any) {
    console.error("markClassAttendanceBatch error:", error);
    return { success: false, error: error?.message || "Failed to save class attendance" };
  }
}

export interface AdminClassAttendanceRow {
  classId: number;
  className: string;
  level: string;
  formMasterEmail: string | null;
  enrolledCount: number;
  markedCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  completionPct: number;
}

export interface AdminDailyAttendanceRow {
  studentId: number;
  admissionNo: string;
  fullName: string;
  classId: number;
  className: string;
  status: "Present" | "Late" | "Absent" | "Excused" | "Unmarked";
  notes: string;
}

export interface AdminAttendanceWarningRow {
  studentId: number;
  admissionNo: string;
  fullName: string;
  classId: number;
  className: string;
  totalMarked: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRatePct: number;
  parentContact: string;
  parentEmail: string | null;
}

export interface AdminSchoolAttendanceOverview {
  success: boolean;
  error?: string;
  selectedDate: string;
  thresholdPct: number;
  selectedTerm: { TermID: number; SessionName: string; TermName: string } | null;
  terms: Array<{ TermID: number; SessionName: string; TermName: string; IsActive: boolean }>;
  summaryStats: {
    totalStudents: number;
    markedTodayCount: number;
    unmarkedTodayCount: number;
    presentTodayCount: number;
    lateTodayCount: number;
    absentTodayCount: number;
    excusedTodayCount: number;
    totalClasses: number;
    unmarkedClassCount: number;
    atRiskCount: number;
  };
  classesSummary: AdminClassAttendanceRow[];
  dailyRegisterRows: AdminDailyAttendanceRow[];
  earlyWarningStudents: AdminAttendanceWarningRow[];
}

export async function getAdminSchoolAttendanceOverview(params?: {
  dateStr?: string;
  termId?: number;
  classId?: number;
  thresholdPct?: number;
}): Promise<AdminSchoolAttendanceOverview> {
  try {
    await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMISSIONS", "BURSAR", "ADMIN", "Admin"]);

    const selectedDate = normalizeAttendanceDateKey(params?.dateStr);
    const thresholdPct = Math.min(95, Math.max(50, Number(params?.thresholdPct) || 80));
    const dayStart = new Date(`${selectedDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${selectedDate}T23:59:59.999Z`);

    const [terms, classes, students, dailyRecords] = await Promise.all([
      prisma.academic_Term.findMany({
        select: { TermID: true, SessionName: true, TermName: true, IsActive: true },
        orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
      }),
      prisma.class.findMany({
        select: {
          ClassID: true,
          ClassName: true,
          Level: true,
          FormMaster: { select: { Email: true } },
        },
        orderBy: [{ Level: "asc" }, { ClassName: "asc" }],
      }),
      prisma.student.findMany({
        where: { EnrolmentStatus: "ACTIVE" },
        select: {
          StudentID: true,
          AdmissionNo: true,
          PreferredName: true,
          FirstName: true,
          LastName: true,
          ClassID: true,
          ParentContact: true,
          ParentEmail: true,
          Class: { select: { ClassName: true } },
        },
        orderBy: [{ ClassID: "asc" }, { FirstName: "asc" }, { LastName: "asc" }],
      }),
      prisma.attendance.findMany({
        where: { Date: { gte: dayStart, lte: dayEnd } },
        select: { StudentID: true, Status: true, Notes: true },
      }),
    ]);

    const selectedTerm =
      (params?.termId ? terms.find((t) => t.TermID === Number(params.termId)) : undefined) ||
      terms.find((t) => t.IsActive) ||
      terms[0] ||
      null;

    const termRecords = selectedTerm
      ? await prisma.attendance.findMany({
          where: { TermID: selectedTerm.TermID },
          select: { StudentID: true, Status: true },
        })
      : [];

    const dailyByStudent = new Map<number, { Status: string; Notes: string | null }>();
    for (const rec of dailyRecords) {
      dailyByStudent.set(rec.StudentID, { Status: rec.Status, Notes: rec.Notes });
    }

    const termByStudent = new Map<number, Array<{ Status: string }>>();
    for (const rec of termRecords) {
      const arr = termByStudent.get(rec.StudentID);
      if (arr) arr.push({ Status: rec.Status });
      else termByStudent.set(rec.StudentID, [{ Status: rec.Status }]);
    }

    const studentsByClass = new Map<number, typeof students>();
    for (const st of students) {
      const list = studentsByClass.get(st.ClassID);
      if (list) list.push(st);
      else studentsByClass.set(st.ClassID, [st]);
    }

    let markedTodayCount = 0;
    let presentTodayCount = 0;
    let lateTodayCount = 0;
    let absentTodayCount = 0;
    let excusedTodayCount = 0;
    let unmarkedClassCount = 0;

    const classesSummary: AdminClassAttendanceRow[] = classes.map((cls) => {
      const roster = studentsByClass.get(cls.ClassID) || [];
      let markedCount = 0;
      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let excusedCount = 0;

      for (const st of roster) {
        const d = dailyByStudent.get(st.StudentID);
        if (d) {
          markedCount += 1;
          if (d.Status === "Present") presentCount += 1;
          else if (d.Status === "Late") lateCount += 1;
          else if (d.Status === "Absent") absentCount += 1;
          else if (d.Status === "Excused") excusedCount += 1;
        }
      }

      markedTodayCount += markedCount;
      presentTodayCount += presentCount;
      lateTodayCount += lateCount;
      absentTodayCount += absentCount;
      excusedTodayCount += excusedCount;

      if (roster.length > 0 && markedCount === 0) {
        unmarkedClassCount += 1;
      }

      const completionPct =
        roster.length > 0 ? Math.round((markedCount / roster.length) * 100) : 100;

      return {
        classId: cls.ClassID,
        className: cls.ClassName,
        level: cls.Level,
        formMasterEmail: cls.FormMaster?.Email || null,
        enrolledCount: roster.length,
        markedCount,
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        completionPct,
      };
    });

    const filteredStudents =
      params?.classId && params.classId > 0
        ? students.filter((s) => s.ClassID === Number(params.classId))
        : students;

    const dailyRegisterRows: AdminDailyAttendanceRow[] = filteredStudents.map((st) => {
      const d = dailyByStudent.get(st.StudentID);
      const status =
        d && VALID_ATTENDANCE_STATUSES.includes(d.Status as (typeof VALID_ATTENDANCE_STATUSES)[number])
          ? (d.Status as "Present" | "Late" | "Absent" | "Excused")
          : "Unmarked";
      const fullName =
        st.PreferredName ||
        `${st.FirstName || ""} ${st.LastName || ""}`.trim() ||
        st.AdmissionNo;

      return {
        studentId: st.StudentID,
        admissionNo: st.AdmissionNo,
        fullName,
        classId: st.ClassID,
        className: st.Class?.ClassName || "Unassigned",
        status,
        notes: d?.Notes || "",
      };
    });

    const earlyWarningStudents: AdminAttendanceWarningRow[] = [];
    for (const st of filteredStudents) {
      const recs = termByStudent.get(st.StudentID) || [];
      const summary = summarizeStudentAttendance(recs);
      if (isAttendanceAtRisk(summary, thresholdPct) && summary.attendanceRatePct !== null) {
        const fullName =
          st.PreferredName ||
          `${st.FirstName || ""} ${st.LastName || ""}`.trim() ||
          st.AdmissionNo;
        earlyWarningStudents.push({
          studentId: st.StudentID,
          admissionNo: st.AdmissionNo,
          fullName,
          classId: st.ClassID,
          className: st.Class?.ClassName || "Unassigned",
          totalMarked: summary.totalMarked,
          present: summary.present,
          late: summary.late,
          absent: summary.absent,
          excused: summary.excused,
          attendanceRatePct: summary.attendanceRatePct,
          parentContact: st.ParentContact,
          parentEmail: st.ParentEmail || null,
        });
      }
    }

    earlyWarningStudents.sort((a, b) => {
      if (a.attendanceRatePct !== b.attendanceRatePct) {
        return a.attendanceRatePct - b.attendanceRatePct;
      }
      return b.absent - a.absent;
    });

    return {
      success: true,
      selectedDate,
      thresholdPct,
      selectedTerm: selectedTerm
        ? {
            TermID: selectedTerm.TermID,
            SessionName: selectedTerm.SessionName,
            TermName: selectedTerm.TermName,
          }
        : null,
      terms,
      summaryStats: {
        totalStudents: students.length,
        markedTodayCount,
        unmarkedTodayCount: Math.max(0, students.length - markedTodayCount),
        presentTodayCount,
        lateTodayCount,
        absentTodayCount,
        excusedTodayCount,
        totalClasses: classes.length,
        unmarkedClassCount,
        atRiskCount: earlyWarningStudents.length,
      },
      classesSummary,
      dailyRegisterRows,
      earlyWarningStudents,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load attendance register.",
      selectedDate: normalizeAttendanceDateKey(params?.dateStr),
      thresholdPct: Number(params?.thresholdPct) || 80,
      selectedTerm: null,
      terms: [],
      summaryStats: {
        totalStudents: 0,
        markedTodayCount: 0,
        unmarkedTodayCount: 0,
        presentTodayCount: 0,
        lateTodayCount: 0,
        absentTodayCount: 0,
        excusedTodayCount: 0,
        totalClasses: 0,
        unmarkedClassCount: 0,
        atRiskCount: 0,
      },
      classesSummary: [],
      dailyRegisterRows: [],
      earlyWarningStudents: [],
    };
  }
}
