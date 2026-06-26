"use server";

import prisma from "@/lib/db";
import { paymentQueue } from "@/lib/queue";

export async function processPayment(studentId: number, amount: number, description: string, termId: number) {
  try {
    // Check if term exists
    const term = await prisma.academic_Term.findUnique({
      where: { TermID: termId }
    });
    
    if (!term) return { success: false, error: "Invalid academic term." };

    // Enqueue the heavy payment processing job
    await paymentQueue.add('process-payment', {
      studentId,
      amount,
      description,
      termId
    });

    return { success: true, message: "Payment processing has started in the background. You will be notified once complete." };
  } catch (error: any) {
    console.error("Payment error:", error);
    return { success: false, error: "Failed to process payment." };
  }
}
