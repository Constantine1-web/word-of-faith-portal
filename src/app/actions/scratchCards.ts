"use server";

import prisma from "@/lib/db";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  requireActiveUser,
  requireRole,
  can,
  checkStudentFeeClearance,
  writeAuditLog,
} from "@/lib/authz";

const PEPPER_KEYS: Record<string, string> = {
  v1:
    process.env.SCRATCH_CARD_PEPPER ||
    process.env.NEXTAUTH_SECRET ||
    "wof-default-pepper-2026-v1",
};

const CURRENT_KEY_ID = "v1";
const BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Unambiguous Base32 (no 0/O/1/I)

/**
 * Generates a cryptographically random Base32 serial number (Section 4 & 6.5: NOT sequential).
 */
function generateRandomBase32Serial(): string {
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += BASE32_ALPHABET[crypto.randomInt(0, BASE32_ALPHABET.length)];
    part2 += BASE32_ALPHABET[crypto.randomInt(0, BASE32_ALPHABET.length)];
  }
  return `WOFS-${part1}-${part2}`;
}

/**
 * Computes HMAC-SHA256(pepper[keyId], serial + ':' + pin) per Section 4 & 6.5.
 */
export async function computeSerialPinHmac(
  serial: string,
  pin: string,
  keyId: string = CURRENT_KEY_ID
): Promise<string> {
  const secret = PEPPER_KEYS[keyId] || PEPPER_KEYS.v1;
  const normalizedSerial = serial.trim().toUpperCase();
  const normalizedPin = pin.trim();
  return crypto
    .createHmac("sha256", secret)
    .update(`${normalizedSerial}:${normalizedPin}`)
    .digest("hex");
}

// Legacy HMAC/SHA256 helpers for backward compatibility with earlier seeded cards
export async function hashPin(pin: string, keyId: string = CURRENT_KEY_ID) {
  const secret = PEPPER_KEYS[keyId] || PEPPER_KEYS.v1;
  return crypto.createHmac("sha256", secret).update(pin.trim()).digest("hex");
}

function legacySha256Pin(pin: string) {
  return crypto.createHash("sha256").update(pin.trim()).digest("hex");
}

