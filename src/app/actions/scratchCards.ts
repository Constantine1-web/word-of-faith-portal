"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Deterministic SHA-256 hash for PIN storage and lookups
export async function hashPin(pin: string) {
  return crypto.createHash("sha256").update(pin.trim()).digest("hex");
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    throw new Error("Unauthorized. Admin privileges required.");
  }
}

// Generate random 12-digit PIN
function generate12DigitPin(): string {
  // Generates 12 random digits formatted as string
  const buf = crypto.randomBytes(6);
  let pin = "";
  for (let i = 0; i < 6; i++) {
    pin += (buf[i] % 10).toString();
    pin += Math.floor(Math.random() * 10).toString();
  }
  return pin.slice(0, 12);
}

// ==========================================
// ADMIN: BATCH GENERATION & CARD MANAGEMENT
// ==========================================

export async function createBatchScratchCards(data: {
  quantity: number;
  termId?: number;
  maxUsage?: number;
}) {
  await requireAdmin();

  try {
    const qty = Math.min(Math.max(1, data.quantity || 20), 500); // Between 1 and 500
    const maxUsage = data.maxUsage || 5;

    let termId = data.termId;
    if (!termId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      termId = active?.TermID;
    }

    const currentCount = await prisma.scratch_Card.count();
    const year = new Date().getFullYear();

    const createdCards: { serialNumber: string; pin: string }[] = [];
    const dbRecords: {
      SerialNumber: string;
      PIN_Hash: string;
      MaxUsage: number;
      TermID: number | null;
    }[] = [];

    const existingHashes = new Set<string>();

    for (let i = 0; i < qty; i++) {
      const seq = (currentCount + i + 1).toString().padStart(4, "0");
      const serialNumber = `WOFS-${year}-${seq}`;

      let pin = generate12DigitPin();
      let pinHash = crypto.createHash("sha256").update(pin).digest("hex");

      // Ensure uniqueness within batch
      while (existingHashes.has(pinHash)) {
        pin = generate12DigitPin();
        pinHash = crypto.createHash("sha256").update(pin).digest("hex");
      }
      existingHashes.add(pinHash);

      createdCards.push({ serialNumber, pin });
      dbRecords.push({
        SerialNumber: serialNumber,
        PIN_Hash: pinHash,
        MaxUsage: maxUsage,
        TermID: termId || null
      });
    }

    // Insert records in batch
    await prisma.scratch_Card.createMany({
      data: dbRecords,
      skipDuplicates: true
    });

    revalidatePath("/portal/admin/cards");
    return {
      success: true,
      count: createdCards.length,
      cards: createdCards // Plaintext PINs returned once for printing / export
    };
  } catch (error: any) {
    console.error("createBatchScratchCards error:", error);
    return { success: false, error: error.message || "Failed to generate scratch cards" };
  }
}

export async function getScratchCardsList(filters?: {
  termId?: number;
  status?: "all" | "unused" | "active" | "exhausted";
  search?: string;
  page?: number;
}) {
  await requireAdmin();

  try {
    const page = filters?.page || 1;
    const pageSize = 50;

    let whereClause: any = {};

    if (filters?.termId) {
      whereClause.TermID = filters.termId;
    }

    if (filters?.status === "unused") {
      whereClause.UsedBy = null;
    } else if (filters?.status === "active") {
      whereClause.UsedBy = { not: null };
      whereClause.UsageCount = { lt: prisma.scratch_Card.fields.MaxUsage };
    } else if (filters?.status === "exhausted") {
      whereClause.UsedBy = { not: null };
    }

    if (filters?.search) {
      whereClause.OR = [
        { SerialNumber: { contains: filters.search.trim(), mode: "insensitive" } },
        { Student: { PreferredName: { contains: filters.search.trim(), mode: "insensitive" } } },
        { Student: { AdmissionNo: { contains: filters.search.trim(), mode: "insensitive" } } },
      ];
    }

    const totalCount = await prisma.scratch_Card.count({ where: whereClause });
    const cards = await prisma.scratch_Card.findMany({
      where: whereClause,
      include: {
        Student: {
          include: { Class: true }
        },
        Term: true
      },
      orderBy: { CardID: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    // Summary statistics
    const stats = {
      total: await prisma.scratch_Card.count(),
      unused: await prisma.scratch_Card.count({ where: { UsedBy: null } }),
      used: await prisma.scratch_Card.count({ where: { UsedBy: { not: null } } }),
    };

    return {
      success: true,
      cards,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      currentPage: page,
      stats
    };
  } catch (error: any) {
    console.error("getScratchCardsList error:", error);
    return { success: false, error: error.message || "Failed to fetch scratch cards" };
  }
}

// ==========================================
// STUDENT: RESULT CHECKER VERIFICATION
// ==========================================

export async function verifyScratchCard(pin: string, termId: number) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const studentRecord = await prisma.student.findFirst({
    where: { UserID: session.user.id }
  });

  if (!studentRecord) {
    return { success: false, error: "Student profile not found." };
  }

  const studentId = studentRecord.StudentID;
  const pinHash = crypto.createHash("sha256").update(pin.trim()).digest("hex");

  try {
    const card = await prisma.scratch_Card.findUnique({
      where: { PIN_Hash: pinHash },
    });

    if (!card) {
      return { success: false, error: "Invalid Scratch Card PIN. Please check the digits carefully." };
    }

    if (card.UsedBy !== null && card.UsedBy !== studentId) {
      return { success: false, error: "This Scratch Card is already bound to another student." };
    }

    if (card.UsageCount >= card.MaxUsage) {
      return { success: false, error: `Scratch Card usage limit exceeded (Max ${card.MaxUsage} checks per card). Please obtain a new card.` };
    }

    // Bind card if not bound, increment usage count, and bind Term
    await prisma.scratch_Card.update({
      where: { CardID: card.CardID },
      data: {
        UsedBy: studentId,
        TermID: card.TermID || termId,
        UsageCount: card.UsageCount + 1,
      },
    });

    // Fetch student's terminal results
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
      message: `Card validated successfully. Remaining checks on this card: ${card.MaxUsage - (card.UsageCount + 1)}`
    };
  } catch (error: any) {
    console.error("verifyScratchCard error:", error);
    return { success: false, error: error.message || "Failed to verify scratch card" };
  }
}
