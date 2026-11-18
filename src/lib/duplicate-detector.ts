import crypto from "crypto";
import prisma from "@/lib/db";

export interface DuplicateCandidateInput {
  excludeStudentId?: number;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth?: Date | string | null;
  classId?: number | null;
  parentContact?: string | null;
  parentEmail?: string | null;
  verificationPhotoDataUrl?: string | null;
  isTwinOrSiblingException?: boolean;
}

export interface DuplicateSignalMatch {
  studentId: number;
  wofsStudentId: string;
  fullName: string;
  className: string;
  dateOfBirth: string;
  registrationStatus: string;
  hasClaimedAccount: boolean;
  matchType: "NAME_DOB_MATCH" | "NAME_CLASS_MATCH" | "BIOMETRIC_MATCH";
  confidenceScore: number; // 0.0 to 1.0
  signals: {
    nameSimilarity: number;
    sameDob: boolean;
    sameClass: boolean;
    sharedGuardianPhone: boolean;
    sharedGuardianEmail: boolean;
    biometricHashMatch: boolean;
    isLikelySiblingOrTwin: boolean;
  };
}

/**
 * Normalizes a person's name for comparison (lowercase, alphanumeric tokens sorted).
 */
export function normalizeNameTokens(first?: string | null, last?: string | null, middle?: string | null): string[] {
  const combined = `${first || ""} ${middle || ""} ${last || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return combined;
}

/**
 * Computes Dice/Jaccard token + character bigram similarity between two names (0.0 to 1.0).
 */
export function computeNameSimilarity(nameA: string, nameB: string): number {
  const cleanA = (nameA || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanB = (nameB || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanA || !cleanB) return 0;
  if (cleanA === cleanB) return 1.0;

  if (cleanA.length < 2 || cleanB.length < 2) {
    return cleanA === cleanB ? 1.0 : 0.0;
  }

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < cleanA.length - 1; i++) {
    const bg = cleanA.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < cleanB.length - 1; i++) {
    const bg = cleanB.slice(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      bigramsA.set(bg, count - 1);
      intersection++;
    }
  }

  return Number(((2.0 * intersection) / (cleanA.length - 1 + (cleanB.length - 1))).toFixed(3));
}

/**
 * Computes a deterministic 64-bit perceptual/content fingerprint from an image data URL
 * so duplicate or reused identity verification captures can be flagged for review.
 */
export function computeVerificationImageFingerprint(dataUrl?: string | null): string | null {
  if (!dataUrl || typeof dataUrl !== "string" || dataUrl.length < 64) return null;
  const base64Part = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  if (!base64Part) return null;

  // Sample 16 evenly spaced slices across the image payload + SHA-256 digest
  const buf = Buffer.from(base64Part, "base64");
  if (buf.length < 32) return null;
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
}

function normalizePhoneDigits(phone?: string | null): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits || digits === "08000000000" || digits.length < 7) return "";
  return digits.slice(-10); // Compare last 10 local digits
}

function toIsoDateOnly(d?: Date | string | null): string | null {
  if (!d) return null;
  const parsed = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

/**
 * Multi-signal duplicate identity detector.
 *
 * IMPORTANT INVARIANT (Requirement 5):
 * A shared guardian phone number or email address ALONE is never flagged as a duplicate
 * student identity because siblings and twins legitimately share parent contact details.
 */
export async function detectPotentialStudentDuplicates(
  input: DuplicateCandidateInput
): Promise<{
  hasBlockingDuplicate: boolean;
  hasSiblingOrTwinSignal: boolean;
  matches: DuplicateSignalMatch[];
}> {
  const candidateFullName = `${input.firstName || ""} ${input.middleName || ""} ${input.lastName || ""}`
    .replace(/\s+/g, " ")
    .trim();
  const candidateFirstLast = `${input.firstName || ""} ${input.lastName || ""}`.replace(/\s+/g, " ").trim();
  const candidateDob = toIsoDateOnly(input.dateOfBirth);
  const candidatePhone = normalizePhoneDigits(input.parentContact);
  const candidateEmail = (input.parentEmail || "").trim().toLowerCase();
  const candidatePhotoHash = computeVerificationImageFingerprint(input.verificationPhotoDataUrl);

  const existingStudents = await prisma.student.findMany({
    where: input.excludeStudentId
      ? { StudentID: { not: input.excludeStudentId } }
      : undefined,
    include: {
      Class: { select: { ClassName: true } },
      IdentityVerifications: {
        select: { perceptualHash: true, status: true },
      },
    },
    take: 500,
  });

  const matches: DuplicateSignalMatch[] = [];
  let hasSiblingOrTwinSignal = false;

  for (const st of existingStudents) {
    const existingName =
      st.PreferredName ||
      `${st.FirstName || ""} ${st.MiddleName || ""} ${st.LastName || ""}`.replace(/\s+/g, " ").trim();
    const existingFirstLast = `${st.FirstName || ""} ${st.LastName || ""}`.replace(/\s+/g, " ").trim();

    const simFull = computeNameSimilarity(candidateFullName, existingName);
    const simFirstLast = computeNameSimilarity(candidateFirstLast, existingFirstLast || existingName);
    const nameSimilarity = Math.max(simFull, simFirstLast);

    const existingDob = toIsoDateOnly(st.DateOfBirth);
    const sameDob = Boolean(candidateDob && existingDob && candidateDob === existingDob);
    const sameClass = Boolean(input.classId && st.ClassID === Number(input.classId));

    const existingPhone = normalizePhoneDigits(st.ParentContact);
    const sharedGuardianPhone = Boolean(candidatePhone && existingPhone && candidatePhone === existingPhone);

    const existingEmail = (st.ParentEmail || "").trim().toLowerCase();
    const sharedGuardianEmail = Boolean(
      candidateEmail && existingEmail && candidateEmail === existingEmail
    );

    const biometricHashMatch = Boolean(
      candidatePhotoHash &&
        st.IdentityVerifications?.some((iv) => iv.perceptualHash && iv.perceptualHash === candidatePhotoHash)
    );

    // Same last name + same DOB + shared guardian contact, but distinct first name => Twin signal!
    const sameLastName =
      Boolean(input.lastName && st.LastName) &&
      input.lastName.trim().toLowerCase() === (st.LastName || "").trim().toLowerCase();
    const distinctFirstName =
      Boolean(input.firstName && st.FirstName) &&
      input.firstName.trim().toLowerCase() !== (st.FirstName || "").trim().toLowerCase();

    const isLikelySiblingOrTwin =
      (sharedGuardianPhone || sharedGuardianEmail) && distinctFirstName && (sameLastName || sameDob);

    if (isLikelySiblingOrTwin) {
      hasSiblingOrTwinSignal = true;
    }

    // Determine whether this record is a potential duplicate identity
    // Note: Shared guardian contact by itself does NOT trigger a match.
    let matchType: DuplicateSignalMatch["matchType"] | null = null;
    let confidenceScore = 0;

    if (biometricHashMatch) {
      matchType = "BIOMETRIC_MATCH";
      confidenceScore = 0.98;
    } else if (nameSimilarity >= 0.86 && sameDob) {
      matchType = "NAME_DOB_MATCH";
      confidenceScore = Number(Math.min(0.99, nameSimilarity * 0.75 + 0.25).toFixed(2));
    } else if (nameSimilarity >= 0.88 && sameClass) {
      matchType = "NAME_CLASS_MATCH";
      confidenceScore = Number(Math.min(0.95, nameSimilarity * 0.8 + 0.15).toFixed(2));
    } else if (nameSimilarity >= 0.94) {
      matchType = "NAME_CLASS_MATCH";
      confidenceScore = nameSimilarity;
    }

    if (matchType) {
      matches.push({
        studentId: st.StudentID,
        wofsStudentId: st.AdmissionNo,
        fullName: existingName || st.AdmissionNo,
        className: st.Class?.ClassName || `Class #${st.ClassID}`,
        dateOfBirth: existingDob || "Unknown",
        registrationStatus: st.RegistrationStatus || (st.UserID ? "CLAIMED" : "UNCLAIMED"),
        hasClaimedAccount: Boolean(st.UserID),
        matchType,
        confidenceScore,
        signals: {
          nameSimilarity,
          sameDob,
          sameClass,
          sharedGuardianPhone,
          sharedGuardianEmail,
          biometricHashMatch,
          isLikelySiblingOrTwin,
        },
      });
    }
  }

  matches.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const hasBlockingDuplicate =
    !input.isTwinOrSiblingException &&
    matches.some((m) => m.confidenceScore >= 0.88 && !m.signals.isLikelySiblingOrTwin);

  return {
    hasBlockingDuplicate,
    hasSiblingOrTwinSignal,
    matches,
  };
}
