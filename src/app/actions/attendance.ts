"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function markAttendance(studentId: number, termId: number, dateStr: string, status: string, notes?: string) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "teacher") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const date = new Date(dateStr);
    const attendance = await prisma.attendance.upsert({
      where: {
        StudentID_Date: {
          StudentID: studentId,
          Date: date
        }
      },
      update: { Status: status, Notes: notes },
      create: {
        StudentID: studentId,
        TermID: termId,
        Date: date,
        Status: status,
        Notes: notes
      }
    });

    if (status === "Absent") {
      // Simulate background job dispatch for parent alert
      console.log(`[ALERT DISPATCHED] Sending SMS to Parent of Student #${studentId}: Your child was marked absent on ${dateStr}.`);
    }

    return { success: true, attendance };
  } catch (error) {
    console.error("Failed to mark attendance:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function getAttendanceForClass(classId: number, dateStr: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const date = new Date(dateStr);
    const attendances = await prisma.attendance.findMany({
      where: {
        Student: { ClassID: classId },
        Date: date
      }
    });

    return { success: true, attendances };
  } catch (error) {
    console.error("Failed to fetch attendance:", error);
    return { success: false, error: "Internal server error" };
  }
}
