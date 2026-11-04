"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { requireActiveUser, writeAuditLog } from "@/lib/authz";
import { parseAndMatchClassList, ParsedClassListRow } from "@/lib/pdf-classlist";

// Helper to check if actor is allowed to manage a class (Admin or Assigned Form Master)
async function verifyClassPermission(actor: any, classId: number) {
  const isAdmin = actor.roles.some((r: string) =>
    ["ADMIN", "SUPER_ADMIN", "PRINCIPAL"].includes(r.toUpperCase())
  );
  if (isAdmin) return true;

  const classRecord = await prisma.class.findUnique({
    where: { ClassID: classId },
  });

  if (!classRecord) {
    throw new Error("Target class arm not found.");
  }

  const isFormMaster = classRecord.FormMasterID === actor.UserID;
  if (!isFormMaster) {
    // Check if teacher is assigned to this class
    const teacherMap = await prisma.teacher_Subject_Map.findFirst({
      where: { TeacherID: actor.UserID, ClassID: classId },
    });
    if (!teacherMap) {
      throw new Error("You are not authorized to sync students for this class arm.");
    }
  }
  return true;
}

export async function previewClassListPdf(formData: FormData) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const classIdStr = formData.get("classId") as string;
  const classId = parseInt(classIdStr, 10);
  const pdfFile = formData.get("pdf") as File | null;

  if (!classId || isNaN(classId)) {
    return { success: false, error: "A target class arm must be selected." };
  }

  if (!pdfFile || pdfFile.size === 0) {
    return { success: false, error: "Please select a valid PDF class list to upload." };
  }

  if (pdfFile.size > 10 * 1024 * 1024) {
    return { success: false, error: "File size exceeds 10MB limit." };
  }

  try {
    await verifyClassPermission(actor, classId);

    const bytes = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await parseAndMatchClassList(buffer, classId);
    return result;
  } catch (error: any) {
    console.error("previewClassListPdf error:", error);
    return { success: false, error: error.message || "Failed to analyze PDF" };
  }
}

export async function commitClassListSync(
  classId: number,
  selectedRows: ParsedClassListRow[]
) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  if (!classId) {
    return { success: false, error: "Target class arm not specified." };
  }

  const activeRows = selectedRows.filter((r) => r.selected);
  if (activeRows.length === 0) {
    return { success: false, error: "No student rows were selected for synchronization." };
  }

  try {
    await verifyClassPermission(actor, classId);

    const targetClass = await prisma.class.findUnique({
      where: { ClassID: classId },
    });

    if (!targetClass) {
      return { success: false, error: "Target class arm not found." };
    }

    const activeTerm =
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } })) ||
      (await prisma.academic_Term.findFirst({ orderBy: { SessionName: "desc" } }));

    if (!activeTerm) {
      return { success: false, error: "No active academic term configured in the system." };
    }

    const claimSlips: Array<{
      name: string;
      admissionNo: string;
      claimCode: string;
      className: string;
    }> = [];

    let matchedCount = 0;
    let newPupilsCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of activeRows) {
        if (row.isExisting && row.existingStudentId) {
          // 1. Matched Existing Student: Retain permanent registration number and update enrollment
          await tx.student.update({
            where: { StudentID: row.existingStudentId },
            data: {
              ClassID: classId,
              PreferredName: row.cleanName,
            },
          });

          // Ensure Enrollment record exists for this term
          await tx.enrollment.upsert({
            where: {
              StudentID_ClassID_TermID: {
                StudentID: row.existingStudentId,
                ClassID: classId,
                TermID: activeTerm.TermID,
              },
            },
            create: {
              StudentID: row.existingStudentId,
              ClassID: classId,
              TermID: activeTerm.TermID,
              AcademicYear: activeTerm.SessionName,
              Status: "ACTIVE",
            },
            update: {
              Status: "ACTIVE",
            },
          });

          matchedCount++;
        } else {
          // 2. New Pupil: Create permanent registration number, claim code & enrollment
          const plainCode = row.claimCode || "WOF-DEMO12";
          const codeHash = crypto.createHash("sha256").update(plainCode).digest("hex");
          const claimExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

          const newStudent = await tx.student.create({
            data: {
              AdmissionNo: row.admissionNo,
              PreferredName: row.cleanName,
              ClassID: classId,
              DateOfBirth: new Date(),
              ParentContact: "08000000000",
              HasPaidFees: false,
              ClaimCodeHash: codeHash,
              ClaimCodeExpiresAt: claimExpiresAt,
              Claims: {
                create: {
                  codeHash,
                  expiresAt: claimExpiresAt,
                },
              },
            },
          });

          await tx.enrollment.create({
            data: {
              StudentID: newStudent.StudentID,
              ClassID: classId,
              TermID: activeTerm.TermID,
              AcademicYear: activeTerm.SessionName,
              Status: "ACTIVE",
            },
          });

          claimSlips.push({
            name: row.cleanName,
            admissionNo: row.admissionNo,
            claimCode: plainCode,
            className: targetClass.ClassName,
          });

          newPupilsCount++;
        }
      }
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "CLASS_LIST_SYNC",
      targetTable: "Class",
      targetId: String(classId),
      afterState: {
        className: targetClass.ClassName,
        matchedCount,
        newPupilsCount,
        totalEnrolled: activeRows.length,
      },
    });

    revalidatePath("/portal/admin/classes");
    revalidatePath("/portal/admin/students");
    revalidatePath("/portal/teacher");

    return {
      success: true,
      className: targetClass.ClassName,
      matchedCount,
      newPupilsCount,
      totalProcessed: activeRows.length,
      claimSlips,
    };
  } catch (error: any) {
    console.error("commitClassListSync error:", error);
    return { success: false, error: error.message || "Failed to commit class list sync" };
  }
}
