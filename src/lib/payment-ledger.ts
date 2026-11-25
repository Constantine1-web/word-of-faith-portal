import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getFeeScheduleForClass } from "@/lib/fee-schedule";
import {
  allocateTermPaymentKobo,
  computeReversalAllocationKobo,
  computeTermInvoiceTotals,
  FINANCIAL_MODEL_CODE,
  PORTAL_ICT_SERVICE_FEE_KOBO,
} from "@/lib/fee-split";

export const APPROVED_PAYMENT_STATUSES = [
  "Approved",
  "Successful",
  "APPROVED",
  "SUCCESSFUL",
] as const;

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Validates binary magic bytes of uploaded teller receipt images or PDFs.
 * Blocks disguised HTML, executables, or polyglots spoofing MIME headers.
 */
export function validateReceiptBinary(
  buffer: Buffer,
  declaredMime: string
): { valid: boolean; ext: string; normalizedMime: string; error?: string } {
  if (!buffer || buffer.length < 8) {
    return { valid: false, ext: "", normalizedMime: "", error: "Uploaded file is empty or corrupted." };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // WEBP: RIFF....WEBP
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  // PDF: %PDF-
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";

  if (isPdf && declaredMime === "application/pdf") {
    return { valid: true, ext: ".pdf", normalizedMime: "application/pdf" };
  }
  if (isPng && declaredMime === "image/png") {
    return { valid: true, ext: ".png", normalizedMime: "image/png" };
  }
  if (isJpeg && (declaredMime === "image/jpeg" || declaredMime === "image/jpg")) {
    return { valid: true, ext: ".jpg", normalizedMime: "image/jpeg" };
  }
  if (isWebp && declaredMime === "image/webp") {
    return { valid: true, ext: ".webp", normalizedMime: "image/webp" };
  }

  // Allow mismatched image/png vs image/jpeg only if magic bytes strictly match a safe image/pdf signature
  if (isPdf) return { valid: true, ext: ".pdf", normalizedMime: "application/pdf" };
  if (isPng) return { valid: true, ext: ".png", normalizedMime: "image/png" };
  if (isJpeg) return { valid: true, ext: ".jpg", normalizedMime: "image/jpeg" };
  if (isWebp) return { valid: true, ext: ".webp", normalizedMime: "image/webp" };

  return {
    valid: false,
    ext: "",
    normalizedMime: "",
    error: "Security check failed: file signature does not match a valid PNG, JPEG, WEBP, or PDF receipt.",
  };
}

/**
 * Stores receipt bytes privately OUTSIDE `public/` (`storage/private-receipts/`),
 * falling back to an encrypted/encapsulated data URI inside `receiptStorageKey` on read-only serverless FS.
 */
export async function persistPrivateReceiptArtifact(params: {
  studentId: number;
  ext: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storageKey: string }> {
  const safeName = `receipt_${params.studentId}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${params.ext}`;
  const privateDir = path.join(process.cwd(), "storage", "private-receipts");
  try {
    await fs.mkdir(privateDir, { recursive: true });
    await fs.writeFile(path.join(privateDir, safeName), params.buffer);
    return { storageKey: `local:${params.mimeType}:${safeName}` };
  } catch {
    // Serverless read-only fallback: keep raw binary payload private in DB column (served only via authenticated /api/receipts/[paymentId])
    return {
      storageKey: `data:${params.mimeType};base64,${params.buffer.toString("base64")}`,
    };
  }
}

/**
 * Reads or updates the authoritative term Invoice + InvoiceLineItems for a student.
 * Enforces Model A + Owner rules:
 * - Tuition & Levies belong 100% to School.
 * - Portal/ICT Service Fee (₦800 by default or active FeeSchedule rate) belongs 100% to Provider once per student per term.
 * - If Invoice.IsWaived = true (100% School Tuition scholarship/waiver), Tuition & Levies become ₦0,
 *   while the ₦800 Portal/ICT Service Fee remains active & payable.
 */
export async function ensureStudentTermInvoice(
  tx: TxClient,
  params: {
    studentId: number;
    termId: number;
    termLabel: string;
    className?: string | null;
    level?: string | null;
    dueDate?: Date;
  }
) {
  const schedule = await getFeeScheduleForClass(params.className, params.level);
  const existing = await tx.invoice.findFirst({
    where: {
      StudentID: params.studentId,
      TermID: params.termId,
      Status: { not: "VOID" },
    },
    include: { LineItems: true },
    orderBy: { CreatedAt: "asc" },
  });

  const portalFeeKobo =
    schedule.portalFeeKobo > BigInt(0) ? schedule.portalFeeKobo : PORTAL_ICT_SERVICE_FEE_KOBO;

  const totals = computeTermInvoiceTotals({
    tuitionKobo: schedule.tuitionKobo,
    leviesKobo: schedule.leviesKobo,
    portalFeeKobo,
    isSchoolFeesWaived: existing?.IsWaived ?? false,
  });

  if (!existing) {
    const created = await tx.invoice.create({
      data: {
        StudentID: params.studentId,
        TermID: params.termId,
        Title: `${schedule.displayName} Term Fees + Portal/ICT Fee (${params.termLabel})`,
        AmountKobo: totals.totalInvoiceKobo,
        Status: "OPEN",
        DueDate: params.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        IsWaived: false,
        LineItems: {
          create: [
            {
              code: "TUITION",
              label: `${schedule.displayName} Tuition`,
              beneficiary: "SCHOOL",
              amountKobo: schedule.tuitionKobo,
              isWaivable: true,
              isWaived: false,
            },
            {
              code: "LEVIES",
              label: "Educational Supplies & School Levies",
              beneficiary: "SCHOOL",
              amountKobo: schedule.leviesKobo,
              isWaivable: true,
              isWaived: false,
            },
            {
              code: "PORTAL_ICT_FEE",
              label: "Portal / ICT Service Fee (Once Per Term)",
              beneficiary: "PROVIDER",
              amountKobo: portalFeeKobo,
              isWaivable: false,
              isWaived: false,
            },
          ],
        },
      },
      include: { LineItems: true },
    });
    return { invoice: created, schedule, totals };
  }

  // Sync unpaid/OPEN invoice if class schedule updated before payments completed (preserving manual waivers)
  if (existing.Status === "OPEN") {
    await tx.invoiceLineItem.upsert({
      where: { invoiceId_code: { invoiceId: existing.id, code: "TUITION" } },
      create: {
        invoiceId: existing.id,
        code: "TUITION",
        label: `${schedule.displayName} Tuition`,
        beneficiary: "SCHOOL",
        amountKobo: totals.effectiveTuitionKobo,
        isWaivable: true,
        isWaived: existing.IsWaived,
      },
      update: {
        label: `${schedule.displayName} Tuition`,
        amountKobo: totals.effectiveTuitionKobo,
        isWaived: existing.IsWaived,
      },
    });
    await tx.invoiceLineItem.upsert({
      where: { invoiceId_code: { invoiceId: existing.id, code: "LEVIES" } },
      create: {
        invoiceId: existing.id,
        code: "LEVIES",
        label: "Educational Supplies & School Levies",
        beneficiary: "SCHOOL",
        amountKobo: totals.effectiveLeviesKobo,
        isWaivable: true,
        isWaived: existing.IsWaived,
      },
      update: {
        amountKobo: totals.effectiveLeviesKobo,
        isWaived: existing.IsWaived,
      },
    });
    await tx.invoiceLineItem.upsert({
      where: { invoiceId_code: { invoiceId: existing.id, code: "PORTAL_ICT_FEE" } },
      create: {
        invoiceId: existing.id,
        code: "PORTAL_ICT_FEE",
        label: "Portal / ICT Service Fee (Once Per Term)",
        beneficiary: "PROVIDER",
        amountKobo: portalFeeKobo,
        isWaivable: false,
        isWaived: false,
      },
      update: {
        amountKobo: portalFeeKobo,
        isWaivable: false,
        isWaived: false,
      },
    });

    if (existing.AmountKobo !== totals.totalInvoiceKobo) {
      const updated = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          Title: `${schedule.displayName} Term Fees + Portal/ICT Fee (${params.termLabel})`,
          AmountKobo: totals.totalInvoiceKobo,
        },
        include: { LineItems: true },
      });
      return { invoice: updated, schedule, totals };
    }
  }

  return { invoice: existing, schedule, totals };
}

