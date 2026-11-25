"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import {
  requireActiveUser,
  requireCapability,
  requireStudentOwnershipOrAdmin,
  assertSeparationOfDuties,
  writeAuditLog,
} from "@/lib/authz";
import {
  SAFE_USER_SELECT,
  requireStepUpIfTotpEnabled,
  decryptTotpSecret,
  claimTotpCodeSingleUse,
  grantStepUpSession,
} from "@/lib/security";
import { verifyTotpCode } from "@/server/security/totp";
import {
  ensureAndListFeeSchedules,
  getFeeScheduleForClass,
  type FeeLevelGroup,
} from "@/lib/fee-schedule";
import {
  allocateTermPaymentKobo,
  computePaystackConvenienceFeeKobo,
  computePaystackSubaccountSplitKobo,
  computeTermInvoiceTotals,
  GROSS_PORTAL_FEE_KOBO,
  type ReversalScope,
} from "@/lib/fee-split";
import {
  APPROVED_PAYMENT_STATUSES,
  acquireStudentTermLock,
  ensureStudentTermInvoice,
  getStudentTermBillingSummary,
  persistPrivateReceiptArtifact,
  recordPaymentCreditInTx,
  recordPaymentReversalInTx,
  syncInvoiceAndStudentClearanceInTx,
  validateReceiptBinary,
} from "@/lib/payment-ledger";
import {
  getPortalBankConfig,
  savePortalBankConfig,
  type PortalBankConfig,
} from "@/lib/portal-settings";
import {
  sendFeePaymentApprovedNotification,
  sendFeePaymentRejectedNotification,
} from "@/lib/email";

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

function collectStudentEmails(student: {
  ParentEmail?: string | null;
  User?: { Email?: string | null } | null;
  ParentLinks?: Array<{ Parent?: { User?: { Email?: string | null } | null } | null }>;
} | null | undefined): string[] {
  const emails: string[] = [];
  if (student?.ParentEmail) emails.push(student.ParentEmail);
  if (student?.User?.Email) emails.push(student.User.Email);
  if (Array.isArray(student?.ParentLinks)) {
    for (const link of student.ParentLinks) {
      if (link?.Parent?.User?.Email) {
        emails.push(link.Parent.User.Email);
      }
    }
  }
  return emails;
}

function serializeFeeAllocationPreview(
  payment: {
    AmountPaid: number;
    AmountKobo?: bigint | number | null;
    gatewayFeeKobo?: bigint | number | null;
    LedgerEntries?: Array<{
      entryType: string;
      grossPaidKobo: bigint;
      gatewayFeeKobo: bigint;
      schoolShareKobo: bigint;
      schoolPortalShareKobo?: bigint;
      schoolChargesShareKobo?: bigint;
      providerShareKobo: bigint;
      settlementChannel: string;
      settlementStatus: string;
      id: string;
    }>;
  }
) {
  const entries = payment.LedgerEntries || [];
  if (entries.length > 0) {
    let principal = BigInt(0);
    let gateway = BigInt(0);
    let school = BigInt(0);
    let schoolPortal = BigInt(0);
    let schoolCharges = BigInt(0);
    let provider = BigInt(0);
    for (const e of entries) {
      principal += e.grossPaidKobo;
      gateway += e.gatewayFeeKobo;
      school += e.schoolShareKobo;
      provider += e.providerShareKobo;
      const sPortal = e.schoolPortalShareKobo ?? BigInt(0);
      const sCharges = e.schoolChargesShareKobo ?? BigInt(0);
      if (e.schoolShareKobo !== BigInt(0) && sPortal === BigInt(0) && sCharges === BigInt(0)) {
        schoolCharges += e.schoolShareKobo;
      } else {
        schoolPortal += sPortal;
        schoolCharges += sCharges;
      }
    }
    return {
      principalNaira: Number(principal) / 100,
      schoolShareNaira: Number(school) / 100,
      schoolPortalShareNaira: Number(schoolPortal) / 100,
      schoolChargesShareNaira: Number(schoolCharges) / 100,
      providerShareNaira: Number(provider) / 100,
      portalFeePortionNaira: Number(provider + schoolPortal) / 100,
      gatewayFeeNaira: Number(gateway) / 100,
      hasLedgerEntry: true,
      ledgerIds: entries.map((e) => e.id),
      settlementChannel: entries[0]?.settlementChannel || "SCHOOL_COLLECTION",
    };
  }

  const principalKobo =
    payment.AmountKobo && BigInt(payment.AmountKobo) > BigInt(0)
      ? BigInt(payment.AmountKobo)
      : BigInt(Math.round((Number(payment.AmountPaid) || 0) * 100));
  const sim = allocateTermPaymentKobo({
    grossPrincipalPaidKobo: principalKobo,
    targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
  });
  return {
    principalNaira: sim.grossPrincipalPaidNaira,
    schoolShareNaira: sim.schoolShareNaira,
    schoolPortalShareNaira: sim.schoolPortalShareNaira,
    schoolChargesShareNaira: sim.schoolChargesShareNaira,
    providerShareNaira: sim.providerShareNaira,
    portalFeePortionNaira: Number(sim.portalFeePortionAppliedKobo) / 100,
    gatewayFeeNaira: Number(payment.gatewayFeeKobo || 0) / 100,
    hasLedgerEntry: false,
    ledgerIds: [] as string[],
    settlementChannel: "SCHOOL_COLLECTION",
  };
}

// ==========================================
// ADMIN / BURSAR: CONFIG, SCHEDULES & AUDIT
// ==========================================

export async function getFeeSchedules() {
  try {
    await requireActiveUser();
    const schedules = await ensureAndListFeeSchedules();
    return {
      success: true,
      schedules: schedules.map(({ totalKobo: _t, tuitionKobo: _tk, leviesKobo: _lk, portalFeeKobo: _pk, ...rest }) => rest),
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load fee schedules",
      schedules: [],
    };
  }
}

export async function updateFeeSchedule(data: {
  levelGroup: FeeLevelGroup;
  displayName?: string;
  tuitionNaira: number;
  leviesNaira: number;
  maintenanceFeeNaira: number;
  stepUpCode?: string;
}) {
  try {
    const actor = await requirePaymentManager();

    const tuition = Math.max(0, Math.round(Number(data.tuitionNaira) || 0));
    const levies = Math.max(0, Math.round(Number(data.leviesNaira) || 0));
    const maintenance = Math.max(0, Math.round(Number(data.maintenanceFeeNaira) || 0));

    const existing = await prisma.feeSchedule.findUnique({
      where: { levelGroup: data.levelGroup },
    });
    const currentPortalFeeNaira = existing
      ? Number(existing.maintenanceFeeKobo) / 100
      : Number(GROSS_PORTAL_FEE_KOBO) / 100;

    // Commercial Control (§5 & §6.3): Altering the Portal/ICT Fee rate requires MANAGE_SYSTEM + TOTP Step-Up
    if (maintenance !== currentPortalFeeNaira) {
      await requireCapability("MANAGE_SYSTEM");
      const trimmedCode = data.stepUpCode?.trim();
      if (trimmedCode) {
        const userRow = await prisma.user.findUnique({
          where: { UserID: actor.UserID },
          select: { TotpEnabled: true, TotpSecret: true },
        });
        if (userRow?.TotpEnabled && userRow.TotpSecret) {
          const plainSecret = decryptTotpSecret(userRow.TotpSecret);
          if (!verifyTotpCode(plainSecret, trimmedCode)) {
            return { success: false, error: "Invalid 2FA Authenticator code." };
          }
          const singleUseOk = await claimTotpCodeSingleUse(actor.UserID, trimmedCode);
          if (!singleUseOk) {
            return { success: false, error: "This 2FA code has already been used. Wait for the next 30s code." };
          }
          await grantStepUpSession(actor.UserID);
        }
      }
      await requireStepUpIfTotpEnabled(actor.UserID, "modify Portal / ICT Fee rate");
    }

    const updated = await prisma.feeSchedule.upsert({
      where: { levelGroup: data.levelGroup },
      create: {
        levelGroup: data.levelGroup,
        displayName: data.displayName || data.levelGroup,
        tuitionKobo: BigInt(tuition * 100),
        leviesKobo: BigInt(levies * 100),
        maintenanceFeeKobo: BigInt(maintenance * 100),
        updatedById: actor.UserID,
      },
      update: {
        ...(data.displayName ? { displayName: data.displayName } : {}),
        tuitionKobo: BigInt(tuition * 100),
        leviesKobo: BigInt(levies * 100),
        maintenanceFeeKobo: BigInt(maintenance * 100),
        updatedById: actor.UserID,
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "FEE_SCHEDULE_UPDATED",
      entity: "FeeSchedule",
      entityId: updated.id,
      beforeState: existing
        ? {
            levelGroup: existing.levelGroup,
            tuitionNaira: Number(existing.tuitionKobo) / 100,
            leviesNaira: Number(existing.leviesKobo) / 100,
            portalIctFeeNaira: Number(existing.maintenanceFeeKobo) / 100,
          }
        : undefined,
      afterState: {
        levelGroup: data.levelGroup,
        tuitionNaira: tuition,
        leviesNaira: levies,
        portalIctFeeNaira: maintenance,
        totalNaira: tuition + levies + maintenance,
      },
    });

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");

    return {
      success: true,
      schedule: {
        id: updated.id,
        levelGroup: updated.levelGroup,
        displayName: updated.displayName,
        tuitionNaira: tuition,
        leviesNaira: levies,
        maintenanceFeeNaira: maintenance,
        totalNaira: tuition + levies + maintenance,
      },
    };
  } catch (error: unknown) {
    console.error("updateFeeSchedule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update fee schedule.",
    };
  }
}

export async function getPortalBankConfigAction() {
  try {
    await requireActiveUser();
    const config = await getPortalBankConfig();
    return { success: true, config };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unauthorized",
    };
  }
}

