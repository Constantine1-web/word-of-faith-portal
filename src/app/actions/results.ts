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

export async function uploadManualResult(data: {
  admissionNo: string;
  subjectName: string;
  caScore: number;
  examScore: number;
}) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "Teacher")) {
    return { error: "Unauthorized. Only admins or teachers can upload results." };
  }

  const { admissionNo, subjectName, caScore, examScore } = data;
  const totalScore = Number(caScore) + Number(examScore);
  const grade = calculateGrade(totalScore);

  try {
    const student = await prisma.student.findUnique({
      where: { AdmissionNo: admissionNo }
    });
    if (!student) return { error: `Student with Admission No. ${admissionNo} not found.` };

    const subject = await prisma.subject.findFirst({
      where: { SubjectName: subjectName }
    });
    if (!subject) return { error: `Subject '${subjectName}' not found.` };

    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });
    if (!term) return { error: "No active academic term found. Please activate a term first." };

    await prisma.result.upsert({
      where: {
        StudentID_SubjectID_TermID: {
          StudentID: student.StudentID,
          SubjectID: subject.SubjectID,
          TermID: term.TermID
        }
      },
      update: { CAScore: Number(caScore), ExamScore: Number(examScore), TotalScore: totalScore, Grade: grade },
      create: { StudentID: student.StudentID, SubjectID: subject.SubjectID, TermID: term.TermID, CAScore: Number(caScore), ExamScore: Number(examScore), TotalScore: totalScore, Grade: grade }
    });

    revalidatePath("/portal/admin/results");
    return { success: true };
  } catch (error: any) {
    console.error("Result upload error:", error);
    return { error: error.message || "Failed to upload result." };
  }
}

export async function uploadBulkResults(csvData: string) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "Teacher")) {
    return { error: "Unauthorized. Only admins or teachers can upload results." };
  }

  try {
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return { error: "CSV file is empty or missing headers. Please ensure headers are: AdmissionNo, SubjectName, CAScore, ExamScore" };
    
    let successCount = 0;
    let errors = [];

    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });
    if (!term) return { error: "No active academic term found." };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 4) {
        errors.push(`Row ${i + 1}: Not enough columns.`);
        continue;
      }
      
      const [admissionNo, subjectName, caStr, examStr] = parts;
      const caScore = parseFloat(caStr);
      const examScore = parseFloat(examStr);
      
      if (isNaN(caScore) || isNaN(examScore)) {
        errors.push(`Row ${i + 1}: Invalid scores for ${admissionNo}`);
        continue;
      }

      const totalScore = caScore + examScore;
      const grade = calculateGrade(totalScore);

      const student = await prisma.student.findUnique({ where: { AdmissionNo: admissionNo } });
      if (!student) {
        errors.push(`Row ${i + 1}: Student ${admissionNo} not found.`);
        continue;
      }

      const subject = await prisma.subject.findFirst({ where: { SubjectName: subjectName } });
      if (!subject) {
        errors.push(`Row ${i + 1}: Subject '${subjectName}' not found.`);
        continue;
      }

      await prisma.result.upsert({
        where: {
          StudentID_SubjectID_TermID: {
            StudentID: student.StudentID,
            SubjectID: subject.SubjectID,
            TermID: term.TermID
          }
        },
        update: { CAScore: caScore, ExamScore: examScore, TotalScore: totalScore, Grade: grade },
        create: { StudentID: student.StudentID, SubjectID: subject.SubjectID, TermID: term.TermID, CAScore: caScore, ExamScore: examScore, TotalScore: totalScore, Grade: grade }
      });
      
      successCount++;
    }

    revalidatePath("/portal/admin/results");
    return { success: true, message: `Successfully uploaded ${successCount} results. ${errors.length > 0 ? "Errors: " + errors.join("; ") : ""}` };
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return { error: error.message || "Failed to process bulk upload." };
  }
}