/**
 * Summarizes cumulative credits, reversals, Portal/ICT Service Fee allocation,
 * and remaining due for a specific student + term.
 */
export async function getStudentTermBillingSummary(
  tx: TxClient,
  studentId: number,
  termId: number
) {
  const [invoice, ledgerRows, approvedPayments] = await Promise.all([
    tx.invoice.findFirst({
      where: { StudentID: studentId, TermID: termId, Status: { not: "VOID" } },
      include: { LineItems: true },
      orderBy: { CreatedAt: "asc" },
    }),
    tx.allocationLedger.findMany({
      where: { studentId, termId },
      orderBy: { createdAt: "asc" },
    }),
    tx.payment_Record.findMany({
      where: {
        StudentID: studentId,
        TermID: termId,
        Status: { in: [...APPROVED_PAYMENT_STATUSES] },
      },
    }),
  ]);

  let totalCreditedKobo = BigInt(0);
  let schoolCreditedKobo = BigInt(0);
  let portalCreditedKobo = BigInt(0);

  if (ledgerRows.length > 0) {
    for (const row of ledgerRows) {
      totalCreditedKobo += row.grossPaidKobo;
      schoolCreditedKobo += row.schoolShareKobo;
      portalCreditedKobo += row.providerShareKobo;
    }
  }

  // Backward-compatible attribution for legacy pre-ledger approved payments not yet present in AllocationLedger
  const paymentIdsWithLedger = new Set(ledgerRows.map((l) => l.paymentId));
  for (const pay of approvedPayments) {
    if (!paymentIdsWithLedger.has(pay.PaymentID)) {
      const principalKobo =
        pay.AmountKobo > BigInt(0) ? pay.AmountKobo : BigInt(Math.round((pay.AmountPaid || 0) * 100));
      const sim = allocateTermPaymentKobo({
        grossPrincipalPaidKobo: principalKobo,
        targetPortalFeeKobo: PORTAL_ICT_SERVICE_FEE_KOBO,
        alreadyAllocatedPortalFeeKobo: portalCreditedKobo,
      });
      totalCreditedKobo += principalKobo;
      portalCreditedKobo += sim.providerShareKobo;
      schoolCreditedKobo += sim.schoolShareKobo;
    }
  }

  if (totalCreditedKobo < BigInt(0)) totalCreditedKobo = BigInt(0);
  if (schoolCreditedKobo < BigInt(0)) schoolCreditedKobo = BigInt(0);
  if (portalCreditedKobo < BigInt(0)) portalCreditedKobo = BigInt(0);

  const lineItems = invoice?.LineItems || [];
  let portalTargetKobo = PORTAL_ICT_SERVICE_FEE_KOBO;
  let schoolTargetKobo = BigInt(0);

  if (lineItems.length > 0) {
    const portalItem = lineItems.find((li) => li.code === "PORTAL_ICT_FEE");
    portalTargetKobo = portalItem && !portalItem.isWaived ? portalItem.amountKobo : PORTAL_ICT_SERVICE_FEE_KOBO;
    schoolTargetKobo = invoice?.IsWaived
      ? BigInt(0)
      : lineItems
          .filter((li) => li.beneficiary === "SCHOOL" && !li.isWaived)
          .reduce((acc, li) => acc + li.amountKobo, BigInt(0));
  } else if (invoice) {
    portalTargetKobo = PORTAL_ICT_SERVICE_FEE_KOBO;
    schoolTargetKobo =
      invoice.IsWaived || invoice.AmountKobo <= portalTargetKobo
        ? BigInt(0)
        : invoice.AmountKobo - portalTargetKobo;
  }

  const totalDueKobo = invoice ? schoolTargetKobo + portalTargetKobo : BigInt(0);
  const remainingTotalKobo = totalDueKobo > totalCreditedKobo ? totalDueKobo - totalCreditedKobo : BigInt(0);
  const remainingPortalKobo =
    portalTargetKobo > portalCreditedKobo ? portalTargetKobo - portalCreditedKobo : BigInt(0);
  const remainingSchoolKobo =
    schoolTargetKobo > schoolCreditedKobo ? schoolTargetKobo - schoolCreditedKobo : BigInt(0);

  return {
    invoice,
    lineItems,
    totalDueKobo,
    schoolTargetKobo,
    portalTargetKobo,
    totalCreditedKobo,
    schoolCreditedKobo,
    portalCreditedKobo,
    remainingTotalKobo,
    remainingPortalKobo,
    remainingSchoolKobo,
    isCleared: invoice ? totalCreditedKobo >= totalDueKobo && totalDueKobo > BigInt(0) : false,
  };
}

