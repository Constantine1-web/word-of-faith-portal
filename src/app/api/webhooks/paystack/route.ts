import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_mocked_key";

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(text).digest("hex");
    const signature = req.headers.get("x-paystack-signature");

    if (hash !== signature) {
      return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(text);

    if (event.event === "charge.success") {
      const reference = event.data.reference;

      // Update payment record to Approved and grant student fee clearance
      const payment = await prisma.payment_Record.findUnique({
        where: { Reference: reference },
        include: { Student: true }
      });

      if (payment) {
        await prisma.$transaction([
          prisma.payment_Record.update({
            where: { Reference: reference },
            data: {
              Status: "Approved",
              ReviewedAt: new Date(),
            }
          }),
          prisma.student.update({
            where: { StudentID: payment.StudentID },
            data: { HasPaidFees: true }
          }),
          prisma.enrollment.updateMany({
            where: { StudentID: payment.StudentID, TermID: payment.TermID },
            data: { Status: "ACTIVE" }
          })
        ]);
      }
    }

    return NextResponse.json({ message: "Success" });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
