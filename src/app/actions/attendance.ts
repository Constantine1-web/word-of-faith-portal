"use server";

import prisma from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { requireClassTeacherOrAdmin, requireRole } from "@/lib/authz";
import { escapeHtml } from "@/lib/security";

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

    const cleanStatus = VALID_ATTENDANCE_STATUSES.includes(status as any) ? status : "Present";
    const cleanNotes = notes ? String(notes).trim().slice(0, 400) : null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { success: false, error: "Invalid attendance date." };
    }

    const attendance = await prisma.attendance.upsert({
      where: {
        StudentID_Date: {
          StudentID: student.StudentID,
          Date: date,
        },
      },
      update: { Status: cleanStatus, Notes: cleanNotes },
      create: {
        StudentID: student.StudentID,
        TermID: Number(termId),
        Date: date,
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
                  <p style="font-size: 14px; color: #4b5563;">If this absence is unexcused or if you have any questions, please contact the class form master or the school administrative desk.</p>
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

    return { success: true, attendance };
  } catch (error: any) {
    console.error("Failed to mark attendance:", error);
    return { success: false, error: error?.message || "Internal server error" };
  }
}

export async function getAttendanceForClass(classId: number, dateStr: string) {
  try {
    await requireClassTeacherOrAdmin(Number(classId));

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { success: false, error: "Invalid date." };
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        Student: { ClassID: Number(classId) },
        Date: date,
      },
    });

    return { success: true, attendances };
  } catch (error: any) {
    console.error("Failed to fetch attendance:", error);
    return { success: false, error: error?.message || "Unauthorized or failed to fetch attendance" };
  }
}

