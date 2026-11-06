import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { writeAuditLog } from "@/lib/authz";

const MINIMUM_TERM_FEE_NAIRA = 65000;

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

    if (event.event === "charge.success") {
      const reference = String(event.data?.reference || "").trim();
      if (!reference) {
        return NextResponse.json({ message: "Missing transaction reference" }, { status: 400 });
      }

      const payment = await prisma.payment_Record.findUnique({
        where: { Reference: reference },
        include: { Student: true },
      });

      if (!payment) {
        return NextResponse.json({ message: "Reference not found" }, { status: 200 });
      }

      const currency = String(event.data?.currency || "NGN").toUpperCase();
      if (currency !== "NGN") {
        return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
      }

      const paidKobo = BigInt(Math.round(Number(event.data?.amount || 0)));
      const expectedKobo =
        payment.AmountKobo > BigInt(0)
          ? payment.AmountKobo
          : BigInt(Math.round(Math.max(payment.AmountPaid || MINIMUM_TERM_FEE_NAIRA, MINIMUM_TERM_FEE_NAIRA) * 100));

      if (paidKobo < expectedKobo) {
        await writeAuditLog({
          actorId: null,
          action: "WEBHOOK_AMOUNT_MISMATCH_BLOCKED",
          entity: "Payment_Record",
          entityId: payment.PaymentID,
          newValue: {
            reference,
            paidKobo: paidKobo.toString(),
            expectedKobo: expectedKobo.toString(),
          },
        });
        return NextResponse.json({ message: "Amount mismatch" }, { status: 400 });
      }

      try {
        await prisma.$transaction([
          prisma.webhookEvent.create({
            data: {
              provider: "PAYSTACK",
              eventKey: reference,
              processedAt: new Date(),
            },
          }),
          prisma.payment_Record.update({
            where: { Reference: reference },
            data: {
              Status: "Approved",
              Channel: "PAYSTACK",
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
      } catch (txErr: any) {
        // Unique constraint violation on WebhookEvent.eventKey (P2002) means already processed
        if (txErr?.code === "P2002") {
          return NextResponse.json({ message: "Event already processed" }, { status: 200 });
        }
        throw txErr;
      }
    }

    return NextResponse.json({ message: "Success" });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}