export async function updatePortalBankConfigAction(
  input: Partial<PortalBankConfig> & { stepUpCode?: string }
) {
  try {
    // Commercial Control (§5 & §6.3): Subaccount / Gateway Fee Policy / Settlement NUBAN requires MANAGE_SYSTEM + 2FA Step-Up
    const actor = await requireCapability("MANAGE_SYSTEM");
    const { stepUpCode, ...configPatch } = input;
    const trimmedCode = stepUpCode?.trim();
    if (trimmedCode) {
      const userRow = await prisma.user.findUnique({
        where: { UserID: actor.UserID },
        select: { TotpEnabled: true, TotpSecret: true },
      });
      if (userRow?.TotpEnabled && userRow.TotpSecret) {
        const plainSecret = decryptTotpSecret(userRow.TotpSecret);
        if (!verifyTotpCode(plainSecret, trimmedCode)) {
          return { success: false, error: "Invalid 2FA Authenticator code." };
        }
        const singleUseOk = await claimTotpCodeSingleUse(actor.UserID, trimmedCode);
        if (!singleUseOk) {
          return { success: false, error: "This 2FA code has already been used. Wait for the next 30s code." };
        }
        await grantStepUpSession(actor.UserID);
      }
    }
    await requireStepUpIfTotpEnabled(actor.UserID, "modify Portal Bank & Paystack Settings");
    const before = await getPortalBankConfig();
    const saved = await savePortalBankConfig(configPatch, actor.UserID);
    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PORTAL_BANK_CONFIG_UPDATED",
      entity: "PortalSetting",
      entityId: "BANK_PAYMENT_CONFIG",
      beforeState: before,
      afterState: saved,
    });
    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true, config: saved };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save bank settings.",
    };
  }
}

