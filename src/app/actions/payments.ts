"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  requireActiveUser,
  requireCapability,
  assertSeparationOfDuties,
  writeAuditLog,
} from "@/lib/authz";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_mocked_key";

async function requirePaymentManager() {
  return requireCapability(["MANAGE_FINANCE", "APPROVE_PAYMENTS"]);
}

// ==========================================
// ADMIN / BURSAR: AUDIT QUEUE & FEE CLEARANCE
// ==========================================

export async function getAdminPaymentAuditList(filters?: {
  status?: string;
  termId?: number;
  search?: string;
}) {
  try {
    await requirePaymentManager();
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

    const rawPayments = await prisma.payment_Record.findMany({
      where: whereClause,
      include: {
        Student: {
          include: { Class: true, User: true },
        },
        Term: true,
      },
      orderBy: { PaymentDate: "desc" },
    });

    // Convert BigInt AmountKobo to Number for React Server Action JSON serialization
    const payments = rawPayments.map((p: any) => ({
      ...p,
      AmountKobo: Number(p.AmountKobo || 0),
    }));

    const pendingCount = await prisma.payment_Record.count({ where: { Status: "Pending" } });
    const approvedTotal = await prisma.payment_Record.aggregate({
      where: { Status: "Approved" },
      _sum: { AmountPaid: true },
    });

    return {
      success: true,
      payments,
      pendingCount,
      totalRevenue: approvedTotal._sum.AmountPaid || 0,
    };
  } catch (error: any) {
    console.error("getAdminPaymentAuditList error:", error);
    return { success: false, error: error.message || "Failed to fetch payment records" };
  }
}

export async function approvePaymentRecord(paymentId: number) {
  const actor = await requireCapability("APPROVE_PAYMENTS");

  try {
    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
      include: { Student: true },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found." };
    }

    // Section B.2 & B.5 Separation of Duties: Submitter cannot approve their own payment
    assertSeparationOfDuties(actor.UserID, payment.SubmittedBy, "payment submission");

    await prisma.$transaction([
      prisma.payment_Record.update({
        where: { PaymentID: paymentId },
        data: {
          Status: "Approved",
          ReviewedBy: actor.UserID,
          ReviewedAt: new Date(),
        },
      }),
      prisma.student.update({
        where: { StudentID: payment.StudentID },
        data: { HasPaidFees: true },
      }),
    ]);

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "PAYMENT_APPROVE",
      targetTable: "Payment_Record",
      targetId: String(paymentId),
      beforeState: { status: payment.Status },
      afterState: { status: "Approved", studentId: payment.StudentID, amountPaid: payment.AmountPaid },
    });

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true };
  } catch (error: any) {
    console.error("approvePaymentRecord error:", error);
    return { success: false, error: error.message || "Failed to approve payment" };
  }
}

export async function rejectPaymentRecord(paymentId: number, rejectionReason?: string) {
  const actor = await requirePaymentManager();

  try {
    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
    });

    await prisma.payment_Record.update({
      where: { PaymentID: paymentId },
      data: {
        Status: "Rejected",
        RejectionReason: rejectionReason || "Receipt could not be verified by Bursary. Please upload a clear teller or transfer receipt.",
        ReviewedBy: actor.UserID,
        ReviewedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "PAYMENT_REJECT",
      targetTable: "Payment_Record",
      targetId: String(paymentId),
      beforeState: { status: payment?.Status },
      afterState: { status: "Rejected", reason: rejectionReason },
    });

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true };
  } catch (error: any) {
    console.error("rejectPaymentRecord error:", error);
    return { success: false, error: error.message || "Failed to reject payment" };
  }
}

// ==========================================
// STUDENT: INITIATE PAYMENT & UPLOAD RECEIPT
// ==========================================

export function generateOrderTrackingId(termName?: string, sessionName?: string) {
  const cleanYear = (sessionName || "2026/2027").split("/")[0] || "2026";
  const termCode = termName?.toLowerCase().includes("second")
    ? "T2"
    : termName?.toLowerCase().includes("third")
    ? "T3"
    : "T1";
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `WOF-PAY-${cleanYear}${termCode}-${randomHex}`;
}

