import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { writeAuditLog } from "@/lib/authz";
import {
  acquireStudentTermLock,
  ensureStudentTermInvoice,
  getStudentTermBillingSummary,
  recordPaymentCreditInTx,
  recordPaymentReversalInTx,
} from "@/lib/payment-ledger";
import type { ReversalScope } from "@/lib/fee-split";
import { getPortalBankConfig } from "@/lib/portal-settings";
import {
  sendFeePaymentApprovedNotification,
  sendFeePaymentRejectedNotification,
} from "@/lib/email";

function collectEmails(student: {
  ParentEmail?: string | null;
  User?: { Email?: string | null } | null;
  ParentLinks?: Array<{ Parent?: { User?: { Email?: string | null } | null } | null }>;
} | null | undefined): string[] {
  const emails: string[] = [];
  if (student?.ParentEmail) emails.push(student.ParentEmail);
  if (student?.User?.Email) emails.push(student.User.Email);
  for (const l of student?.ParentLinks || []) {
    if (l?.Parent?.User?.Email) emails.push(l.Parent.User.Email);
  }
  return emails;
}

export async function POST(req: Request) {
  try {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!paystackSecretKey || paystackSecretKey === "sk_test_mocked_key") {
      console.error("[Paystack Webhook] PAYSTACK_SECRET_KEY is not configured.");
      return NextResponse.json({ message: "Webhook not configured" }, { status: 500 });
    }

    const text = await req.text();
    const signature = req.headers.get("x-paystack-signature")?.trim();

    if (!signature) {
      return NextResponse.json({ message: "Missing signature" }, { status: 400 });
    }

    const hash = crypto.createHmac("sha512", paystackSecretKey).update(text).digest("hex");
    const hashBuf = Buffer.from(hash, "utf8");
    const sigBuf = Buffer.from(signature, "utf8");

    if (hashBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hashBuf, sigBuf)) {
      return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(text);
    const eventType = String(event?.event || "");

    if (eventType === "charge.success") {
      const reference = String(event.data?.reference || "").trim();
      if (!reference) {
        return NextResponse.json({ message: "Missing transaction reference" }, { status: 400 });
      }

      const payment = await prisma.payment_Record.findUnique({
        where: { Reference: reference },
        include: {
          Term: true,
          Student: {
            include: {
              Class: true,
              User: { select: { Email: true } },
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
        return NextResponse.json({ message: "Reference not found" }, { status: 200 });
      }

      const currency = String(event.data?.currency || "NGN").toUpperCase();
      if (currency !== "NGN") {
        return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
      }

      const totalPaidOnGatewayKobo = BigInt(Math.round(Number(event.data?.amount || 0)));
      const principalExpectedKobo =
        payment.AmountKobo > BigInt(0)
          ? payment.AmountKobo
          : BigInt(Math.round((payment.AmountPaid || 0) * 100));
      const expectedTotalChargedKobo = principalExpectedKobo + (payment.gatewayFeeKobo || BigInt(0));

      if (expectedTotalChargedKobo <= BigInt(0) || totalPaidOnGatewayKobo < expectedTotalChargedKobo) {
        await writeAuditLog({
          actorId: null,
          action: "WEBHOOK_AMOUNT_MISMATCH_BLOCKED",
          entity: "Payment_Record",
          entityId: payment.PaymentID,
          newValue: {
            reference,
            totalPaidOnGatewayKobo: totalPaidOnGatewayKobo.toString(),
            expectedTotalChargedKobo: expectedTotalChargedKobo.toString(),
          },
        });
        return NextResponse.json({ message: "Amount mismatch" }, { status: 400 });
      }

      const bankConfig = await getPortalBankConfig();
      const hasApprovedSplit = Boolean(
        bankConfig.paystackSplitApproved && bankConfig.paystackSubaccountCode
      );
      const feeBearer =
        bankConfig.gatewayFeePolicy === "PAYER_SURCHARGE" ? "PAYER_SURCHARGE" : "ACCOUNT";
      const actualPaystackFeeKobo =
        event.data?.fees !== undefined && event.data?.fees !== null
          ? BigInt(Math.max(0, Math.round(Number(event.data.fees))))
          : payment.gatewayFeeKobo || BigInt(0);

      let ledgerResult: Awaited<ReturnType<typeof recordPaymentCreditInTx>> | null = null;
      let remainingAfterKobo = BigInt(0);

      try {
        await prisma.$transaction(async (tx) => {
          // Atomic single-winner lock via WebhookEvent PK/Unique constraint
          await tx.webhookEvent.create({
            data: {
              provider: "PAYSTACK",
              eventKey: reference,
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
            where: { Reference: reference },
            data: {
              InvoiceID: invoiceId,
              Status: "Approved",
              Channel: "PAYSTACK",
              gatewayFeeKobo: actualPaystackFeeKobo,
              ReviewedAt: new Date(),
            },
          });

          ledgerResult = await recordPaymentCreditInTx(tx, {
            paymentId: payment.PaymentID,
            invoiceId,
            studentId: payment.StudentID,
            termId: payment.TermID,
            principalKobo: principalExpectedKobo,
            gatewayFeeKobo: actualPaystackFeeKobo,
            feeBearer,
            settlementChannel: hasApprovedSplit ? "PAYSTACK_SUBACCOUNT" : "SCHOOL_COLLECTION",
            reference,
            notes: "Verified via Paystack HMAC webhook (₦1,000 Portal Fee: ₦800 Provider / ₦200 School)",
            actorId: null,
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
          return NextResponse.json({ message: "Event already processed" }, { status: 200 });
        }
        throw txErr;
      }

      if (ledgerResult) {
        const l = ledgerResult as Awaited<ReturnType<typeof recordPaymentCreditInTx>>;
        await writeAuditLog({
          actorId: null,
          action: "PAYSTACK_WEBHOOK_APPROVED",
          entity: "Payment_Record",
          entityId: payment.PaymentID,
          newValue: {
            reference,
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
          recipients: collectEmails(payment.Student),
          studentName: studentDisplayName,
          admissionNo: payment.Student?.AdmissionNo || "N/A",
          className: payment.Student?.Class?.ClassName,
          termLabel,
          reference,
          amountPaidNaira: Number(principalExpectedKobo) / 100,
          channel: "PAYSTACK",
          schoolShareNaira: Number(l.schoolShareKobo) / 100,
          schoolPortalShareNaira: Number(l.schoolPortalShareKobo) / 100,
          schoolChargesShareNaira: Number(l.schoolChargesShareKobo) / 100,
          providerShareNaira: Number(l.providerShareKobo) / 100,
          gatewayFeeNaira: Number(actualPaystackFeeKobo) / 100,
          remainingBalanceNaira: Number(remainingAfterKobo) / 100,
        }).catch((err) => console.warn("[Webhook Email] Notification warning:", err));
      }

      return NextResponse.json({ message: "Success" });
    }

    // Refund & Chargeback Dispute Handling
    if (
      eventType === "refund.processed" ||
      eventType === "charge.dispute.create" ||
      eventType === "charge.dispute.resolve"
    ) {
      const reference = String(
        event.data?.transaction_reference ||
          event.data?.transaction?.reference ||
          event.data?.reference ||
          ""
      ).trim();

      if (!reference) {
        return NextResponse.json({ message: "No reference on reversal event" }, { status: 200 });
      }

      const eventKey = `${eventType}:${String(event.data?.id || reference)}`;
      const payment = await prisma.payment_Record.findUnique({
        where: { Reference: reference },
        include: {
          Term: true,
          Student: {
            include: {
              User: { select: { Email: true } },
              ParentLinks: { include: { Parent: { include: { User: { select: { Email: true } } } } } },
            },
          },
        },
      });

      if (!payment) {
        return NextResponse.json({ message: "Payment reference not found" }, { status: 200 });
      }

      const isDisputeWon =
        eventType === "charge.dispute.resolve" &&
        String(event.data?.status || "").toLowerCase() === "won";

      if (isDisputeWon) {
        await writeAuditLog({
          actorId: null,
          action: "PAYSTACK_DISPUTE_WON",
          entity: "Payment_Record",
          entityId: payment.PaymentID,
          newValue: { reference, eventKey },
        });
        return NextResponse.json({ message: "Dispute won recorded" });
      }

      let resolvedScope: ReversalScope =
        eventType === "refund.processed" ? "FULL" : "CHARGEBACK";
      const refundedKoboRaw = BigInt(Math.max(0, Math.round(Number(event.data?.amount || 0))));

      let finalStatus = eventType === "refund.processed" ? "Refunded" : "Disputed";
      try {
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: {
              provider: "PAYSTACK",
              eventKey,
              processedAt: new Date(),
            },
          });

          if (eventType === "refund.processed" && refundedKoboRaw > BigInt(0)) {
            const creditRow = await tx.allocationLedger.findFirst({
              where: { paymentId: payment.PaymentID, entryType: "CREDIT" },
              orderBy: { createdAt: "asc" },
            });
            if (creditRow && refundedKoboRaw < creditRow.grossPaidKobo) {
              const portalGross = creditRow.providerShareKobo + creditRow.schoolPortalShareKobo;
              if (
                creditRow.schoolChargesShareKobo > BigInt(0) &&
                refundedKoboRaw === creditRow.schoolChargesShareKobo
              ) {
                resolvedScope = "TUITION_ONLY";
                finalStatus = "Partially Refunded";
              } else if (portalGross > BigInt(0) && refundedKoboRaw === portalGross) {
                resolvedScope = "PORTAL_FEE_ONLY";
                finalStatus = "Partially Refunded";
              }
            }
          }

          await tx.payment_Record.update({
            where: { PaymentID: payment.PaymentID },
            data: {
              Status: finalStatus,
              RejectionReason: `Automated Paystack ${eventType} (${resolvedScope}) event recorded.`,
              ReviewedAt: new Date(),
            },
          });

          await recordPaymentReversalInTx(tx, {
            paymentId: payment.PaymentID,
            studentId: payment.StudentID,
            termId: payment.TermID,
            invoiceId: payment.InvoiceID,
            scope: resolvedScope,
            gatewayFeeKobo: payment.gatewayFeeKobo,
            reference,
            notes: `Paystack ${eventType} [${resolvedScope}] (${eventKey})`,
            actorId: null,
          });
        });

        await writeAuditLog({
          actorId: null,
          action: `PAYSTACK_${finalStatus.replace(/\s+/g, "_").toUpperCase()}`,
          entity: "Payment_Record",
          entityId: payment.PaymentID,
          newValue: { reference, eventType, eventKey, scope: resolvedScope, status: finalStatus },
        });

        const studentDisplayName =
          payment.Student?.PreferredName ||
          [payment.Student?.FirstName, payment.Student?.LastName].filter(Boolean).join(" ") ||
          "Student";
        await sendFeePaymentRejectedNotification({
          recipients: collectEmails(payment.Student),
          studentName: studentDisplayName,
          admissionNo: payment.Student?.AdmissionNo || "N/A",
          termLabel: payment.Term ? `${payment.Term.SessionName} (${payment.Term.TermName})` : undefined,
          reference,
          amountPaidNaira: payment.AmountPaid,
          reason: `Transaction marked ${finalStatus} (${resolvedScope}) via Paystack (${eventType}). Please contact the Bursary office.`,
        }).catch(() => {});
      } catch (txErr: unknown) {
        if ((txErr as { code?: string })?.code === "P2002") {
          return NextResponse.json({ message: "Reversal already processed" }, { status: 200 });
        }
        throw txErr;
      }

      return NextResponse.json({ message: "Reversal recorded" });
    }

    return NextResponse.json({ message: "Event acknowledged" });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
