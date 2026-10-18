"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { calculateGrade } from "@/lib/grading";
import { rateLimit } from "@/lib/rateLimit";

// ==========================================
// 1. TEACHER & FORM MASTER DASHBOARD DATA
// ==========================================

export async function getTeacherDashboardData() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const userId = session.user.id;

  try {
    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });

    if (!activeTerm) {
      return { success: false, error: "No active academic session/term is currently set by Admin." };
    }

    // 1. Fetch Subject Teacher allocations
    const subjectAllocations = await prisma.teacher_Subject_Map.findMany({
      where: { TeacherID: userId },
      include: {
        Subject: true,
        Class: {
          include: {
            Students: true,
            FormMaster: true
          }
        },
        Term: true
      },
      orderBy: { Class: { ClassName: "asc" } }
    });

    // 2. Fetch submission status for each allocation
    const submissions = await prisma.subject_Submission.findMany({
      where: {
        TermID: activeTerm.TermID,
        TeacherID: userId
      }
    });

    // 3. Check if this teacher is also a Form Master (Class Teacher)
    const formMasterClasses = await prisma.class.findMany({
      where: { FormMasterID: userId },
      include: {
        Students: {
          include: {
            Results: {
              where: { TermID: activeTerm.TermID },
              include: { Subject: true }
            },
            FormMasterReports: {
              where: { TermID: activeTerm.TermID }
            }
          },
          orderBy: { AdmissionNo: "asc" }
        },
        TeacherMaps: {
          include: {
            Subject: true,
            Teacher: true
          }
        },
        SubjectSubmissions: {
          where: { TermID: activeTerm.TermID },
          include: {
            Subject: true,
            Teacher: true
          }
        }
      }
    });

    return {
      success: true,
      activeTerm,
      subjectAllocations,
      submissions,
      formMasterClasses,
      isFormMaster: formMasterClasses.length > 0
    };
  } catch (error: any) {
    console.error("getTeacherDashboardData error:", error);
    return { success: false, error: error.message || "Failed to load teacher dashboard data." };
  }
}

// ==========================================
// 2. SUBJECT TEACHER SCORE ENTRY & SUBMISSION
// ==========================================

export async function getStudentsAndScoresForSubject(classId: number, subjectId: number, termId?: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }

    if (!targetTermId) return { success: false, error: "No active term" };

    const students = await prisma.student.findMany({
      where: { ClassID: classId },
      include: {
        User: true,
        Results: {
          where: {
            SubjectID: subjectId,
            TermID: targetTermId
          }
        }
      },
      orderBy: { AdmissionNo: "asc" }
    });

    const submission = await prisma.subject_Submission.findUnique({
      where: {
        SubjectID_ClassID_TermID: {
          SubjectID: subjectId,
          ClassID: classId,
          TermID: targetTermId
        }
      }
    });

    const term = await prisma.academic_Term.findUnique({ where: { TermID: targetTermId } });

    return {
      success: true,
      students,
      isSubmitted: submission?.Status === "Submitted" || submission?.Status === "Approved",
      submission,
      isTermLocked: term?.IsLocked || false
    };
  } catch (error: any) {
    console.error("getStudentsAndScoresForSubject error:", error);
    return { success: false, error: error.message || "Failed to fetch student scores" };
  }
}

export async function saveSubjectScoresBatch(data: {
  subjectId: number;
  classId: number;
  termId: number;
  scores: { studentId: number; caScore: number; examScore: number }[];
}) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Teacher" && session.user.role !== "teacher" && session.user.role !== "Admin" && session.user.role !== "admin")) {
    return { success: false, error: "Unauthorized. Only authorized teachers or admins can enter scores." };
  }

  try {
    // Check if the term is locked
    const term = await prisma.academic_Term.findUnique({ where: { TermID: data.termId } });
    if (term?.IsLocked) {
      return { success: false, error: "Score entry for this academic term has been LOCKED by administration." };
    }

    // Save/upsert each student score
    for (const item of data.scores) {
      const ca = Math.min(Math.max(0, Number(item.caScore) || 0), 40);
      const exam = Math.min(Math.max(0, Number(item.examScore) || 0), 60);
      const total = ca + exam;
      const { grade, remark } = calculateGrade(total);

      await prisma.result.upsert({
        where: {
          StudentID_SubjectID_TermID: {
            StudentID: item.studentId,
            SubjectID: data.subjectId,
            TermID: data.termId
          }
        },
        update: {
          CAScore: ca,
          ExamScore: exam,
          TotalScore: total,
          Grade: grade,
          Remark: remark
        },
        create: {
          StudentID: item.studentId,
          SubjectID: data.subjectId,
          TermID: data.termId,
          CAScore: ca,
          ExamScore: exam,
          TotalScore: total,
          Grade: grade,
          Remark: remark
        }
      });
    }

    revalidatePath("/portal/dashboard");
    return { success: true, message: "Scores saved successfully as draft." };
  } catch (error: any) {
    console.error("saveSubjectScoresBatch error:", error);
    return { success: false, error: error.message || "Failed to save scores." };
  }
}

