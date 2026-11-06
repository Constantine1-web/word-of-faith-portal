import crypto from "crypto";
import { z, ZodSchema } from "zod";
import redis from "../redis";
import { rateLimit } from "../rateLimit";

/**
 * Explicit Prisma User selector that NEVER exposes PasswordHash, TotpSecret, or TotpBackupCodes.
 */
export const SAFE_USER_SELECT = {
  UserID: true,
  Email: true,
  RoleID: true,
  IsActive: true,
  Capabilities: true,
  TotpEnabled: true,
  CreatedAt: true,
} as const;

/**
 * Recursively strips PasswordHash, TotpSecret, TotpBackupCodes, TokenVersion, FailedLoginAttempts, and LockedUntil from any serialized object.
 */
export function stripSensitiveUserFields<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== "object") {
    return input;
  }
  if (input instanceof Date) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveUserFields(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (
      key === "PasswordHash" ||
      key === "TotpSecret" ||
      key === "TotpBackupCodes" ||
      key === "TokenVersion" ||
      key === "FailedLoginAttempts" ||
      key === "LockedUntil"
    ) {
      continue;
    }
    copy[key] = stripSensitiveUserFields(val);
  }
  return copy as T;
}

/**
 * Escapes HTML special characters to prevent HTML/XSS injection in email templates.
 */
export function escapeHtml(unsafe: unknown): string {
  const str = String(unsafe ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Strips CR/LF characters from email headers/subjects to prevent SMTP header injection.
 */
export function sanitizeEmailHeader(headerVal: unknown, maxLen: number = 180): string {
  return String(headerVal ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) on CSV/XLSX/PDF imported text.
 */
export function sanitizeFormulaCell(value: unknown, maxLen: number = 200): string {
  const raw = String(value ?? "").slice(0, maxLen);
  if (/^\s*[=+\-@\t\r]/.test(raw)) {
    return `'${raw}`;
  }
  return raw.trim();
}

/**
 * Cryptographically secure 6-digit OTP generator using Node CSPRNG (crypto.randomInt).
 */
export function generateSecureOtp6(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes SHA-256 hex digest of a token/OTP for at-rest storage.
 */
export function hashTokenSha256(token: string): string {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
}

/**
 * Constant-time string comparison using crypto.timingSafeEqual.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Derives a 32-byte AES-256-GCM key for encrypting TOTP secrets at rest.
 */
function getTotpEncryptionKey(): Buffer {
  const rawKey =
    process.env.TOTP_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "dev-only-totp-key-do-not-use-in-prod-2026" : "");

  if (!rawKey) {
    throw new Error("SERVER_MISCONFIGURED: TOTP_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set.");
  }
  return crypto.createHash("sha256").update(`wof-totp-aes256gcm:${rawKey}`).digest();
}

/**
 * Encrypts a Base32 TOTP secret using AES-256-GCM before storing in User.TotpSecret.
 * Format: enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
export function encryptTotpSecret(plainBase32: string): string {
  if (!plainBase32 || plainBase32.startsWith("enc:v1:")) {
    return plainBase32;
  }
  const key = getTotpEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a stored User.TotpSecret (supports both AES-256-GCM enc:v1:... and legacy Base32 secrets).
 */
export function decryptTotpSecret(storedSecret: string | null | undefined): string {
  if (!storedSecret) return "";
  if (!storedSecret.startsWith("enc:v1:")) {
    return storedSecret;
  }
  const parts = storedSecret.split(":");
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted TOTP secret format.");
  }
  const [, , ivHex, tagHex, cipherHex] = parts;
  const key = getTotpEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Prevents TOTP code replay within its 90-second acceptance window.
 * Returns true if the code is fresh and marks it used; returns false if already used.
 */
export async function claimTotpCodeSingleUse(userId: number, code: string): Promise<boolean> {
  const cleanCode = String(code || "").trim();
  const key = `totp:used:${userId}:${hashTokenSha256(cleanCode)}`;
  const existing = await redis.get(key);
  if (existing) {
    return false;
  }
  await redis.setex(key, 95, "1");
  return true;
}

/**
 * Records a server-side Step-Up TOTP verification grant in Redis.
 */
export async function grantStepUpSession(
  userId: number,
  actionOrTtl: string | number = 600,
  ttlSeconds: number = 600
): Promise<string> {
  const verifiedAt = new Date().toISOString();
  const effectiveTtl = typeof actionOrTtl === "number" ? actionOrTtl : ttlSeconds;
  await redis.setex(`stepup:verified:${userId}`, effectiveTtl, verifiedAt);
  return verifiedAt;
}

/**
 * Checks whether the actor has a valid server-side Step-Up TOTP grant.
 */
export async function hasValidStepUpSession(userId: number, _actionName?: string): Promise<boolean> {
  const val = await redis.get(`stepup:verified:${userId}`);
  return Boolean(val);
}

/**
 * Enforces Step-Up TOTP server-side if the actor has TotpEnabled.
 */
export async function requireStepUpIfTotpEnabled(
  userId: number,
  actionOrTotpEnabled?: string | boolean | null,
  actionLabel?: string
): Promise<void> {
  let totpEnabled: boolean;
  let label: string;
  if (typeof actionOrTotpEnabled === "boolean") {
    totpEnabled = actionOrTotpEnabled;
    label = actionLabel || "this sensitive operation";
  } else {
    label = typeof actionOrTotpEnabled === "string" ? actionOrTotpEnabled : actionLabel || "this sensitive operation";
    const prisma = (await import("../db")).default;
    const u = await prisma.user.findUnique({
      where: { UserID: userId },
      select: { TotpEnabled: true },
    });
    totpEnabled = Boolean(u?.TotpEnabled);
  }

  if (!totpEnabled) return;
  const valid = await hasValidStepUpSession(userId, label);
  if (!valid) {
    throw new Error(
      `STEP_UP_2FA_REQUIRED: Please verify your 6-digit Authenticator / 2FA code before performing ${label}.`
    );
  }
}

/**
 * Tracks failed OTP attempts per email/type and returns whether the token has exceeded max attempts (5).
 */
export async function incrementOtpAttemptAndCheckLocked(
  email: string,
  type: string,
  maxAttempts: number = 5,
  windowSeconds: number = 900
): Promise<{ locked: boolean; attempts: number }> {
  const key = `otp:attempts:${type}:${email.toLowerCase().trim()}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, windowSeconds);
  }
  return { locked: attempts >= maxAttempts, attempts };
}

export async function clearOtpAttempts(email: string, type: string): Promise<void> {
  const key = `otp:attempts:${type}:${email.toLowerCase().trim()}`;
  await redis.del(key);
}

/**
 * Validates input against a Zod schema and throws a clean validation error.
 */
export function validateInput<T>(schema: ZodSchema<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid request input.");
  }
  return parsed.data;
}

/**
 * Formats an error safely for client responses without leaking Prisma/SQL internals.
 */
export function safeErrorMessage(error: unknown, fallbackMessage: string = "An unexpected error occurred."): string {
  if (!(error instanceof Error)) return fallbackMessage;
  const msg = error.message || "";
  // Mask raw Prisma, database, or filesystem errors
  if (
    msg.includes("PrismaClient") ||
    msg.includes("Invalid `prisma.") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("postgres://") ||
    msg.includes("postgresql://")
  ) {
    return fallbackMessage;
  }
  return msg || fallbackMessage;
}

export { rateLimit };
export { z };