export async function getOrCreateStudentFeeOrder() {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const student = await prisma.student.findFirst({
      where: { UserID: actor.UserID },
      include: {
        Class: true,
        User: true,
      },
    });

    if (!student) {
      return { success: false, error: "Student profile not found" };
    }

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    }) || await prisma.academic_Term.findFirst({
      orderBy: { SessionName: "desc" },
    });

    if (!activeTerm) {
      return { success: false, error: "Active academic term not found." };
    }

    // 1. Check if student already has an APPROVED payment for this term
    const approvedPayment = await prisma.payment_Record.findFirst({
      where: {
        StudentID: student.StudentID,
        TermID: activeTerm.TermID,
        Status: "Approved",
      },
      orderBy: { PaymentDate: "desc" },
    });

    if (approvedPayment) {
      return {
        success: true,
        isCleared: true,
        status: "Approved",
        trackingId: approvedPayment.Reference,
        amount: approvedPayment.AmountPaid,
        term: activeTerm,
        student,
        paymentRecord: {
          ...approvedPayment,
          AmountKobo: Number(approvedPayment.AmountKobo || 0),
        },
      };
    }

    // 2. Check if student has a PENDING payment order for this term
    const pendingPayment = await prisma.payment_Record.findFirst({
      where: {
        StudentID: student.StudentID,
        TermID: activeTerm.TermID,
        Status: "Pending",
      },
      orderBy: { PaymentDate: "desc" },
    });

    if (pendingPayment && pendingPayment.Reference) {
      return {
        success: true,
        isCleared: false,
        status: "Pending",
        trackingId: pendingPayment.Reference,
        amount: pendingPayment.AmountPaid,
        hasUploadedReceipt: Boolean(pendingPayment.ReceiptUrl),
        term: activeTerm,
        student,
        paymentRecord: {
          ...pendingPayment,
          AmountKobo: Number(pendingPayment.AmountKobo || 0),
        },
      };
    }

    // 3. Create a fresh consolidated School Fees order with a unique Tracking ID
    const trackingId = generateOrderTrackingId(activeTerm.TermName, activeTerm.SessionName);
    const defaultAmount = 65000; // Comprehensive School Fees
    const defaultAmountKobo = BigInt(defaultAmount * 100);

    const newPayment = await prisma.payment_Record.create({
      data: {
        StudentID: student.StudentID,
        TermID: activeTerm.TermID,
        AmountPaid: defaultAmount,
        AmountKobo: defaultAmountKobo,
        Channel: "BANK_TELLER",
        Description: `Consolidated School Fees (${activeTerm.SessionName} - ${activeTerm.TermName})`,
        Reference: trackingId,
        Status: "Pending",
      },
    });

    return {
      success: true,
      isCleared: false,
      status: "Pending",
      trackingId,
      amount: defaultAmount,
      hasUploadedReceipt: false,
      term: activeTerm,
      student,
      paymentRecord: {
        ...newPayment,
        AmountKobo: Number(newPayment.AmountKobo || 0),
      },
    };
  } catch (error: any) {
    console.error("getOrCreateStudentFeeOrder error:", error);
    return { success: false, error: error.message || "Failed to load fee order" };
  }
}

export async function uploadBankTellerReceipt(formData: FormData) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const student = await prisma.student.findFirst({
      where: { UserID: actor.UserID },
      include: { User: true },
    });

    if (!student) {
      return { success: false, error: "Student profile not found" };
    }

    const trackingId = (formData.get("trackingId") as string)?.trim();
    const bankName = (formData.get("bankName") as string)?.trim() || "Commercial Bank";
    const tellerNumber = (formData.get("tellerNumber") as string)?.trim() || "";
    const paymentDateStr = (formData.get("paymentDate") as string)?.trim();
    const amountStr = (formData.get("amount") as string)?.trim();
    const receiptFile = formData.get("receipt") as File | null;

    if (!receiptFile || receiptFile.size === 0) {
      return { success: false, error: "Please select a valid receipt or bank teller screenshot/PDF to upload." };
    }

    if (receiptFile.size > 5 * 1024 * 1024) {
      return { success: false, error: "Receipt file size exceeds maximum limit of 5MB." };
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(receiptFile.type)) {
      return { success: false, error: "Invalid file format. Only JPEG, PNG, WEBP and PDF files are accepted." };
    }

    const bytes = await receiptFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Compute SHA-256 hash to detect duplicate receipts across the school
    const receiptHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check if receipt hash already exists in another payment record
    const duplicateReceipt = await prisma.payment_Record.findFirst({
      where: {
        ReceiptHash: receiptHash,
        NOT: {
          Reference: trackingId,
        },
      },
      include: {
        Student: true,
      },
    });

    if (duplicateReceipt) {
      return {
        success: false,
        error: "This receipt file has already been uploaded for another transaction. Duplicate receipts cannot be verified.",
      };
    }

    // Ensure storage directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = path.extname(receiptFile.name) || (receiptFile.type === "application/pdf" ? ".pdf" : ".jpg");
    const fileName = `receipt_${student.StudentID}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/receipts/${fileName}`;
    const amount = parseFloat(amountStr || "65000") || 65000;
    const amountInKobo = Math.round(amount * 100);
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();

    // Find or update the payment record with this tracking ID
    let paymentRecord = await prisma.payment_Record.findFirst({
      where: {
        Reference: trackingId,
        StudentID: student.StudentID,
      },
    });

    if (paymentRecord) {
      await prisma.payment_Record.update({
        where: { PaymentID: paymentRecord.PaymentID },
        data: {
          AmountPaid: amount,
          AmountKobo: BigInt(amountInKobo),
          Channel: "BANK_TELLER",
          ReceiptUrl: publicUrl,
          ReceiptHash: receiptHash,
          Status: "Pending",
          PaymentDate: paymentDate,
          SubmittedBy: actor.UserID,
          Description: `School Fees [${bankName} - Ref: ${tellerNumber || "Direct Transfer"}]`,
        },
      });
    } else {
      const activeTerm = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: activeTerm ? activeTerm.TermID : 1,
          AmountPaid: amount,
          AmountKobo: BigInt(amountInKobo),
          Channel: "BANK_TELLER",
          ReceiptUrl: publicUrl,
          ReceiptHash: receiptHash,
          Reference: trackingId || `WOF-PAY-${Date.now()}`,
          Status: "Pending",
          PaymentDate: paymentDate,
          SubmittedBy: actor.UserID,
          Description: `School Fees [${bankName} - Ref: ${tellerNumber || "Direct Transfer"}]`,
        },
      });
    }

    revalidatePath("/portal/fees");
    revalidatePath("/portal/admin/payments");

    return {
      success: true,
      message: "Receipt uploaded successfully! Your payment is now queued for Bursary verification.",
    };
  } catch (error: any) {
    console.error("uploadBankTellerReceipt error:", error);
    return { success: false, error: error.message || "Failed to process receipt upload" };
  }
}