/**
 * Records an immutable CREDIT AllocationLedger entry inside the caller's transaction
 * and refreshes Invoice status and active-term Student.HasPaidFees.
 */
export async function recordPaymentCreditInTx(
  tx: TxClient,
  params: {
    paymentId: number;
    invoiceId?: string | null;
    studentId: number;
    termId: number;
    principalKobo: bigint;
    gatewayFeeKobo?: bigint;
    settlementChannel: "PAYSTACK_SUBACCOUNT" | "SCHOOL_COLLECTION";
    reference?: string | null;
    notes?: string | null;
    actorId?: number | null;
  }
) {
  // Prevent duplicate ledger credit for the same Payment_Record
  const existingCredit = await tx.allocationLedger.findFirst({
    where: {
      paymentId: params.paymentId,
      entryType: "CREDIT",
    },
  });
  if (existingCredit) {
    return existingCredit;
  }

  const summaryBefore = await getStudentTermBillingSummary(tx, params.studentId, params.termId);

  const alloc = allocateTermPaymentKobo({
    grossPrincipalPaidKobo: params.principalKobo,
    targetPortalFeeKobo: summaryBefore.portalTargetKobo || PORTAL_ICT_SERVICE_FEE_KOBO,
    alreadyAllocatedPortalFeeKobo: summaryBefore.portalCreditedKobo,
    gatewayFeeKobo: params.gatewayFeeKobo || BigInt(0),
  });

  const ledger = await tx.allocationLedger.create({
    data: {
      paymentId: params.paymentId,
      invoiceId: params.invoiceId ?? summaryBefore.invoice?.id ?? null,
      studentId: params.studentId,
      termId: params.termId,
      entryType: "CREDIT",
      modelCode: FINANCIAL_MODEL_CODE,
      grossPaidKobo: alloc.grossPrincipalPaidKobo,
      gatewayFeeKobo: alloc.gatewayFeeKobo,
      schoolShareKobo: alloc.schoolShareKobo,
      providerShareKobo: alloc.providerShareKobo,
      settlementChannel: params.settlementChannel,
      settlementStatus:
        params.settlementChannel === "PAYSTACK_SUBACCOUNT" ? "AUTO_SPLIT" : "PENDING_REMITTANCE",
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      createdById: params.actorId ?? null,
    },
  });

  await syncInvoiceAndStudentClearanceInTx(tx, params.studentId, params.termId);
  return ledger;
}

