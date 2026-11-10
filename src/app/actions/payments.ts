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
import { SAFE_USER_SELECT } from "@/lib/security";

function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key || key === "sk_test_mocked_key") {
    throw new Error("PAYSTACK_SECRET_KEY is not configured on the server.");
  }
  return key;
}

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
          include: { Class: true, User: { select: SAFE_USER_SELECT } },
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
      actorRoles: Array.from(actor.roles).join(","),
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
      actorRoles: Array.from(actor.roles).join(","),
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

export async function generateOrderTrackingId(termName?: string, sessionName?: string) {
  const cleanYear = (sessionName || "2026/2027").split("/")[0] || "2026";
  const termCode = termName?.toLowerCase().includes("second")
    ? "T2"
    : termName?.toLowerCase().includes("third")
    ? "T3"
    : "T1";
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `WOF-PAY-${cleanYear}${termCode}-${randomHex}`;
}

async function resolveActorTargetStudent(actor: { UserID: number; Email: string }) {
  const direct = await prisma.student.findFirst({
    where: { UserID: actor.UserID },
    include: {
      Class: true,
      User: { select: SAFE_USER_SELECT },
    },
  });
  if (direct) return direct;

  const parent = await prisma.parent.findUnique({
    where: { UserID: actor.UserID },
    include: {
      Children: {
        include: {
          Student: {
            include: {
              Class: true,
              User: { select: SAFE_USER_SELECT },
            },
          },
        },
      },
    },
  });
  if (parent && parent.Children.length > 0) {
    return parent.Children[0].Student;
  }

  if (actor.Email) {
    const byParentEmail = await prisma.student.findFirst({
      where: {
        ParentEmail: {
          equals: actor.Email.trim(),
          mode: "insensitive",
        },
      },
      include: {
        Class: true,
        User: { select: SAFE_USER_SELECT },
      },
    });
    if (byParentEmail) return byParentEmail;
  }

  return null;
}

