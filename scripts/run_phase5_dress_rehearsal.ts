import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  PORTAL_ICT_SERVICE_FEE_KOBO,
  allocateTermPaymentKobo,
  computePaystackConvenienceFeeKobo,
  computeTermInvoiceTotals,
  computeReversalAllocationKobo,
} from "../src/lib/fee-split";
import { validateReceiptBinary } from "../src/lib/payment-ledger";
import {
  signStudentVerificationToken,
  verifyStudentVerificationToken,
} from "../src/lib/qr-verify";
import {
  escapeHtml,
  sanitizeEmailHeader,
  encryptTotpSecret,
  decryptTotpSecret,
} from "../src/lib/security";
import {
  gradeFor,
  computeSubjectStats,
  computeBroadsheetRankings,
  WAEC_SECONDARY_BANDS,
} from "../src/server/domain/grading";
import {
  resolveActorCapabilities,
  assertSeparationOfDuties,
} from "../src/server/security/capabilities";
import {
  generateTotpSecret,
  computeTotpCode,
  verifyTotpCode,
} from "../src/server/security/totp";
import { computeSerialPinHmac } from "../src/app/actions/scratchCards";
import { performBackup } from "../src/scripts/backup";

async function main() {
  console.log("=== PHASE 5 END-TO-END DRESS REHEARSAL SUITE ===\n");

  // 1. Model A ₦800/Term ICT Fee, Paystack Option A Convenience Fee & Scholarship Non-Exemption
  console.log("1. Verifying Model A ₦800/Term ICT Fee, Gateway Option A, Waivers & Reversals...");
  const invNormal = computeTermInvoiceTotals({
    tuitionKobo: BigInt(6_500_000), // ₦65,000
    leviesKobo: BigInt(0),
    isSchoolFeesWaived: false,
  });
  assert.equal(invNormal.portalFeeKobo, PORTAL_ICT_SERVICE_FEE_KOBO);
  assert.equal(invNormal.schoolSubtotalKobo, BigInt(6_500_000));
  assert.equal(invNormal.totalInvoiceKobo, BigInt(6_580_000));

  // Partial installment #1 (₦30,000) -> ₦800 Provider, ₦29,200 School
  const part1 = allocateTermPaymentKobo({
    grossPrincipalPaidKobo: BigInt(3_000_000),
    targetPortalFeeKobo: PORTAL_ICT_SERVICE_FEE_KOBO,
    alreadyAllocatedPortalFeeKobo: BigInt(0),
    gatewayFeeKobo: computePaystackConvenienceFeeKobo(BigInt(3_000_000)),
  });
  assert.equal(part1.providerShareNaira, 800);
  assert.equal(part1.schoolShareNaira, 29200);
  assert.equal(part1.remainingPortalFeeAfterKobo, BigInt(0));
  assert(part1.gatewayFeeKobo > BigInt(0), "Paystack Option A convenience surcharge must be added");

  // Partial installment #2 (₦35,800) same term -> ₦0 Provider, ₦35,800 (100%) School
  const part2 = allocateTermPaymentKobo({
    grossPrincipalPaidKobo: BigInt(3_580_000),
    targetPortalFeeKobo: PORTAL_ICT_SERVICE_FEE_KOBO,
    alreadyAllocatedPortalFeeKobo: PORTAL_ICT_SERVICE_FEE_KOBO,
    gatewayFeeKobo: BigInt(0),
  });
  assert.equal(part2.providerShareNaira, 0);
  assert.equal(part2.schoolShareNaira, 35800);

  // Scholarship / 100% Tuition Waiver -> School Fees ₦0, ICT Fee ₦800 still due
  const waivedInv = computeTermInvoiceTotals({
    tuitionKobo: BigInt(6_500_000),
    leviesKobo: BigInt(500_000),
    isSchoolFeesWaived: true,
  });
  assert.equal(waivedInv.schoolSubtotalKobo, BigInt(0));
  assert.equal(waivedInv.portalFeeKobo, PORTAL_ICT_SERVICE_FEE_KOBO);
  assert.equal(waivedInv.totalInvoiceKobo, BigInt(80_000));

  // Refund / Reversal math
  const rev = computeReversalAllocationKobo({
    paymentPrincipalKobo: part1.grossPrincipalPaidKobo,
    creditedSchoolKobo: part1.schoolShareKobo,
    creditedProviderKobo: part1.providerShareKobo,
    gatewayFeeKobo: part1.gatewayFeeKobo,
  });
  assert.equal(rev.providerShareKobo, -BigInt(80_000));
  assert.equal(rev.schoolShareKobo, -BigInt(2_920_000));

  // Signed QR & Binary Receipt Magic-Byte Checks
  const qrSig = signStudentVerificationToken("WOFS-STU-2026-000001");
  assert.equal(verifyStudentVerificationToken("WOFS-STU-2026-000001", qrSig), true);
  assert.equal(verifyStudentVerificationToken("WOFS-STU-2026-000002", qrSig), false);
  assert.equal(validateReceiptBinary(Buffer.from("%PDF-1.4\n%test"), "application/pdf").valid, true);
  assert.equal(validateReceiptBinary(Buffer.from("<html><script>1</script>"), "application/pdf").valid, false);
  console.log("   ✔ Model A ₦800/term, Option A gateway fee, waivers, reversals, QR HMAC & magic bytes verified.");

  // 2. Email Security, Header Sanitization & SMTP Configuration Readiness
  console.log("2. Verifying Email Subsystem & Notification Sanitization...");
  const escaped = escapeHtml(`<script>alert("xss")</script> & 'Student'`);
  assert(!escaped.includes("<script>"));
  const cleanHdr = sanitizeEmailHeader("Parent@example.com\r\nBcc: attacker@evil.com", 160);
  assert(!cleanHdr.includes("\r") && !cleanHdr.includes("\n"));
  const hasEmailTransport = Boolean(
    process.env.RESEND_API_KEY?.trim() ||
      (process.env.SMTP_USER?.trim() && (process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim()))
  );
  console.log(`   ✔ Email sanitization verified (Active Transport Configured: ${hasEmailTransport}).`);

  // 3. Full Term Academic & Security Workflow Simulation
  console.log("3. Simulating Full Term Academic, Broadsheet, Scratch Card & RBAC Lifecycle...");
  assert.equal(gradeFor(750, WAEC_SECONDARY_BANDS).grade, "A1");
  assert.equal(gradeFor(745, WAEC_SECONDARY_BANDS).grade, "B2");
  const stats = computeSubjectStats([800, 700, 700, 500]);
  assert.equal(stats.highestTenths, 800);
  assert.equal(stats.lowestTenths, 500);

  const ranks = computeBroadsheetRankings([
    { studentId: 1, enteredSubjectTotalsTenths: [820, 820], isWithdrawn: false, hasPendingSubject: false },
    { studentId: 2, enteredSubjectTotalsTenths: [760, 760], isWithdrawn: false, hasPendingSubject: false },
    { studentId: 3, enteredSubjectTotalsTenths: [760, 760], isWithdrawn: false, hasPendingSubject: false },
    { studentId: 4, enteredSubjectTotalsTenths: [610, 610], isWithdrawn: false, hasPendingSubject: false },
    { studentId: 5, enteredSubjectTotalsTenths: [900, 900], isWithdrawn: true, hasPendingSubject: false },
  ]);
  const rMap = new Map(ranks.map((r) => [r.studentId, r.position]));
  assert.equal(rMap.get(1), 1);
  assert.equal(rMap.get(2), 2);
  assert.equal(rMap.get(3), 2);
  assert.equal(rMap.get(4), 4);
  assert.equal(rMap.get(5), null);

  // Separation of Duties
  let sodBlocked = false;
  try {
    assertSeparationOfDuties(42, 42, "payment submission");
  } catch {
    sodBlocked = true;
  }
  assert(sodBlocked);
  assertSeparationOfDuties(99, 42, "payment submission");

  // Principal vs Super Admin Unlock Separation
  const superCaps = resolveActorCapabilities(null, ["SUPER_ADMIN"], "SUPER_ADMIN");
  const principalCaps = resolveActorCapabilities(null, ["PRINCIPAL"], "PRINCIPAL");
  assert(!superCaps.has("UNLOCK_SHEETS") && principalCaps.has("UNLOCK_SHEETS"));

  // TOTP + AES-256-GCM encryption + Scratch Card HMAC
  const secret = generateTotpSecret();
  const enc = encryptTotpSecret(secret);
  assert(enc.startsWith("enc:v1:"));
  assert.equal(decryptTotpSecret(enc), secret);
  const code = computeTotpCode(secret);
  assert.equal(verifyTotpCode(secret, code), true);
  const hmac1 = await computeSerialPinHmac("WOFS-2026-ABCD", "123456789012");
  const hmac2 = await computeSerialPinHmac("WOFS-2026-ABCD", "123456789012");
  assert.equal(hmac1, hmac2);
  console.log("   ✔ Grading tenths, 1-2-2-4 broadsheet ranks, SoD, RBAC, 2FA & Scratch Card HMAC verified.");

  // 4. Live PostgreSQL Logical Backup & SHA-256 Integrity Check
  console.log("4. Executing Live PostgreSQL Backup & SHA-256 Checksum Verification...");
  const backupRes = await performBackup();
  assert(backupRes.success && backupRes.backupPath, `Backup failed: ${backupRes.error || "unknown"}`);
  assert(fs.existsSync(backupRes.backupPath));
  const rawJson = fs.readFileSync(backupRes.backupPath, "utf8");
  const parsed = JSON.parse(rawJson);
  if (backupRes.encrypted && parsed.alg === "aes-256-gcm") {
    assert(parsed.iv && parsed.tag && parsed.ciphertext && parsed.dataSha256);
    console.log(
      `   ✔ Encrypted AES-256-GCM PostgreSQL backup verified (${backupRes.totalRows} rows, sha256=${String(parsed.dataSha256).slice(0, 12)}).`
    );
  } else {
    const recomputedSha = crypto
      .createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .digest("hex");
    assert.equal(recomputedSha, parsed.metadata.dataSha256);
    console.log(
      `   ✔ PostgreSQL backup verified (${parsed.metadata.totalRows} rows across ${Object.keys(parsed.metadata.tableCounts).length} tables, SHA-256 OK).`
    );
  }

  console.log("\n✅ ALL PHASE 5 DRESS REHEARSAL CHECKS PASSED!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ DRESS REHEARSAL FAILED:", err);
  process.exit(1);
});
