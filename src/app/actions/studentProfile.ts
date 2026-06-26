"use server";

import prisma from "@/lib/db";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export async function getStudentProfile(userId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  if (session.user.id !== userId && session.user.role !== "admin") {
    return { success: false, error: "Forbidden. You cannot view another student's profile." };
  }

  try {
    const cacheKey = `profile:${userId}`;
    const cachedProfile = await getCachedData<any>(cacheKey);
    
    if (cachedProfile) {
      return cachedProfile;
    }

    // 1. Single Highly Optimized Query resolving previous N+1 cascading calls
    const student = await prisma.student.findUnique({
      where: { UserID: userId },
      include: {
        User: true,
        Class: {
          include: {
            TeacherMaps: {
              include: {
                Subject: true,
                Teacher: true
              }
            }
          }
        },
        PaymentRecords: {
          include: { Term: true },
          orderBy: { PaymentDate: 'desc' }
        }
      }
    });

    if (!student) {
      return { success: false, error: "Student profile not found" };
    }

    const academics = student.Class.TeacherMaps;
    const payments = student.PaymentRecords;

    // Safely parse the Teacher User data to remove sensitive info
    const safeAcademics = academics.map(a => ({
      SubjectName: a.Subject.SubjectName,
      TeacherName: a.Teacher.Email // Or a Name field if you add one to User
    }));

    const finalResponse = {
      success: true,
      student: {
        id: student.StudentID,
        admissionNo: student.AdmissionNo,
        className: student.Class.ClassName,
        level: student.Class.Level,
        email: student.User?.Email,
        preferredName: student.PreferredName,
        dob: student.DateOfBirth,
        parentContact: student.ParentContact
      },
      academics: safeAcademics,
      payments: payments.map(p => ({
        id: p.PaymentID,
        term: p.Term.TermName,
        session: p.Term.SessionName,
        amount: p.AmountPaid,
        description: p.Description,
        status: p.Status,
        date: p.PaymentDate
      }))
    };

    // Save to Cache with 24h TTL
    await setCachedData(cacheKey, finalResponse, 86400);

    return finalResponse;
  } catch (error: any) {
    console.error("Failed to get student profile", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function uploadPaymentReceipt(studentId: number, termId: number, description: string, amount: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  const rateLimitResult = await rateLimit(`uploadReceipt:${session.user.id}`, 3, 60);
  if (!rateLimitResult.success) {
    return { success: false, error: "Upload rate limit exceeded. Please wait a minute." };
  }

  try {
    const record = await prisma.payment_Record.create({
      data: {
        StudentID: studentId,
        TermID: termId,
        Description: description,
        AmountPaid: amount,
        ReceiptUrl: "/uploads/dummy-receipt.pdf", // Stubbed file upload
        Status: "Pending"
      }
    });

    // Invalidate the cache to reflect the new pending payment
    const student = await prisma.student.findUnique({ where: { StudentID: studentId } });
    if (student?.UserID) {
      await invalidateCache(`profile:${student.UserID}`);
    }

    return { success: true, message: "Receipt uploaded successfully and is pending admin verification." };
  } catch (error: any) {
    console.error("Failed to upload receipt", error);
    return { success: false, error: "Internal server error" };
  }
}
