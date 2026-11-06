# Word of Faith Schools Portal — Security Hardening & Verification Report (Phase 2 & Phase 3)

**Date**: November 6, 2026  
**Scope**: Full-stack remediation of the 33 vulnerabilities identified in [`SECURITY_AUDIT.md`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/SECURITY_AUDIT.md) (`8 CRITICAL`, `12 HIGH`, `9 MEDIUM`, `4 LOW`), creation of central security primitives, Next.js 16 edge proxy & HTTP security headers, and automated exploit regression testing.

---

## 1. Executive Summary of Remediations

| Severity | Found in Phase 1 | Fixed in Phase 2 | Status |
| :--- | :---: | :---: | :---: |
| **CRITICAL** | 8 | 8 | **100% Remediated** |
| **HIGH** | 12 | 12 | **100% Remediated** |
| **MEDIUM** | 9 | 9 | **100% Remediated** |
| **LOW** | 4 | 4 | **100% Remediated** |
| **Total** | **33** | **33** | **33 / 33 Closed** |

---

## 2. Central Security Module Created

- **[`src/lib/security/index.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/security/index.ts)**:
  - `SAFE_USER_SELECT` & `stripSensitiveUserFields()`: Prevents Prisma over-fetching from ever returning `PasswordHash`, `TotpSecret`, `TotpBackupCodes`, `TokenVersion`, or lockout fields to client components.
  - `encryptTotpSecret()` & `decryptTotpSecret()`: Encrypts TOTP 2FA secrets at rest using **AES-256-GCM** (`enc:v1:<iv>:<tag>:<ciphertext>`) with a key derived via HKDF-SHA256 from `TOTP_ENCRYPTION_KEY` (or `NEXTAUTH_SECRET`), while remaining backwards-compatible with existing Base32 secrets.
  - `claimTotpCodeSingleUse()`, `grantStepUpSession()`, `hasValidStepUpSession()`, `requireStepUpIfTotpEnabled()`: Enforces single-use TOTP replay protection per 30-second window and server-side Step-Up 2FA verification on sensitive admin actions.
  - `generateSecureOtp6()`, `hashTokenSha256()`, `timingSafeCompare()`, `incrementOtpAttemptAndCheckLocked()`, `clearOtpAttempts()`: CSPRNG 6-digit OTP generation (`crypto.randomInt`), SHA-256 token hashing at rest, constant-time comparisons, and 5-attempt OTP brute-force invalidation.
  - `escapeHtml()`, `sanitizeEmailHeader()`, `sanitizeFormulaCell()`, `validateInput()`: Neutralizes HTML/XSS injection in emails, CRLF header injection, CSV/XLSX formula injection (`=`, `+`, `-`, `@`), and schema violations.

---

## 3. Remediated Findings by Severity

### CRITICAL Findings (8 / 8 Fixed)
1. **CRIT-01 — Hardcoded Gmail Address & App Password Removed**:
   - **File**: [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts)
   - **Fix**: Removed hardcoded `SMTP_USER` and 16-char Gmail App Password fallback; requires `process.env.SMTP_USER` and `process.env.SMTP_PASS`.
2. **CRIT-02 — Hardcoded Secret Fallbacks Removed (`NEXTAUTH_SECRET`, `PAYSTACK_SECRET_KEY`, `SCRATCH_CARD_PEPPER`)**:
   - **Files**: [`src/lib/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/auth.ts), [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts), [`src/app/api/webhooks/paystack/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts), [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts)
   - **Fix**: All fallback strings (`"fallback-secret-for-dev"`, `"sk_test_mocked_key"`, `"wof-default-pepper-2026-v1"`) are rejected in production; missing secrets fail closed immediately.
3. **CRIT-03 — Paystack Amount, Currency & Student Ownership Verified Before Fee Clearance**:
   - **Files**: [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts), [`src/app/api/webhooks/paystack/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts)
   - **Fix**: Enforced server-side minimum tuition threshold (`MINIMUM_TERM_FEE_NAIRA = 65000`), verified `paystackData.data.currency === "NGN"` and `paidKobo >= expectedKobo` before setting `Status = "Approved"` and `HasPaidFees = true`, and enforced `requireStudentOwnershipOrAdmin` on `initializePayment` and `verifyPaystackPayment`.
