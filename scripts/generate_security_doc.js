const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType
} = require('docx');

const COLOR_NAVY = "1E3A8A";
const COLOR_GREEN = "16A34A";
const COLOR_SLATE = "475569";
const COLOR_DARK = "0F172A";
const COLOR_LIGHT_BG = "F1F5F9";
const COLOR_WHITE = "FFFFFF";

function createHeading1(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    run: { color: COLOR_NAVY, bold: true, size: 30, font: "Calibri" }
  });
}

function createHeading2(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    run: { color: COLOR_GREEN, bold: true, size: 25, font: "Calibri" }
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 110, line: 260 },
    alignment: options.alignment || AlignmentType.LEFT,
    children: [
      new TextRun({
        text: text,
        size: 21,
        font: "Calibri",
        color: options.color || COLOR_DARK,
        bold: options.bold || false,
        italics: options.italics || false
      })
    ]
  });
}

function createBullet(text, boldPrefix = "") {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({ text: boldPrefix + " ", bold: true, size: 21, font: "Calibri", color: COLOR_DARK }));
  }
  children.push(new TextRun({ text: text, size: 21, font: "Calibri", color: COLOR_DARK }));
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70, line: 250 },
    children: children
  });
}

function createCallout(title, text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: COLOR_LIGHT_BG, type: ShadingType.CLEAR },
            borders: {
              left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_NAVY },
              top: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE }
            },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 50 },
                children: [new TextRun({ text: "📌 " + title, bold: true, size: 21, font: "Calibri", color: COLOR_NAVY })]
              }),
              new Paragraph({
                spacing: { after: 0, line: 250 },
                children: [new TextRun({ text: text, size: 20, font: "Calibri", color: COLOR_DARK })]
              })
            ]
          })
        ]
      })
    ]
  });
}

function createCodeBlock(codeText) {
  const lines = codeText.split('\n');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "1E293B", type: ShadingType.CLEAR },
            borders: {
              left: { style: BorderStyle.SINGLE, size: 12, color: "0F172A" },
              top: { style: BorderStyle.SINGLE, size: 12, color: "0F172A" },
              right: { style: BorderStyle.SINGLE, size: 12, color: "0F172A" },
              bottom: { style: BorderStyle.SINGLE, size: 12, color: "0F172A" }
            },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: lines.map(line => new Paragraph({
              spacing: { after: 30 },
              children: [new TextRun({ text: line, font: "Consolas", size: 18, color: "E2E8F0" })]
            }))
          })
        ]
      })
    ]
  });
}

