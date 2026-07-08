"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_mocked_key";

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
    // 1. Create a pending payment record
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

    // 2. Call Paystack API
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