function timingSafeHexEquals(hexA: string, hexB: string): boolean {
  try {
    const bufA = Buffer.from(hexA, "hex");
    const bufB = Buffer.from(hexB, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function requireCardManager() {
  const actor = await requireRole(["BURSAR", "PRINCIPAL", "SUPER_ADMIN", "Admin"]);
  if (!can(actor, "card:generate") && !actor.roles.has("SUPER_ADMIN")) {
    throw new Error("Forbidden: Bursar or Principal authority required for scratch card operations.");
  }
  return actor;
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
  initialStatus?: "GENERATED" | "ISSUED";
}) {
  try {
    const actor = await requireCardManager();

    const qty = Math.min(Math.max(1, data.quantity || 20), 500);
    const maxUsage = data.maxUsage || 5;
    const status = data.initialStatus || "ISSUED";

    let termId = data.termId;
    if (!termId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      termId = active?.TermID;
    }

    const batch = await prisma.scratchCardBatch.create({
      data: {
        createdById: actor.UserID,
        size: qty,
        pepperKeyId: CURRENT_KEY_ID,
        status,
      },
    });

    const createdCards: { serialNumber: string; pin: string }[] = [];
    const dbRecords: {
      SerialNumber: string;
      PIN_Hash: string;
      KeyId: string;
      BatchId: string;
      Status: string;
      MaxUsage: number;
      TermID: number | null;
      IssuedAt: Date | null;
      IssuedBy: number | null;
    }[] = [];

    const existingSerials = new Set<string>();

    for (let i = 0; i < qty; i++) {
      let serialNumber = generateRandomBase32Serial();
      while (existingSerials.has(serialNumber)) {
        serialNumber = generateRandomBase32Serial();
      }
      existingSerials.add(serialNumber);

      const pin = generate12DigitPin();
      const pinHash = await computeSerialPinHmac(serialNumber, pin, CURRENT_KEY_ID);

      createdCards.push({ serialNumber, pin });
      dbRecords.push({
        SerialNumber: serialNumber,
        PIN_Hash: pinHash,
        KeyId: CURRENT_KEY_ID,
        BatchId: batch.id,
        Status: status,
        MaxUsage: maxUsage,
        TermID: termId || null,
        IssuedAt: status === "ISSUED" ? new Date() : null,
        IssuedBy: status === "ISSUED" ? actor.UserID : null,
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
      targetTable: "ScratchCardBatch",
      targetId: batch.id,
      afterState: { quantity: createdCards.length, termId, maxUsage, status, keyId: CURRENT_KEY_ID },
    });

    revalidatePath("/portal/admin/cards");
    return {
      success: true,
      batchId: batch.id,
      count: createdCards.length,
      cards: createdCards,
    };
  } catch (error: any) {
    console.error("createBatchScratchCards error:", error);
    return { success: false, error: error.message || "Failed to generate scratch cards" };
  }
}

export async function issueScratchCardBatch(batchId: string) {
  try {
    const actor = await requireCardManager();
    const updated = await prisma.scratch_Card.updateMany({
      where: { BatchId: batchId, Status: "GENERATED" },
      data: {
        Status: "ISSUED",
        IssuedAt: new Date(),
        IssuedBy: actor.UserID,
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "SCRATCH_CARD_BATCH_ISSUE",
      targetTable: "ScratchCardBatch",
      targetId: batchId,
      afterState: { issuedCards: updated.count },
    });

    revalidatePath("/portal/admin/cards");
    return { success: true, count: updated.count };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to issue card batch" };
  }
}

export async function unlockScratchCard(cardId: number, reason: string) {
  try {
    const actor = await requireCardManager();
    const card = await prisma.scratch_Card.update({
      where: { CardID: Number(cardId) },
      data: {
        FailedAttempts: 0,
        LockedUntil: null,
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "SCRATCH_CARD_UNLOCK",
      targetTable: "Scratch_Card",
      targetId: String(card.CardID),
      reason: reason || "Bursar-assisted card unlock",
      afterState: { serial: card.SerialNumber, failedAttempts: 0 },
    });

    revalidatePath("/portal/admin/cards");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to unlock scratch card" };
  }
}

export async function getScratchCardsList(filters?: {
  termId?: number;
  status?: "all" | "unused" | "active" | "exhausted";
  search?: string;
  page?: number;
}) {
  try {
    await requireCardManager();
    const page = filters?.page || 1;
    const pageSize = 50;

    const whereClause: any = {};

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
// STUDENT: RESULT CHECKER VERIFICATION (Section 6.5)
// ==========================================

export async function verifyScratchCard(
  pin: string,
  termId: number,
  serialNumber?: string,
  isRefresh: boolean = false
) {
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

  // Section 6.4: Enforce server-side derived fee-clearance check before returning results
  const clearance = await checkStudentFeeClearance(studentId, termId);
  if (!clearance.isCleared) {
    return {
      success: false,
      error: "Tuition fee clearance is required for this academic term before checking terminal results.",
    };
  }

  const cleanPin = (pin || "").trim();
  const cleanSerial = serialNumber?.trim().toUpperCase();
  const genericError = "Invalid or locked Scratch Card credentials. Please verify your card details.";

  try {
    let card: any = null;

    if (cleanSerial) {
      card = await prisma.scratch_Card.findUnique({
        where: { SerialNumber: cleanSerial },
      });

      if (!card) {
        return { success: false, error: genericError };
      }

      if (card.LockedUntil && new Date(card.LockedUntil) > new Date()) {
        return { success: false, error: genericError };
      }

      const expectedHmac = await computeSerialPinHmac(card.SerialNumber, cleanPin, card.KeyId || CURRENT_KEY_ID);
      const legacyHmac = await hashPin(cleanPin, card.KeyId || CURRENT_KEY_ID);
      const legacySha = legacySha256Pin(cleanPin);

      const isMatch =
        timingSafeHexEquals(card.PIN_Hash, expectedHmac) ||
        timingSafeHexEquals(card.PIN_Hash, legacyHmac) ||
        timingSafeHexEquals(card.PIN_Hash, legacySha);

      if (!isMatch) {
        const nextFailures = (card.FailedAttempts || 0) + 1;
        const lockCard = nextFailures >= 5;
        await prisma.scratch_Card.update({
          where: { CardID: card.CardID },
          data: {
            FailedAttempts: nextFailures,
            LockedUntil: lockCard ? new Date(Date.now() + 15 * 60 * 1000) : card.LockedUntil,
          },
        });
        return { success: false, error: genericError };
      }
    } else {
      // Lookup by PIN hash if serial was not provided in legacy form, or match against student's already-bound active card
      const hmacPinHash = await hashPin(cleanPin);
      const sha256PinHash = legacySha256Pin(cleanPin);

      card = await prisma.scratch_Card.findFirst({
        where: {
          OR: [{ PIN_Hash: hmacPinHash }, { PIN_Hash: sha256PinHash }],
        },
      });

      if (!card) {
        // Also check recently generated cards where PIN_Hash includes serialNumber
        const candidateCards = await prisma.scratch_Card.findMany({
          where: {
            OR: [{ UsedBy: studentId }, { UsedBy: null }],
            Status: { in: ["ISSUED", "ACTIVE"] },
          },
          take: 200,
          orderBy: { CardID: "desc" },
        });

        for (const candidate of candidateCards) {
          const candidateHmac = await computeSerialPinHmac(
            candidate.SerialNumber,
            cleanPin,
            candidate.KeyId || CURRENT_KEY_ID
          );
          if (timingSafeHexEquals(candidate.PIN_Hash, candidateHmac)) {
            card = candidate;
            break;
          }
        }
      }
    }

    if (!card) {
      return { success: false, error: genericError };
    }

    if (card.LockedUntil && new Date(card.LockedUntil) > new Date()) {
      return {
        success: false,
        error: "This Scratch Card is locked for 15 minutes due to 5 failed PIN attempts. Contact the Bursar to unlock.",
      };
    }

    if (card.Status === "GENERATED" || card.Status === "REVOKED") {
      return {
        success: false,
        error: "This Scratch Card has not been activated for sale by the Bursar or has been revoked.",
      };
    }

    if (card.UsedBy !== null && card.UsedBy !== studentId) {
      return {
        success: false,
        error: "This Scratch Card is already bound to another student.",
      };
    }

    if (card.ActiveWindowExpires && new Date(card.ActiveWindowExpires) < new Date()) {
      return {
        success: false,
        error: "This Scratch Card's 30-day access window has expired. Please obtain a new card.",
      };
    }

    const incrementBy = isRefresh ? 0 : 1;
    if (!isRefresh && card.UsageCount >= card.MaxUsage) {
      return {
        success: false,
        error: `Scratch Card usage limit exceeded (Max ${card.MaxUsage} report generations per card).`,
      };
    }

    // Section 6.5 (4): Conditional atomic UPDATE binding student + term and setting 30-day accessExpiresAt
    const thirtyDaysFromNow =
      card.ActiveWindowExpires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const updated = await prisma.scratch_Card.updateMany({
      where: {
        CardID: card.CardID,
        Status: { in: ["ISSUED", "ACTIVE", "CONSUMED"] },
        OR: [{ UsedBy: null }, { UsedBy: studentId }],
        ...(isRefresh ? {} : { UsageCount: { lt: card.MaxUsage } }),
      },
      data: {
        UsedBy: studentId,
        TermID: card.TermID || termId,
        UsageCount: { increment: incrementBy },
        FailedAttempts: 0,
        LockedUntil: null,
        ActiveWindowExpires: thirtyDaysFromNow,
        Status: card.UsageCount + incrementBy >= card.MaxUsage ? "EXHAUSTED" : "ACTIVE",
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: "Scratch card could not be redeemed (already bound or usage limit reached).",
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
      afterState: {
        serial: card.SerialNumber,
        studentId,
        termId,
        usageAfter: card.UsageCount + incrementBy,
        accessExpiresAt: thirtyDaysFromNow,
      },
    });

    return {
      success: true,
      data: { results, term, student },
      message: `Card validated (${card.SerialNumber}). Remaining report checks: ${
        card.MaxUsage - (card.UsageCount + incrementBy)
      }`,
    };
  } catch (error: any) {
    console.error("verifyScratchCard error:", error);
    return { success: false, error: error.message || "Failed to verify scratch card" };
  }
}