export async function getAdminPaymentAuditList(filters?: {
  status?: string;
  termId?: number;
  search?: string;
}) {
  try {
    await requirePaymentManager();
    const whereClause: Record<string, unknown> = {};

    if (filters?.status && filters.status !== "ALL") {
      if (filters.status.toUpperCase() === "APPROVED") {
        whereClause.Status = { in: [...APPROVED_PAYMENT_STATUSES] };
      } else {
        whereClause.Status = filters.status;
      }
    }

    if (filters?.termId) {
      whereClause.TermID = filters.termId;
    }

    if (filters?.search) {
      const q = filters.search.trim();
      whereClause.OR = [
        { Reference: { contains: q, mode: "insensitive" } },
        { Student: { PreferredName: { contains: q, mode: "insensitive" } } },
        { Student: { AdmissionNo: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [rawPayments, pendingCount, approvedTotal, bankConfig, remittanceAuditRows] = await Promise.all([
      prisma.payment_Record.findMany({
        where: whereClause,
        include: {
          Student: {
            include: { Class: true, User: { select: SAFE_USER_SELECT } },
          },
          Term: true,
          Invoice: { include: { LineItems: true } },
          LedgerEntries: true,
        },
        orderBy: { PaymentDate: "desc" },
      }),
      prisma.payment_Record.count({ where: { Status: "Pending" } }),
      prisma.payment_Record.aggregate({
        where: { Status: { in: [...APPROVED_PAYMENT_STATUSES] } },
        _sum: { AmountPaid: true },
      }),
      getPortalBankConfig(),
      prisma.auditLog.findMany({
        where: { Action: "PROVIDER_REMITTANCE_SETTLED" },
        select: { NewValue: true },
        take: 200,
      }),
    ]);

    const settledLedgerIds = new Set<string>();
    for (const r of remittanceAuditRows) {
      const val = (r.NewValue || {}) as { ledgerIds?: string[] };
      if (Array.isArray(val.ledgerIds)) {
        for (const id of val.ledgerIds) settledLedgerIds.add(String(id));
      }
    }

    const payments = rawPayments.map((p) => {
      const alloc = serializeFeeAllocationPreview(p);
      const safeReceiptEndpoint = p.ReceiptUrl || p.receiptStorageKey ? `/api/receipts/${p.PaymentID}` : null;
      return {
        ...p,
        AmountKobo: Number(p.AmountKobo || 0),
        gatewayFeeKobo: Number(p.gatewayFeeKobo || 0),
        ReceiptUrl: safeReceiptEndpoint,
        Invoice: p.Invoice
          ? {
              ...p.Invoice,
              AmountKobo: Number(p.Invoice.AmountKobo),
              LineItems: p.Invoice.LineItems.map((li) => ({
                ...li,
                amountKobo: Number(li.amountKobo),
              })),
            }
          : null,
        LedgerEntries: p.LedgerEntries.map((le) => ({
          ...le,
          grossPaidKobo: Number(le.grossPaidKobo),
          grossPortalFeeKobo: Number(le.grossPortalFeeKobo || 0),
          gatewayFeeKobo: Number(le.gatewayFeeKobo),
          schoolShareKobo: Number(le.schoolShareKobo),
          schoolPortalShareKobo: Number(le.schoolPortalShareKobo || 0),
          schoolChargesShareKobo: Number(le.schoolChargesShareKobo || 0),
          providerShareKobo: Number(le.providerShareKobo),
          feeBearer: le.feeBearer || "ACCOUNT",
          reversalOfLedgerEntryId: le.reversalOfLedgerEntryId || null,
          reversalScope: le.reversalScope || null,
          isRemitted:
            le.settlementStatus === "AUTO_SPLIT" ||
            le.settlementStatus === "REMITTED" ||
            settledLedgerIds.has(le.id),
        })),
        allocation: alloc,
      };
    });

    return {
      success: true,
      payments,
      pendingCount,
      totalRevenue: approvedTotal._sum.AmountPaid || 0,
      bankConfig,
    };
  } catch (error: unknown) {
    console.error("getAdminPaymentAuditList error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch payment records",
    };
  }
}

export async function approvePaymentRecord(paymentId: number) {
  const actor = await requireCapability("APPROVE_PAYMENTS");

  try {
    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
      include: {
        Term: true,
        Student: {
          include: {
            Class: true,
            User: { select: SAFE_USER_SELECT },
            ParentLinks: {
              include: { Parent: { include: { User: { select: { Email: true } } } } },
            },
          },
        },
      },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found." };
    }

    // Separation of Duties: Submitter cannot approve their own submission
    assertSeparationOfDuties(actor.UserID, payment.SubmittedBy, "payment submission");

    if (payment.Status === "Approved" || payment.Status === "Successful") {
      return { success: true, alreadyApproved: true };
    }

    const principalKobo =
      payment.AmountKobo > BigInt(0)
        ? payment.AmountKobo
        : BigInt(Math.round((Number(payment.AmountPaid) || 0) * 100));

    let ledgerEntry: Awaited<ReturnType<typeof recordPaymentCreditInTx>> | null = null;
    let remainingAfterKobo = BigInt(0);

    await prisma.$transaction(async (tx) => {
      await acquireStudentTermLock(tx, payment.StudentID, payment.TermID);
      let invoiceId = payment.InvoiceID;
      if (!invoiceId && payment.Term) {
        const ensured = await ensureStudentTermInvoice(tx, {
          studentId: payment.StudentID,
          termId: payment.TermID,
          termLabel: `${payment.Term.SessionName} (${payment.Term.TermName})`,
          className: payment.Student?.Class?.ClassName,
          level: payment.Student?.Class?.Level,
        });
        invoiceId = ensured.invoice.id;
      }

      await tx.payment_Record.update({
        where: { PaymentID: paymentId },
        data: {
          InvoiceID: invoiceId,
          Status: "Approved",
          ReviewedBy: actor.UserID,
          ReviewedAt: new Date(),
        },
      });

      ledgerEntry = await recordPaymentCreditInTx(tx, {
        paymentId: payment.PaymentID,
        invoiceId,
        studentId: payment.StudentID,
        termId: payment.TermID,
        principalKobo,
        gatewayFeeKobo: payment.gatewayFeeKobo || BigInt(0),
        feeBearer: "ACCOUNT",
        settlementChannel: "SCHOOL_COLLECTION",
        reference: payment.Reference,
        notes: `Manual ${payment.Channel} payment verified by ${actor.Email}`,
        actorId: actor.UserID,
      });

      const summary = await getStudentTermBillingSummary(tx, payment.StudentID, payment.TermID);
      remainingAfterKobo = summary.remainingTotalKobo;
    });

    if (ledgerEntry) {
      const l = ledgerEntry as Awaited<ReturnType<typeof recordPaymentCreditInTx>>;
      await writeAuditLog({
        actorUserId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "PAYMENT_APPROVE",
        targetTable: "Payment_Record",
        targetId: String(paymentId),
        beforeState: { status: payment.Status },
        afterState: {
          status: "Approved",
          studentId: payment.StudentID,
          principalKobo: principalKobo.toString(),
          schoolShareKobo: l.schoolShareKobo.toString(),
          schoolPortalShareKobo: l.schoolPortalShareKobo.toString(),
          schoolChargesShareKobo: l.schoolChargesShareKobo.toString(),
          providerShareKobo: l.providerShareKobo.toString(),
          modelCode: l.modelCode,
        },
      });

      const studentDisplayName =
        payment.Student?.PreferredName ||
        [payment.Student?.FirstName, payment.Student?.LastName].filter(Boolean).join(" ") ||
        "Student";
      const termLabel = payment.Term
        ? `${payment.Term.SessionName} (${payment.Term.TermName})`
        : "Current Academic Term";
      await sendFeePaymentApprovedNotification({
        recipients: collectStudentEmails(payment.Student),
        studentName: studentDisplayName,
        admissionNo: payment.Student?.AdmissionNo || "N/A",
        className: payment.Student?.Class?.ClassName,
        termLabel,
        reference: payment.Reference || `PAY-${payment.PaymentID}`,
        amountPaidNaira: Number(principalKobo) / 100,
        channel: payment.Channel || "BANK_TELLER",
        schoolShareNaira: Number(l.schoolShareKobo) / 100,
        schoolPortalShareNaira: Number(l.schoolPortalShareKobo) / 100,
        schoolChargesShareNaira: Number(l.schoolChargesShareKobo) / 100,
        providerShareNaira: Number(l.providerShareKobo) / 100,
        gatewayFeeNaira: Number(payment.gatewayFeeKobo || 0) / 100,
        remainingBalanceNaira: Number(remainingAfterKobo) / 100,
      }).catch((err) => console.warn("[Email] Payment approval notification warning:", err));
    }

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true };
  } catch (error: unknown) {
    console.error("approvePaymentRecord error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve payment",
    };
  }
}

export async function rejectPaymentRecord(paymentId: number, rejectionReason?: string) {
  const actor = await requirePaymentManager();

  try {
    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
      include: {
        Term: true,
        Student: {
          include: {
            User: { select: SAFE_USER_SELECT },
            ParentLinks: {
              include: { Parent: { include: { User: { select: { Email: true } } } } },
            },
          },
        },
      },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found." };
    }

    const cleanReason =
      rejectionReason?.trim() ||
      "Receipt could not be verified by Bursary. Please upload a clear teller or transfer receipt.";

    const wasApproved =
      payment.Status === "Approved" ||
      payment.Status === "Successful" ||
      payment.Status === "APPROVED" ||
      payment.Status === "SUCCESSFUL";

    await prisma.$transaction(async (tx) => {
      await tx.payment_Record.update({
        where: { PaymentID: paymentId },
        data: {
          Status: "Rejected",
          RejectionReason: cleanReason,
          ReviewedBy: actor.UserID,
          ReviewedAt: new Date(),
        },
      });

      if (wasApproved) {
        await recordPaymentReversalInTx(tx, {
          paymentId: payment.PaymentID,
          studentId: payment.StudentID,
          termId: payment.TermID,
          invoiceId: payment.InvoiceID,
          scope: "FULL",
          gatewayFeeKobo: payment.gatewayFeeKobo,
          reference: payment.Reference,
          notes: `Payment rejected/reversed after approval: ${cleanReason}`,
          actorId: actor.UserID,
        });
      }
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: wasApproved ? "PAYMENT_REVERT_AND_REJECT" : "PAYMENT_REJECT",
      targetTable: "Payment_Record",
      targetId: String(paymentId),
      beforeState: { status: payment.Status },
      afterState: { status: "Rejected", reason: cleanReason, ledgerReversed: wasApproved },
    });

    const studentDisplayName =
      payment.Student?.PreferredName ||
      [payment.Student?.FirstName, payment.Student?.LastName].filter(Boolean).join(" ") ||
      "Student";
    await sendFeePaymentRejectedNotification({
      recipients: collectStudentEmails(payment.Student),
      studentName: studentDisplayName,
      admissionNo: payment.Student?.AdmissionNo || "N/A",
      termLabel: payment.Term ? `${payment.Term.SessionName} (${payment.Term.TermName})` : undefined,
      reference: payment.Reference || `PAY-${payment.PaymentID}`,
      amountPaidNaira: payment.AmountPaid,
      reason: cleanReason,
    }).catch((err) => console.warn("[Email] Payment rejection notification warning:", err));

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return { success: true };
  } catch (error: unknown) {
    console.error("rejectPaymentRecord error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reject payment",
    };
  }
}

/**
 * Supports selective refunds & chargeback reversals per §6.2 & §9 Tests 11-13:
 * - `FULL`: reverses School Charges + School ₦200 Portal Share + Provider ₦800 Portal Share
 * - `TUITION_ONLY`: reverses School Tuition & Levies only (leaves Portal Fee intact)
 * - `PORTAL_FEE_ONLY`: reverses Portal Fee shares 80:20 only (leaves Tuition intact)
 * - `CHARGEBACK`: marks full chargeback reversal and clears/updates invoice status
 */
export async function reverseApprovedPaymentRecord(params: {
  paymentId: number;
  scope: ReversalScope;
  reason: string;
}) {
  try {
    const actor = await requirePaymentManager();
    const reason = (params.reason || "").trim();
    if (reason.length < 4) {
      return { success: false, error: "Provide an audit reason for reversing this payment." };
    }

    const scope: ReversalScope =
      params.scope === "TUITION_ONLY" ||
      params.scope === "PORTAL_FEE_ONLY" ||
      params.scope === "CHARGEBACK"
        ? params.scope
        : "FULL";

    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: Number(params.paymentId) },
    });
    if (!payment) {
      return { success: false, error: "Payment record not found." };
    }

    let createdReversalId: string | null = null;
    const nextPaymentStatus =
      scope === "TUITION_ONLY" || scope === "PORTAL_FEE_ONLY"
        ? "Partially Refunded"
        : scope === "CHARGEBACK"
        ? "Chargeback"
        : "Refunded";

    await prisma.$transaction(async (tx) => {
      const rev = await recordPaymentReversalInTx(tx, {
        paymentId: payment.PaymentID,
        studentId: payment.StudentID,
        termId: payment.TermID,
        invoiceId: payment.InvoiceID,
        scope,
        gatewayFeeKobo: payment.gatewayFeeKobo,
        reference: payment.Reference,
        notes: `${scope} reversal by ${actor.Email}: ${reason}`,
        actorId: actor.UserID,
      });
      createdReversalId = rev?.id ?? null;

      await tx.payment_Record.update({
        where: { PaymentID: payment.PaymentID },
        data: {
          Status: nextPaymentStatus,
          RejectionReason: reason,
          ReviewedBy: actor.UserID,
          ReviewedAt: new Date(),
        },
      });
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: `PAYMENT_REVERSAL_${scope}`,
      targetTable: "Payment_Record",
      targetId: String(payment.PaymentID),
      beforeState: { status: payment.Status },
      afterState: {
        status: nextPaymentStatus,
        scope,
        reversalLedgerId: createdReversalId,
        reason,
      },
    });

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return {
      success: true,
      reversalLedgerId: createdReversalId,
      status: nextPaymentStatus,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reverse payment",
    };
  }
}

