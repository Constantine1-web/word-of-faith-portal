import crypto from "crypto";
import prisma from "@/lib/db";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Normalizes a human-entered WOFS Student ID or Invitation Code.
 */
export function normalizeWofsCode(raw: string): string {
  return (raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Checks whether an identifier follows the canonical WOFS Student ID format:
 * WOFS-STU-YYYY-NNNNNN (e.g. WOFS-STU-2026-000001)
 */
export function isWofsStudentIdFormat(value: string): boolean {
  return /^WOFS-STU-\d{4}-\d{6}$/i.test((value || "").trim());
}

/**
 * Formats a year and sequence integer into a canonical WOFS Student ID.
 */
export function formatWofsStudentId(year: number, sequenceNumber: number): string {
  const safeYear = Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
  const paddedSeq = Math.max(1, sequenceNumber).toString().padStart(6, "0");
  return `WOFS-STU-${safeYear}-${paddedSeq}`;
}

/**
 * Resolves the active academic session start year (e.g., "2026/2027" -> 2026).
 */
export async function resolveActiveAcademicYear(tx: any = prisma): Promise<number> {
  try {
    const activeTerm = await tx.academic_Term.findFirst({
      where: { IsActive: true },
      select: { SessionName: true },
    });
    if (activeTerm?.SessionName) {
      const match = activeTerm.SessionName.match(/(20\d{2})/);
      if (match) return parseInt(match[1], 10);
    }
  } catch {
    // Fallback to current calendar year
  }
  return new Date().getFullYear();
}

/**
 * Transactionally generates the next unique, permanent WOFS Student ID:
 *   WOFS-STU-2026-000001
 *   WOFS-STU-2026-000002
 *
 * Uses the StudentSequence table with atomic upsert/increment inside the caller's
 * Prisma transaction (`tx`) and verifies zero collision against existing Student rows.
 */
export async function generateNextWofsStudentId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any = prisma,
  explicitYear?: number
): Promise<string> {
  const year = explicitYear || (await resolveActiveAcademicYear(tx));

  // Ensure StudentSequence is initialized to at least the highest existing sequence for this year
  const existingSeq = await tx.studentSequence.findUnique({
    where: { year },
  });

  if (!existingSeq) {
    const prefix = `WOFS-STU-${year}-`;
    const latestStudent = await tx.student.findFirst({
      where: {
        AdmissionNo: {
          startsWith: prefix,
        },
      },
      orderBy: {
        AdmissionNo: "desc",
      },
      select: { AdmissionNo: true },
    });

    let highestExisting = 0;
    if (latestStudent?.AdmissionNo) {
      const tail = latestStudent.AdmissionNo.slice(prefix.length);
      const parsed = parseInt(tail, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        highestExisting = parsed;
      }
    } else {
      // Also consider total student count so sequence starts cleanly
      const totalCount = await tx.student.count();
      highestExisting = totalCount;
    }

    await tx.studentSequence
      .upsert({
        where: { year },
        create: { year, lastValue: highestExisting },
        update: {},
      })
      .catch(() => {});
  }

  // Loop until we mint an unused ID (guarantees zero collision even with legacy data)
  for (let attempt = 0; attempt < 25; attempt++) {
    const updated = await tx.studentSequence.upsert({
      where: { year },
      create: { year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });

    const candidateId = formatWofsStudentId(year, updated.lastValue);
    const conflict = await tx.student.findUnique({
      where: { AdmissionNo: candidateId },
      select: { StudentID: true },
    });

    if (!conflict) {
      return candidateId;
    }
  }

  throw new Error("Unable to allocate a unique WOFS Student ID after multiple attempts.");
}

/**
 * Generates a cryptographically random, single-use Student Registration Invitation:
 * - `plainCode`: Human-friendly slip code e.g. `WOFS-INV-8K4P9M2X`
 * - `plainToken`: 256-bit URL-safe token for direct link claiming
 * - `codeHash`: SHA-256(normalized plainCode)
 * - `tokenHash`: SHA-256(plainToken)
 * - `maskedCode`: e.g. `WOFS-INV-****9M2X`
 */
export function generateStudentInvitationSecrets() {
  const bytes = crypto.randomBytes(8);
  let body = "";
  for (let i = 0; i < 8; i++) {
    body += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  const plainCode = `WOFS-INV-${body}`;
  const maskedCode = `WOFS-INV-****${body.slice(4)}`;
  const plainToken = crypto.randomBytes(32).toString("base64url");

  const codeHash = crypto.createHash("sha256").update(plainCode).digest("hex");
  const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");

  return {
    plainCode,
    maskedCode,
    plainToken,
    codeHash,
    tokenHash,
  };
}

/**
 * Generates a human-readable reference code for manual verification requests:
 * e.g. `WOFS-MVR-2026-7F3K9A`
 */
export function generateManualVerificationRef(): string {
  const year = new Date().getFullYear();
  const bytes = crypto.randomBytes(6);
  let tail = "";
  for (let i = 0; i < 6; i++) {
    tail += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return `WOFS-MVR-${year}-${tail}`;
}
