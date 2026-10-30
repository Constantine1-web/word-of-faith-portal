"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  requireActiveUser,
  requireRole,
  checkStudentFeeClearance,
  writeAuditLog,
} from "@/lib/authz";

const PEPPER =
  process.env.SCRATCH_CARD_PEPPER ||
  process.env.NEXTAUTH_SECRET ||
  "wof-default-pepper-2026";

// HMAC-SHA256 hash with server-side pepper for PIN storage and lookups
export async function hashPin(pin: string) {
  return crypto
    .createHmac("sha256", PEPPER)
    .update(pin.trim())
    .digest("hex");
}

function legacySha256Pin(pin: string) {
  return crypto.createHash("sha256").update(pin.trim()).digest("hex");
}

async function requireCardManager() {
  return requireRole(["BURSAR", "SUPER_ADMIN", "PRINCIPAL", "Admin"]);
}

// Generate cryptographically random 12-digit PIN
function generate12DigitPin(): string {
  let pin = "";
  for (let i = 0; i < 12; i++) {
    pin += crypto.randomInt(0, 10).toString();
  }
  return pin;
}

// ==========================================
// ADMIN / BURSAR: BATCH GENERATION & CARD MANAGEMENT
// ==========================================

export async function createBatchScratchCards(data: {
  quantity: number;
  termId?: number;
  maxUsage?: number;
}) {
  const actor = await requireCardManager();

  try {
    const qty = Math.min(Math.max(1, data.quantity || 20), 500);
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
      Status: string;
      MaxUsage: number;
      TermID: number | null;
    }[] = [];

    const existingHashes = new Set<string>();

    for (let i = 0; i < qty; i++) {
      const seq = (currentCount + i + 1).toString().padStart(4, "0");
      const serialNumber = `WOFS-${year}-${seq}`;

      let pin = generate12DigitPin();
      let pinHash = await hashPin(pin);

      while (existingHashes.has(pinHash)) {
        pin = generate12DigitPin();
        pinHash = await hashPin(pin);
      }
      existingHashes.add(pinHash);

      createdCards.push({ serialNumber, pin });
      dbRecords.push({
        SerialNumber: serialNumber,
        PIN_Hash: pinHash,
        Status: "ACTIVE",
        MaxUsage: maxUsage,
        TermID: termId || null,
      });
    }

    await prisma.scratch_Card.createMany({
      data: dbRecords,
      skipDuplicates: true,
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "SCRATCH_CARD_BATCH_CREATE",
      targetTable: "Scratch_Card",
      targetId: `batch-${year}-${currentCount + 1}`,
      afterState: { quantity: createdCards.length, termId, maxUsage },
    });

    revalidatePath("/portal/admin/cards");
    return {
      success: true,
      count: createdCards.length,
      cards: createdCards,
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
  await requireCardManager();

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
          include: { Class: true },
        },
        Term: true,
      },
      orderBy: { CardID: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

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
      stats,
    };
  } catch (error: any) {
    console.error("getScratchCardsList error:", error);
    return { success: false, error: error.message || "Failed to fetch scratch cards" };
  }
}

// ==========================================
// STUDENT: RESULT CHECKER VERIFICATION (HARDENED v3)
// ==========================================

export async function verifyScratchCard(pin: string, termId: number) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const studentRecord = await prisma.student.findFirst({
    where: { UserID: actor.UserID },
  });

  if (!studentRecord) {
    return { success: false, error: "Student profile not found." };
  }

  const studentId = studentRecord.StudentID;

  // Enforce Layer 3 server-side fee-clearance check before returning results
  const clearance = await checkStudentFeeClearance(studentId, termId);
  if (!clearance.isCleared) {
    return {
      success: false,
      error: "Tuition fee clearance is required for this academic term before checking terminal results.",
    };
  }

  const hmacPinHash = await hashPin(pin);
  const sha256PinHash = legacySha256Pin(pin);

  try {
    let card = await prisma.scratch_Card.findUnique({
      where: { PIN_Hash: hmacPinHash },
    });

    if (!card) {
      card = await prisma.scratch_Card.findUnique({
        where: { PIN_Hash: sha256PinHash },
      });
    }

    if (!card) {
      return {
        success: false,
        error: "Invalid Scratch Card PIN. Please check the digits carefully.",
      };
    }

    if (card.Status === "REVOKED") {
      return { success: false, error: "This Scratch Card has been revoked by administration." };
    }

    if (card.UsedBy !== null && card.UsedBy !== studentId) {
      return {
        success: false,
        error: "This Scratch Card is already bound to another student.",
      };
    }

    if (card.UsageCount >= card.MaxUsage) {
      return {
        success: false,
        error: `Scratch Card usage limit exceeded (Max ${card.MaxUsage} checks per card). Please obtain a new card.`,
      };
    }

    // Atomic bind & usage increment
    const activeWindowExpires =
      card.ActiveWindowExpires || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const updated = await prisma.scratch_Card.updateMany({
      where: {
        CardID: card.CardID,
        OR: [{ UsedBy: null }, { UsedBy: studentId }],
        UsageCount: { lt: card.MaxUsage },
      },
      data: {
        UsedBy: studentId,
        TermID: card.TermID || termId,
        UsageCount: { increment: 1 },
        ActiveWindowExpires: activeWindowExpires,
        Status: card.UsageCount + 1 >= card.MaxUsage ? "EXHAUSTED" : "CONSUMED",
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: "Scratch card could not be consumed (already bound or usage limit reached).",
      };
    }

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
      where: { TermID: termId },
    });

    const student = await prisma.student.findUnique({
      where: { StudentID: studentId },
      include: { Class: true, User: true },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "SCRATCH_CARD_VERIFY_RESULT",
      targetTable: "Scratch_Card",
      targetId: String(card.CardID),
      afterState: { studentId, termId, usageAfter: card.UsageCount + 1 },
    });

    return {
      success: true,
      data: { results, term, student },
      message: `Card validated successfully. Remaining checks on this card: ${card.MaxUsage - (card.UsageCount + 1)}`,
    };
  } catch (error: any) {
    console.error("verifyScratchCard error:", error);
    return { success: false, error: error.message || "Failed to verify scratch card" };
  }
}