export async function recordCashBursaryPayment(data: {
  studentAdmissionOrId: string | number;
  termId?: number;
  amountNaira: number;
  receiptNo?: string;
  notes?: string;
}) {
  try {
    const actor = await requireCapability("APPROVE_PAYMENTS");
    const cleanInput = String(data.studentAdmissionOrId || "").trim();
    const numericId = Number(cleanInput);
    const student = await prisma.student.findFirst({
      where: Number.isInteger(numericId) && numericId > 0
        ? { StudentID: numericId }
        : { AdmissionNo: { equals: cleanInput, mode: "insensitive" } },
      include: {
        Class: true,
        User: { select: SAFE_USER_SELECT },
        ParentLinks: { include: { Parent: { include: { User: { select: { Email: true } } } } } },
      },
    });
    if (!student) return { success: false, error: "Student not found." };

    const term =
      (data.termId
        ? await prisma.academic_Term.findUnique({ where: { TermID: Number(data.termId) } })
        : null) ||
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } }));
    if (!term) return { success: false, error: "Active academic term not found." };

    const amountNaira = Number(data.amountNaira);
    if (!Number.isFinite(amountNaira) || amountNaira <= 0 || amountNaira > 10_000_000) {
      return { success: false, error: "Invalid cash receipt amount." };
    }
    const principalKobo = BigInt(Math.round(amountNaira * 100));
    const ref =
      data.receiptNo?.trim() ||
      `WOF-CASH-${term.TermID}-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    let createdPaymentId = 0;
    let ledger: Awaited<ReturnType<typeof recordPaymentCreditInTx>> | null = null;
    let remainingAfterKobo = BigInt(0);

    await prisma.$transaction(async (tx) => {
      const ensured = await ensureStudentTermInvoice(tx, {
        studentId: student.StudentID,
        termId: term.TermID,
        termLabel: `${term.SessionName} (${term.TermName})`,
        className: student.Class?.ClassName,
        level: student.Class?.Level,
      });

      const rec = await tx.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: term.TermID,
          InvoiceID: ensured.invoice.id,
          AmountPaid: amountNaira,
          AmountKobo: principalKobo,
          gatewayFeeKobo: BigInt(0),
          Channel: "CASH_BURSARY",
          Reference: ref,
          Status: "Approved",
          Description:
            data.notes?.trim() ||
            `Cash Bursary Payment (${term.SessionName} - ${term.TermName})`,
          SubmittedBy: actor.UserID,
          ReviewedBy: actor.UserID,
          ReviewedAt: new Date(),
        },
      });
      createdPaymentId = rec.PaymentID;

      ledger = await recordPaymentCreditInTx(tx, {
        paymentId: rec.PaymentID,
        invoiceId: ensured.invoice.id,
        studentId: student.StudentID,
        termId: term.TermID,
        principalKobo,
        gatewayFeeKobo: BigInt(0),
        settlementChannel: "SCHOOL_COLLECTION",
        reference: ref,
        notes: `Recorded as Cash-at-Bursary by ${actor.Email}`,
        actorId: actor.UserID,
      });

      const summary = await getStudentTermBillingSummary(tx, student.StudentID, term.TermID);
      remainingAfterKobo = summary.remainingTotalKobo;
    });

    if (ledger) {
      const l = ledger as Awaited<ReturnType<typeof recordPaymentCreditInTx>>;
      await writeAuditLog({
        actorUserId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CASH_BURSARY_RECORDED",
        targetTable: "Payment_Record",
        targetId: String(createdPaymentId),
        afterState: {
          studentId: student.StudentID,
          reference: ref,
          principalKobo: principalKobo.toString(),
          schoolShareKobo: l.schoolShareKobo.toString(),
          schoolPortalShareKobo: l.schoolPortalShareKobo.toString(),
          schoolChargesShareKobo: l.schoolChargesShareKobo.toString(),
          providerShareKobo: l.providerShareKobo.toString(),
        },
      });

      const studentDisplayName =
        student.PreferredName || [student.FirstName, student.LastName].filter(Boolean).join(" ") || "Student";
      await sendFeePaymentApprovedNotification({
        recipients: collectStudentEmails(student),
        studentName: studentDisplayName,
        admissionNo: student.AdmissionNo,
        className: student.Class?.ClassName,
        termLabel: `${term.SessionName} (${term.TermName})`,
        reference: ref,
        amountPaidNaira: amountNaira,
        channel: "CASH_BURSARY",
        schoolShareNaira: Number(l.schoolShareKobo) / 100,
        schoolPortalShareNaira: Number(l.schoolPortalShareKobo) / 100,
        schoolChargesShareNaira: Number(l.schoolChargesShareKobo) / 100,
        providerShareNaira: Number(l.providerShareKobo) / 100,
        remainingBalanceNaira: Number(remainingAfterKobo) / 100,
      }).catch(() => {});
    }

    revalidatePath("/portal/admin/payments");
    return { success: true, reference: ref, paymentId: createdPaymentId };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record cash payment",
    };
  }
}

export async function waiveStudentSchoolFees(data: {
  studentAdmissionOrId: string | number;
  termId?: number;
  isWaived: boolean;
  reason: string;
  mode?: "WAIVE_TUITION_KEEP_PORTAL" | "WAIVE_ALL_HARDSHIP" | "PRORATE_PORTAL" | "RESTORE";
  portalFeeProrationPct?: number;
  stepUpCode?: string;
}) {
  try {
    const actor = await requirePaymentManager();
    const reason = (data.reason || "").trim();
    if (reason.length < 4) {
      return { success: false, error: "Please provide a brief reason for modifying school fee waiver status." };
    }

    const mode =
      data.mode ||
      (data.isWaived ? "WAIVE_TUITION_KEEP_PORTAL" : "RESTORE");

    const prorationPct =
      mode === "WAIVE_ALL_HARDSHIP"
        ? 0
        : mode === "PRORATE_PORTAL"
        ? Math.max(0, Math.min(100, Math.round(Number(data.portalFeeProrationPct ?? 50))))
        : 100;

    const touchesPortalFee = mode === "WAIVE_ALL_HARDSHIP" || mode === "PRORATE_PORTAL";
    if (touchesPortalFee) {
      await requireCapability("MANAGE_SYSTEM");
      const trimmedCode = data.stepUpCode?.trim();
      if (trimmedCode) {
        const userRow = await prisma.user.findUnique({
          where: { UserID: actor.UserID },
          select: { TotpEnabled: true, TotpSecret: true },
        });
        if (userRow?.TotpEnabled && userRow.TotpSecret) {
          const plainSecret = decryptTotpSecret(userRow.TotpSecret);
          if (!verifyTotpCode(plainSecret, trimmedCode)) {
            return { success: false, error: "Invalid 2FA Authenticator code." };
          }
          const singleUseOk = await claimTotpCodeSingleUse(actor.UserID, trimmedCode);
          if (!singleUseOk) {
            return { success: false, error: "This 2FA code has already been used. Wait for the next 30s code." };
          }
          await grantStepUpSession(actor.UserID);
        }
      }
      await requireStepUpIfTotpEnabled(actor.UserID, "modify Portal / ICT Fee exemption or proration");
    }

    const cleanInput = String(data.studentAdmissionOrId || "").trim();
    const numericId = Number(cleanInput);
    const student = await prisma.student.findFirst({
      where: Number.isInteger(numericId) && numericId > 0
        ? { StudentID: numericId }
        : { AdmissionNo: { equals: cleanInput, mode: "insensitive" } },
      include: { Class: true },
    });
    if (!student) return { success: false, error: "Student not found." };

    const term =
      (data.termId
        ? await prisma.academic_Term.findUnique({ where: { TermID: Number(data.termId) } })
        : null) ||
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } }));
    if (!term) return { success: false, error: "Academic term not found." };

    const waiveSchoolFees = mode === "WAIVE_TUITION_KEEP_PORTAL" || mode === "WAIVE_ALL_HARDSHIP";
    const portalExempt = mode === "WAIVE_ALL_HARDSHIP";

    let finalPortalFeeNaira = 1000;

    await prisma.$transaction(async (tx) => {
      const ensured = await ensureStudentTermInvoice(tx, {
        studentId: student.StudentID,
        termId: term.TermID,
        termLabel: `${term.SessionName} (${term.TermName})`,
        className: student.Class?.ClassName,
        level: student.Class?.Level,
      });

      const basePortalFeeKobo =
        ensured.schedule.portalFeeKobo > BigInt(0)
          ? ensured.schedule.portalFeeKobo
          : GROSS_PORTAL_FEE_KOBO;

      const totals = computeTermInvoiceTotals({
        tuitionKobo: ensured.schedule.tuitionKobo,
        leviesKobo: ensured.schedule.leviesKobo,
        portalFeeKobo: basePortalFeeKobo,
        isSchoolFeesWaived: waiveSchoolFees,
        isPortalFeeExempt: portalExempt,
        portalFeeProrationPct: prorationPct,
      });
      finalPortalFeeNaira = Number(totals.portalFeeKobo) / 100;

      await tx.invoiceLineItem.updateMany({
        where: { invoiceId: ensured.invoice.id, code: "TUITION" },
        data: { amountKobo: totals.effectiveTuitionKobo, isWaived: waiveSchoolFees },
      });
      await tx.invoiceLineItem.updateMany({
        where: { invoiceId: ensured.invoice.id, code: "LEVIES" },
        data: { amountKobo: totals.effectiveLeviesKobo, isWaived: waiveSchoolFees },
      });
      await tx.invoiceLineItem.updateMany({
        where: { invoiceId: ensured.invoice.id, code: "PORTAL_ICT_FEE" },
        data: {
          amountKobo: totals.portalFeeKobo,
          isWaived: portalExempt,
          beneficiary: "SHARED",
        },
      });

      await tx.invoice.update({
        where: { id: ensured.invoice.id },
        data: {
          IsWaived: waiveSchoolFees,
          portalFeeExempt: portalExempt,
          portalFeeProrationPct: prorationPct,
          WaivedBy: waiveSchoolFees || portalExempt || prorationPct < 100 ? actor.UserID : null,
          WaivedReason: waiveSchoolFees || portalExempt || prorationPct < 100 ? reason : null,
          AmountKobo: totals.totalInvoiceKobo,
        },
      });

      await syncInvoiceAndStudentClearanceInTx(tx, student.StudentID, term.TermID);
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action:
        mode === "WAIVE_ALL_HARDSHIP"
          ? "SCHOOL_AND_PORTAL_FEES_HARDSHIP_WAIVED"
          : mode === "PRORATE_PORTAL"
          ? "PORTAL_FEE_PRORATED"
          : mode === "WAIVE_TUITION_KEEP_PORTAL"
          ? "SCHOOL_FEES_WAIVED_ICT_RETAINED"
          : "SCHOOL_FEE_WAIVER_REMOVED",
      entity: "Invoice",
      entityId: `${student.StudentID}:${term.TermID}`,
      reason,
      afterState: {
        studentId: student.StudentID,
        admissionNo: student.AdmissionNo,
        termId: term.TermID,
        mode,
        isWaived: waiveSchoolFees,
        portalFeeExempt: portalExempt,
        portalFeeProrationPct: prorationPct,
        portalIctFeeStillRequiredNaira: finalPortalFeeNaira,
      },
    });

    revalidatePath("/portal/admin/payments");
    revalidatePath("/portal/fees");
    return {
      success: true,
      message:
        mode === "WAIVE_ALL_HARDSHIP"
          ? `Full Board hardship waiver applied (Tuition + Portal Fee exempted) for ${student.AdmissionNo}.`
          : mode === "PRORATE_PORTAL"
          ? `Portal/ICT Fee prorated to ${prorationPct}% (₦${finalPortalFeeNaira.toLocaleString()}) for ${student.AdmissionNo}.`
          : waiveSchoolFees
          ? `School Tuition/Levies waived for ${student.AdmissionNo}. The ₦${finalPortalFeeNaira.toLocaleString()} Portal/ICT Fee (₦800 Provider / ₦200 School) remains payable.`
          : `School fee waiver cleared for ${student.AdmissionNo}.`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update fee waiver",
    };
  }
}

export async function markProviderRemittanceSettled(ledgerIds: string[], referenceNote: string) {
  try {
    const actor = await requirePaymentManager();
    const cleanIds = (ledgerIds || []).map((id) => String(id).trim()).filter(Boolean).slice(0, 500);
    if (cleanIds.length === 0) {
      return { success: false, error: "Select at least one ledger entry to mark remitted." };
    }

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PROVIDER_REMITTANCE_SETTLED",
      entity: "AllocationLedger",
      entityId: `${cleanIds.length}-entries`,
      reason: referenceNote?.trim() || "Marked Provider 80% Portal Fee share remitted",
      newValue: { ledgerIds: cleanIds, settledAt: new Date().toISOString() },
    });

    revalidatePath("/portal/admin/payments");
    return { success: true, count: cleanIds.length };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record remittance",
    };
  }
}

// ==========================================
// STUDENT & MULTI-WARD PARENT FEE PORTAL
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

async function resolveActorWardsList(actor: { UserID: number; Email: string }) {
  const direct = await prisma.student.findFirst({
    where: { UserID: actor.UserID },
    include: { Class: true, User: { select: SAFE_USER_SELECT } },
  });
  const map = new Map<number, NonNullable<typeof direct>>();
  if (direct) map.set(direct.StudentID, direct);

  const parent = await prisma.parent.findUnique({
    where: { UserID: actor.UserID },
    include: {
      Children: {
        include: {
          Student: {
            include: { Class: true, User: { select: SAFE_USER_SELECT } },
          },
        },
        orderBy: { StudentID: "asc" },
      },
    },
  });
  if (parent) {
    for (const link of parent.Children) {
      if (link.Student) map.set(link.Student.StudentID, link.Student);
    }
  }

  if (actor.Email) {
    const byEmail = await prisma.student.findMany({
      where: {
        ParentEmail: { equals: actor.Email.trim(), mode: "insensitive" },
      },
      include: { Class: true, User: { select: SAFE_USER_SELECT } },
      orderBy: { StudentID: "asc" },
    });
    for (const st of byEmail) map.set(st.StudentID, st);
  }

  return Array.from(map.values());
}

async function resolveAuthorizedStudentForBilling(
  actor: { UserID: number; Email: string; roles: Set<string> },
  requestedStudentId?: number
) {
  const wards = await resolveActorWardsList(actor);

  if (requestedStudentId && Number.isInteger(requestedStudentId) && requestedStudentId > 0) {
    const inWards = wards.find((w) => w.StudentID === requestedStudentId);
    if (inWards) {
      return { student: inWards, wards };
    }
    // Check ownership/admin via central DAL helper (blocks arbitrary IDOR)
    const { student } = await requireStudentOwnershipOrAdmin(requestedStudentId, {
      allowFinance: true,
    });
    return { student, wards: wards.length > 0 ? wards : [student] };
  }

  if (wards.length > 0) {
    return { student: wards[0], wards };
  }

  return { student: null, wards: [] };
}

export async function getActorWardsListAction() {
  try {
    const actor = await requireActiveUser();
    const wards = await resolveActorWardsList(actor);
    return {
      success: true,
      wards: wards.map((w) => ({
        studentId: w.StudentID,
        admissionNo: w.AdmissionNo,
        fullName:
          w.PreferredName ||
          [w.FirstName, w.LastName].filter(Boolean).join(" ") ||
          w.AdmissionNo,
        className: w.Class?.ClassName || "Assigned Class",
        level: w.Class?.Level || "School",
      })),
    };
  } catch (error: unknown) {
    return {
      success: false,
      wards: [],
      error: error instanceof Error ? error.message : "Unauthorized",
    };
  }
}

export async function getOrCreateStudentFeeOrder(targetStudentId?: number, termId?: number) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { student, wards } = await resolveAuthorizedStudentForBilling(
      actor,
      targetStudentId ? Number(targetStudentId) : undefined
    );

    if (!student) {
      return { success: false, error: "Student profile not found" };
    }

    const activeTerm =
      (termId
        ? await prisma.academic_Term.findUnique({ where: { TermID: Number(termId) } })
        : null) ||
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } })) ||
      (await prisma.academic_Term.findFirst({ orderBy: { SessionName: "desc" } }));

    if (!activeTerm) {
      return { success: false, error: "Active academic term not found." };
    }

    const termLabel = `${activeTerm.SessionName} (${activeTerm.TermName})`;
    const bankConfig = await getPortalBankConfig();

    const ensured = await ensureStudentTermInvoice(prisma, {
      studentId: student.StudentID,
      termId: activeTerm.TermID,
      termLabel,
      className: student.Class?.ClassName,
      level: student.Class?.Level,
    });

    const summary = await getStudentTermBillingSummary(prisma, student.StudentID, activeTerm.TermID);

    const remainingDueKobo = summary.remainingTotalKobo;
    const paystackConvenienceFeeKobo = computePaystackConvenienceFeeKobo(
      remainingDueKobo,
      bankConfig.gatewayFeePolicy
    );

    const feeBreakdown = {
      levelDisplayName: ensured.schedule.displayName,
      tuitionNaira: ensured.invoice.IsWaived ? 0 : ensured.schedule.tuitionNaira,
      leviesNaira: ensured.invoice.IsWaived ? 0 : ensured.schedule.leviesNaira,
      maintenanceFeeNaira: Number(summary.portalTargetKobo) / 100,
      providerPortionNaira: Number(summary.portalProviderCapKobo) / 100,
      schoolPortalPortionNaira: Number(summary.portalSchoolCapKobo) / 100,
      totalNaira: Number(summary.totalDueKobo) / 100,
      isSchoolFeesWaived: ensured.invoice.IsWaived,
      isPortalFeeExempt: ensured.invoice.portalFeeExempt,
      portalFeeProrationPct: ensured.invoice.portalFeeProrationPct,
      gatewayFeePolicy: bankConfig.gatewayFeePolicy,
    };

    const wardSummaries = wards.map((w) => ({
      studentId: w.StudentID,
      admissionNo: w.AdmissionNo,
      fullName:
        w.PreferredName ||
        [w.FirstName, w.LastName].filter(Boolean).join(" ") ||
        w.AdmissionNo,
      className: w.Class?.ClassName || "Assigned Class",
    }));

    const lineItemsSerialized = summary.lineItems.map((li) => ({
      id: li.id,
      code: li.code,
      label: li.label,
      beneficiary: li.beneficiary,
      amountNaira: Number(li.amountKobo) / 100,
      isWaived: li.isWaived,
    }));

    if (summary.isCleared) {
      const latestApproved = await prisma.payment_Record.findFirst({
        where: {
          StudentID: student.StudentID,
          TermID: activeTerm.TermID,
          Status: { in: [...APPROVED_PAYMENT_STATUSES] },
        },
        orderBy: { PaymentDate: "desc" },
      });

      return {
        success: true,
        wards: wardSummaries,
        selectedStudentId: student.StudentID,
        isCleared: true,
        status: "Approved",
        trackingId: latestApproved?.Reference || `INV-${ensured.invoice.id.slice(0, 8).toUpperCase()}`,
        amount: Number(summary.totalCreditedKobo) / 100,
        remainingDueNaira: 0,
        schoolDueNaira: Number(summary.remainingSchoolKobo) / 100,
        schoolPortalDueNaira: Number(summary.remainingSchoolPortalKobo) / 100,
        schoolChargesDueNaira: Number(summary.remainingSchoolChargesKobo) / 100,
        portalFeeDueNaira: Number(summary.remainingPortalKobo) / 100,
        providerDueNaira: Number(summary.remainingProviderKobo) / 100,
        alreadyPaidNaira: Number(summary.totalCreditedKobo) / 100,
        paystackConvenienceFeeNaira: 0,
        paystackTotalWithGatewayNaira: 0,
        lineItems: lineItemsSerialized,
        feeBreakdown,
        bankConfig,
        term: activeTerm,
        student,
      };
    }

    // Check existing pending receipt submission or placeholder order
    let pendingPayment = await prisma.payment_Record.findFirst({
      where: {
        StudentID: student.StudentID,
        TermID: activeTerm.TermID,
        Status: "Pending",
      },
      orderBy: { PaymentDate: "desc" },
    });

    if (pendingPayment && !pendingPayment.receiptStorageKey && !pendingPayment.ReceiptUrl) {
      if (Number(pendingPayment.AmountKobo || 0) !== Number(remainingDueKobo)) {
        pendingPayment = await prisma.payment_Record.update({
          where: { PaymentID: pendingPayment.PaymentID },
          data: {
            InvoiceID: ensured.invoice.id,
            AmountPaid: Number(remainingDueKobo) / 100,
            AmountKobo: remainingDueKobo,
            Description: `${ensured.schedule.displayName} Term Fees + Portal/ICT Fee (${activeTerm.SessionName} - ${activeTerm.TermName})`,
          },
        });
      }
    }

    const trackingId =
      pendingPayment?.Reference ||
      (await generateOrderTrackingId(activeTerm.TermName, activeTerm.SessionName));

    if (!pendingPayment) {
      pendingPayment = await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: activeTerm.TermID,
          InvoiceID: ensured.invoice.id,
          AmountPaid: Number(remainingDueKobo) / 100,
          AmountKobo: remainingDueKobo,
          gatewayFeeKobo: BigInt(0),
          Channel: "BANK_TELLER",
          Description: `${ensured.schedule.displayName} Term Fees + Portal/ICT Fee (${activeTerm.SessionName} - ${activeTerm.TermName})`,
          Reference: trackingId,
          Status: "Pending",
        },
      });
    }

    return {
      success: true,
      wards: wardSummaries,
      selectedStudentId: student.StudentID,
      isCleared: false,
      status: summary.totalCreditedKobo > BigInt(0) ? "Partial" : "Pending",
      trackingId,
      amount: Number(remainingDueKobo) / 100,
      remainingDueNaira: Number(remainingDueKobo) / 100,
      schoolDueNaira: Number(summary.remainingSchoolKobo) / 100,
      schoolPortalDueNaira: Number(summary.remainingSchoolPortalKobo) / 100,
      schoolChargesDueNaira: Number(summary.remainingSchoolChargesKobo) / 100,
      portalFeeDueNaira: Number(summary.remainingPortalKobo) / 100,
      providerDueNaira: Number(summary.remainingProviderKobo) / 100,
      alreadyPaidNaira: Number(summary.totalCreditedKobo) / 100,
      paystackConvenienceFeeNaira: Number(paystackConvenienceFeeKobo) / 100,
      paystackTotalWithGatewayNaira:
        Number(remainingDueKobo + paystackConvenienceFeeKobo) / 100,
      hasUploadedReceipt: Boolean(pendingPayment.receiptStorageKey || pendingPayment.ReceiptUrl),
      pendingSubmittedAmountNaira: pendingPayment.receiptStorageKey || pendingPayment.ReceiptUrl
        ? Number(pendingPayment.AmountKobo || 0) / 100 || pendingPayment.AmountPaid
        : null,
      lineItems: lineItemsSerialized,
      feeBreakdown,
      bankConfig,
      term: activeTerm,
      student,
    };
  } catch (error: unknown) {
    console.error("getOrCreateStudentFeeOrder error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load fee order",
    };
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
    const targetStudentIdRaw = Number(formData.get("studentId") || 0);
    const { student } = await resolveAuthorizedStudentForBilling(
      actor,
      Number.isInteger(targetStudentIdRaw) && targetStudentIdRaw > 0 ? targetStudentIdRaw : undefined
    );

    if (!student) {
      return { success: false, error: "Student profile not found" };
    }

    const trackingId = (formData.get("trackingId") as string)?.trim();
    const bankName = (formData.get("bankName") as string)?.trim() || "Commercial Bank";
    const tellerNumber = (formData.get("tellerNumber") as string)?.trim() || "";
    const paymentDateStr = (formData.get("paymentDate") as string)?.trim();
    const amountRaw = Number(formData.get("amount") || 0);
    const receiptFile = formData.get("receipt") as File | null;

    if (!receiptFile || receiptFile.size === 0) {
      return {
        success: false,
        error: "Please select a valid receipt or bank teller screenshot/PDF to upload.",
      };
    }

    if (receiptFile.size > 5 * 1024 * 1024) {
      return { success: false, error: "Receipt file size exceeds maximum limit of 5MB." };
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(receiptFile.type)) {
      return {
        success: false,
        error: "Invalid file format. Only JPEG, PNG, WEBP and PDF files are accepted.",
      };
    }

    const bytes = await receiptFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Server-side magic-byte signature validation
    const magicCheck = validateReceiptBinary(buffer, receiptFile.type);
    if (!magicCheck.valid) {
      return { success: false, error: magicCheck.error || "Invalid receipt file signature." };
    }

    // Cryptographic duplicate-receipt prevention
    const receiptHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const duplicateReceipt = await prisma.payment_Record.findFirst({
      where: {
        ReceiptHash: receiptHash,
        NOT: trackingId ? { Reference: trackingId } : undefined,
      },
    });

    if (duplicateReceipt) {
      return {
        success: false,
        error:
          "This receipt file has already been uploaded for another transaction. Duplicate receipts cannot be verified.",
      };
    }

    const activeTerm =
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } })) ||
      (await prisma.academic_Term.findFirst({ orderBy: { SessionName: "desc" } }));
    if (!activeTerm) {
      return { success: false, error: "Active academic term not found." };
    }

    const termLabel = `${activeTerm.SessionName} (${activeTerm.TermName})`;
    const ensured = await ensureStudentTermInvoice(prisma, {
      studentId: student.StudentID,
      termId: activeTerm.TermID,
      termLabel,
      className: student.Class?.ClassName,
      level: student.Class?.Level,
    });
    const summary = await getStudentTermBillingSummary(prisma, student.StudentID, activeTerm.TermID);
    const remainingDueNaira = Number(summary.remainingTotalKobo) / 100;

    if (summary.isCleared || remainingDueNaira <= 0) {
      return { success: false, error: "This student's fees are already cleared for the active term." };
    }

    // Clamp submitted amount between min installment (₦500 or remaining) and remaining invoice balance
    const minAcceptableNaira = Math.min(500, remainingDueNaira);
    const cleanAmountNaira =
      Number.isFinite(amountRaw) && amountRaw >= minAcceptableNaira
        ? Math.min(Math.round(amountRaw * 100) / 100, remainingDueNaira)
        : remainingDueNaira;
    const amountInKobo = BigInt(Math.round(cleanAmountNaira * 100));

    const { storageKey } = await persistPrivateReceiptArtifact({
      studentId: student.StudentID,
      ext: magicCheck.ext,
      mimeType: magicCheck.normalizedMime,
      buffer,
    });

    const parsedDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
    const paymentDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const existingOrder = trackingId
      ? await prisma.payment_Record.findFirst({
          where: {
            Reference: trackingId,
            StudentID: student.StudentID,
            Status: "Pending",
            receiptStorageKey: null,
          },
        })
      : null;

    let finalRef = trackingId;
    let paymentId = 0;

    if (existingOrder) {
      const updated = await prisma.payment_Record.update({
        where: { PaymentID: existingOrder.PaymentID },
        data: {
          InvoiceID: ensured.invoice.id,
          AmountPaid: cleanAmountNaira,
          AmountKobo: amountInKobo,
          gatewayFeeKobo: BigInt(0),
          Channel: "BANK_TELLER",
          receiptStorageKey: storageKey,
          ReceiptUrl: `/api/receipts/${existingOrder.PaymentID}`,
          ReceiptHash: receiptHash,
          Status: "Pending",
          SubmittedBy: actor.UserID,
          PaymentDate: paymentDate,
          Description: `Bank Transfer (${bankName}${tellerNumber ? ` · Ref: ${tellerNumber}` : ""})`,
        },
      });
      paymentId = updated.PaymentID;
      finalRef = updated.Reference || trackingId;
    } else {
      finalRef = await generateOrderTrackingId(activeTerm.TermName, activeTerm.SessionName);
      const created = await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: activeTerm.TermID,
          InvoiceID: ensured.invoice.id,
          AmountPaid: cleanAmountNaira,
          AmountKobo: amountInKobo,
          gatewayFeeKobo: BigInt(0),
          Channel: "BANK_TELLER",
          receiptStorageKey: storageKey,
          ReceiptHash: receiptHash,
          Reference: finalRef,
          Status: "Pending",
          SubmittedBy: actor.UserID,
          PaymentDate: paymentDate,
          Description: `Bank Transfer (${bankName}${tellerNumber ? ` · Ref: ${tellerNumber}` : ""})`,
        },
      });
      paymentId = created.PaymentID;
      await prisma.payment_Record.update({
        where: { PaymentID: created.PaymentID },
        data: { ReceiptUrl: `/api/receipts/${created.PaymentID}` },
      });
    }

    await writeAuditLog({
      actorId: actor.UserID,
      action: "BANK_TELLER_UPLOADED",
      entity: "Payment_Record",
      entityId: paymentId,
      newValue: {
        studentId: student.StudentID,
        reference: finalRef,
        amountNaira: cleanAmountNaira,
        receiptHash: receiptHash.slice(0, 16),
      },
    });

    revalidatePath("/portal/fees");
    revalidatePath("/portal/admin/payments");

    return {
      success: true,
      trackingId: finalRef,
      message: "Receipt uploaded securely! Your payment is now queued for Bursary verification.",
    };
  } catch (error: unknown) {
    console.error("uploadBankTellerReceipt error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to process receipt upload",
    };
  }
}

export async function initializePayment(data: {
  amount?: number;
  description: string;
  termId?: number;
  trackingId?: string;
  targetStudentId?: number;
}) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { error: "Unauthorized" };
  }

  try {
    const { student } = await resolveAuthorizedStudentForBilling(
      actor,
      data.targetStudentId ? Number(data.targetStudentId) : undefined
    );

    if (!student) {
      return { error: "Student profile not found" };
    }

    const paystackKey = getPaystackSecretKey();

    const activeTerm =
      (data.termId
        ? await prisma.academic_Term.findUnique({ where: { TermID: Number(data.termId) } })
        : null) ||
      (await prisma.academic_Term.findFirst({ where: { IsActive: true } }));

    if (!activeTerm) {
      return { error: "Academic term not found." };
    }

    const termLabel = `${activeTerm.SessionName} (${activeTerm.TermName})`;
    const ensured = await ensureStudentTermInvoice(prisma, {
      studentId: student.StudentID,
      termId: activeTerm.TermID,
      termLabel,
      className: student.Class?.ClassName,
      level: student.Class?.Level,
    });
    const summary = await getStudentTermBillingSummary(prisma, student.StudentID, activeTerm.TermID);

    if (summary.isCleared || summary.remainingTotalKobo <= BigInt(0)) {
      return { error: "All term fees for this student are already paid and cleared." };
    }

    const remainingKobo = summary.remainingTotalKobo;
    const requestedNaira = Number(data.amount || 0);
    const minInstallmentKobo =
      remainingKobo > BigInt(50_000) ? BigInt(50_000) : remainingKobo;

    let principalKobo = remainingKobo;
    if (Number.isFinite(requestedNaira) && requestedNaira > 0) {
      const requestedKobo = BigInt(Math.round(requestedNaira * 100));
      if (requestedKobo >= minInstallmentKobo && requestedKobo <= remainingKobo) {
        principalKobo = requestedKobo;
      }
    }

    const bankConfig = await getPortalBankConfig();
    const gatewayFeeKobo = computePaystackConvenienceFeeKobo(
      principalKobo,
      bankConfig.gatewayFeePolicy
    );
    const totalGatewayChargeKobo = principalKobo + gatewayFeeKobo;
    const principalNaira = Number(principalKobo) / 100;

    // Mint clean Paystack checkout reference (never reuse a teller-uploaded Pending ref)
    let reference = data.trackingId?.trim() || "";
    const existing = reference
      ? await prisma.payment_Record.findUnique({ where: { Reference: reference } })
      : null;

    if (existing) {
      if (existing.StudentID !== student.StudentID) {
        return { error: "FORBIDDEN: Payment reference belongs to another student." };
      }
      if (existing.Status === "Approved" || existing.Status === "Successful") {
        return { error: "This fee order has already been paid and approved." };
      }
      if (existing.receiptStorageKey || existing.ReceiptUrl) {
        // Generate fresh ref so pending bank teller receipt upload is preserved cleanly
        reference = await generateOrderTrackingId(activeTerm.TermName, activeTerm.SessionName);
        await prisma.payment_Record.create({
          data: {
            StudentID: student.StudentID,
            TermID: activeTerm.TermID,
            InvoiceID: ensured.invoice.id,
            AmountPaid: principalNaira,
            AmountKobo: principalKobo,
            gatewayFeeKobo,
            Channel: "PAYSTACK",
            Description: String(data.description || ensured.invoice.Title).slice(0, 200),
            Reference: reference,
            Status: "Pending",
            SubmittedBy: actor.UserID,
          },
        });
      } else {
        await prisma.payment_Record.update({
          where: { Reference: reference },
          data: {
            InvoiceID: ensured.invoice.id,
            AmountPaid: principalNaira,
            AmountKobo: principalKobo,
            gatewayFeeKobo,
            Channel: "PAYSTACK",
          },
        });
      }
    } else {
      reference =
        reference ||
        `WOF-PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      await prisma.payment_Record.create({
        data: {
          StudentID: student.StudentID,
          TermID: activeTerm.TermID,
          InvoiceID: ensured.invoice.id,
          AmountPaid: principalNaira,
          AmountKobo: principalKobo,
          gatewayFeeKobo,
          Channel: "PAYSTACK",
          Description: String(data.description || ensured.invoice.Title).slice(0, 200),
          Reference: reference,
          Status: "Pending",
          SubmittedBy: actor.UserID,
        },
      });
    }

    const payerEmail =
      ("User" in student ? student.User?.Email : undefined) || student.ParentEmail || actor.Email;
    if (!payerEmail || !payerEmail.includes("@")) {
      return { error: "A valid payer email address is required to launch Paystack checkout." };
    }

    const allocPreview = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: principalKobo,
      targetPortalFeeKobo: summary.portalTargetKobo,
      alreadyAllocatedProviderKobo: summary.providerCreditedKobo,
      alreadyAllocatedSchoolPortalKobo: summary.schoolPortalCreditedKobo,
      gatewayFeeKobo,
    });

    const splitActive = Boolean(
      bankConfig.paystackSplitApproved &&
        bankConfig.paystackSubaccountCode &&
        allocPreview.providerShareKobo > BigInt(0)
    );

    const paystackPayload: Record<string, unknown> = {
      email: payerEmail,
      amount: Number(totalGatewayChargeKobo),
      currency: "NGN",
      reference,
      callback_url: `${bankConfig.portalBaseUrl}/portal/fees?payment=verify&studentId=${student.StudentID}`,
      metadata: {
        studentId: student.StudentID,
        admissionNo: student.AdmissionNo,
        termId: activeTerm.TermID,
        principalKobo: principalKobo.toString(),
        grossPortalFeeKobo: summary.portalTargetKobo.toString(),
        providerShareKobo: allocPreview.providerShareKobo.toString(),
        schoolPortalShareKobo: allocPreview.schoolPortalShareKobo.toString(),
        schoolChargesShareKobo: allocPreview.schoolChargesShareKobo.toString(),
        schoolShareKobo: allocPreview.schoolShareKobo.toString(),
        gatewayFeeKobo: gatewayFeeKobo.toString(),
        gatewayFeePolicy: bankConfig.gatewayFeePolicy,
        splitActive,
      },
    };

    // Guardrail (§3.1, §3.3 & Appendix B): ONLY send subaccount & transaction_charge to Paystack
    // when Paystack Subaccount KYC + controlled NGN split proof are approved AND providerShareKobo > 0.
    // Later tuition-only instalments settle 100% directly to the School Main Account.
    if (splitActive) {
      const split = computePaystackSubaccountSplitKobo({
        totalChargedKobo: totalGatewayChargeKobo,
        providerShareKobo: allocPreview.providerShareKobo,
      });
      paystackPayload.subaccount = bankConfig.paystackSubaccountCode;
      paystackPayload.transaction_charge = Number(split.transactionChargeMainAccountKobo);
      paystackPayload.bearer = split.bearer;
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await response.json();

    if (!paystackData.status) {
      return { error: paystackData.message || "Failed to initialize payment gateway" };
    }

    return { authorizationUrl: paystackData.data.authorization_url, reference };
  } catch (error: unknown) {
    console.error("Payment init error:", error);
    return {
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
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
        Term: true,
        Student: {
          include: {
            Class: true,
            User: { select: SAFE_USER_SELECT },
            ParentLinks: {
              include: {
                Parent: { include: { User: { select: { Email: true } } } },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found for this reference." };
    }

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

    if (payment.Status === "Approved" || payment.Status === "Successful") {
      return { success: true, message: "Payment is already verified and approved." };
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanRef)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${paystackKey}` },
      }
    );

    const data = await response.json();

    if (!data.status || data.data?.status !== "success") {
      return {
        success: false,
        error: data.message || "Payment verification failed or pending authorization.",
      };
    }

    const gatewayCurrency = String(data.data?.currency || "").toUpperCase();
    if (gatewayCurrency && gatewayCurrency !== "NGN") {
      return {
        success: false,
        error: `SECURITY_VIOLATION: Unexpected payment currency (${gatewayCurrency}). Expected NGN.`,
      };
    }

    const paidTotalOnGatewayKobo = BigInt(Math.round(Number(data.data?.amount || 0)));
    const principalExpectedKobo =
      payment.AmountKobo > BigInt(0)
        ? payment.AmountKobo
        : BigInt(Math.round((Number(payment.AmountPaid) || 0) * 100));
    const expectedTotalWithGatewayKobo =
      principalExpectedKobo + (payment.gatewayFeeKobo || BigInt(0));

    if (
      expectedTotalWithGatewayKobo <= BigInt(0) ||
      paidTotalOnGatewayKobo < expectedTotalWithGatewayKobo
    ) {
      await writeAuditLog({
        actorId: actor.UserID,
        action: "PAYMENT_AMOUNT_MISMATCH_BLOCKED",
        entity: "Payment_Record",
        entityId: payment.PaymentID,
        newValue: {
          reference: cleanRef,
          paidTotalOnGatewayKobo: paidTotalOnGatewayKobo.toString(),
          expectedTotalWithGatewayKobo: expectedTotalWithGatewayKobo.toString(),
        },
      });
      return {
        success: false,
        error:
          "SECURITY_VIOLATION: Amount paid on gateway is less than the required invoice + gateway amount.",
      };
    }

    const bankConfig = await getPortalBankConfig();
    const hasApprovedSplit = Boolean(
      bankConfig.paystackSplitApproved && bankConfig.paystackSubaccountCode
    );
    const feeBearer =
      bankConfig.gatewayFeePolicy === "PAYER_SURCHARGE" ? "PAYER_SURCHARGE" : "ACCOUNT";
    const actualPaystackFeeKobo =
      data.data?.fees !== undefined && data.data?.fees !== null
        ? BigInt(Math.max(0, Math.round(Number(data.data.fees))))
        : payment.gatewayFeeKobo || BigInt(0);

    let ledgerEntry: Awaited<ReturnType<typeof recordPaymentCreditInTx>> | null = null;
    let remainingAfterKobo = BigInt(0);

    try {
      await prisma.$transaction(async (tx) => {
        // Atomic webhook/verify mutex via unique constraint (`P2002` prevents double processing)
        await tx.webhookEvent.create({
          data: {
            provider: "PAYSTACK",
            eventKey: cleanRef,
            processedAt: new Date(),
          },
        });

        await acquireStudentTermLock(tx, payment.StudentID, payment.TermID);

        let invoiceId = payment.InvoiceID;
        if (!invoiceId && payment.Term) {
          const ensured = await ensureStudentTermInvoice(tx, {
            studentId: payment.StudentID,
            termId: payment.TermID,
            termLabel: `${payment.Term.SessionName} (${payment.Term.TermName})`,
            className: payment.Student?.Class?.ClassName,
            level: payment.Student?.Class?.Level,
          });
          invoiceId = ensured.invoice.id;
        }

        await tx.payment_Record.update({
          where: { Reference: cleanRef },
          data: {
            InvoiceID: invoiceId,
            Status: "Approved",
            Channel: "PAYSTACK",
            gatewayFeeKobo: actualPaystackFeeKobo,
            ReviewedAt: new Date(),
          },
        });

        ledgerEntry = await recordPaymentCreditInTx(tx, {
          paymentId: payment.PaymentID,
          invoiceId,
          studentId: payment.StudentID,
          termId: payment.TermID,
          principalKobo: principalExpectedKobo,
          gatewayFeeKobo: actualPaystackFeeKobo,
          feeBearer,
          settlementChannel: hasApprovedSplit ? "PAYSTACK_SUBACCOUNT" : "SCHOOL_COLLECTION",
          reference: cleanRef,
          notes: "Verified via callback Paystack verification (₦1,000 Portal Fee: ₦800 Provider / ₦200 School)",
          actorId: actor.UserID,
        });

        await tx.enrollment.updateMany({
          where: { StudentID: payment.StudentID, TermID: payment.TermID },
          data: { Status: "ACTIVE" },
        });

        const summary = await getStudentTermBillingSummary(tx, payment.StudentID, payment.TermID);
        remainingAfterKobo = summary.remainingTotalKobo;
      });
    } catch (txErr: unknown) {
      if ((txErr as { code?: string })?.code === "P2002") {
        // Webhook won the race concurrently — return cleanly without duplicate logs or emails
        return { success: true, message: "Payment is already verified and approved!" };
      }
      throw txErr;
    }

    if (ledgerEntry) {
      const l = ledgerEntry as Awaited<ReturnType<typeof recordPaymentCreditInTx>>;
      await writeAuditLog({
        actorId: actor.UserID,
        action: "PAYSTACK_PAYMENT_VERIFIED",
        entity: "Payment_Record",
        entityId: payment.PaymentID,
        newValue: {
          reference: cleanRef,
          principalKobo: principalExpectedKobo.toString(),
          gatewayFeeKobo: actualPaystackFeeKobo.toString(),
          feeBearer,
          schoolShareKobo: l.schoolShareKobo.toString(),
          schoolPortalShareKobo: l.schoolPortalShareKobo.toString(),
          schoolChargesShareKobo: l.schoolChargesShareKobo.toString(),
          providerShareKobo: l.providerShareKobo.toString(),
          modelCode: l.modelCode,
        },
      });

      const studentDisplayName =
        payment.Student?.PreferredName ||
        [payment.Student?.FirstName, payment.Student?.LastName].filter(Boolean).join(" ") ||
        "Student";
      const termLabel = payment.Term
        ? `${payment.Term.SessionName} (${payment.Term.TermName})`
        : "Current Academic Term";
      await sendFeePaymentApprovedNotification({
        recipients: collectStudentEmails(payment.Student),
        studentName: studentDisplayName,
        admissionNo: payment.Student?.AdmissionNo || "N/A",
        className: payment.Student?.Class?.ClassName,
        termLabel,
        reference: cleanRef,
        amountPaidNaira: Number(principalExpectedKobo) / 100,
        channel: "PAYSTACK",
        schoolShareNaira: Number(l.schoolShareKobo) / 100,
        schoolPortalShareNaira: Number(l.schoolPortalShareKobo) / 100,
        schoolChargesShareNaira: Number(l.schoolChargesShareKobo) / 100,
        providerShareNaira: Number(l.providerShareKobo) / 100,
        gatewayFeeNaira: Number(actualPaystackFeeKobo) / 100,
        remainingBalanceNaira: Number(remainingAfterKobo) / 100,
      }).catch((err) => console.warn("[Email] Paystack verification notification warning:", err));
    }

    revalidatePath("/portal/fees");
    revalidatePath("/portal/admin/payments");

    return { success: true, message: "Payment verified and approved successfully!" };
  } catch (error: unknown) {
    console.error("verifyPaystackPayment error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification request failed",
    };
  }
}
