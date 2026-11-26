import crypto from "crypto";
import { hashTokenSha256, timingSafeCompare } from "@/lib/security";
import { normalizeCbtSubjectCode } from "@/lib/cbt-csv";

const VAULT_PREFIX = "ev:v1:";
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getExamVaultKey(): Buffer {
  const secret =
    process.env.EXAM_VAULT_SECRET ||
    process.env.TOTP_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "wofs-default-exam-vault-key-change-in-prod";
  return crypto.createHash("sha256").update(`wofs:exam-vault:v1:${secret}`).digest();
}

/**
 * Encrypts sensitive EXAM_ONLY question stems, option texts, or answer keys at rest using AES-256-GCM.
 */
export function encryptExamVaultString(plaintext: string): string {
  const raw = String(plaintext ?? "");
  if (!raw || raw.startsWith(VAULT_PREFIX)) return raw;

  const key = getExamVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VAULT_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Transparently decrypts an AES-256-GCM encrypted exam vault string,
 * or returns legacy plaintext unchanged for backward compatibility.
 */
export function decryptExamVaultString(stored: string | null | undefined): string {
  if (!stored) return "";
  const raw = String(stored);
  if (!raw.startsWith(VAULT_PREFIX)) return raw;

  try {
    const body = raw.slice(VAULT_PREFIX.length);
    const [ivHex, tagHex, cipherHex] = body.split(":");
    if (!ivHex || !tagHex || !cipherHex) return raw;
    const key = getExamVaultKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "[Encrypted Exam Content]";
  }
}

export function encryptExamOptionsJson(
  options: Array<{ key: string; text: string }>,
  shouldEncrypt: boolean
): Array<{ key: string; text: string }> {
  return options.map((opt) => ({
    key: String(opt.key || "a").toLowerCase(),
    text: shouldEncrypt ? encryptExamVaultString(opt.text) : String(opt.text || ""),
  }));
}

export function decryptExamOptionsJson(
  rawOptions: unknown
): Array<{ key: string; text: string }> {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.map((o) => {
    const item = (o && typeof o === "object" ? o : {}) as { key?: string; text?: string };
    return {
      key: String(item.key || "a").toLowerCase(),
      text: decryptExamVaultString(String(item.text || "")),
    };
  });
}

export function decryptAnswerKeyValue(rawKey: string | null | undefined): "a" | "b" | "c" | "d" {
  const dec = decryptExamVaultString(rawKey).toLowerCase().trim();
  return (["a", "b", "c", "d"].includes(dec) ? dec : "a") as "a" | "b" | "c" | "d";
}

/**
 * Normalizes a subject examination room code for comparison (strips spaces, uppercase).
 */
export function normalizeRoomCode(code: string | null | undefined): string {
  return String(code ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function buildSubjectPrefix(subjectCode: string): string {
  const clean = normalizeCbtSubjectCode(subjectCode).toUpperCase();
  const consonants = clean.replace(/[AEIOU]/g, "");
  const base = (consonants.length >= 3 ? consonants : clean).slice(0, 3);
  return base.padEnd(3, "X");
}

/**
 * Generates a unique, human-readable morning examination room code for a specific subject,
 * e.g. "MTH-7K4P-WOF", along with a safe masked preview "MTH-****-WOF".
 */
export function generateSubjectExamRoomCode(subjectCode: string): {
  plainCode: string;
  codePreview: string;
} {
  const prefix = buildSubjectPrefix(subjectCode);
  const bytes = crypto.randomBytes(6);
  let middle = "";
  for (let i = 0; i < 6; i++) {
    middle += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return {
    plainCode: `${prefix}-${middle}-WOF`,
    codePreview: `${prefix}-****${middle.slice(-2)}-WOF`,
  };
}

/**
 * Cryptographically binds an exam room code to both the specific `scheduledExamId` and `subjectCode`
 * so a code generated for one subject or examination can never unlock another paper.
 */
export function hashSubjectExamRoomCode(
  scheduledExamId: string,
  subjectCode: string,
  plainCode: string
): string {
  const normCode = normalizeRoomCode(plainCode);
  const normSubj = normalizeCbtSubjectCode(subjectCode);
  if (!normCode || normCode.length < 4) {
    throw new Error("Examination room code must be at least 4 characters.");
  }
  const pepper = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "wofs-exam-room-code-v1";
  return hashTokenSha256(`${pepper}:ROOM_CODE:${scheduledExamId}:${normSubj}:${normCode}`);
}

/**
 * Validates an examination room code against its bound exam, subject, active status, and time window.
 */
export function verifySubjectExamRoomCode(params: {
  scheduledExamId: string;
  subjectCode: string;
  candidateCode: string | null | undefined;
  expectedHash: string;
  isActive: boolean;
  activatesAt?: Date | string | null;
  expiresAt?: Date | string | null;
  now?: Date;
}): { valid: boolean; reason?: string } {
  const now = params.now || new Date();
  if (!params.isActive) {
    return {
      valid: false,
      reason: "This examination room code has been deactivated or replaced by the Exam Officer.",
    };
  }

  if (params.activatesAt) {
    const act = new Date(params.activatesAt);
    if (!Number.isNaN(act.getTime()) && now < act) {
      return {
        valid: false,
        reason: `This room code is not active until ${act.toLocaleTimeString("en-NG", {
          timeZone: "Africa/Lagos",
          hour: "2-digit",
          minute: "2-digit",
        })}.`,
      };
    }
  }

  if (params.expiresAt) {
    const exp = new Date(params.expiresAt);
    if (!Number.isNaN(exp.getTime()) && now > exp) {
      return {
        valid: false,
        reason: "This examination room code has expired.",
      };
    }
  }

  const normCandidate = normalizeRoomCode(params.candidateCode);
  if (!normCandidate || normCandidate.length < 4) {
    return { valid: false, reason: "Please enter a valid examination room code." };
  }

  const candidateHash = hashSubjectExamRoomCode(
    params.scheduledExamId,
    params.subjectCode,
    normCandidate
  );

  if (!timingSafeCompare(candidateHash, params.expectedHash)) {
    return {
      valid: false,
      reason: "Invalid examination room code for this subject.",
    };
  }

  return { valid: true };
}

/**
 * Pure state-machine validator for Teacher Question Submissions & Single-Tier Exam Officer Approval.
 * Guarantees:
 * 1. `initialSubmittedAt` is set on the first submission and NEVER overwritten by later edits/resubmissions.
 * 2. Separation of Duties: an author can NEVER review, approve, reject, or request revision on their own submission.
 */
export function computeSubmissionTransition(params: {
  currentStatus:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "REVISION_REQUESTED"
    | "APPROVED"
    | "REJECTED";
  currentInitialSubmittedAt: Date | null;
  currentRevisionNumber: number;
  action: "SUBMIT" | "OPEN_REVIEW" | "APPROVE" | "REQUEST_REVISION" | "REJECT";
  actorId: number;
  teacherId: number;
  questionCount: number;
  now?: Date;
}): {
  nextStatus:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "REVISION_REQUESTED"
    | "APPROVED"
    | "REJECTED";
  initialSubmittedAt: Date | null;
  nextRevisionNumber: number;
  revisionActionLabel: string;
} {
  const now = params.now || new Date();

  if (params.action === "SUBMIT") {
    if (params.currentStatus !== "DRAFT" && params.currentStatus !== "REVISION_REQUESTED") {
      throw new Error(
        `Cannot submit packet while status is ${params.currentStatus}. Wait for Exam Officer review.`
      );
    }
    if (params.questionCount < 1) {
      throw new Error("Attach at least 1 question before submitting to the Exam Officer.");
    }
    const isResubmit = params.currentInitialSubmittedAt !== null;
    return {
      nextStatus: "SUBMITTED",
      initialSubmittedAt: params.currentInitialSubmittedAt ?? now,
      nextRevisionNumber: isResubmit
        ? params.currentRevisionNumber + 1
        : params.currentRevisionNumber,
      revisionActionLabel: isResubmit ? "RESUBMITTED" : "SUBMITTED",
    };
  }

  // All review decisions enforce Separation of Duties
  if (params.actorId === params.teacherId) {
    throw new Error(
      "SEPARATION_OF_DUTIES_VIOLATION: You cannot review, approve, or reject an examination question submission that you authored yourself."
    );
  }

  if (params.action === "OPEN_REVIEW") {
    return {
      nextStatus:
        params.currentStatus === "SUBMITTED" ? "UNDER_REVIEW" : params.currentStatus,
      initialSubmittedAt: params.currentInitialSubmittedAt,
      nextRevisionNumber: params.currentRevisionNumber,
      revisionActionLabel: "UNDER_REVIEW",
    };
  }

  if (params.action === "APPROVE") {
    if (
      params.currentStatus !== "SUBMITTED" &&
      params.currentStatus !== "UNDER_REVIEW"
    ) {
      throw new Error(
        `Only SUBMITTED or UNDER_REVIEW packets can be approved (current: ${params.currentStatus}).`
      );
    }
    if (params.questionCount < 1) {
      throw new Error("Cannot approve an empty question submission.");
    }
    return {
      nextStatus: "APPROVED",
      initialSubmittedAt: params.currentInitialSubmittedAt ?? now,
      nextRevisionNumber: params.currentRevisionNumber,
      revisionActionLabel: "APPROVED",
    };
  }

  if (params.action === "REQUEST_REVISION") {
    return {
      nextStatus: "REVISION_REQUESTED",
      initialSubmittedAt: params.currentInitialSubmittedAt,
      nextRevisionNumber: params.currentRevisionNumber,
      revisionActionLabel: "REVISION_REQUESTED",
    };
  }

  return {
    nextStatus: "REJECTED",
    initialSubmittedAt: params.currentInitialSubmittedAt,
    nextRevisionNumber: params.currentRevisionNumber,
    revisionActionLabel: "REJECTED",
  };
}