async function buildDocument() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 80 },
            children: [
              new TextRun({ text: "WORD OF FAITH SCHOOLS, UYO", bold: true, size: 34, font: "Calibri", color: COLOR_NAVY })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 50 },
            children: [
              new TextRun({ text: "Security Review & Corrected Architecture (v3)", bold: true, size: 24, font: "Calibri", color: COLOR_GREEN })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [
              new TextRun({ text: "Definitive Architectural Specification & Implementation Blueprint", italics: true, size: 21, font: "Calibri", color: COLOR_SLATE })
            ]
          }),

          // Metadata Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: COLOR_NAVY, type: ShadingType.CLEAR },
                    margins: { top: 80, bottom: 80, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: "Specification Detail", bold: true, color: COLOR_WHITE, font: "Calibri", size: 20 })] })]
                  }),
                  new TableCell({
                    shading: { fill: COLOR_NAVY, type: ShadingType.CLEAR },
                    margins: { top: 80, bottom: 80, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: "Value / Status", bold: true, color: COLOR_WHITE, font: "Calibri", size: 20 })] })]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Document Ref", bold: true, font: "Calibri", size: 20 })] })] }),
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "ES/WOF/2026/ARCH-v3", font: "Calibri", size: 20 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true, font: "Calibri", size: 20 })] })] }),
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "October 30, 2026", font: "Calibri", size: 20 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Standard Base", bold: true, font: "Calibri", size: 20 })] })] }),
                  new TableCell({ margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Solely based on Claude Code's v3 Architecture Specifications", font: "Calibri", size: 20 })] })] })
                ]
              })
            ]
          }),

          new Paragraph({ spacing: { before: 180 } }),

          createHeading1("1. Verdict & Purpose of This Document"),
          createParagraph(
            "Do not adopt Antigravity's v2.0 hardening document (ES/WOF/2026/REV-SEC-02) as it stands. While its directional intent was sound, it was a summary of intentions rather than a complete architecture. Its schema omitted foundational entities (terms with locks, teacher assignments, student enrollments, submission sheets, parent links, invoices, and ledgers) upon which Layer 3 guardrails depend."
          ),
          createParagraph(
            "This v3 document replaces v2.0 for all engineering, architectural, and procurement purposes. It records what to keep, corrects every schema and relational gap, and establishes database-level constraints, atomic queries, and a strict build order."
          ),

          createHeading1("2. What to Keep from v2.0"),
          createBullet("Server-side verification confirming the user is active on every action and data fetch (Layer 3), not merely at login.", "Active User Check:"),
          createBullet("Currency stored strictly as integer kobo, never floating-point numbers.", "Integer Kobo:"),
          createBullet("HMAC with an out-of-band server pepper for scratch-card PINs, paired with atomic SQL updates.", "Cryptographic Cards:"),
          createBullet("Term-lock and submission-sheet status evaluated within the exact same database transaction as the write.", "Transactional Term Locks:"),
          createBullet("Optimistic concurrency enforced through an integer version column on scores and submission sheets.", "Optimistic Locking:"),
          createBullet("Pre-issued offline claim codes for student registration, with enumeration-resistant responses.", "Two-Factor Account Claims:"),
          createBullet("Decomposing the monolithic Admin into distinct roles, governed by a default-deny route policy.", "Role Segregation:"),
          createBullet("Paystack webhook HMAC-SHA512 raw body verification, server-to-server confirmation, and reference idempotency.", "Financial Integrity:"),
          createBullet("Private storage with short-lived signed URLs for bank tellers, with separation of duties.", "Teller Proof Security:"),
          createBullet("Server-side grade recomputation, null for unentered scores, and Zod validation on every input.", "Zero Client Math Trust:"),

          createHeading1("3. Decisions the School Must Make"),
          createParagraph("Four questions are school policy matters that engineers must not settle silently:"),
          createBullet("Grade the exact total (74.5 stays B2) vs round half-up (74.5 becomes 75.0 = A1). Recommended default: Grade exact total (matches WAEC standard). Decided by Principal.", "1. Boundary Rounding:"),
          createBullet("Principal only vs Two-Person rule (Principal request + Administrator approval). Recommended: Two-Person rule. ICT cannot alter grades. Decided by Administrator & Principal.", "2. Sheet Unlock Reversion:"),
          createBullet("TOTP at login for Principal, Bursar, Admissions, ICT. Teachers use password plus step-up OTP for score submissions. Decided by Administrator.", "3. MFA Scope:"),
          createBullet("Allowed only as a controlled correction: written reason, second approver, new version row, original never overwritten. Decided by Principal.", "4. Post-Approval Corrections:"),

          createHeading1("4. Complete Corrected Prisma Schema (v3)"),
          createParagraph("The relational architecture now fully defines all necessary entities:"),
          createCodeBlock(`enum RoleName {
  SUPER_ADMIN
  PRINCIPAL
  BURSAR
  ADMISSIONS
  TEACHER
  FORM_MASTER
  STUDENT
  PARENT
}

enum SubmissionStatus {
  DRAFT
  SUBMITTED
  APPROVED
}

enum CardStatus {
  GENERATED
  ISSUED
  ACTIVE
  EXHAUSTED
}

enum PaymentChannel {
  PAYSTACK
  BANK_TELLER
  CASH_BURSARY
}

enum PaymentStatus {
  PENDING
  APPROVED
  REJECTED
  SUCCESSFUL
}

enum EnrollmentStatus {
  ACTIVE
  PROMOTED
  REPEATING
  WITHDRAWN
}

enum ParentRelationship {
  FATHER
  MOTHER
  GUARDIAN
}

model User {
  id                   String           @id @default(uuid())
  email                String?          @unique
  passwordHash         String
  isActive             Boolean          @default(true)
  tokenVersion         Int              @default(1)
  mustChangePassword   Boolean          @default(false)
  failedLoginAttempts  Int              @default(0)
  lockedUntil          DateTime?
  totpSecret           String?
  totpEnabled          Boolean          @default(false)
  totpBackupCodes      String?
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  roles                UserRole[]
  studentProfile       Student?
  parentProfile        Parent?
  teacherAssignments   TeacherAssignment[]
  auditLogs            AuditLog[]
  submittedSheets      SubmissionSheet[] @relation("SubmittedSheets")
  approvedSheets       SubmissionSheet[] @relation("ApprovedSheets")
  unlockedSheets       SubmissionSheet[] @relation("UnlockedSheets")
  reviewedPayments     Payment_Record[]  @relation("PaymentReviews")
  waivedInvoices       Invoice[]         @relation("WaivedInvoices")
}

model UserRole {
  id         String    @id @default(uuid())
  userId     String
  role       RoleName
  assignedAt DateTime  @default(now())
  assignedBy String?

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, role])
}

model Academic_Term {
  id           String             @id @default(uuid())
  sessionName  String             // "2026/2027"
  termName     String             // "First Term"
  startDate    DateTime?
  endDate      DateTime?
  isActive     Boolean            @default(false)
  isLocked     Boolean            @default(false)
  lockedAt     DateTime?
  lockedBy     String?
  version      Int                @default(1)
  createdAt    DateTime           @default(now())

  enrollments  Enrollment[]
  assignments  TeacherAssignment[]
  sheets       SubmissionSheet[]
  results      Result[]
  invoices     Invoice[]
  payments     Payment_Record[]
  scratchCards ScratchCard[]
}

model ClassArm {
  id           String             @id @default(uuid())
  name         String             @unique // "JSS 1 Gold", "SSS 2 Science"
  level        String             // "Primary", "JSS", "SSS"
  arm          String             // "Gold", "Diamond"

  enrollments  Enrollment[]
  assignments  TeacherAssignment[]
  sheets       SubmissionSheet[]
}

model Subject {
  id           String             @id @default(uuid())
  name         String             // "Mathematics"
  code         String             @unique // "MTH"
  classLevel   String             // "JSS"

  assignments  TeacherAssignment[]
  sheets       SubmissionSheet[]
  results      Result[]
}

model Student {
  id                  String             @id @default(uuid())
  userId              String?            @unique
  admissionNo         String             @unique // "WOF/2026/SEC/001"
  claimCodeHash       String?
  claimCodeExpiresAt  DateTime?
  firstName           String
  lastName            String
  dateOfBirth         DateTime
  gender              String
  createdAt           DateTime           @default(now())

  user                User?              @relation(fields: [userId], references: [id])
  parentLinks         ParentStudentLink[]
  enrollments         Enrollment[]
  results             Result[]
  invoices            Invoice[]
  payments            Payment_Record[]
  claimedScratchCards ScratchCard[]
}

model Parent {
  id                  String             @id @default(uuid())
  userId              String             @unique
  phone               String             @unique
  altPhone            String?
  address             String?
  createdAt           DateTime           @default(now())

  user                User               @relation(fields: [userId], references: [id])
  children            ParentStudentLink[]
}

model ParentStudentLink {
  id                  String             @id @default(uuid())
  parentId            String
  studentId           String
  relationship        ParentRelationship
  isEmergencyContact  Boolean            @default(true)

  parent              Parent             @relation(fields: [parentId], references: [id], onDelete: Cascade)
  student             Student            @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([parentId, studentId])
}

model Enrollment {
  id           String             @id @default(uuid())
  studentId    String
  classArmId   String
  termId       String
  academicYear String             // "2026/2027"
  status       EnrollmentStatus   @default(ACTIVE)

  student      Student            @relation(fields: [studentId], references: [id])
  classArm     ClassArm           @relation(fields: [classArmId], references: [id])
  term         Academic_Term      @relation(fields: [termId], references: [id])

  @@unique([studentId, classArmId, termId])
}

model TeacherAssignment {
  id           String             @id @default(uuid())
  teacherId    String
  classArmId   String
  subjectId    String
  termId       String
  isFormMaster Boolean            @default(false)
  assignedAt   DateTime           @default(now())
  assignedBy   String?

  teacher      User               @relation(fields: [teacherId], references: [id])
  classArm     ClassArm           @relation(fields: [classArmId], references: [id])
  subject      Subject            @relation(fields: [subjectId], references: [id])
  term         Academic_Term      @relation(fields: [termId], references: [id])

  @@unique([teacherId, classArmId, subjectId, termId])
}

model SubmissionSheet {
  id           String             @id @default(uuid())
  classArmId   String
  subjectId    String
  termId       String
  status       SubmissionStatus   @default(DRAFT)
  submittedBy  String?
  submittedAt  DateTime?
  approvedBy   String?
  approvedAt   DateTime?
  unlockedBy   String?
  unlockedReason String?
  version      Int                @default(1)

  classArm     ClassArm           @relation(fields: [classArmId], references: [id])
  subject      Subject            @relation(fields: [subjectId], references: [id])
  term         Academic_Term      @relation(fields: [termId], references: [id])
  submitter    User?              @relation("SubmittedSheets", fields: [submittedBy], references: [id])
  approver     User?              @relation("ApprovedSheets", fields: [approvedBy], references: [id])
  unlocker     User?              @relation("UnlockedSheets", fields: [unlockedBy], references: [id])
  results      Result[]

  @@unique([classArmId, subjectId, termId])
}

model Result {
  id                String             @id @default(uuid())
  submissionSheetId String
  studentId         String
  subjectId         String
  termId            String
  caScoreTenths     Int?               // Integer tenths: 0 to 400 (0.0 to 40.0)
  examScoreTenths   Int?               // Integer tenths: 0 to 600 (0.0 to 60.0)
  totalScoreTenths  Int?               // Integer tenths: 0 to 1000 (0.0 to 100.0)
  grade             String?            // "A1", "B2", etc.
  remark            String?
  version           Int                @default(1)
  updatedAt         DateTime           @updatedAt

  submissionSheet   SubmissionSheet    @relation(fields: [submissionSheetId], references: [id], onDelete: Cascade)
  student           Student            @relation(fields: [studentId], references: [id])
  subject           Subject            @relation(fields: [subjectId], references: [id])
  term              Academic_Term      @relation(fields: [termId], references: [id])

  @@unique([studentId, subjectId, termId])
}

model Invoice {
  id           String             @id @default(uuid())
  studentId    String
  termId       String
  title        String
  amountKobo   BigInt             // Integer kobo
  dueDate      DateTime
  isWaived     Boolean            @default(false)
  waivedBy     String?
  waivedReason String?
  createdAt    DateTime           @default(now())

  student      Student            @relation(fields: [studentId], references: [id])
  term         Academic_Term      @relation(fields: [termId], references: [id])
  waiverUser   User?              @relation("WaivedInvoices", fields: [waivedBy], references: [id])
  payments     Payment_Record[]

  @@index([studentId, termId])
}

model Payment_Record {
  id              String           @id @default(uuid())
  studentId       String
  termId          String
  invoiceId       String?
  amountKobo      BigInt
  reference       String?          @unique
  channel         PaymentChannel
  status          PaymentStatus    @default(PENDING)
  receiptUrl      String?
  receiptHash     String?          // SHA-256 hash
  rejectionReason String?
  reviewedBy      String?
  reviewedAt      DateTime?
  paidAt          DateTime         @default(now())

  student         Student          @relation(fields: [studentId], references: [id])
  term            Academic_Term    @relation(fields: [termId], references: [id])
  invoice         Invoice?         @relation(fields: [invoiceId], references: [id])
  reviewer        User?            @relation("PaymentReviews", fields: [reviewedBy], references: [id])

  @@index([studentId, termId])
}

model ScratchCard {
  id                   String           @id @default(uuid())
  serialNumber         String           @unique
  pinHmac              String           @unique
  keyId                String
  status               CardStatus       @default(GENERATED)
  usageCount           Int              @default(0)
  maxUsage             Int              @default(5)
  usedByStudentId      String?
  usedByTermId         String?
  activeWindowExpires  DateTime?
  batchId              String
  issuedAt             DateTime?
  issuedBy             String?
  createdAt            DateTime         @default(now())

  student              Student?         @relation(fields: [usedByStudentId], references: [id])
  term                 Academic_Term?   @relation(fields: [usedByTermId], references: [id])
}

model AuditLog {
  id         String             @id @default(uuid())
  actorId    String?            // Nullable for unauth attempts / webhooks
  action     String
  entity     String
  entityId   String
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime           @default(now())

  actor      User?              @relation(fields: [actorId], references: [id])
}`),

          createHeading1("5. Database-Level Enforcement & SQL Triggers"),
          createParagraph("Execute the following migrations directly in PostgreSQL:"),
          createCodeBlock(`-- 1. Score Range Constraints
ALTER TABLE "Result" 
  ADD CONSTRAINT "chk_ca_range" 
  CHECK ("caScoreTenths" IS NULL OR ("caScoreTenths" >= 0 AND "caScoreTenths" <= 400));

ALTER TABLE "Result" 
  ADD CONSTRAINT "chk_exam_range" 
  CHECK ("examScoreTenths" IS NULL OR ("examScoreTenths" >= 0 AND "examScoreTenths" <= 600));

ALTER TABLE "Result" 
  ADD CONSTRAINT "chk_total_sum" 
  CHECK (
    ("caScoreTenths" IS NULL AND "examScoreTenths" IS NULL AND "totalScoreTenths" IS NULL) OR
    ("totalScoreTenths" = COALESCE("caScoreTenths", 0) + COALESCE("examScoreTenths", 0))
  );

-- 2. AuditLog Immutability Trigger
REVOKE UPDATE, DELETE ON "AuditLog" FROM PUBLIC;

CREATE OR REPLACE FUNCTION trg_protect_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL: The AuditLog table is append-only. Modifying or deleting audit records is strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_tampering
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION trg_protect_audit_log();`),

          createHeading1("6. Implementer's Brief & Build Order"),
          createBullet("Step 1: Replace prisma/schema.prisma with the v3 schema; run migration on Neon PostgreSQL.", "1. Database Migration:"),
          createBullet("Step 2: Build src/lib/authz.ts with requireActiveUser, requireRole, assertTeacherAssigned, and assertParentAccess.", "2. Policy Engine:"),
          createBullet("Step 3: Refactor src/app/actions/results.ts for integer tenths, atomic lock transactions, and server WAEC calculations.", "3. Score Engine:"),
          createBullet("Step 4: Implement invoice ledgers, Paystack webhook HMAC listener, and duplicate receipt hash detection.", "4. Fee Clearance:"),
          createBullet("Step 5: Construct dedicated /portal/teacher score grid with local draft caching and Form Master hub.", "5. Teacher Workspace:"),
          createBullet("Step 6: Build hardened /portal/admin suite with live metrics, two-person unlock workflow, and scratch card generator.", "6. Admin Suite:"),
          createBullet("Step 7: Execute automated test suite across all 8 roles, verify zero build errors, and deploy.", "7. Automated Testing:")
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  
  const publicPath = path.join(__dirname, '..', 'public', 'downloads', 'Word_of_Faith_Schools_Security_Architecture_v3.docx');
  fs.writeFileSync(publicPath, buffer);
  console.log(`Saved to: ${publicPath}`);

  const downloadPath = "C:\\Users\\abasi\\Downloads\\Word_of_Faith_Schools_Security_Architecture_v3.docx";
  try {
    fs.writeFileSync(downloadPath, buffer);
    console.log(`Saved to Downloads: ${downloadPath}`);
  } catch (err) {
    console.warn("Could not write to Downloads path directly:", err.message);
  }

  const desktopPath = "C:\\Users\\abasi\\OneDrive\\Desktop\\Word_of_Faith_Schools_Security_Architecture_v3.docx";
  try {
    fs.writeFileSync(desktopPath, buffer);
    console.log(`Saved to Desktop: ${desktopPath}`);
  } catch (err) {
    console.warn("Could not write to Desktop path directly:", err.message);
  }
}

buildDocument().catch(err => {
  console.error("Error generating docx:", err);
  process.exit(1);
});