4. **CRIT-04 — Atomic Webhook Idempotency via Unique Constraint**:
   - **Files**: [`src/app/api/webhooks/paystack/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts), [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts)
   - **Fix**: Moved `prisma.webhookEvent.create` inside `prisma.$transaction` as the first statement and handled Prisma `P2002` unique constraint conflicts idempotently (`{ received: true, duplicate: true }`).
5. **CRIT-05 — Direct Student Messaging Restricted to Authorized Staff & Scoped by Class**:
   - **File**: [`src/app/actions/messaging.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts)
   - **Fix**: Restricted `lookupStudentByEmail` and `sendDirectStudentMessage` to `STAFF_MESSAGING_ROLES`, enforced `requireClassTeacherOrAdmin(actor, student.ClassID)` for teachers, restricted `phoneOverride` DB persistence to `MANAGE_STUDENTS`/Admin, and removed student PII from `getMessageContacts` for non-staff callers.
6. **CRIT-06 — IDOR in `uploadPaymentReceipt` & `getStudentProfile` Closed**:
   - **File**: [`src/app/actions/studentProfile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts)
   - **Fix**: Enforced `requireStudentOwnershipOrAdmin(actor, studentId)` on both actions and validated positive finite amounts.
7. **CRIT-07 — Prisma Over-Fetching of `PasswordHash`, `TotpSecret`, `TotpBackupCodes` Eliminated**:
   - **Files**: [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts), [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts), [`src/app/actions/studentProfile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts), [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts)
   - **Fix**: Replaced `include: { User: true }` with `User: { select: SAFE_USER_SELECT }`.
8. **CRIT-08 — BullMQ `paymentWorker` Auto-Approval Bypass Removed**:
   - **File**: [`src/worker.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/worker.ts)
   - **Fix**: Changed `paymentWorker` to keep manual receipts in `Status: "Pending"` awaiting Bursar verification or signed Paystack webhook confirmation.

---

### HIGH Findings (12 / 12 Fixed)
- **HIGH-01** ([`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts)): Enforced `requireClassTeacherOrAdmin` on `getStudentsInClass`, `getClassBroadsheet`, `getStudentsAndScoresForSubject`, and ownership check on `getTeacherSubjects`.
- **HIGH-02** ([`src/app/actions/parent.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts), [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts)): Gated terminal results in `getParentDashboardData` and `verifyScratchCard` behind `term.IsPublished` and `checkStudentFeeClearance()`.
- **HIGH-03** ([`src/app/actions/parent.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts)): Added per-user and per-student rate limits (`5 / 15m`) to `linkChildByAdmissionNo` and blocked hijacking an already-linked student profile.
- **HIGH-04** ([`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts)): Replaced `Math.random()` OTPs with `generateSecureOtp6()`, hashed OTP tokens with SHA-256 at rest, added per-account rate limits, and invalidated OTP tokens after 5 failed attempts.
- **HIGH-05** ([`src/lib/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/auth.ts)): Added per-account and per-IP rate limits in `authorize()`, constant-time dummy `bcrypt.compare` on missing users, 1-hour session rotation, explicit `cookies` flags (`httpOnly`, `sameSite: "lax"`, `secure`), and safe `redirect` validation.
- **HIGH-06** ([`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts)): Encrypted `TotpSecret` at rest with AES-256-GCM, enforced rate limiting and single-use replay protection on `verifyStepUpTotpAction`, and enforced `requireStepUpIfTotpEnabled` on `updateAdminCapabilities`, `toggleUserStatus`, and `adminResetPassword`.
- **HIGH-07** ([`src/app/actions/cbt.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts)): Blocked `getQuestionAiExplanation` when the student has an `ACTIVE` `CbtAttempt` or when `questionId` is not from a completed attempt, and rate-limited requests per user.
- **HIGH-08** ([`src/app/actions/cbt.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts)): Removed the `TEACHER` fallback to `prisma.student.findFirst()` in `resolveCurrentStudent()`.
- **HIGH-09** ([`src/app/api/chat/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/chat/route.ts)): Added `maxOutputTokens: 600` to `streamText`.
- **HIGH-10** ([`src/app/api/cron/cbt-reaper/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/cron/cbt-reaper/route.ts)): Failed closed when `CRON_SECRET` is unset (unless called by an authenticated `SUPER_ADMIN`) and compared secrets with `timingSafeCompare`.
- **HIGH-11** ([`src/app/api/setup/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/setup/route.ts)): Added rate limiting, `timingSafeCompare` on `x-setup-secret`, and required `INITIAL_ADMIN_PASSWORD` in production.
- **HIGH-12** ([`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts), [`src/lib/aloc-api.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/aloc-api.ts)): Enabled TLS certificate verification in production (`rejectUnauthorized: process.env.NODE_ENV === "production"`).