export async function getOrCreateStudentFeeOrder() {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const student = await resolveActorTargetStudent(actor);

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
    const trackingId = await generateOrderTrackingId(activeTerm.TermName, activeTerm.SessionName);
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
    const student = await resolveActorTargetStudent(actor);

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

    // Attempt local disk write; fall back to Data URI on read-only serverless filesystems (e.g. Vercel)
    let publicUrl: string;
    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");
      await fs.mkdir(uploadDir, { recursive: true });
      const ext = path.extname(receiptFile.name) || (receiptFile.type === "application/pdf" ? ".pdf" : ".jpg");
      const fileName = `receipt_${student.StudentID}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, buffer);
      publicUrl = `/uploads/receipts/${fileName}`;
    } catch {
      publicUrl = `data:${receiptFile.type};base64,${buffer.toString("base64")}`;
    }

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

const MINIMUM_TERM_FEE_NAIRA = 65000;

export async function initializePayment(data: { amount: number; description: string; termId: number; trackingId?: string }) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { error: "Unauthorized" };
  }

  const student = await resolveActorTargetStudent(actor);

  if (!student) {
    return { error: "Student profile not found" };
  }

  const reference = data.trackingId?.trim() || `WOF-PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  try {
    const paystackKey = getPaystackSecretKey();

    // Check if order exists with this reference
    const existing = await prisma.payment_Record.findUnique({
      where: { Reference: reference },
    });

    let authoritativeKobo: bigint;
    let authoritativeNaira: number;

    if (existing) {
      // Prevent IDOR: student cannot attach to or overwrite another student's reference
      if (existing.StudentID !== student.StudentID) {
        return { error: "FORBIDDEN: Payment reference belongs to another student." };
      }
      if (existing.Status === "Approved") {
        return { error: "This fee order has already been paid and approved." };
      }
      // Never allow client-supplied data.amount to reduce the server-authoritative order amount
      const existingKobo =
        existing.AmountKobo > BigInt(0)
          ? existing.AmountKobo
          : BigInt(Math.round(Math.max(existing.AmountPaid || MINIMUM_TERM_FEE_NAIRA, MINIMUM_TERM_FEE_NAIRA) * 100));
      authoritativeKobo = existingKobo;
      authoritativeNaira = Number(existingKobo) / 100;

      await prisma.payment_Record.update({
        where: { Reference: reference },
        data: {
          AmountPaid: authoritativeNaira,
          AmountKobo: authoritativeKobo,
          Channel: "PAYSTACK",
        },
      });
    } else {
      authoritativeNaira = Math.max(Number(data.amount) || MINIMUM_TERM_FEE_NAIRA, MINIMUM_TERM_FEE_NAIRA);
      authoritativeKobo = BigInt(Math.round(authoritativeNaira * 100));

      await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: Number(data.termId),
          AmountPaid: authoritativeNaira,
          AmountKobo: authoritativeKobo,
          Channel: "PAYSTACK",
          Description: String(data.description || "Consolidated School Fees").slice(0, 200),
          Reference: reference,
          Status: "Pending",
          SubmittedBy: actor.UserID,
        },
      });
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: student.User?.Email,
        amount: Number(authoritativeKobo),
        currency: "NGN",
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
  if (!cleanRef || cleanRef.length > 120) {
    return { success: false, error: "Valid transaction reference is required." };
  }

  try {
    const paystackKey = getPaystackSecretKey();

    const payment = await prisma.payment_Record.findUnique({
      where: { Reference: cleanRef },
      include: {
        Student: {
          include: { ParentLinks: { include: { Parent: true } } },
        },
      },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found for this reference." };
    }

    // Enforce ownership or finance admin authorization (blocks IDOR)
    const isFinanceAdmin =
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("BURSAR") ||
      actor.roles.has("Admin") ||
      actor.capabilities.has("MANAGE_FINANCE") ||
      actor.capabilities.has("APPROVE_PAYMENTS");
    const isOwner =
      payment.Student.UserID === actor.UserID ||
      payment.Student.ParentLinks.some((l) => l.Parent?.UserID === actor.UserID) ||
      Boolean(
        payment.Student.ParentEmail &&
          payment.Student.ParentEmail.toLowerCase() === actor.Email.toLowerCase()
      );

    if (!isOwner && !isFinanceAdmin) {
      return { success: false, error: "FORBIDDEN: You are not authorized to verify this payment." };
    }

    if (payment.Status === "Approved") {
      return { success: true, message: "Payment is already verified and approved." };
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanRef)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
      },
    });

    const data = await response.json();

    if (!data.status || data.data?.status !== "success") {
      return {
        success: false,
        error: data.message || "Payment verification failed or pending authorization.",
      };
    }

    // Verify currency and exact amount in kobo
    const gatewayCurrency = String(data.data?.currency || "").toUpperCase();
    if (gatewayCurrency && gatewayCurrency !== "NGN") {
      return {
        success: false,
        error: `SECURITY_VIOLATION: Unexpected payment currency (${gatewayCurrency}). Expected NGN.`,
      };
    }

    const paidKobo = BigInt(Math.round(Number(data.data?.amount || 0)));
    const expectedKobo =
      payment.AmountKobo > BigInt(0)
        ? payment.AmountKobo
        : BigInt(Math.round(Math.max(payment.AmountPaid || MINIMUM_TERM_FEE_NAIRA, MINIMUM_TERM_FEE_NAIRA) * 100));

    if (paidKobo < expectedKobo) {
      await writeAuditLog({
        actorId: actor.UserID,
        action: "PAYMENT_AMOUNT_MISMATCH_BLOCKED",
        entity: "Payment_Record",
        entityId: payment.PaymentID,
        newValue: {
          reference: cleanRef,
          paidKobo: paidKobo.toString(),
          expectedKobo: expectedKobo.toString(),
        },
      });
      return {
        success: false,
        error: "SECURITY_VIOLATION: Amount paid on gateway is less than the required invoice amount.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.upsert({
        where: { eventKey: cleanRef },
        update: {},
        create: {
          provider: "PAYSTACK",
          eventKey: cleanRef,
          processedAt: new Date(),
        },
      });

      await tx.payment_Record.update({
        where: { Reference: cleanRef },
        data: {
          Status: "Approved",
          Channel: "PAYSTACK",
          ReviewedAt: new Date(),
        },
      });

      await tx.student.update({
        where: { StudentID: payment.StudentID },
        data: { HasPaidFees: true },
      });

      await tx.enrollment.updateMany({
        where: { StudentID: payment.StudentID, TermID: payment.TermID },
        data: { Status: "ACTIVE" },
      });
    });

    await writeAuditLog({
      actorId: actor.UserID,
      action: "PAYSTACK_PAYMENT_VERIFIED",
      entity: "Payment_Record",
      entityId: payment.PaymentID,
      newValue: { reference: cleanRef, paidKobo: paidKobo.toString() },
    });

    revalidatePath("/portal/fees");
    revalidatePath("/portal/admin/payments");

    return { success: true, message: "Payment verified and approved successfully!" };
  } catch (error: any) {
    console.error("verifyPaystackPayment error:", error);
    return { success: false, error: error.message || "Verification request failed" };
  }
}