export async function submitSubjectToFormMaster(subjectId: number, classId: number, termId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const term = await prisma.academic_Term.findUnique({ where: { TermID: termId } });
    if (term?.IsLocked) {
      return { success: false, error: "Cannot submit results: term score entry is locked." };
    }

    const submission = await prisma.subject_Submission.upsert({
      where: {
        SubjectID_ClassID_TermID: {
          SubjectID: subjectId,
          ClassID: classId,
          TermID: termId
        }
      },
      update: {
        Status: "Submitted",
        SubmittedAt: new Date(),
        TeacherID: session.user.id
      },
      create: {
        SubjectID: subjectId,
        ClassID: classId,
        TermID: termId,
        TeacherID: session.user.id,
        Status: "Submitted",
        SubmittedAt: new Date()
      }
    });

    revalidatePath("/portal/dashboard");
    return { success: true, submission };
  } catch (error: any) {
    console.error("submitSubjectToFormMaster error:", error);
    return { success: false, error: error.message || "Failed to submit results to Form Master." };
  }
}

// ==========================================
// 3. FORM MASTER COMPILATION & REMARKS
// ==========================================

export async function saveFormMasterRemarks(data: {
  studentId: number;
  termId: number;
  formMasterRemark?: string;
  principalRemark?: string;
  affectiveTraits?: Record<string, number>;
  psychomotorTraits?: Record<string, number>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const report = await prisma.form_Master_Report.upsert({
      where: {
        StudentID_TermID: {
          StudentID: data.studentId,
          TermID: data.termId
        }
      },
      update: {
        FormMasterRemark: data.formMasterRemark || undefined,
        PrincipalRemark: data.principalRemark || undefined,
        AffectiveTraits: data.affectiveTraits ? JSON.stringify(data.affectiveTraits) : undefined,
        PsychomotorTraits: data.psychomotorTraits ? JSON.stringify(data.psychomotorTraits) : undefined,
      },
      create: {
        StudentID: data.studentId,
        TermID: data.termId,
        FormMasterRemark: data.formMasterRemark || "A hardworking and disciplined student.",
        PrincipalRemark: data.principalRemark || "Satisfactory academic performance.",
        AffectiveTraits: data.affectiveTraits ? JSON.stringify(data.affectiveTraits) : JSON.stringify({ punctuality: 5, neatness: 5, attentiveness: 4, conduct: 5 }),
        PsychomotorTraits: data.psychomotorTraits ? JSON.stringify(data.psychomotorTraits) : JSON.stringify({ handwriting: 4, sports: 4, crafts: 4 }),
        Status: "Draft"
      }
    });

    revalidatePath("/portal/dashboard");
    return { success: true, report };
  } catch (error: any) {
    console.error("saveFormMasterRemarks error:", error);
    return { success: false, error: error.message || "Failed to save Form Master remarks." };
  }
}

export async function submitClassResultsToAdmin(classId: number, termId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const students = await prisma.student.findMany({
      where: { ClassID: classId }
    });

    for (const student of students) {
      await prisma.form_Master_Report.upsert({
        where: {
          StudentID_TermID: {
            StudentID: student.StudentID,
            TermID: termId
          }
        },
        update: { Status: "SubmittedToAdmin" },
        create: {
          StudentID: student.StudentID,
          TermID: termId,
          FormMasterRemark: "Good overall performance.",
          PrincipalRemark: "Promoted / Approved.",
          Status: "SubmittedToAdmin"
        }
      });
    }

    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/admin/results");
    return { success: true, message: "Class results compiled and submitted to Admin for final publication!" };
  } catch (error: any) {
    console.error("submitClassResultsToAdmin error:", error);
    return { success: false, error: error.message || "Failed to submit class to admin." };
  }
}