export async function initializePayment(data: { amount: number; description: string; termId: number; trackingId?: string }) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { error: "Unauthorized" };
  }

  const student = await prisma.student.findFirst({
    where: { UserID: actor.UserID },
    include: { User: true },
  });

  if (!student) {
    return { error: "Student profile not found" };
  }

  const reference = data.trackingId || `WOF-PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const amountInKobo = Math.round(data.amount * 100);

  try {
    // Check if order exists with this reference
    const existing = await prisma.payment_Record.findUnique({
      where: { Reference: reference },
    });

    if (existing) {
      await prisma.payment_Record.update({
        where: { Reference: reference },
        data: {
          AmountPaid: data.amount,
          AmountKobo: BigInt(amountInKobo),
          Channel: "PAYSTACK",
        },
      });
    } else {
      await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: data.termId,
          AmountPaid: data.amount,
          AmountKobo: BigInt(amountInKobo),
          Channel: "PAYSTACK",
          Description: data.description || "Consolidated School Fees",
          Reference: reference,
          Status: "Pending",
        },
      });
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: student.User?.Email,
        amount: amountInKobo,
        reference: reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/portal/fees?payment=verify`,
      }),
    });

    const paystackData = await response.json();

    if (!paystackData.status) {
      return { error: paystackData.message || "Failed to initialize payment gateway" };
    }

    return { authorizationUrl: paystackData.data.authorization_url };
  } catch (error: any) {
    console.error("Payment init error:", error);
    return { error: error.message || "An unexpected error occurred" };
  }
}

export async function verifyPaystackPayment(reference: string) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const cleanRef = reference?.trim();
  if (!cleanRef) {
    return { success: false, error: "Transaction reference is required." };
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${cleanRef}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();

    if (!data.status || data.data?.status !== "success") {
      return {
        success: false,
        error: data.message || "Payment verification failed or pending authorization.",
      };
    }

    const payment = await prisma.payment_Record.findUnique({
      where: { Reference: cleanRef },
    });

    if (payment) {
      await prisma.$transaction([
        prisma.payment_Record.update({
          where: { Reference: cleanRef },
          data: {
            Status: "Approved",
            ReviewedAt: new Date(),
          },
        }),
        prisma.student.update({
          where: { StudentID: payment.StudentID },
          data: { HasPaidFees: true },
        }),
        prisma.enrollment.updateMany({
          where: { StudentID: payment.StudentID, TermID: payment.TermID },
          data: { Status: "ACTIVE" },
        }),
      ]);
    }

    revalidatePath("/portal/fees");
    revalidatePath("/portal/admin/payments");

    return { success: true, message: "Payment verified and approved successfully!" };
  } catch (error: any) {
    console.error("verifyPaystackPayment error:", error);
    return { success: false, error: error.message || "Verification request failed" };
  }
}
