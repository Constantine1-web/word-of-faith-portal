import crypto from "crypto";

function resolveQrVerifySecret(): string {
  const configured =
    process.env.QR_VERIFY_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL: QR_VERIFY_SECRET or NEXTAUTH_SECRET must be set in production.");
  }
  return "wofs-dev-qr-verify-secret-local-only-2026";
}

/**
 * Generates a compact 22-char base64url HMAC-SHA256 verification signature for a WOFS Student ID.
 * Prevents unauthenticated sequential ID enumeration on `/verify/student/[wofsId]`.
 */
export function signStudentVerificationToken(wofsId: string): string {
  const normalized = String(wofsId || "").trim().toUpperCase();
  const hmac = crypto
    .createHmac("sha256", resolveQrVerifySecret())
    .update(`wofs:qr:v1:${normalized}`)
    .digest("base64url");
  return hmac.slice(0, 22);
}

/**
 * Verifies a QR verification signature in constant time.
 */
export function verifyStudentVerificationToken(
  wofsId: string,
  providedSig?: string | null
): boolean {
  if (!wofsId || !providedSig) return false;
  const expected = signStudentVerificationToken(wofsId);
  const clean = String(providedSig).trim();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(clean, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildSignedStudentVerifyUrl(origin: string, wofsId: string, sig: string): string {
  const cleanOrigin = origin.replace(/\/$/, "");
  const encodedPath = String(wofsId || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${cleanOrigin}/verify/student/${encodedPath}?sig=${encodeURIComponent(sig)}`;
}
