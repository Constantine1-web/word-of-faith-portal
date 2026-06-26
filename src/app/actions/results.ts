"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { revalidatePath } from "next/cache";

function calculateGrade(totalScore: number): string {
  if (totalScore >= 70) return "A";
  if (totalScore >= 60) return "B";
  if (totalScore >= 50) return "C";
  if (totalScore >= 45) return "D";
  if (totalScore >= 40) return "E";
  return "F";
}

export async function saveResult(data: {
  studentId: number;
  subjectId: number;
  termId: number;
  caScore: number;
  examScore: number;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "teacher") {
    return { success: false, error: "Unauthorized. Only teachers can submit grades." };
  }

  const rateLimitResult = await rateLimit(`saveResult:${session.user.id}`, 20, 60);
  if (!rateLimitResult.success) {
    return { success: false, error: "Too many requests. Please wait a minute." };
  }

  const { studentId, subjectId, termId, caScore, examScore } = data;
  const totalScore = caScore + examScore;
  const grade = calculateGrade(totalScore);

  try {
    const result = await prisma.result.upsert({
      where: {
        StudentID_SubjectID_TermID: {
          StudentID: studentId,
          SubjectID: subjectId,
          TermID: termId,
        },
      },
      update: {
        CAScore: caScore,
        ExamScore: examScore,
        TotalScore: totalScore,
        Grade: grade,
      },
      create: {
        StudentID: studentId,
        SubjectID: subjectId,
        TermID: termId,
        CAScore: caScore,
        ExamScore: examScore,
        TotalScore: totalScore,
        Grade: grade,
      },
    });

    revalidatePath("/portal/dashboard");
    return { success: true, result };
  } catch (error: any) {
    console.error("Error saving result:", error);
    return { success: false, error: "Failed to save the result. Please check the provided data." };
  }
}

export async function getTeacherSubjects(teacherUserId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return [];

  try {
    return await prisma.teacher_Subject_Map.findMany({
      where: { TeacherID: teacherUserId },
      include: { Subject: true, Class: true },
    });
  } catch (error) {
    console.error("Failed to fetch teacher subjects:", error);
    return [];
  }
}

export async function getStudentsInClass(classId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return [];

  try {
    return await prisma.student.findMany({
      where: { ClassID: classId },
      include: { User: true },
    });
  } catch (error) {
    console.error("Failed to fetch students:", error);
    return [];
  }
}
