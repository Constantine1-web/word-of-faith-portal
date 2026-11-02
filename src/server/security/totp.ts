import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generates a 20-byte random Base32 TOTP secret (RFC 6238 / Google Authenticator compatible).
 */
export function generateTotpSecret(): string {
    const bytes = crypto.randomBytes(20);
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

function decodeBase32(secret: string): Buffer {
    const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
    let bits = 0;
    let value = 0;
    const out: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
        const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/**
 * Computes a 6-digit RFC 6238 TOTP code for a given Base32 secret and time step.
 */
export function computeTotpCode(secret: string, timestampMs: number = Date.now(), stepSec: number = 30): string {
    const key = decodeBase32(secret);
    const counter = Math.floor(timestampMs / 1000 / stepSec);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    const otp = binary % 1_000_000;
    return String(otp).padStart(6, "0");
}

/**
 * Verifies a 6-digit TOTP code allowing +/- 1 time window (30s drift tolerance).
 */
export function verifyTotpCode(secret: string, token: string, timestampMs: number = Date.now()): boolean {
    const cleanToken = String(token || "").trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    for (const drift of [-1, 0, 1]) {
        const expected = computeTotpCode(secret, timestampMs + drift * 30_000);
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(cleanToken, "utf8");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return true;
        }
    }
    return false;
}

/**
 * Builds an otpauth:// URI for authenticator apps (Google Authenticator, Authy, 1Password).
 */
export function buildOtpAuthUri(email: string, secret: string, issuer: string = "WordOfFaithSchools"): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates 8 single-use recovery codes and their SHA-256 hashes.
 */
export function generateRecoveryCodes(): { plainCodes: string[]; codeHashes: string[] } {
    const plainCodes: string[] = [];
    const codeHashes: string[] = [];

    for (let i = 0; i < 8; i++) {
        const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
        const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
        plainCodes.push(formatted);
        codeHashes.push(crypto.createHash("sha256").update(formatted).digest("hex"));
    }

    return { plainCodes, codeHashes };
}
