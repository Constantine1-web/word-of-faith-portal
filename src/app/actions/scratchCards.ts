"use server";

import prisma from "@/lib/db";
import crypto from "crypto";

// Hash the PIN deterministically using SHA-256 for direct DB lookup
function hashPin(pin: string) {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export async function verifyScratchCard(pin: string, studentId: number, termId: number) {
  const pinHash = hashPin(pin);

  try {
    const card = await prisma.scratch_Card.findUnique({
      where: { PIN_Hash: pinHash },
    });

    if (!card) {
      return { success: false, error: "Invalid Scratch Card PIN." };
    }

    if (card.UsedBy !== null && card.UsedBy !== studentId) {
      return { success: false, error: "This Scratch Card is already bound to another student." };
    }

    if (card.UsageCount >= card.MaxUsage) {
      return { success: false, error: "Scratch Card usage limit exceeded." };
    }

    // Bind card if not bound, and increment usage count
    await prisma.scratch_Card.update({
      where: { CardID: card.CardID },
      data: {
        UsedBy: studentId,
        UsageCount: card.UsageCount + 1,
      },
    });

    // Fetch the terminal results
    const results = await prisma.result.findMany({
      where: {
        StudentID: studentId,
        TermID: termId,
      },
      include: {
        Subject: true,
      },
    });

    const term = await prisma.academic_Term.findUnique({
      where: { TermID: termId }
    });

    const student = await prisma.student.findUnique({
      where: { StudentID: studentId },
      include: { Class: true, User: true }
    });

    return { 
      success: true, 
      data: { results, term, student },
      message: `Card validated. Usages left: ${card.MaxUsage - (card.UsageCount + 1)}`
    };

  } catch (error: any) {
    console.error("Error validating scratch card:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}