// ==========================================
// 4. BROADSHEET & POSITION ENGINE
// ==========================================

export async function getClassBroadsheet(classId: number, termId?: number) {
  try {
    let targetTermId = termId;
    if (!targetTermId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      targetTermId = active?.TermID;
    }

    if (!targetTermId) return { success: false, error: "No active term" };

    const classData = await prisma.class.findUnique({
      where: { ClassID: classId },
      include: {
        FormMaster: true,
        Students: {
          include: {
            Results: {
              where: { TermID: targetTermId },
              include: { Subject: true }
            },
            FormMasterReports: {
              where: { TermID: targetTermId }
            }
          }
        },
        TeacherMaps: {
          include: { Subject: true, Teacher: true }
        },
        SubjectSubmissions: {
          where: { TermID: targetTermId },
          include: { Subject: true }
        }
      }
    });

    if (!classData) return { success: false, error: "Class not found." };

    const term = await prisma.academic_Term.findUnique({ where: { TermID: targetTermId } });

    // Distinct subjects in this class
    const subjectsMap = new Map<number, string>();
    classData.Students.forEach(st => {
      st.Results.forEach(r => {
        subjectsMap.set(r.SubjectID, r.Subject.SubjectName);
      });
    });

    // Compute student aggregate scores, averages, and rankings
    const studentSummaries = classData.Students.map(student => {
      let totalMarks = 0;
      let subjectCount = 0;
      const scoreMap: Record<number, { ca: number; exam: number; total: number; grade: string }> = {};

      student.Results.forEach(r => {
        totalMarks += r.TotalScore;
        subjectCount++;
        scoreMap[r.SubjectID] = {
          ca: r.CAScore,
          exam: r.ExamScore,
          total: r.TotalScore,
          grade: r.Grade
        };
      });

      const average = subjectCount > 0 ? parseFloat((totalMarks / subjectCount).toFixed(1)) : 0;

      return {
        studentId: student.StudentID,
        admissionNo: student.AdmissionNo,
        name: student.PreferredName || student.AdmissionNo,
        scoreMap,
        totalMarks,
        average,
        subjectCount,
        report: student.FormMasterReports[0] || null
      };
    });

    // Rank students by totalMarks descending
    studentSummaries.sort((a, b) => b.totalMarks - a.totalMarks);
    studentSummaries.forEach((s, idx) => {
      (s as any).position = idx + 1;
    });

    return {
      success: true,
      classData,
      term,
      subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
      studentSummaries
    };
  } catch (error: any) {
    console.error("getClassBroadsheet error:", error);
    return { success: false, error: error.message || "Failed to generate class broadsheet" };
  }
}

// Legacy helper for backward compatibility
export async function saveResult(data: {
  studentId: number;
  subjectId: number;
  termId: number;
  caScore: number;
  examScore: number;
}) {
  return saveSubjectScoresBatch({
    subjectId: data.subjectId,
    classId: 0,
    termId: data.termId,
    scores: [{ studentId: data.studentId, caScore: data.caScore, examScore: data.examScore }]
  });
}

export async function getStudentsInClass(classId: number) {
  try {
    return await prisma.student.findMany({
      where: { ClassID: classId },
      include: { User: true }
    });
  } catch {
    return [];
  }
}

export async function getTeacherSubjects(teacherUserId: number) {
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
  const { grade, remark } = calculateGrade(totalScore);

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
      update: { CAScore: Number(caScore), ExamScore: Number(examScore), TotalScore: totalScore, Grade: grade, Remark: remark },
      create: { StudentID: student.StudentID, SubjectID: subject.SubjectID, TermID: term.TermID, CAScore: Number(caScore), ExamScore: Number(examScore), TotalScore: totalScore, Grade: grade, Remark: remark }
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
    let errors: string[] = [];

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
      const { grade, remark } = calculateGrade(totalScore);

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
        update: { CAScore: caScore, ExamScore: examScore, TotalScore: totalScore, Grade: grade, Remark: remark },
        create: { StudentID: student.StudentID, SubjectID: subject.SubjectID, TermID: term.TermID, CAScore: caScore, ExamScore: examScore, TotalScore: totalScore, Grade: grade, Remark: remark }
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