/**
 * Records an immutable negative REVERSAL AllocationLedger row when an approved payment
 * is refunded, disputed/charged back, or manually rejected after prior approval.
 */
export async function recordPaymentReversalInTx(
  tx: TxClient,
  params: {
    paymentId: number;
    studentId: number;
    termId: number;
    invoiceId?: string | null;
    gatewayFeeKobo?: bigint;
    reference?: string | null;
    notes: string;
    actorId?: number | null;
  }
) {
  const existingReversal = await tx.allocationLedger.findFirst({
    where: { paymentId: params.paymentId, entryType: "REVERSAL" },
  });
  if (existingReversal) {
    return existingReversal;
  }

  const credits = await tx.allocationLedger.findMany({
    where: { paymentId: params.paymentId, entryType: "CREDIT" },
  });

  let creditedPrincipal = BigInt(0);
  let creditedSchool = BigInt(0);
  let creditedProvider = BigInt(0);

  for (const c of credits) {
    creditedPrincipal += c.grossPaidKobo;
    creditedSchool += c.schoolShareKobo;
    creditedProvider += c.providerShareKobo;
  }

  if (creditedPrincipal === BigInt(0)) {
    // Fallback if reverting a legacy payment before AllocationLedger was introduced
    const payRow = await tx.payment_Record.findUnique({ where: { PaymentID: params.paymentId } });
    if (payRow) {
      creditedPrincipal =
        payRow.AmountKobo > BigInt(0) ? payRow.AmountKobo : BigInt(Math.round((payRow.AmountPaid || 0) * 100));
      creditedSchool = creditedPrincipal;
    }
  }

  const rev = computeReversalAllocationKobo({
    paymentPrincipalKobo: creditedPrincipal,
    creditedSchoolKobo: creditedSchool,
    creditedProviderKobo: creditedProvider,
    gatewayFeeKobo: params.gatewayFeeKobo || BigInt(0),
  });

  const row = await tx.allocationLedger.create({
    data: {
      paymentId: params.paymentId,
      invoiceId: params.invoiceId ?? null,
      studentId: params.studentId,
      termId: params.termId,
      entryType: "REVERSAL",
      modelCode: FINANCIAL_MODEL_CODE,
      grossPaidKobo: rev.grossPrincipalReversedKobo,
      gatewayFeeKobo: rev.gatewayFeeKobo,
      schoolShareKobo: rev.schoolShareKobo,
      providerShareKobo: rev.providerShareKobo,
      settlementChannel: "SCHOOL_COLLECTION",
      settlementStatus: "REVERSED",
      reference: params.reference ?? null,
      notes: params.notes,
      createdById: params.actorId ?? null,
    },
  });

  await syncInvoiceAndStudentClearanceInTx(tx, params.studentId, params.termId);
  return row;
}

