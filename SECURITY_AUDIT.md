# Word of Faith Schools Portal — Comprehensive Security Audit (`PHASE 1`)

**Audit Date:** November 6, 2026  
**Target Stack:** Next.js 16.2.9 (App Router, Server Actions, Route Handlers), React 19.2.4, TypeScript 5, Prisma ORM 5.22.0, PostgreSQL, NextAuth.js 4.24.14, Redis (`ioredis` + `BullMQ`), Paystack, Google Gemini (`@ai-sdk/google`), Meta WhatsApp Cloud API, Termii SMS, ALOC v1/v2 & SdashAPI (CBT).  
**Phase Status:** **PHASE 1 (READ-ONLY)** — Zero application source files modified during this phase.

---

## Executive Summary & Severity Totals

| Severity | Count | Summary |
| :--- | :---: | :--- |
| **CRITICAL** | **8** | Hardcoded live SMTP credentials & secret fallbacks in source code; Paystack amount/currency/student verification bypass (`₦1` clears full tuition); IDOR in direct messaging & phone overwrite; IDOR in receipt injection; `PasswordHash` & `TotpSecret` leaked to client via Prisma `include: { User: true }`; unauthenticated/forged Paystack webhook amount bypass. |
| **HIGH** | **12** | Parent ward-linking DOB brute-force (365 guesses) & unpublished result bypass; IDOR in class roster/attendance/student profile; Step-Up TOTP 2FA not enforced server-side & plaintext `TotpSecret` without replay protection; weak `Math.random()` OTPs & plaintext DB storage; CBT mid-exam AI answer leak & teacher-to-first-student fallback mutation; unauthenticated cron when `CRON_SECRET` is unset; TLS `rejectUnauthorized: false`. |
| **MEDIUM** | **9** | Missing HTTP security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`); fail-open Redis mock when `REDIS_URL` is missing; HTML injection in email templates; CSV/PDF upload lack magic-byte & formula-injection (`=,+,-,@`) sanitization; AuditLog hash-chain race condition & silent error swallowing; user enumeration in password reset; non-constant-time `x-setup-secret` check. |
| **LOW** | **4** | Inconsistent `bcrypt` cost factor (`10` vs `12`); unauthenticated `/api/download-architecture` endpoint; verbose error messages returned to client; lack of `NEXT_PUBLIC_*` build-time env validation. |

---

## Complete Route Handler & Server Action Enumeration Table

### 1. HTTP Route Handlers (`src/app/api/**`)

| Route Path | Method(s) | Auth Check | Role / Capability Check | Rate Limit | Input Validation | Identified Security Gaps |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| [`/api/auth/[...nextauth]`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/auth/%5B...nextauth%5D/route.ts#L1-L7) | `GET, POST` | NextAuth | Credentials Provider | IP only (`5/60s`) | Basic string check | **CRIT-02**: Hardcoded fallback `NEXTAUTH_SECRET`. **HIGH-05**: No per-account progressive lockout; session maxAge defaults to 30 days. |
| [`/api/admissions`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/admissions/route.ts#L10-L128) | `POST` | Public | Public applicant | IP (`10/900s`) | Manual `.slice()` | **MED-03**: No Zod schema validation (`dateOfBirth` can be `Invalid Date`), unescaped HTML interpolated into admission emails (`email.ts:133-142`). |
| [`/api/admissions`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/admissions/route.ts#L69-L128) | `GET, PATCH` | `requireRole` | `SUPER_ADMIN, PRINCIPAL, ADMISSIONS, Admin` | None | Minimal check | **MED-03**: `PATCH` allows arbitrary `status` string without enum whitelist; unescaped `reason` in rejection email (`email.ts:226`). |
| [`/api/chat`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/chat/route.ts#L11-L190) | `POST` | **None (Public)** | **None** | IP (`20/300s`) | Array & length slice | **HIGH-09**: Unauthenticated public endpoint consumes paid Gemini API quota; no `maxOutputTokens` cap on `streamText`; trusts spoofable `x-forwarded-for`. |
| [`/api/webhooks/paystack`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts#L7-L88) | `POST` | HMAC-SHA512 | Webhook | None | JSON parse | **CRIT-03 / CRIT-04**: Falls back to `"sk_test_mocked_key"` in non-prod; does **not** verify `event.data.amount >= payment.AmountKobo` or `currency === "NGN"`, nor re-verify with Paystack API; check-then-insert race before `webhookEvent.create`. |
| [`/api/cron/cbt-reaper`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/cron/cbt-reaper/route.ts#L10-L34) | `GET, POST` | Conditional Bearer | Cron | None | None | **HIGH-10**: If `CRON_SECRET` is unset (`!cronSecret`), line 15 skips auth entirely; uses `!==` instead of `timingSafeEqual`. |
| [`/api/setup`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/setup/route.ts#L6-L134) | `GET` | Conditional | `SUPER_ADMIN` or `x-setup-secret` | None | None | **HIGH-11**: Mutates DB on `GET`; hardcoded default password `"wofschools2026"` for 3 seeded accounts (`setup/route.ts:52`); non-constant-time `===` comparison on `x-setup-secret`. |
| [`/api/debug-env`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/debug-env/route.ts#L4-L23) | `GET` | `requireRole` | `SUPER_ADMIN, Admin` | None | None | **LOW-03**: Exposes infrastructure environment variable presence in production. |
| [`/api/download-architecture`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/download-architecture/route.ts#L5-L29) | `GET` | **None (Public)** | **None** | None | None | **LOW-02**: Unauthenticated public download of internal `System_Architecture.docx`. |

---

### 2. Server Actions (`src/app/actions/*.ts`)

| File & Action | Auth Guard | Role / Capability Guard | Rate Limit | Input Validation | Identified Security Gaps |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`auth.ts:initiateRegistration`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L28-L154) | Public | Claim Code / Email | IP (`5/300s`) | Manual | **HIGH-04**: Uses `Math.random()` for 6-digit OTP (`auth.ts:108`); stores plaintext OTP in DB; no per-email/admissionNo rate limit. |
| [`auth.ts:verifyRegistration`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L156-L330) | Public | OTP match | IP (`5/300s`) | Manual | **HIGH-04**: No per-email OTP attempt counter or invalidation on failed guesses; uses `bcrypt.hash(password, 10)` (`auth.ts:224`). |
| [`auth.ts:requestPasswordReset`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L332-L410) | Public | Public | IP (`3/300s`) | Manual | **HIGH-04 / MED-06**: Uses `Math.random()` (`auth.ts:365`); leaks whether an admission number or email exists (`auth.ts:350-363`). |
| [`auth.ts:resetPassword`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L412-L496) | Public | OTP match | IP (`5/300s`) | Manual | **HIGH-04**: No per-email lockout on failed OTP guesses; uses `bcrypt` cost 10 (`auth.ts:478`). |
| [`messaging.ts:getChatContacts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L12-L40) | `getServerSession` | Any logged-in | None | None | Does not check `IsActive` in DB (`requireActiveUser()`). |
| [`messaging.ts:getConversation`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L42-L70) | `getServerSession` | Any logged-in | None | None | Allows messaging any `UserID` regardless of role/relationship. |
| [`messaging.ts:sendMessage`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L72-L106) | `getServerSession` | Any logged-in | None | `.trim()` only | No max length validation, no rate limit, no role check. |
| [`messaging.ts:lookupStudentByEmail`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L112-L169) | `getServerSession` | **MISSING** | None | None | **CRIT-05**: Any logged-in student/parent can search and extract any student's email, phone (`ParentContact`), and class. |
| [`messaging.ts:sendDirectStudentMessage`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L175-L310) | `getServerSession` | **MISSING** | None | Minimal | **CRIT-05**: Any logged-in student/parent can dispatch official school Email/SMS/WhatsApp to any student AND overwrite any student's `ParentContact` in DB via `phoneOverride` (`messaging.ts:228-242`). |
| [`studentProfile.ts:getStudentProfile`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts#L8-L92) | `getServerSession` | Partial check | None | None | **HIGH-02**: Any `Teacher` can view any student's full financial history, attendance, and grades; does not use `requireActiveUser()`. |
| [`studentProfile.ts:uploadPaymentReceipt`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts#L94-L126) | `getServerSession` | **MISSING** | None | None | **CRIT-06**: Zero ownership or role check! Any logged-in user can inject `Payment_Record` entries for arbitrary `studentId` and `amount`. |
| [`payments.ts:getAdminPaymentAuditList`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L17-L79) | `requireCapability` | `MANAGE_FINANCE / APPROVE_PAYMENTS` | None | None | **CRIT-07**: Uses `include: { Student: { include: { User: true } } }` (`payments.ts:54`), leaking `PasswordHash` and `TotpSecret` to client. |
| [`payments.ts:getOrCreateStudentFeeOrder`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L194-L361) | `requireActiveUser` | Owner / Parent / Finance | None | None | **CRIT-07**: Leaks full `Student.User` (`PasswordHash`, `TotpSecret`) at lines 200, 236, 263, 297. |
| [`payments.ts:initializePayment`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L443-L518) | `requireActiveUser` | Owner / Parent / Finance | None | None | **CRIT-03**: Trusts client `data.amount` and overwrites `AmountPaid`/`AmountKobo` (`payments.ts:471-489`), allowing `₦1` payment to clear full fees. |
| [`payments.ts:verifyPaystackPayment`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L520-L582) | `requireActiveUser` | **No ownership check** | None | None | **CRIT-03**: Does not verify `data.data.amount >= payment.AmountKobo`, `currency === "NGN"`, or ownership of `payment.StudentID`; sets `HasPaidFees: true` unconditionally. |
| [`results.ts:getStudentsInClass`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1781-L1791) | `requireActiveUser` | **MISSING** | None | None | **CRIT-07 / HIGH-01**: Any logged-in student can call `getStudentsInClass(classId)` and receive all students with `include: { User: true }` (`PasswordHash`, `TotpSecret`)! |
| [`results.ts:getTeacherSubjects`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1793-L1804) | `requireActiveUser` | **MISSING** | None | None | **HIGH-01**: Any logged-in user can enumerate any teacher's assigned classes and subjects. |
| [`results.ts:getStudentsAndScoresForSubject`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L179-L265) | `requireSubjectTeacherOrAdmin` | Teacher / Admin | None | None | **CRIT-07**: Includes `User: true` on `Student` (`results.ts:188`), returning `PasswordHash` and `TotpSecret`. |
| [`results.ts:getClassBroadsheet`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1334-L1432) | `requireFormMasterOrAdmin` | FormMaster / Admin | None | None | **CRIT-07**: Includes `FormMaster: true` and `Teacher: true` (`results.ts:1343, 1363`), leaking staff `PasswordHash` and `TotpSecret`. |
| [`parent.ts:getParentDashboardData`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts#L8-L247) | `getServerSession` | **Missing role check** | None | None | **HIGH-03**: Returns raw `s.Results` (`parent.ts:28-31`) even when results are **unpublished** or fees are **unpaid**, bypassing Scratch Card and Fee Clearance gates! |
| [`parent.ts:linkChildByAdmissionNo`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts#L249-L300) | `getServerSession` | **Missing role check** | **None** | Manual | **HIGH-03**: Zero rate limiting on `(admissionNo, dateOfBirth)` — an attacker can brute-force all 365 days of a year in seconds to hijack any student's parent link! |
| [`attendance.ts:markAttendance`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/attendance.ts#L8-L87) | `getServerSession` | Any Teacher / Admin | None | Manual | **HIGH-02 / MED-03**: Does not check if teacher is assigned to student's class; injects unescaped `notes` into parent HTML email (`attendance.ts:68`). |
| [`attendance.ts:getAttendanceForClass`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/attendance.ts#L89-L107) | `getServerSession` | **MISSING** | None | None | **HIGH-02**: Any logged-in student or parent can query attendance records for any class. |
| [`classes.ts:getClasses / getSubjects`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/classes.ts#L9-L90) | `getServerSession` | Any logged-in | None | None | `getClasses` includes `FormMaster: true` (`classes.ts:15`), leaking the Form Master's `PasswordHash` and `TotpSecret` to any logged-in user! |
| [`terms.ts:getTerms / getActiveTerm`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/terms.ts#L11-L42) | **None** | **None** | None | None | **MED-07**: Completely unauthenticated server actions. |
| [`cbt.ts:resolveCurrentStudent`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts#L29-L65) | `requireActiveUser` | Student / Teacher / Admin | None | None | **HIGH-07**: Lines 56–62 allow any `TEACHER` without a student record to fall back to `prisma.student.findFirst({ orderBy: { StudentID: "asc" } })`, mutating the first real student's CBT attempts and day locks! |
| [`cbt.ts:getQuestionAiExplanation`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts#L968-L1035) | `requireActiveUser` | Any logged-in | None | None | **HIGH-08**: Does not verify that the student has no `ACTIVE` attempt or that the question belongs to a `SUBMITTED` attempt — students can ask Gemini for the answer key & explanation mid-exam! |
| [`admin.ts:verifyStepUpTotpAction`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts#L1249-L1295) | `requireActiveUser` | Admin | None | 6-digit regex | **HIGH-06**: No rate limit on TOTP verification; no replay protection for used 6-digit codes; returns client-only `verifiedAt` without server-side Redis/DB enforcement on sensitive mutations (`updateAdminCapabilities`, `adminResetPassword`, `toggleTermLock`, `publishClassBroadsheetAction`). |

---

## Detailed Findings by Checklist Category (Ranked CRITICAL → LOW)

### CRITICAL Findings

#### `CRIT-01`: Live Gmail SMTP Credentials Hardcoded in Source Code
- **File & Lines:** [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L5-L6)
- **Checklist Section:** I (Secrets, Config & Dependencies)
- **Exploit Scenario:** Lines 5–6 contain hardcoded fallback credentials (`smtpUser` and a 16-character Gmail App Password `smtpPass`) committed directly into the repository. Anyone with read access to the git repository or build artifacts can authenticate directly to the Gmail account, read sent school emails (including OTPs, claim codes, and admission letters), and send phishing emails from the school's SMTP account.
- **Concrete Fix:** Remove the hardcoded email and app password fallback strings from [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L5-L6), require `SMTP_USER` and `SMTP_PASSWORD` strictly from `process.env`, and **immediately revoke/rotate** the exposed Gmail App Password in Google Account Security.

#### `CRIT-02`: Hardcoded Fallback Cryptographic Secrets (`NEXTAUTH_SECRET`, `SCRATCH_CARD_PEPPER`, `PAYSTACK_SECRET_KEY`)
- **File & Lines:**
  - [`src/lib/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/auth.ts#L41) (`secret: process.env.NEXTAUTH_SECRET || "fallback-secret-for-dev"`)
  - [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts#L14-L19) (`"wof-default-pepper-2026-v1"`)
  - [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L15) & [`src/app/api/webhooks/paystack/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts#L5) (`"sk_test_mocked_key"`)
- **Checklist Section:** A (Authentication & Sessions), D (Payments & Scratch Cards), I (Secrets)
- **Exploit Scenario:** If `NEXTAUTH_SECRET` or `SCRATCH_CARD_PEPPER` is omitted or misnamed in an environment, an attacker can forge valid NextAuth JWT cookies for `SUPER_ADMIN` using `"fallback-secret-for-dev"` or precompute HMAC-SHA256 scratch card PIN hashes using `"wof-default-pepper-2026-v1"`.
- **Concrete Fix:** Remove all hardcoded secret fallbacks; fail closed with an explicit startup/runtime error if `NEXTAUTH_SECRET`, `SCRATCH_CARD_PEPPER`, or `PAYSTACK_SECRET_KEY` is missing.

#### `CRIT-03`: Client-Controlled Tuition Amount & Unverified Amount/Ownership in Paystack Verification
- **File & Lines:** [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L443-L582)
- **Checklist Section:** D (Payments & Scratch Cards)
- **Exploit Scenario:**
  1. In [`initializePayment`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L443-L491), a student or parent can pass `{ studentId, termId, amount: 1, reference }` and overwrite an existing pending fee order's `AmountPaid` to `₦1` (`100` kobo).
  2. In [`verifyPaystackPayment(reference)`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L520-L582), the server checks `data.data?.status === "success"` from Paystack, but **never checks**:
     - `BigInt(data.data.amount) >= payment.AmountKobo` (paying `₦1` on Paystack marks the student's entire term fee as `Approved` and sets `Student.HasPaidFees = true`!).
     - `data.data.currency === "NGN"`.
     - Ownership of `payment.StudentID` by the calling user.
     - `WebhookEvent` idempotency inside the same transaction.
- **Concrete Fix:** In `initializePayment`, derive the required fee amount strictly from the server-side `Payment_Record` / `Invoice` (never overwrite `AmountKobo` with a smaller client-supplied `data.amount`). In `verifyPaystackPayment`, enforce ownership, verify `data.data.currency === "NGN"` and `BigInt(data.data.amount) >= payment.AmountKobo`, and record `WebhookEvent` atomically inside `prisma.$transaction`.

#### `CRIT-04`: Paystack Webhook Missing Amount/Currency Check, Missing Server Re-Verify, and Check-Then-Insert Race
- **File & Lines:** [`src/app/api/webhooks/paystack/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/webhooks/paystack/route.ts#L34-L81)
- **Checklist Section:** D (Payments & Scratch Cards)
- **Exploit Scenario:**
  1. The webhook handler checks `existingEvent` via `findUnique` (line 41) outside the transaction before calling `prisma.$transaction` (line 56), creating a check-then-insert race condition under concurrent webhook deliveries.
  2. It never verifies `BigInt(event.data.amount) >= payment.AmountKobo` or `event.data.currency === "NGN"`, nor does it call Paystack's `/transaction/verify/:reference` endpoint to confirm the event state.
- **Concrete Fix:** Re-verify the transaction against `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, assert `status === "success"`, `currency === "NGN"`, and `BigInt(amount) >= payment.AmountKobo`, and rely on the `WebhookEvent.eventKey` unique constraint inside the transaction (catching Prisma `P2002` duplicate key gracefully as `200 OK`).

#### `CRIT-05`: Broken Access Control & IDOR in Direct Student Messaging (`lookupStudentByEmail` & `sendDirectStudentMessage`)
- **File & Lines:** [`src/app/actions/messaging.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/messaging.ts#L112-L310)
- **Checklist Section:** B (Authorization)
- **Exploit Scenario:** Both `lookupStudentByEmail` (line 112) and `sendDirectStudentMessage` (line 175) only check `if (!session || !session.user?.id)`. Any logged-in `STUDENT` or `PARENT` can:
  1. Query any student's email, admission number, and phone number (`ParentContact`).
  2. Pass `phoneOverride` (lines 228–242) to overwrite any student's `ParentContact` phone number in the database!
  3. Trigger official school emails, Termii SMS, and Meta WhatsApp messages to any student or phone number while impersonating `"School Administration"`.
- **Concrete Fix:** Enforce `requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMISSIONS", "BURSAR", "EXAM_OFFICER", "FORM_MASTER", "TEACHER", "Admin", "Teacher"])` via `requireActiveUser()`, Scope `TEACHER` / `FORM_MASTER` to students in their assigned classes, restrict `phoneOverride` persistence strictly to users with `MANAGE_STUDENTS` capability, and add per-user rate limiting and HTML escaping.

#### `CRIT-06`: IDOR & Arbitrary Payment Record Injection in `uploadPaymentReceipt`
- **File & Lines:** [`src/app/actions/studentProfile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts#L94-L126)
- **Checklist Section:** B (Authorization), D (Payments)
- **Exploit Scenario:** `uploadPaymentReceipt(studentId, termId, description, amount)` only checks `if (!session)`. It does not verify that `studentId` belongs to the logged-in student or parent, nor does it validate `amount` or `termId`. Any authenticated user can flood the bursary queue or inject arbitrary `Payment_Record` entries for any student.
- **Concrete Fix:** Enforce `requireActiveUser()`, verify student ownership (or linked guardian relationship via `StudentGuardian`), validate inputs with Zod (`amount > 0`, valid `termId`), and write an audit log entry.

#### `CRIT-07`: Server-Side Leakage of `PasswordHash`, `TotpSecret`, and `TotpBackupCodes` via Unfiltered Prisma Includes
- **File & Lines:**
  - [`src/app/actions/classes.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/classes.ts#L15) (`getClasses` → `include: { FormMaster: true }`)
  - [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L188) (`getStudentsAndScoresForSubject` → `include: { User: true }`)
  - [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1343-L1363) (`getClassBroadsheet` → `include: { FormMaster: true, Teacher: true }`)
  - [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1784) (`getStudentsInClass` → `include: { User: true }`)
  - [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L54) (`getAdminPaymentAuditList` → `include: { Student: { include: { User: true } } }`)
  - [`src/app/actions/payments.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/payments.ts#L200-L297) (`getOrCreateStudentFeeOrder` → `include: { Student: { include: { User: true } } }`)
- **Checklist Section:** C (Input Validation & Prisma Over-Fetching)
- **Exploit Scenario:** Because Next.js Server Actions serialize their entire return object over the network to the browser, any logged-in student calling `getClasses()` or `getStudentsInClass(classId)` receives the complete Prisma `User` row—including `PasswordHash` (allowing offline hash cracking), `TotpSecret` (allowing immediate 2FA bypass), and `TotpBackupCodes`!
- **Concrete Fix:** Replace every `User: true`, `FormMaster: true`, and `Teacher: true` with a central safe Prisma selector `SAFE_USER_SELECT` (`{ UserID: true, Email: true, IsActive: true, RoleID: true }`) that explicitly excludes `PasswordHash`, `TotpSecret`, and `TotpBackupCodes`.

#### `CRIT-08`: BullMQ Worker `payment-queue` Creates Approved Payments Without Gateway Verification
- **File & Lines:** [`src/worker.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/worker.ts#L48-L73)
- **Checklist Section:** D (Payments), H (Logging & Operations)
- **Exploit Scenario:** `paymentWorker` in `src/worker.ts` listens on `payment-queue` and creates `Payment_Record` rows with `Status: "Approved"` and a mock receipt URL `/receipts/mock-${Date.now()}.pdf` without any Paystack or Bursar verification.
- **Concrete Fix:** Remove the mock auto-approval from `paymentWorker` in `src/worker.ts` (or mark any queued receipt upload as `Status: "Pending"` requiring Bursar approval).

---

### HIGH Findings

#### `HIGH-01`: IDOR in `getStudentsInClass` and `getTeacherSubjects` (`src/app/actions/results.ts`)
- **File & Lines:** [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L1781-L1804)
- **Checklist Section:** B (Authorization)
- **Exploit Scenario:** `getStudentsInClass(classId)` and `getTeacherSubjects(teacherUserId)` only call `requireActiveUser()`. A student can enumerate every student in any class and every teacher's subject allocations.
- **Concrete Fix:** Gate `getStudentsInClass` with `requireFormMasterOrAdmin(classId)` (or verify the caller teaches a subject in `classId`), and gate `getTeacherSubjects` so teachers can only query their own `teacherUserId` unless the caller holds admin/exam-officer privileges.

#### `HIGH-02`: IDOR in `getAttendanceForClass`, `markAttendance`, and `getStudentProfile`
- **File & Lines:**
  - [`src/app/actions/attendance.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/attendance.ts#L8-L107)
  - [`src/app/actions/studentProfile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/studentProfile.ts#L8-L92)
- **Checklist Section:** B (Authorization)
- **Exploit Scenario:**
  - `getAttendanceForClass(classId, dateStr)` only checks `if (!session)` — any student can read attendance for any class.
  - `markAttendance` allows any teacher to mark attendance (and trigger absence emails to parents) for students in classes they do not teach or manage.
  - `getStudentProfile` allows any teacher to read any student's financial payments and full profile, and allows a parent to read only `Student.ParentID === userId` without checking `StudentGuardian` or `requireActiveUser()`.
- **Concrete Fix:** Enforce `requireFormMasterOrAdmin(classId)` (or assigned subject teacher check) on `getAttendanceForClass` and `markAttendance`. In `getStudentProfile`, restrict teachers to students in their assigned classes and strip financial records unless the caller is the student, linked parent, or finance admin.

#### `HIGH-03`: Parent Portal Ward-Linking DOB Brute-Force (IDOR) & Unpublished Result Gate Bypass
- **File & Lines:** [`src/app/actions/parent.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts#L8-L60), [`src/app/actions/parent.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/parent.ts#L170-L300)
- **Checklist Section:** B (Authorization), E (Grading, Broadsheet & Result Integrity)
- **Exploit Scenario:**
  1. `linkChildByAdmissionNo(admissionNo, dateOfBirthStr)` (line 249) has **zero rate limiting** and only checks `DateOfBirth` (365 possible days per birth year). A malicious user can brute-force a target student's DOB in <30 seconds and link another family's child to their account!Furthermore, if `student.ParentID` is already set to another parent, line 284 overwrites `ParentID: userId` and hijacks the child from the real parent!
  2. `getParentDashboardData()` (lines 28–31, 170–206) returns all `s.Results` for linked children without checking if the term/broadsheet is `PUBLISHED` or if `HasPaidFees` / Scratch Card unlock is satisfied, completely bypassing both result publication and fee clearance gates!
- **Concrete Fix:**
  1. Rate-limit `linkChildByAdmissionNo` strictly per-user and per-IP (`5` attempts per 15 minutes), require `requireRole(["PARENT", "Parent"])`, refuse to overwrite an already-linked `ParentID` (require Admin approval if a student already has a primary parent), and also require matching `ParentContact` phone or `ParentEmail` on the student record.
  2. Filter `s.Results` in `getParentDashboardData()` so only results from `PUBLISHED` broadsheets (or fee-cleared terms) are returned.

#### `HIGH-04`: Weak `Math.random()` OTPs, Plaintext OTP Storage, and Missing Per-Account OTP Brute-Force Lockout
- **File & Lines:** [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L108), [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L156-L230), [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L365-L485)
- **Checklist Section:** A (Authentication & Sessions)
- **Exploit Scenario:** Registration and password-reset 6-digit OTPs are generated using `Math.floor(100000 + Math.random() * 900000)` (not cryptographically secure), stored in plaintext in `VerificationToken.token`, and only rate-limited by IP (`x-forwarded-for`, which can be rotated or spoofed if not behind a trusted proxy). Failed OTP attempts do not increment a per-email attempt counter or invalidate the token after 5 failures.
- **Concrete Fix:** Generate OTPs with `crypto.randomInt(100000, 1000000)`, store SHA-256 hashes of OTP tokens in `VerificationToken.token` (comparing with `timingSafeEqual`), enforce per-email AND per-IP rate limits, and delete/invalidate the OTP after 5 failed attempts.

#### `HIGH-05`: NextAuth Login Missing Per-Account Lockout, Short Session Lifetimes, and Explicit Cookie Security Flags
- **File & Lines:** [`src/lib/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/auth.ts#L29-L181)
- **Checklist Section:** A (Authentication & Sessions)
- **Exploit Scenario:** `authorize()` only rate-limits by IP (`login:${ip}`), allowing distributed credential stuffing against `admin@wordoffaith.com` from multiple IPs. Furthermore, `session` does not set a short `maxAge` (defaulting to 30 days) or explicit `cookies` configuration (`httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`), and lacks a `redirect` callback to prevent open redirects.
- **Concrete Fix:** Add per-account (`login:acct:${identifier.toLowerCase()}`) progressive rate limiting alongside per-IP rate limiting in `authorize()`, configure `session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 }`, set explicit `cookies` attributes, and add a strict `callbacks.redirect` validator.

#### `HIGH-06`: Step-Up TOTP 2FA Not Enforced Server-Side, Plaintext `TotpSecret` at Rest, and TOTP Replay Vulnerability
- **File & Lines:**
  - [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts#L1198-L1295)
  - [`src/server/security/totp.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/server/security/totp.ts#L71-L84)
- **Checklist Section:** A (Authentication & Sessions — Step-Up TOTP 2FA)
- **Exploit Scenario:**
  1. `verifyStepUpTotpAction` verifies a TOTP code and returns `{ verifiedAt: new Date().toISOString() }` to the UI, but **never stores a server-side step-up session grant** and sensitive mutations (`updateAdminCapabilities`, `adminResetPassword`, `toggleTermLock`, `publishClassBroadsheetAction`, `decideUnlockRequest`) never verify that the admin completed Step-Up TOTP! An attacker with a hijacked session can call the Server Actions directly, bypassing the UI TOTP modal completely.
  2. `User.TotpSecret` is stored in plaintext in PostgreSQL instead of AES-256-GCM encrypted at rest.
  3. `verifyTotpCode` has no Redis replay lock (`totp:used:${userId}:${code}`), so a captured 6-digit code can be replayed multiple times within its 90-second drift window.
- **Concrete Fix:** Encrypt `TotpSecret` at rest using AES-256-GCM (derived from `TOTP_ENCRYPTION_KEY` / `NEXTAUTH_SECRET`), rate-limit `verifyStepUpTotpAction`, store used TOTP codes in Redis (`SETEX totp:used:${userId}:${token} 90 1`) to block replay, record a 10-minute server-side step-up token in Redis (`stepup:${userId}`), and enforce `requireStepUpTotp(actor)` server-side on sensitive actions when the actor has `TotpEnabled`.

#### `HIGH-07`: CBT `resolveCurrentStudent` Fallback Mutates the First Student in the Database When Called by a Teacher
- **File & Lines:** [`src/app/actions/cbt.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts#L56-L62)
- **Checklist Section:** F (CBT & Exam Integrity)
- **Exploit Scenario:** In `resolveCurrentStudent()`, if a logged-in `TEACHER` does not have a linked `Student` row, lines 56–60 execute `prisma.student.findFirst({ orderBy: { StudentID: "asc" } })` and return the first real student in the school! If a teacher tests the CBT exam interface, they create `CbtAttempt` and `CbtDayLock` records on a real student's account, locking that student out of their actual exam!
- **Concrete Fix:** Remove the `TEACHER` fallback to `prisma.student.findFirst()` (restrict `studentIdOverride` strictly to `SUPER_ADMIN` / `EXAM_OFFICER` preview or require an explicit preview account).

#### `HIGH-08`: CBT Mid-Exam AI Explanation Leak (`getQuestionAiExplanation`)
- **File & Lines:** [`src/app/actions/cbt.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/cbt.ts#L968-L1035)
- **Checklist Section:** F (CBT & Exam Integrity), G (AI / Gemini & Chat)
- **Exploit Scenario:** `getQuestionAiExplanation(params)` only calls `requireActiveUser()`. A student who currently has an `ACTIVE` CBT exam attempt can call `getQuestionAiExplanation({ questionId, stem, options, ... })` from browser DevTools; lines 982–989 look up `CbtAnswerKey` in the database and ask Gemini to explain why `correctKey` is the right answer, leaking the answer key mid-exam!
- **Concrete Fix:** In `getQuestionAiExplanation`, verify that the calling student does **not** have an `ACTIVE` `CbtAttempt` containing `questionId` (require that the question belongs to a `SUBMITTED` attempt owned by the student, or that the caller is staff). Also add per-user rate limiting.

#### `HIGH-09`: Unauthenticated Public `/api/chat` Endpoint Allowing AI Quota Exhaustion
- **File & Lines:** [`src/app/api/chat/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/chat/route.ts#L11-L190)
- **Checklist Section:** G (AI / Gemini & Chat)
- **Exploit Scenario:** `/api/chat` does not require a session or limit `maxOutputTokens` on `streamText`. Anyone on the internet can script requests with spoofed `X-Forwarded-For` headers (when not behind Vercel's edge header stripping) and exhaust the school's Google Gemini API quota.
- **Concrete Fix:** Cap `maxOutputTokens: 600` on `streamText`, add global + per-IP rate limiting using trusted platform headers (`x-real-ip` / last hop of `x-forwarded-for`), and validate message structure with Zod.

#### `HIGH-10`: `/api/cron/cbt-reaper` Unauthenticated When `CRON_SECRET` Is Unset
- **File & Lines:** [`src/app/api/cron/cbt-reaper/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/cron/cbt-reaper/route.ts#L12-L18)
- **Checklist Section:** B (Authorization), F (CBT)
- **Exploit Scenario:** Line 15 checks `if (cronSecret && authHeader !== 'Bearer ' + cronSecret)`. If `CRON_SECRET` is not set in the environment, the endpoint is completely open to unauthenticated callers. It also uses non-constant-time `!==`.
- **Concrete Fix:** Fail closed (`if (!cronSecret)` return `401`/`500` in production, or require an authenticated `SUPER_ADMIN` / `EXAM_OFFICER` session), and compare the Bearer token using `crypto.timingSafeEqual`.

#### `HIGH-11`: `/api/setup` Mutates Database on `GET` with Predictable Default Password `"wofschools2026"`
- **File & Lines:** [`src/app/api/setup/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/setup/route.ts#L6-L134)
- **Checklist Section:** A (Authentication), B (Authorization)
- **Exploit Scenario:** `/api/setup` performs database writes on a `GET` request, uses a hardcoded fallback password `"wofschools2026"` (line 52) if `INITIAL_ADMIN_PASSWORD` is unset, and compares `x-setup-secret` with `===` instead of `timingSafeEqual`.
- **Concrete Fix:** Require `POST` for mutations (or gate `GET` strictly behind `SUPER_ADMIN` / `timingSafeEqual` on `SETUP_SECRET`), and require `INITIAL_ADMIN_PASSWORD` or generate a cryptographically random initial password if none is configured.

#### `HIGH-12`: TLS Certificate Verification Disabled (`rejectUnauthorized: false`) in SMTP and ALOC Client
- **File & Lines:**
  - [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L18-L21) (`tls: { rejectUnauthorized: false }`)
  - [`src/lib/aloc-api.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/aloc-api.ts#L204) (`new https.Agent({ rejectUnauthorized: false })`)
- **Checklist Section:** I (Secrets, Config & Dependencies)
- **Exploit Scenario:** Disabling TLS certificate validation in production allows Man-in-the-Middle (MitM) interception of outbound SMTP credentials/emails and ALOC API keys.
- **Concrete Fix:** Enforce `rejectUnauthorized: process.env.NODE_ENV === "production"` in `email.ts` and restrict the `aloc-api.ts` insecure agent fallback to non-production or explicit opt-in (`ALOC_ALLOW_INSECURE_TLS === "true"`).

---

### MEDIUM Findings

#### `MED-01`: Missing Security Headers & Content Security Policy (CSP) in `next.config.ts` and Middleware
- **File & Lines:** [`next.config.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/next.config.ts#L1-L15) (and no `src/middleware.ts` present)
- **Checklist Section:** H (Logging, Error Handling & Operations)
- **Exploit Scenario:** The application serves pages without `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, or `Permissions-Policy`, leaving the portal vulnerable to clickjacking (framing the admin or CBT exam screen) and MIME-sniffing attacks.
- **Concrete Fix:** Configure comprehensive security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security`, and `Content-Security-Policy`) in `next.config.ts` and add `src/middleware.ts` for route-level session defense-in-depth.

#### `MED-02`: Redis Mock Always Returns `incr() => 1`, Disabling All Rate Limiting When `REDIS_URL` Is Unset
- **File & Lines:** [`src/lib/redis.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/redis.ts#L31-L43), [`src/lib/rateLimit.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/rateLimit.ts#L9-L35)
- **Checklist Section:** A (Authentication & Rate Limiting)
- **Exploit Scenario:** When `REDIS_URL` is not configured or Redis is unreachable, `redisMock.incr` always returns `1`. Every `rateLimit()` call across login, OTP verification, scratch cards, and chat permanently succeeds without any in-memory fallback!
- **Concrete Fix:** Implement an in-memory sliding-window/token-bucket fallback (`Map<string, { count: number; expiresAt: number }>`) inside `src/lib/redis.ts` / `src/lib/rateLimit.ts` when Redis is unavailable so rate limits still enforce per-instance protection.

#### `MED-03`: HTML Injection in Transactional Emails (`email.ts`, `attendance.ts`, `admin.ts`)
- **File & Lines:**
  - [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L126-L146), [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L183-L238), [`src/lib/email.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L412-L433)
  - [`src/app/actions/attendance.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/attendance.ts#L64-L74)
- **Checklist Section:** C (Input Validation & Injection — Email/SMS/WhatsApp)
- **Exploit Scenario:** User-supplied fields (`parentName`, `childFirstName`, `applyingClass`, `reason`, `subject`, `message`, attendance `notes`) are interpolated directly into HTML email templates without HTML entity escaping and without stripping `\r`/`\n` from email `subject` lines. An attacker submitting an admission form with `<a href="https://evil.example">Pay Admission Fee Here</a>` in `parentName` causes the school's official SMTP server to send a realistic phishing link to the target email address!
- **Concrete Fix:** Add a central `escapeHtml()` and `sanitizeEmailHeader()` helper and sanitize all interpolated variables in `src/lib/email.ts`, `src/app/actions/attendance.ts`, and `src/app/actions/admin.ts`.

#### `MED-04`: CSV Bulk Upload & PDF Class-List Parser Missing Size, Row, Magic-Byte, and Formula-Injection (`=,+,-,@`) Protections
- **File & Lines:**
  - [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts#L984-L1084) (`parseClassListPdfAction` & `commitClassListOnboardingAction`)
  - [`src/app/actions/results.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/results.ts#L387-L561) (`stageScoreUploadAction`)
- **Checklist Section:** C (Input Validation & Injection — CSV/XLSX/PDF Bulk Upload)
- **Exploit Scenario:**
  1. `parseClassListPdfAction` decodes arbitrary-size `base64Pdf` into memory without checking max size or verifying the `%PDF-` magic header (`0x25 0x50 0x44 0x46`).
  2. CSV/student name fields are not sanitized against spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`), which can execute formulas when an admin exports broadsheets or audit logs to Excel.
- **Concrete Fix:** Enforce max payload size (10 MB for PDF, 500 rows per batch), verify `%PDF-` magic bytes in `parseClassListPdfAction`, and sanitize leading formula characters (`^[=+\-@\t\r]+`) on imported names and remarks.

#### `MED-05`: AuditLog Hash-Chain Race Condition & Silent Error Swallowing
- **File & Lines:** [`src/lib/authz.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/authz.ts#L482-L535)
- **Checklist Section:** H (Logging, Error Handling & Operations)
- **Exploit Scenario:** `writeAuditLog` queries `prisma.auditLog.findFirst({ orderBy: { CreatedAt: "desc" } })` and then calls `prisma.auditLog.create(...)` outside a serialized lock. Concurrent actions read the same `PrevHash`, creating forks in the hash chain. Additionally, no helper verifies the integrity of the hash chain.
- **Concrete Fix:** Wrap `writeAuditLog` chain insertion in an interactive transaction (or retry on contention) and expose an admin `verifyAuditLogChain()` integrity verifier.

#### `MED-06`: User & Admission Number Enumeration in `requestPasswordReset`
- **File & Lines:** [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L345-L363)
- **Checklist Section:** A (Authentication & Sessions)
- **Exploit Scenario:** `requestPasswordReset` returns distinct error messages: `"No student found with that Registration Number"`, `"This student profile has not been claimed yet"`, and `"No account found with that email address"`, allowing an unauthenticated attacker to enumerate valid admission numbers and claimed/unclaimed student accounts.
- **Concrete Fix:** Return a uniform generic response (`{ success: true, message: "If an account matches that identifier, a 6-digit reset code has been sent to the registered email." }`) regardless of whether the account exists.

#### `MED-07`: Unauthenticated `getTerms` and `getActiveTerm` Server Actions
- **File & Lines:** [`src/app/actions/terms.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/terms.ts#L11-L42)
- **Checklist Section:** B (Authorization)
- **Exploit Scenario:** `getTerms()` and `getActiveTerm()` can be invoked by unauthenticated clients to enumerate all academic sessions, term lock states, and result publication flags.
- **Concrete Fix:** Require `requireActiveUser()` on `getTerms()` and `getActiveTerm()`.

#### `MED-08`: Scratch Card Batch Generation Stores Plaintext PINs in Audit Log `NewValue` Check & Missing Step-Up Check
- **File & Lines:** [`src/app/actions/scratchCards.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/scratchCards.ts#L57-L143)
- **Checklist Section:** D (Payments & Scratch Cards)
- **Exploit Scenario:** `generateScratchCardBatch` is marked `requiresStepUpTotp: true` in `CAPABILITY_METADATA.MANAGE_CARDS`, and returns plaintext PINs once for printing. While it hashes PINs with HMAC-SHA256 in `ScratchCard.PinHash`, it should enforce Step-Up TOTP when the actor has 2FA enabled and cap batch size strictly.
- **Concrete Fix:** Enforce Step-Up TOTP check when `actor` has `TotpEnabled` and validate inputs with Zod.

#### `MED-09`: `npm audit` Dependency Vulnerabilities in Transitive Dev/Build Packages
- **File & Lines:** [`package.json`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/package.json#L1-L52)
- **Checklist Section:** I (Secrets, Config & Dependencies)
- **Exploit Scenario:** Outdated transitive dependencies can introduce prototype pollution or ReDoS vulnerabilities.
- **Concrete Fix:** Document and remediate safe non-breaking dependency updates.

---

### LOW Findings

#### `LOW-01`: Inconsistent `bcrypt` Cost Factor (`10` vs `12`)
- **File & Lines:** [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L224), [`src/app/actions/auth.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/auth.ts#L478), [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts#L91), [`src/app/actions/admin.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/admin.ts#L479), [`src/app/actions/profile.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/actions/profile.ts#L28)
- **Checklist Section:** A (Authentication & Sessions)
- **Exploit Scenario:** Password hashing in `auth.ts`, `admin.ts`, and `profile.ts` uses cost factor `10` instead of the required `12+`.
- **Concrete Fix:** Standardize all `bcrypt.hash()` calls to cost factor `12`.

#### `LOW-02`: Unauthenticated Public Download of `System_Architecture.docx`
- **File & Lines:** [`src/app/api/download-architecture/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/download-architecture/route.ts#L5-L29)
- **Checklist Section:** B (Authorization)
- **Exploit Scenario:** Unauthenticated users can download internal architecture documentation from `/api/download-architecture`.
- **Concrete Fix:** Gate `/api/download-architecture` behind `requireRole(["SUPER_ADMIN", "PRINCIPAL", "Admin"])`.

#### `LOW-03`: `/api/debug-env` Endpoint Present in Codebase
- **File & Lines:** [`src/app/api/debug-env/route.ts`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/app/api/debug-env/route.ts#L1-L24)
- **Checklist Section:** H (Logging, Error Handling & Operations)
- **Exploit Scenario:** Even though gated by `requireRole(["SUPER_ADMIN", "Admin"])`, debug environment inspection routes should be disabled in production (`NODE_ENV === "production"`).
- **Concrete Fix:** Return `404 Not Found` in production unless explicitly enabled, and require Step-Up / `MANAGE_SYSTEM` capability.

#### `LOW-04`: Raw `error.message` Returned in Server Action & Route Handler Catch Blocks
- **File & Lines:** Multiple files (`src/app/api/cron/cbt-reaper/route.ts:26`, `src/app/api/setup/route.ts:130`, `src/app/actions/*.ts`)
- **Checklist Section:** H (Logging, Error Handling & Operations)
- **Exploit Scenario:** Returning `error.message` directly from Prisma or internal exceptions can leak table names, constraint names, or SQL connection strings to the client.
- **Concrete Fix:** Introduce a central `safeErrorResponse(error, fallbackMessage)` helper in `src/lib/security/` that preserves intentional domain error messages while masking internal Prisma/database stack traces with a correlation ID.

---

## Required Environment Variables & Secret Rotation Checklist

> [!CAUTION]
> **Immediate Secret Rotation Required (Do NOT commit `.env`):**
> 1. **`SMTP_PASSWORD`**: The Gmail App Password hardcoded in [`src/lib/email.ts:6`](file:///c:/Users/abasi/OneDrive/Desktop/word-of-faith-portal/src/lib/email.ts#L6) **must be revoked immediately** in the Google Account Security console and replaced with a new App Password stored only in `.env` / Vercel Environment Variables.
> 2. **`NEXTAUTH_SECRET`**: Ensure a 32+ byte random secret (`openssl rand -base64 32`) is set in `.env` and production.
> 3. **`SCRATCH_CARD_PEPPER`**: Set a dedicated 32+ byte secret in `.env` and production.
> 4. **`TOTP_ENCRYPTION_KEY`**: Set a 32-byte hex/base64 key for AES-256-GCM encryption of `TotpSecret` at rest (falls back to HKDF-derived key from `NEXTAUTH_SECRET` if unset).
> 5. **`CRON_SECRET`** & **`SETUP_SECRET`**: Set strong random secrets for cron and bootstrap endpoints.

| Environment Variable | Scope | Purpose |
| :--- | :---: | :--- |
| `DATABASE_URL` / `POSTGRES_PRISMA_URL` | Server | PostgreSQL Prisma connection string |
| `DIRECT_URL` / `POSTGRES_URL_NON_POOLING` | Server | PostgreSQL direct connection for migrations |
| `NEXTAUTH_SECRET` | Server | NextAuth JWT encryption & signing secret (min 32 chars) |
| `NEXTAUTH_URL` | Server | Canonical portal origin URL |
| `TOTP_ENCRYPTION_KEY` | Server | AES-256-GCM key for encrypting `User.TotpSecret` at rest |
| `SCRATCH_CARD_PEPPER` | Server | Server-side HMAC-SHA256 pepper for scratch card PINs |
| `PAYSTACK_SECRET_KEY` | Server | Paystack secret key for transaction verification & webhook HMAC |
| `REDIS_URL` | Server | Redis connection string for rate limiting, cache, and BullMQ |
| `RESEND_API_KEY` / `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Server | Transactional email delivery credentials |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Server | Meta WhatsApp Cloud API credentials |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | Server | Termii SMS & WhatsApp gateway credentials |
| `ALOC_API_KEY`, `SDASH_API_KEY` | Server | CBT past-question cloud provider keys |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Server | Google Gemini API key for Faithbot & post-exam CBT explanations |
| `CRON_SECRET` | Server | Bearer secret authenticating `/api/cron/cbt-reaper` |
| `SETUP_SECRET`, `INITIAL_ADMIN_PASSWORD` | Server | Bootstrap protection for `/api/setup` |