---

### MEDIUM & LOW Findings (13 / 13 Fixed)
- **MED-01** ([`next.config.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/next.config.ts), [`src/proxy.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/proxy.ts)): Configured `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`, and Next.js 16 edge proxy (`src/proxy.ts`).
- **MED-02** ([`src/lib/redis.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/redis.ts), [`src/lib/rateLimit.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/rateLimit.ts)): Replaced no-op `redisMock` with a stateful in-memory TTL store and sliding-window fallback.
- **MED-03** ([`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts), [`src/app/api/admissions/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/admissions/route.ts)): Escaped all user-supplied HTML interpolations with `escapeHtml()`, stripped CRLF from email subjects, and added strict Zod schemas on `/api/admissions`.
- **MED-04** ([`src/app/actions/classes.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/classes.ts), [`src/app/actions/profile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/profile.ts)): Enforced `%PDF-` magic-byte verification and formula-prefix neutralization in `uploadClassStudentsPdf`, and MIME/size/filename sanitization in `updateProfile`.
- **MED-05** ([`src/lib/authz.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/authz.ts)): Serialized hash-chained audit writes via an in-process mutex (`auditChainMutex`) and added `verifyAuditLogChain()`.
- **MED-06** ([`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts)): Returned a uniform response on unknown email addresses in `requestPasswordReset`.
- **MED-07** ([`src/app/actions/terms.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/terms.ts), [`src/app/actions/attendance.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/attendance.ts)): Enforced `requireActiveUser()` on `getTerms`/`getActiveTerm` and `requireClassTeacherOrAdmin` on `markAttendance`/`getClassAttendance`.
- **MED-08 & LOW-04** ([`src/app/actions/classes.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/classes.ts), [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts), [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts), [`src/app/actions/terms.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/terms.ts), [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts), [`src/app/actions/cbt.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts)): Fixed `Set` bugs (`Array.from(actor.roles)`) and removed `"WOF-DEMO12"` fallback.
- **LOW-01** ([`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts), [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts)): Standardized `bcrypt.hash` cost factor to `12`.
- **LOW-02 & LOW-03** ([`src/app/api/download-architecture/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/download-architecture/route.ts), [`src/app/api/debug-env/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/debug-env/route.ts)): Gated `/api/download-architecture` behind admin roles and disabled `/api/debug-env` in production.

---

## 4. Required Production Environment Checklist

Ensure the following environment variables are set in your production environment (never committed to `.env` in Git):

```ini
# Core Auth & Encryption
NEXTAUTH_SECRET="<at least 32 random bytes, e.g. openssl rand -base64 32>"
NEXTAUTH_URL="https://portal.wordoffaithschools.edu.ng"
TOTP_ENCRYPTION_KEY="<32-byte key for AES-256-GCM TOTP secret encryption>"

# Database & Redis
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# Payments & Scratch Cards
PAYSTACK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY="pk_live_..."
SCRATCH_CARD_PEPPER="<at least 32 random characters>"

# Communications (SMTP / Termii / Meta WhatsApp)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="<official school SMTP account>"
SMTP_PASS="<app password from secret manager — rotate previous exposed Gmail App Password>"

# CBT & AI Providers
ALOC_API_KEY="<ALOC access token>"
SDASH_API_KEY="<Sdash API key>"
GOOGLE_GENERATIVE_AI_API_KEY="<Gemini API key>"

# Operational & Cron Guards
CRON_SECRET="<at least 24 random characters>"
SETUP_SECRET="<at least 24 random characters>"
INITIAL_ADMIN_PASSWORD="<strong initial admin bootstrap password>"
```
