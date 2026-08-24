"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_mocked_key";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    throw new Error("Unauthorized. Admin privileges required.");
  }
}

// ==========================================
// ADMIN: AUDIT QUEUE & FEE CLEARANCE
// ==========================================

export async function getAdminPaymentAuditList(filters?: {
  status?: string;
  termId?: number;
  search?: string;
}) {
  await requireAdmin();

  try {
    let whereClause: any = {};

    if (filters?.status && filters.status !== "ALL") {
      whereClause.Status = filters.status;
    }

    if (filters?.termId) {
      whereClause.TermID = filters.termId;
    }

    if (filters?.search) {
      whereClause.OR = [
        { Reference: { contains: filters.search.trim(), mode: "insensitive" } },
        { Student: { PreferredName: { contains: filters.search.trim(), mode: "insensitive" } } },
        { Student: { AdmissionNo: { contains: filters.search.trim(), mode: "insensitive" } } },
      ];
    }

    const payments = await prisma.payment_Record.findMany({
      where: whereClause,
      include: {
        Student: {
          include: { Class: true, User: true }
        },
        Term: true
      },
      orderBy: { PaymentDate: "desc" }
    });

    const pendingCount = await prisma.payment_Record.count({ where: { Status: "Pending" } });
    const approvedTotal = await prisma.payment_Record.aggregate({
      where: { Status: "Approved" },
      _sum: { AmountPaid: true }
    });

    return {
      success: true,
      payments,
      pendingCount,
      totalRevenue: approvedTotal._sum.AmountPaid || 0
    };
  } catch (error: any) {
    console.error("getAdminPaymentAuditList error:", error);
    return { success: false, error: error.message || "Failed to fetch payment records" };
  }
}

export async function approvePaymentRecord(paymentId: number) {
  await requireAdmin();

  try {
    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
      include: { Student: true }
    });

    if (!payment) {
      return { success: false, error: "Payment record not found." };
    }

    // Approve payment and grant student fee clearance for results
    await prisma.$transaction([
      prisma.payment_Record.update({
        where: { PaymentID: paymentId },
        data: { Status: "Approved" }
      }),
      prisma.student.update({
        where: { StudentID: payment.StudentID },
        data: { HasPaidFees: true }
      })
    ]);

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true };
  } catch (error: any) {
    console.error("approvePaymentRecord error:", error);
    return { success: false, error: error.message || "Failed to approve payment" };
  }
}

export async function rejectPaymentRecord(paymentId: number) {
  await requireAdmin();

  try {
    await prisma.payment_Record.update({
      where: { PaymentID: paymentId },
      data: { Status: "Rejected" }
    });

    revalidatePath("/portal/admin/payments");
    return { success: true };
  } catch (error: any) {
    console.error("rejectPaymentRecord error:", error);
    return { success: false, error: error.message || "Failed to reject payment" };
  }
}

// ==========================================
// STUDENT: INITIATE PAYMENT & UPLOAD RECEIPT
// ==========================================

export async function initializePayment(data: { amount: number; description: string; termId: number }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { error: "Unauthorized" };
  }

  const student = await prisma.student.findFirst({
    where: { UserID: session.user.id },
    include: { User: true }
  });

  if (!student) {
    return { error: "Student profile not found" };
  }

  const reference = `WOF-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const amountInKobo = Math.round(data.amount * 100);

  try {
    await prisma.payment_Record.create({
      data: {
        StudentID: student.StudentID,
        TermID: data.termId,
        AmountPaid: data.amount,
        Description: data.description,
        Reference: reference,
        Status: "Pending"
      }
    });

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: student.User?.Email,
        amount: amountInKobo,
        reference: reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal/fees?payment=verify`
      })
    });

    const paystackData = await response.json();

    if (!paystackData.status) {
      return { error: paystackData.message || "Failed to initialize payment with Paystack" };
    }

    return { authorizationUrl: paystackData.data.authorization_url };
  } catch (error: any) {
    console.error("Payment init error:", error);
    return { error: error.message || "An unexpected error occurred" };
  }
}