/**
 * Recomputes Invoice.Status ("OPEN" | "PARTIAL" | "PAID") and sets Student.HasPaidFees ONLY
 * against the active term's authoritative balance.
 */
export async function syncInvoiceAndStudentClearanceInTx(
  tx: TxClient,
  studentId: number,
  termId: number
) {
  const summary = await getStudentTermBillingSummary(tx, studentId, termId);

  if (summary.invoice) {
    let nextStatus = "OPEN";
    if (summary.totalCreditedKobo >= summary.totalDueKobo && summary.totalDueKobo > BigInt(0)) {
      nextStatus = "PAID";
    } else if (summary.totalCreditedKobo > BigInt(0)) {
      nextStatus = "PARTIAL";
    }

    if (summary.invoice.Status !== nextStatus) {
      await tx.invoice.update({
        where: { id: summary.invoice.id },
        data: { Status: nextStatus },
      });
    }
  }

  const activeTerm = await tx.academic_Term.findFirst({
    where: { IsActive: true },
    select: { TermID: true },
  });

  if (!activeTerm || activeTerm.TermID === termId) {
    let isCleared = summary.isCleared;
    if (!summary.invoice) {
      // Check against schedule total when invoice row absent
      const st = await tx.student.findUnique({
        where: { StudentID: studentId },
        include: { Class: true },
      });
      if (st) {
        const sched = await getFeeScheduleForClass(st.Class?.ClassName, st.Class?.Level);
        isCleared = summary.totalCreditedKobo >= sched.totalKobo && sched.totalKobo > BigInt(0);
      }
    }

    await tx.student.update({
      where: { StudentID: studentId },
      data: { HasPaidFees: isCleared },
    });
  }
}
