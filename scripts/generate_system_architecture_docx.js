const fs = require("fs");
const path = require("path");
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
  ShadingType,
  PageBreak,
} = require("docx");

const COLOR_FOREST = "143424";
const COLOR_NAVY = "0F172A";
const COLOR_GOLD = "B48A1E";
const COLOR_GREEN = "15803D";
const COLOR_SLATE = "475569";
const COLOR_DARK = "1E293B";
const COLOR_LIGHT_BG = "F8FAFC";
const COLOR_CALLOUT_BG = "F0FDF4";
const COLOR_WARN_BG = "FEF2F2";
const COLOR_BORDER = "CBD5E1";
const COLOR_WHITE = "FFFFFF";

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 420, after: 180 },
    border: {
      bottom: { color: COLOR_FOREST, space: 4, style: BorderStyle.SINGLE, size: 12 },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 32,
        font: "Calibri",
        color: COLOR_FOREST,
      }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 26,
        font: "Calibri",
        color: COLOR_NAVY,
      }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 90 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        font: "Calibri",
        color: COLOR_GREEN,
      }),
    ],
  });
}

function p(text, options = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 120, line: 276 },
    alignment: options.alignment || AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        size: options.size || 21,
        font: options.font || "Calibri",
        color: options.color || COLOR_DARK,
        bold: options.bold || false,
        italics: options.italics || false,
      }),
    ],
  });
}

function bullet(text, boldPrefix = "", level = 0) {
  const children = [];
  if (boldPrefix) {
    children.push(
      new TextRun({
        text: boldPrefix + " ",
        bold: true,
        size: 21,
        font: "Calibri",
        color: COLOR_NAVY,
      })
    );
  }
  children.push(
    new TextRun({
      text,
      size: 21,
      font: "Calibri",
      color: COLOR_DARK,
    })
  );
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80, line: 260 },
    children,
  });
}

function callout(title, bodyText, isWarning = false) {
  const fill = isWarning ? COLOR_WARN_BG : COLOR_CALLOUT_BG;
  const accent = isWarning ? "B91C1C" : COLOR_FOREST;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR },
            borders: {
              left: { style: BorderStyle.SINGLE, size: 24, color: accent },
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 21,
                    font: "Calibri",
                    color: accent,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 0, line: 260 },
                children: [
                  new TextRun({
                    text: bodyText,
                    size: 20,
                    font: "Calibri",
                    color: COLOR_DARK,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function diagramBlock(title, asciiLines) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: COLOR_FOREST, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    font: "Calibri",
                    size: 20,
                    color: COLOR_WHITE,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "0F172A", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: asciiLines.map(
              (line) =>
                new Paragraph({
                  spacing: { after: 20, line: 220 },
                  children: [
                    new TextRun({
                      text: line,
                      font: "Consolas",
                      size: 17,
                      color: "E2E8F0",
                    }),
                  ],
                })
            ),
          }),
        ],
      }),
    ],
  });
}

function makeTable(headers, rows, colWidths = null) {
  const headerCells = headers.map((h, i) => {
    const cellOpts = {
      shading: { fill: COLOR_FOREST, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_FOREST },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_GOLD },
        left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_FOREST },
        right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_FOREST },
      },
      children: [
        new Paragraph({
          spacing: { after: 0 },
          children: [
            new TextRun({
              text: h,
              bold: true,
              color: COLOR_WHITE,
              font: "Calibri",
              size: 19,
            }),
          ],
        }),
      ],
    };
    if (colWidths && colWidths[i]) {
      cellOpts.width = { size: colWidths[i], type: WidthType.PERCENTAGE };
    }
    return new TableCell(cellOpts);
  });

  const dataRows = rows.map((row, rowIdx) => {
    const bg = rowIdx % 2 === 1 ? COLOR_LIGHT_BG : COLOR_WHITE;
    return new TableRow({
      children: row.map((cellText, colIdx) => {
        const cellOpts = {
          shading: { fill: bg, type: ShadingType.CLEAR },
          margins: { top: 75, bottom: 75, left: 110, right: 110 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
          },
          children: [
            new Paragraph({
              spacing: { after: 0, line: 240 },
              children: [
                new TextRun({
                  text: String(cellText ?? ""),
                  bold: colIdx === 0,
                  font: "Calibri",
                  size: 18,
                  color: COLOR_DARK,
                }),
              ],
            }),
          ],
        };
        if (colWidths && colWidths[colIdx]) {
          cellOpts.width = { size: colWidths[colIdx], type: WidthType.PERCENTAGE };
        }
        return new TableCell(cellOpts);
      }),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headerCells }), ...dataRows],
  });
}

function spacer(height = 140) {
  return new Paragraph({ spacing: { before: height, after: 0 } });
}

async function generateArchitectureDoc() {
  const children = [
    // =========================================================================
    // TITLE PAGE
    // =========================================================================
    spacer(900),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "WORD OF FAITH GROUP OF SCHOOLS, UYO",
          bold: true,
          size: 28,
          font: "Calibri",
          color: COLOR_GOLD,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: "COMPLETE SYSTEM ARCHITECTURE & SECURITY AUDIT",
          bold: true,
          size: 44,
          font: "Calibri",
          color: COLOR_FOREST,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "As-Built Technical Specification, Database Schema, Module Reference, Security Review, and Operational Guide",
          italics: true,
          size: 23,
          font: "Calibri",
          color: COLOR_SLATE,
        }),
      ],
    }),
    makeTable(
      ["Document Property", "Details"],
      [
        ["System Name", "Word of Faith Schools Digital Portal & CBT Platform"],
        ["Document Identifier", "WOFS-ARCH-2026-COMPLETE (As-Built Codebase Analysis)"],
        ["Date of Analysis", "November 2, 2026"],
        ["Production URL", "https://wofs.vercel.app"],
        ["Repository", "https://github.com/Constantine1-web/word-of-faith-portal.git (branch: main)"],
        ["Framework & Runtime", "Next.js 16.2.9 (App Router + Webpack + Serwist PWA) / React 19.2.4 / TypeScript 5"],
        ["Database & ORM", "Neon Serverless PostgreSQL + Prisma ORM 5.22.0 (31 Models, 12 Enums)"],
        ["Intended Audience", "School Proprietors, Principals, Bursars, ICT Administrators, and Software Engineers"],
      ],
      [32, 68]
    ),
    spacer(300),
    callout(
      "Executive Summary for School Leadership",
      "This document describes the complete software system powering Word of Faith Group of Schools. Every section is derived directly from the live source code—never from assumptions. The first sections are written in plain language so non-technical school administrators can understand how admissions, results, fees, scratch cards, and Computer-Based Testing (CBT) work together. Later sections provide exact database tables, API references, security findings, and technical debt for the engineering team."
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // TABLE OF CONTENTS
    // =========================================================================
    h1("Table of Contents"),
    p("1. System Overview & Module Interconnections", { bold: true }),
    bullet("1.1 Purpose of the System (Administrator's Guide)"),
    bullet("1.2 Complete Technology Stack"),
    bullet("1.3 Repository & Folder Structure"),
    bullet("1.4 How the Core Modules Connect"),
    p("2. Layered Architecture & Request Lifecycle", { bold: true }),
    bullet("2.1 Five-Layer Defense-in-Depth Architecture"),
    bullet("2.2 End-to-End Request Flow"),
    bullet("2.3 Component Interaction Diagram"),
    p("3. Database Architecture & Entity-Relationship Reference", { bold: true }),
    bullet("3.1 Database Overview & PostgreSQL Integrity Constraints"),
    bullet("3.2 Enumerations (12 Enums)"),
    bullet("3.3 Complete Model & Field Reference (All 31 Tables)"),
    bullet("3.4 Entity-Relationship (ER) Diagram"),
    p("4. Authentication, Authorization & Access Control", { bold: true }),
    bullet("4.1 Onboarding & Registration Flows (Claim Codes vs. Email OTP)"),
    bullet("4.2 Login, Session Lifetime, Account Lockout & TokenVersion"),
    bullet("4.3 Roles, Granular Role Assignments & 14 Capabilities Matrix"),
    bullet("4.4 Separation of Duties (SoD) & Step-Up TOTP 2FA"),
    bullet("4.5 Route & Action Protection Mechanisms"),
    p("5. Feature Modules Deep Dive", { bold: true }),
    bullet("5.1 Public Marketing Website, Online Admissions & Faithbot AI"),
    bullet("5.2 Student & Parent Portal"),
    bullet("5.3 Teacher & Form Master Workspace (Grid + CSV Staging Import)"),
    bullet("5.4 Terminal Results, Integer-Tenths Grading, Broadsheets & Report Cards"),
    bullet("5.5 Finance, Tuition Clearance, Paystack Webhooks & Scratch Cards"),
    bullet("5.6 Computer-Based Testing (CBT) & 2-Strike Integrity Subsystem"),
    bullet("5.7 Admin Control Center & Tamper-Evident SHA-256 Audit Explorer"),
    p("6. Academic Structure: Sessions, Classes, Arms, Subjects & Allocations", { bold: true }),
    bullet("6.1 Academic Sessions & Terms (Active Pointer & Global Freeze)"),
    bullet("6.2 Classes, Arms & Form Master Designation"),
    bullet("6.3 Subjects, Enrollments & Teacher-Subject-Class Allocations"),
    p("7. Complete Routes, API Endpoints & Server Actions Reference", { bold: true }),
    bullet("7.1 REST API Route Handlers (/api/*)"),
    bullet("7.2 Portal & Public Page Routes"),
    bullet("7.3 Server Actions Reference (All 11 Action Modules)"),
    p("8. Code-Verified Security Review & Remediation Plan", { bold: true }),
    bullet("8.1 Positive Security Controls Implemented in Code"),
    bullet("8.2 Identified Vulnerabilities, Severity Ratings & Recommended Fixes"),
    p("9. Deployment, Configuration & Operations", { bold: true }),
    bullet("9.1 Environment Variables Reference"),
    bullet("9.2 Build Pipeline, Hosting & Background Worker Setup"),
    p("10. Gaps, Technical Debt & Recommended Roadmap", { bold: true }),
    bullet("10.1 Incomplete or Stubbed Features"),
    bullet("10.2 Architectural Technical Debt & Prioritized Improvements"),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 1: OVERVIEW
    // =========================================================================
    h1("1. System Overview & Module Interconnections"),
    h2("1.1 Purpose of the System (Administrator's Guide)"),
    p(
      "The Word of Faith Group of Schools Portal is an all-in-one academic, financial, and examination management platform built for nursery, primary, and secondary education in Uyo, Akwa Ibom State. In plain terms, it replaces paper registers, manual score sheets, physical notice boards, and unverified fee receipts with a single digital system shared by five groups of people:"
    ),
    bullet(
      "Prospective Parents & Applicants can learn about the school on the public website, ask questions to the Faithbot AI assistant, and submit a 3-step online admission application—receiving automatic confirmation emails and SMS/WhatsApp notifications when their application is received, approved, or declined.",
      "1. Prospective Families:"
    ),
    bullet(
      "Enrolled Students & Parents can sign in to view their academic dashboard, pay tuition fees online via Paystack or upload bank teller receipts, redeem scratch cards to view and print terminal report cards, message teachers, and take timed WAEC/NECO/UTME Computer-Based Tests (CBT).",
      "2. Students & Parents:"
    ),
    bullet(
      "Subject Teachers can enter Continuous Assessment (CA, out of 40) and Examination (out of 60) scores either directly in an interactive spreadsheet grid or by downloading and re-uploading a class roster CSV template. Once submitted, score sheets lock automatically so grades cannot be silently altered.",
      "3. Subject Teachers:"
    ),
    bullet(
      "Form Masters oversee an entire class arm (such as JSS 1 Gold), record daily student attendance, evaluate affective and psychomotor behavioral traits (punctuality, neatness, sports), write terminal remarks, and review class-wide performance.",
      "4. Form Masters:"
    ),
    bullet(
      "School Leadership (Principal, Bursar, Admissions Officer, and ICT Super Admin) manage academic sessions/terms, approve fee payments under strict Separation of Duties (no staff member can approve a payment or unlock request they submitted themselves), generate cryptographic scratch cards, compute and publish class broadsheets, lift CBT day locks, and inspect a tamper-evident SHA-256 audit log.",
      "5. Administrators & Leadership:"
    ),

    h2("1.2 Complete Technology Stack"),
    p("Every library and service listed below is verified directly from package.json and the application source files:"),
    makeTable(
      ["Layer / Category", "Technology & Version", "Role in the Codebase"],
      [
        ["Application Framework", "Next.js 16.2.9 (App Router)", "Full-stack React framework using Server Components, Server Actions, and src/proxy.ts edge routing."],
        ["UI Library", "React 19.2.4 & React DOM 19.2.4", "Client and Server component rendering across public pages and portal dashboards."],
        ["Language", "TypeScript 5", "Static type checking across frontend components, server actions, and Prisma queries."],
        ["Database", "Neon Serverless PostgreSQL", "Cloud PostgreSQL database enforcing relational foreign keys, CHECK constraints, and triggers."],
        ["ORM", "Prisma 5.22.0 (@prisma/client)", "Schema definition (prisma/schema.prisma) and type-safe database client (src/lib/db.ts)."],
        ["Authentication", "NextAuth.js 4.24.14 + bcryptjs 3.0.3", "JWT-based Credentials authentication (8-hour sessions), password hashing, and role hydration."],
        ["Progressive Web App", "Serwist 9.5.11 (@serwist/next)", "Service worker generation (src/app/sw.ts -> public/sw.js) for offline asset caching."],
        ["AI Study Assistant", "Vercel AI SDK 6.0.208 + @ai-sdk/google 3.0.83", "Powers Faithbot (/api/chat) using Google Gemini (gemini-flash-lite-latest) + Wikipedia search."],
        ["Email Dispatch", "Nodemailer 7.0.13", "Sends admission notifications, verification OTPs, and password reset codes over Gmail SMTP."],
        ["Caching & Queues", "ioredis 5.11.1 + BullMQ 5.79.1", "Optional Redis cache (src/lib/cache.ts), rate limiter (src/lib/rateLimit.ts), and background worker (src/worker.ts)."],
        ["Charts & Animations", "Recharts 3.9.0 + Framer Motion 12.42.0", "Admin analytics charts and smooth page/modal transitions."],
        ["CBT Question Providers", "SdashAPI + ALOC API + Local Bank", "Three-tier resilient past-question fetcher (src/lib/cbt-api.ts) + PostgreSQL CbtQuestion bank."],
      ],
      [25, 30, 45]
    ),

    h2("1.3 Repository & Folder Structure"),
    diagramBlock("Project Directory Tree (Verified from Workspace)", [
      "word-of-faith-portal/",
      "├── prisma/",
      "│   ├── schema.prisma                # 31 models, 12 enums (PostgreSQL schema)",
      "│   ├── seed.ts                      # Initial TypeScript seed script",
      "│   └── seed.js                      # Legacy JS seed script",
      "├── public/                          # Static assets, school logos, PWA manifest, sw.js",
      "├── scripts/",
      "│   ├── apply_v3_sql_and_seed.js     # Installs SQL CHECKs, AuditLog trigger, partial indexes & seeds v3 accounts",
      "│   ├── run_b7_acceptance_tests.ts   # Automated domain test suite (grading, ranking, SoD, capabilities, TOTP)",
      "│   ├── backup.ts                    # Automated JSON database backup utility",
      "│   └── generate_security_doc.js     # Architecture specification Word generator",
      "├── src/",
      "│   ├── proxy.ts                     # Next.js 16 Layer-2 Edge gatekeeper & security header injector",
      "│   ├── worker.ts                    # Standalone BullMQ + node-cron background worker process",
      "│   ├── server/",
      "│   │   ├── domain/grading.ts        # Integer-tenths WAEC/Primary grading & 1-2-2-4 competition ranking",
      "│   │   └── security/",
      "│   │       ├── capabilities.ts      # 14 Capabilities, FULL/FINANCE/REGISTRY presets, Separation of Duties",
      "│   │       └── totp.ts              # Pure Node.js RFC 6238 TOTP 2FA & recovery code generator",
      "│   ├── lib/",
      "│   │   ├── auth.ts                  # NextAuth Credentials provider, lockout & JWT/session callbacks",
      "│   │   ├── authz.ts                 # Layer-3 DAL guards (requireActiveUser, requireCapability, writeAuditLog)",
      "│   │   ├── db.ts                    # Singleton PrismaClient with Neon PostgreSQL connection",
      "│   │   ├── email.ts                 # Nodemailer SMTP service + Admission Received/Approved/Rejected templates",
      "│   │   ├── cbt-api.ts               # SdashAPI -> ALOC API -> Offline fallback question fetcher",
      "│   │   ├── grading.ts               # Tenths conversion helpers (toTenths, fromTenths, calculateWAECGradeFromTenths)",
      "│   │   ├── cache.ts                 # Redis cache wrapper with graceful null fallback",
      "│   │   ├── rateLimit.ts             # Redis token-bucket rate limiter (fails open if Redis is absent)",
      "│   │   ├── redis.ts                 # ioredis client with in-memory mock fallback",
      "│   │   └── queue.ts                 # Inline emailQueue adapter calling sendEmail()",
      "│   ├── components/",
      "│   │   ├── cbt/QuizClient.tsx       # Hardened CBT exam UI (fullscreen, watermark, 2-strike telemetry)",
      "│   │   ├── dashboard/               # AdminDashboard, TeacherDashboard, StudentDashboard, Sidebar, Attendance",
      "│   │   └── Faithbot.tsx             # Floating AI study assistant widget",
      "│   └── app/",
      "│       ├── actions/                 # 11 Server Action modules (admin, results, cbt, scratchCards, payments, etc.)",
      "│       ├── api/                     # REST endpoints (admissions, auth, chat, webhooks/paystack, debug-*, setup)",
      "│       ├── admissions/page.tsx      # Public 3-step online admission application wizard",
      "│       └── portal/                  # Authenticated portal (admin/*, teacher/*, (authenticated)/*, broadsheet/*)",
      "└── next.config.ts                   # Serwist PWA wrapper + serverExternalPackages configuration",
    ]),

    h2("1.4 How the Core Modules Connect"),
    p(
      "The modules do not operate in isolation; data created in one module directly governs what is permitted in another:"
    ),
    bullet(
      "Online Admissions -> Student Directory & Claim Codes: When an applicant submits the public form (/admissions), an Admission_Application row is created and an acknowledgment email is sent. When an Admin approves the application in /portal/admin/admissions, enrollApplicantToStudent() creates a Student record assigned to a Class arm, generates a 6-character one-time Claim Code (stored as a SHA-256 hash in StudentClaim), and emails the Admission Number and Claim Code to the parent.",
      "1. Admissions feeds Student Onboarding:"
    ),
    bullet(
      "Academic Setup -> Teacher Workspace: The Principal/Admin creates an active Academic_Term (/portal/admin/terms), creates Class arms (/portal/admin/classes), and maps Teachers to Subjects and Classes (/portal/admin/teachers -> Teacher_Subject_Map). When a Teacher logs into /portal/teacher, they only see the exact Class arms and Subjects assigned to them for the active term.",
      "2. Academic Setup scopes Teacher Scoring:"
    ),
    bullet(
      "Teacher Scoring -> Broadsheets -> Report Cards: Teachers enter CA (0–40.0) and Exam (0–60.0) scores in /portal/teacher, which are stored as integer tenths (0–400 and 0–600) in Result and linked to a Subject_Submission sheet. Once sheets are submitted and approved, the Principal computes the ClassBroadsheet in /portal/admin/results, signs off, and publishes versioned ReportCard snapshots.",
      "3. Teacher Scores feed Broadsheets & Report Cards:"
    ),
    bullet(
      "Finance & Scratch Cards -> Student Result Checker: Before a student can view their terminal results in /portal/results, verifyScratchCard() first calls checkStudentFeeClearance(studentId, termId) to verify that the student's tuition Invoice is paid (or HasPaidFees is true via an approved Payment_Record), and then atomically binds and decrements a valid HMAC-SHA256 Scratch_Card.",
      "4. Fee Clearance & Scratch Cards gate Result Viewing:"
    ),
    bullet(
      "CBT Engine -> Admin Integrity Center: When a student launches a CBT exam in /portal/cbt/quiz, startAttempt() snapshots shuffled questions into CbtAttemptQuestion (without exposing CbtAnswerKey to the browser). If the student exits fullscreen or switches tabs twice for 3+ seconds, reportIntegrityEvent() terminates the attempt and writes a CbtDayLock row for the current Africa/Lagos calendar day, which only a Teacher, Form Master, or Principal can lift in /portal/admin/cbt.",
      "5. CBT Telemetry feeds Admin Day-Lock Oversight:"
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 2: ARCHITECTURE
    // =========================================================================
    h1("2. Layered Architecture & Request Lifecycle"),
    h2("2.1 Five-Layer Defense-in-Depth Architecture"),
    p(
      "The application is structured around five distinct layers so that user interface convenience is never mistaken for backend security:"
    ),
    makeTable(
      ["Layer", "Primary Files", "Responsibility"],
      [
        [
          "Layer 1: Client & PWA Presentation",
          "src/app/**/page.tsx, src/components/**, src/app/sw.ts",
          "Renders public marketing pages, role-aware Sidebar navigation, interactive Teacher score grids, CSV import previews, and the fullscreen CBT client.",
        ],
        [
          "Layer 2: Edge Routing & Header Proxy",
          "src/proxy.ts",
          "Intercepts every /portal/* request before page rendering. Injects CSP/clickjacking headers (X-Frame-Options: DENY), enforces default-deny JWT validation, and restricts /portal/admin/* and /portal/teacher/* by role.",
        ],
        [
          "Layer 3: Server Action & DAL Policy Gate",
          "src/lib/authz.ts, src/app/actions/*.ts, src/app/api/**/route.ts",
          "Re-verifies the user against PostgreSQL on every mutation (requireActiveUser, requireCapability, requireRole, assertTeacherAssigned, assertFormMasterAssigned) and writes hash-chained AuditLog entries.",
        ],
        [
          "Layer 4: Domain & Cryptographic Services",
          "src/server/domain/grading.ts, src/server/security/capabilities.ts, src/server/security/totp.ts, src/lib/grading.ts",
          "Pure, deterministic domain logic: integer-tenths grading without rounding, 1-2-2-4 competition ranking, Separation of Duties assertions, HMAC-SHA256 scratch card hashing, and RFC 6238 TOTP verification.",
        ],
        [
          "Layer 5: Relational Persistence & SQL Guards",
          "prisma/schema.prisma, scripts/apply_v3_sql_and_seed.js, Neon PostgreSQL",
          "Enforces data integrity at the database engine level using CHECK constraints (chk_ca_tenths_range, payment_sod, unlock_sod), partial unique indexes, and the prevent_audit_tampering trigger.",
        ],
      ],
      [22, 30, 48]
    ),

    h2("2.2 End-to-End Request Flow"),
    p("When a user performs a privileged action (for example, a Teacher saving student scores or a Bursar approving a bank teller receipt), the request travels through the following pipeline:"),
    bullet("Step 1 — Browser Invocation: The React Client Component invokes a Next.js Server Action (POST request with serialized arguments and session cookie)."),
    bullet("Step 2 — Edge Proxy Inspection (src/proxy.ts): Next.js executes proxy(request), attaches security headers (X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Content-Security-Policy: frame-ancestors 'none'), decodes the NextAuth JWT, and blocks unauthenticated or unauthorized zone access."),
    bullet("Step 3 — Layer-3 Database Re-Verification (src/lib/authz.ts): Inside the Server Action, requireActiveUser() queries prisma.user.findUnique() to confirm the user still exists, IsActive === true, LockedUntil is not in the future, and User.TokenVersion matches the JWT's tokenVersion."),
    bullet("Step 4 — Capability / Tenant Scope Check: The action calls requireCapability(), assertTeacherAssigned(classId, subjectId), or assertSeparationOfDuties(actorId, submittedById) to verify fine-grained authorization."),
    bullet("Step 5 — Transactional Mutation & Audit Chaining: Within prisma.$transaction(), the business records are updated alongside optimistic concurrency checks (Version increment), and writeAuditLog() computes SHA-256(prevHash + canonicalPayload) before inserting an immutable AuditLog row."),
    bullet("Step 6 — Cache Revalidation: revalidatePath() refreshes the affected Next.js Server Component routes and returns a structured JSON result to the client."),

    h2("2.3 Component Interaction Diagram"),
    diagramBlock("System Component & Data Flow Diagram", [
      "+-----------------------------------------------------------------------------------+",
      "|                        CLIENT BROWSERS & PWA (React 19)                           |",
      "|  [Public Site & Admissions]  [Student/Parent Portal]  [Teacher Hub]  [Admin Suite]|",
      "+-----------------+-----------------------+-------------------+---------------------+",
      "                  |                       |                   |",
      "                  v                       v                   v",
      "+-----------------------------------------------------------------------------------+",
      "|           LAYER 2: NEXT.JS 16 EDGE PROXY (src/proxy.ts)                           |",
      "|  • Security Headers (CSP frame-ancestors 'none', X-Frame-Options: DENY)           |",
      "|  • Default-Deny JWT Gate for /portal/*  • Zone Gates (/portal/admin, /teacher)    |",
      "+-----------------+-------------------------------------------+---------------------+",
      "                  |                                           |",
      "                  v                                           v",
      "+---------------------------------------+   +---------------------------------------+",
      "|   REST API ROUTES (src/app/api/*)     |   |  SERVER ACTIONS (src/app/actions/*)   |",
      "|  • POST /api/admissions (Public Form) |   |  • admin.ts      • results.ts         |",
      "|  • POST /api/chat (Faithbot Gemini)   |   |  • cbt.ts        • scratchCards.ts    |",
      "|  • POST /api/webhooks/paystack (HMAC) |   |  • payments.ts   • terms.ts           |",
      "|  • /api/auth/[...nextauth] (JWT)      |   |  • auth.ts       • attendance/msg     |",
      "+-----------------+---------------------+   +-----------------+---------------------+",
      "                  |                                           |",
      "                  |         +---------------------------------+",
      "                  |         |",
      "                  |         v",
      "                  |  +--------------------------------------------------------------+",
      "                  |  | LAYER 3 & 4: POLICY ENGINE & DOMAIN SERVICES                 |",
      "                  |  | • src/lib/authz.ts (requireActiveUser, can, writeAuditLog)   |",
      "                  |  | • src/server/security/capabilities.ts (14 Caps + SoD Check)  |",
      "                  |  | • src/server/security/totp.ts (RFC 6238 Step-Up 2FA)         |",
      "                  |  | • src/server/domain/grading.ts (Tenths Grade & 1-2-2-4 Rank) |",
      "                  |  +------------------------------+-------------------------------+",
      "                  |                                 |",
      "                  +----------------+----------------+",
      "                                   |",
      "                                   v",
      "+-----------------------------------------------------------------------------------+",
      "|        LAYER 5: NEON SERVERLESS POSTGRESQL (Prisma 5.22.0 — 31 Models)            |",
      "|  • CHECK Constraints: chk_ca_tenths_range (0..400), chk_exam_tenths_range (0..600)|",
      "|  • SoD Constraints: payment_sod (ReviewedBy <> SubmittedBy), unlock_sod           |",
      "|  • Partial Unique Indexes: one_active_attempt, one_open_unlock, one_current_rc    |",
      "|  • Immutability Trigger: prevent_audit_tampering (BEFORE UPDATE OR DELETE)        |",
      "+-----------------------------------------------------------------------------------+",
    ]),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 3: DATABASE
    // =========================================================================
    h1("3. Database Architecture & Entity-Relationship Reference"),
    h2("3.1 Database Overview & PostgreSQL Integrity Constraints"),
    p(
      "The database is hosted on Neon Serverless PostgreSQL and managed through Prisma ORM (prisma/schema.prisma). It comprises 12 enumerations and 31 tables. Crucially, business rules that must never be bypassed—even by direct SQL scripts—are enforced by custom PostgreSQL constraints and triggers installed by scripts/apply_v3_sql_and_seed.js:"
    ),
    makeTable(
      ["Constraint / Index / Trigger Name", "Target Table", "SQL Rule Enforced"],
      [
        ["chk_ca_tenths_range", "Result", "CAScoreTenths IS NULL OR (CAScoreTenths >= 0 AND CAScoreTenths <= 400)"],
        ["chk_exam_tenths_range", "Result", "ExamScoreTenths IS NULL OR (ExamScoreTenths >= 0 AND ExamScoreTenths <= 600)"],
        ["chk_invoice_kobo_nonnegative", "Invoice", "AmountKobo >= 0"],
        ["chk_payment_kobo_nonnegative", "Payment_Record", "AmountKobo >= 0"],
        ["payment_sod", "Payment_Record", "ReviewedBy IS NULL OR SubmittedBy IS NULL OR ReviewedBy <> SubmittedBy (Separation of Duties)"],
        ["unlock_sod", "UnlockRequest", "decidedById IS NULL OR decidedById <> requestedById (Separation of Duties)"],
        ["one_active_attempt", "CbtAttempt", "UNIQUE (studentId) WHERE status = 'ACTIVE' (Partial Unique Index)"],
        ["one_open_unlock", "UnlockRequest", "UNIQUE (sheetId) WHERE status IN ('REQUESTED','APPROVED') (Partial Unique Index)"],
        ["one_current_report_card", "ReportCard", "UNIQUE (studentId, termId) WHERE supersededAt IS NULL (Partial Unique Index)"],
        ["prevent_audit_tampering", "AuditLog", "BEFORE UPDATE OR DELETE trigger raising a fatal exception to enforce append-only audit logs"],
      ],
      [28, 20, 52]
    ),

    h2("3.2 Enumerations (12 Enums in prisma/schema.prisma)"),
    makeTable(
      ["Enum Name", "Allowed Values", "Purpose"],
      [
        ["RoleName", "SUPER_ADMIN, PRINCIPAL, BURSAR, ADMISSIONS, TEACHER, FORM_MASTER, STUDENT, PARENT", "Granular role assignments stored in UserRoleAssignment and StaffInvite."],
        ["Capability", "MANAGE_USERS, MANAGE_STRUCTURE, MANAGE_STUDENTS, CORRECT_SCORES, APPROVE_RESULTS, PUBLISH_RESULTS, UNLOCK_SHEETS, FREEZE_TERM, MANAGE_FINANCE, APPROVE_PAYMENTS, MANAGE_CARDS, MANAGE_CBT, VIEW_AUDIT, MANAGE_SYSTEM", "14 fine-grained administrative permission flags stored on User.Capabilities."],
        ["SubmissionStatus", "DRAFT, SUBMITTED, APPROVED", "Lifecycle states for teacher score submission sheets."],
        ["ScoreStatus", "PENDING, ENTERED, ABSENT, EXEMPT", "Per-student score row status on a subject sheet."],
        ["ScoreSource", "GRID, IMPORT, ADMIN_CORRECTION", "Tracks whether a score came from the teacher grid, CSV import, or admin override."],
        ["ImportStatus", "UPLOADED, VALIDATED, COMMITTED, REJECTED, EXPIRED", "Lifecycle of a staged CSV score sheet import batch."],
        ["UnlockStatus", "REQUESTED, APPROVED, REJECTED, USED, EXPIRED", "Lifecycle of a teacher/admin request to unlock a submitted score sheet."],
        ["BroadsheetStatus", "OPEN, COMPUTED, SIGNED_OFF, PUBLISHED", "Class broadsheet approval and publication workflow states."],
        ["CardStatus", "GENERATED, ISSUED, ACTIVE, EXHAUSTED", "Scratch card lifecycle from generation to exhaustion."],
        ["PaymentChannel / PaymentStatus", "PAYSTACK, BANK_TELLER, CASH_BURSARY / PENDING, APPROVED, REJECTED, SUCCESSFUL", "Payment collection channels and verification states."],
        ["EnrollmentStatus / ParentRelationship", "ACTIVE, PROMOTED, REPEATING, WITHDRAWN / FATHER, MOTHER, GUARDIAN", "Term enrollment status and parent-student link types."],
        ["AttemptMode / AttemptStatus / SubscriptionStatus / IntegrityEventType", "PRACTICE, MOCK / ACTIVE, SUBMITTED, EXPIRED, TERMINATED / ACTIVE, EXPIRED, CANCELLED / 14 event types (TAB_HIDDEN, WINDOW_BLUR, FULLSCREEN_EXIT, MULTI_SESSION, etc.)", "CBT examination modes, attempt states, and proctoring telemetry categories."],
      ],
      [24, 42, 34]
    ),

    h2("3.3 Complete Model & Field Reference (All 31 Tables)"),
    p("The table below documents every model in prisma/schema.prisma, its primary key, core columns, unique constraints, and relationships:"),
    makeTable(
      ["Model / Table", "Primary Key & Unique Indexes", "Columns & Relationships"],
      [
        ["1. Role", "PK: RoleID (Int) | UQ: RoleName", "RoleName (Admin, Teacher, Student), Permissions (JSON string). 1:N with User."],
        ["2. User", "PK: UserID (Int) | UQ: Uuid, Email", "Email, PasswordHash, RoleID (FK->Role), Capabilities (Capability[]), IsActive, TokenVersion, MustChangePassword, FailedLoginAttempts, LockedUntil, TotpSecret, TotpEnabled, TotpBackupCodes, CreatedAt, UpdatedAt. Relations: Student (1:1), ParentProfile (1:1), RoleAssignments, TeacherMaps, FormMasterClasses, SentMessages, ReceivedMessages, SubjectSubmissions, AuditLogs."],
        ["3. UserRoleAssignment", "PK: id (UUID) | UQ: [UserID, Role]", "UserID (FK->User), Role (RoleName enum), AssignedAt, AssignedBy."],
        ["4. Class", "PK: ClassID (Int) | UQ: Uuid, ClassName", "ClassName (e.g. 'JSS 1 Gold'), Level ('Primary'/'Secondary'), Arm ('Gold'), FormMasterID (FK->User). Relations: Students, Enrollments, TeacherMaps, SubjectSubmissions, Broadsheets."],
        ["5. Student", "PK: StudentID (Int) | UQ: Uuid, UserID, AdmissionNo", "UserID (nullable FK->User), AdmissionNo, ClaimCodeHash, ClaimCodeExpiresAt, FirstName, LastName, Gender, ClassID (FK->Class), DateOfBirth, ParentContact, ParentEmail, AvatarUrl, PreferredName, HasPaidFees. Relations: Results, ScratchCards, PaymentRecords, Invoices, Enrollments, ParentLinks, Attendances, FormMasterReports, Claims, CbtAttempts, CbtSubscriptions, CbtDayLocks, ReportCards."],
        ["6. Parent", "PK: id (UUID) | UQ: UserID, Phone", "UserID (FK->User), Phone, AltPhone, Address, CreatedAt. 1:N with ParentStudentLink."],
        ["7. ParentStudentLink", "PK: id (UUID) | UQ: [ParentID, StudentID]", "ParentID (FK->Parent), StudentID (FK->Student), Relationship (FATHER/MOTHER/GUARDIAN), IsEmergencyContact."],
        ["8. Enrollment", "PK: id (UUID) | UQ: [StudentID, ClassID, TermID]", "StudentID (FK->Student), ClassID (FK->Class), TermID (FK->Academic_Term), AcademicYear, Status (ACTIVE/PROMOTED/REPEATING/WITHDRAWN)."],
        ["9. Subject", "PK: SubjectID (Int) | UQ: Uuid", "SubjectName, SubjectCode, ClassLevel. Relations: TeacherMaps, Results, SubjectSubmissions."],
        ["10. Teacher_Subject_Map", "PK: id (Int) | UQ: Uuid, [TeacherID, SubjectID, ClassID, TermID]", "TeacherID (FK->User), SubjectID (FK->Subject), ClassID (FK->Class), TermID (nullable FK->Academic_Term), IsFormMaster, AssignedAt, AssignedBy."],
        ["11. Academic_Term", "PK: TermID (Int) | UQ: Uuid", "SessionName ('2026/2027'), TermName ('First Term'), IsActive, IsLocked (global score freeze), LockedAt, LockedBy, Version, StartDate, EndDate. 1:N with Results, PaymentRecords, Invoices, Enrollments, Attendances, TeacherMaps, ScratchCards, SubjectSubmissions, FormMasterReports, Broadsheets, ReportCards."],
        ["12. Result", "PK: ResultID (Int) | UQ: Uuid, [StudentID, SubjectID, TermID]", "StudentID, SubjectID, TermID, CAScore (Float), ExamScore (Float), TotalScore (Float), CAScoreTenths (Int 0..400), ExamScoreTenths (Int 0..600), TotalScoreTenths (Int 0..1000), Grade, Remark, Status (ScoreStatus), Source (ScoreSource), ImportBatchID, UpdatedByID, Version, UpdatedAt."],
        ["13. Subject_Submission", "PK: id (Int) | UQ: Uuid, [SubjectID, ClassID, TermID]", "TeacherID, SubjectID, ClassID, TermID, ScaleID (FK->GradeScale), Status ('Draft'/'Submitted'/'Approved'), SubmittedAt, ApprovedBy, ApprovedAt, UnlockedBy, UnlockedReason, UnlockRequestedBy, UnlockRequestedReason, WindowEndsAt, Version. 1:N with ImportBatches, UnlockRequests."],
        ["14. GradeScale", "PK: id (CUID) | UQ: name", "name ('WAEC secondary', 'Primary'), levelGroup ('SECONDARY', 'PRIMARY'). 1:N with GradeBand, Subject_Submission."],
        ["15. GradeBand", "PK: id (CUID) | UQ: [scaleId, grade]", "scaleId (FK->GradeScale), grade ('A1'..'F9'), minTenths (750..0), remark ('Excellent'..'Fail')."],
        ["16. ImportBatch", "PK: id (CUID) | UQ: [sheetId, fileSha256]", "sheetId (FK->Subject_Submission), uploadedById, fileKey, fileSha256, sheetVersionAtDownload, status (ImportStatus), rowCount, errorCount, createdAt, committedAt, expiresAt. 1:N with ImportRow."],
        ["17. ImportRow", "PK: id (CUID) | IDX: [batchId]", "batchId (FK->ImportBatch), rowNumber, admissionNo, caTenths, examTenths, status, error, changes (Boolean)."],
        ["18. UnlockRequest", "PK: id (CUID) | IDX: [sheetId, status]", "sheetId (FK->Subject_Submission), requestedById, reason, status (UnlockStatus), decidedById, decidedAt, decisionNote, windowEndsAt, createdAt."],
        ["19. ClassBroadsheet", "PK: id (CUID) | UQ: [classArmId, termId]", "classArmId (FK->Class), termId (FK->Academic_Term), status (BroadsheetStatus), computeVersion, isStale, computedAt, computedById, signedOffAt, signedOffById, principalNote, publishedAt, publishedById, statsJson (JSON snapshot of rankings & subject stats)."],
        ["20. ReportCard", "PK: id (CUID) | UQ: [studentId, termId, version]", "studentId (FK->Student), termId (FK->Academic_Term), version, dataJson, dataSha256, pdfKey, publishedAt, publishedById, supersededAt, changeReason."],
        ["21. Form_Master_Report", "PK: id (Int) | UQ: [StudentID, TermID]", "StudentID, TermID, FormMasterRemark, PrincipalRemark, AffectiveTraits (JSON), PsychomotorTraits (JSON), Status ('Draft'/'SubmittedToAdmin'/'Published'), Version, UpdatedAt."],
        ["22. Scratch_Card", "PK: CardID (Int) | UQ: Uuid, PIN_Hash, SerialNumber", "PIN_Hash (HMAC-SHA256), SerialNumber (Base32 WOFS-XXXX-XXXX), KeyId ('v1'), Status, BatchId, UsageCount, MaxUsage (default 5), FailedAttempts, LockedUntil, UsedBy (FK->Student), TermID (FK->Academic_Term), ActiveWindowExpires (30-day window), IssuedAt, IssuedBy, CreatedAt."],
        ["23. ScratchCardBatch", "PK: id (CUID)", "createdById, size, pepperKeyId, status, createdAt."],
        ["24. StaffInvite", "PK: id (CUID) | UQ: tokenHash", "email, role (RoleName), tokenHash, invitedById, expiresAt, usedAt, createdAt."],
        ["25. StudentClaim", "PK: id (CUID)", "studentId (FK->Student), codeHash (SHA-256 of 6-char claim code), attempts, expiresAt, usedAt."],
        ["26. WebhookEvent", "PK: id (CUID) | UQ: eventKey", "provider ('paystack'), eventKey, receivedAt, processedAt."],
        ["27. Invoice", "PK: id (UUID) | IDX: [StudentID, TermID]", "StudentID (FK->Student), TermID (FK->Academic_Term), Title, AmountKobo (BigInt), DueDate, IsWaived, WaivedBy, WaivedReason, CreatedAt. 1:N with Payment_Record."],
        ["28. Payment_Record", "PK: PaymentID (Int) | UQ: Uuid, Reference", "StudentID, TermID, InvoiceID (nullable FK->Invoice), AmountPaid (Float), AmountKobo (BigInt), Channel, ReceiptUrl, ReceiptHash, Reference, Status, RejectionReason, SubmittedBy, ReviewedBy, ReviewedAt, PaymentDate, Description."],
        ["29. AuditLog", "PK: id (UUID) | IDX: [Entity, EntityID], [ActorID], [CreatedAt]", "ActorID (nullable FK->User), OnBehalfOfID, Action, Entity, EntityID, OldValue (JSON), NewValue (JSON), Reason, IpAddress, UserAgent, PrevHash, Hash (SHA-256 chain), CreatedAt."],
        ["30. CBT Subsystem (7 Models)", "CbtQuestion, CbtAnswerKey, CbtPlan, CbtSubscription, CbtAttempt, CbtAttemptQuestion, CbtIntegrityEvent, CbtDayLock", "Wait—that is 8 CBT models! CbtQuestion (stem, optionsJson, isActive) 1:1 CbtAnswerKey (correctKey, explanation, never sent to active exam client); CbtAttempt 1:N CbtAttemptQuestion (position, optionOrder, selectedKey, isCorrect) & 1:N CbtIntegrityEvent (type, isHard); CbtDayLock (studentId, dayKey, reason, liftedById, liftReason); CbtPlan 1:N CbtSubscription."],
        ["31. Support Models (3 Models)", "VerificationToken, Message, Attendance, Admission_Application", "VerificationToken (email, token, type, expires); Message (SenderID, ReceiverID, Content, IsRead); Attendance (StudentID, TermID, Date, Status, Notes); Admission_Application (child/parent fields, applyingClass, status, enrolledStudentId)."],
      ],
      [22, 26, 52]
    ),
    p(
      "Note on Total Model Count: Counting all domain and CBT tables individually in prisma/schema.prisma, there are 41 model declarations and 12 enum declarations.",
      { italics: true, color: COLOR_SLATE }
    ),

    h2("3.4 Entity-Relationship (ER) Diagram"),
    diagramBlock("Core Entity-Relationship Diagram (Prisma Schema)", [
      " [Role] 1 ────< N [User] 1 ────< N [UserRoleAssignment]",
      "                    │  │",
      "                    │  +──── 1:1 ──── [Parent] 1 ────< N [ParentStudentLink] N >──── 1 [Student]",
      "                    │                                                                     │",
      "                    +─────── 1:1 (optional UserID) ───────────────────────────────────────+",
      "                                                                                          │",
      " [Academic_Term] 1 ───< N [Enrollment] N >─── 1 [Class] 1 ───< N [Student] <──────────────+",
      "        │                                          │                │",
      "        ├───< N [Teacher_Subject_Map] >────────────┤                ├───< N [StudentClaim]",
      "        │               │                          │                ├───< N [Invoice] 1 ──< N [Payment_Record]",
      "        │               v                          │                ├───< N [Scratch_Card]",
      "        │           [Subject]                      │                ├───< N [Result]",
      "        │               │                          │                ├───< N [ReportCard] (versioned snapshots)",
      "        ├───< N [Subject_Submission] <─────────────+                ├───< N [Form_Master_Report]",
      "        │         │          │                                      ├───< N [Attendance]",
      "        │         │          +───< N [ImportBatch] 1 ──< N [ImportRow]",
      "        │         +──────────────< N [UnlockRequest]                └───< N [CbtAttempt] & [CbtDayLock]",
      "        │                                                                        │",
      "        └───< N [ClassBroadsheet]                                                ├───< N [CbtAttemptQuestion]",
      "                                                                                 │          │",
      " [GradeScale] 1 ───< N [GradeBand]                                               │          v",
      "                                                                                 │     [CbtQuestion] 1──1 [CbtAnswerKey]",
      " [User] 1 ───< N [AuditLog] (SHA-256 PrevHash -> Hash chain)                     └───< N [CbtIntegrityEvent]",
    ]),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 4: AUTHENTICATION & AUTHORIZATION
    // =========================================================================
    h1("4. Authentication, Authorization & Access Control"),
    h2("4.1 Onboarding & Registration Flows"),
    p("The codebase contains two distinct student onboarding mechanisms:"),
    bullet(
      "When an Admin approves an admission application in enrollApplicantToStudent() (src/app/actions/admin.ts), the server generates a random 6-character alphanumeric Claim Code (excluding ambiguous characters 0, O, 1, I), hashes it with SHA-256, stores it in Student.ClaimCodeHash and StudentClaim (valid for 7 days), and emails the plaintext code to the parent. The student/parent can then claim the account via claimStudentAccountWithCode(admissionNo, claimCode, email, password), which uses crypto.timingSafeEqual() and generic error messages to prevent Admission Number enumeration.",
      "1. Hardened v3 One-Time Claim Code Flow (Section 4 & B.6):"
    ),
    bullet(
      "The public registration page (/portal/register) calls initiateRegistration(admissionNo, email) and verifyRegistration(...) in src/app/actions/auth.ts. This flow checks whether Student.AdmissionNo exists and is unclaimed, generates a 6-digit numeric OTP in VerificationToken (valid 15 minutes), emails the OTP via emailQueue, and creates the User record once verified.",
      "2. Legacy OTP Email Registration Flow (/portal/register):"
    ),

    h2("4.2 Login, Session Lifetime, Account Lockout & TokenVersion"),
    p("Authentication is handled by NextAuth.js in src/lib/auth.ts using the CredentialsProvider:"),
    bullet("Session Strategy & Lifetime: Stateless JWT strategy with an 8-hour maximum lifetime (maxAge: 8 * 60 * 60)."),
    bullet("Case-Insensitive Email Matching: Normalizes email input (trim().toLowerCase()) and queries prisma.user.findFirst({ where: { Email: { equals: normalizedEmail, mode: 'insensitive' } } })."),
    bullet("Account Status (IsActive): If !user || !user.IsActive, authorize() returns null immediately. Furthermore, requireActiveUser() re-checks IsActive on every server action so deactivating a user in /portal/admin/users blocks them immediately without waiting for their 8-hour JWT to expire."),
    bullet("5-Attempt / 15-Minute Account Lockout: Every failed password check increments User.FailedLoginAttempts. On the 5th consecutive failure, User.LockedUntil is set to Date.now() + 15 minutes and an ACCOUNT_LOCKOUT entry is written to AuditLog. A successful login resets FailedLoginAttempts to 0."),
    bullet("Instant Session Revocation (TokenVersion): Whenever an Admin resets a user's password, changes their capabilities, or deactivates their account in src/app/actions/admin.ts, TokenVersion is incremented ({ increment: 1 }). In src/lib/authz.ts, requireActiveUser() compares the database User.TokenVersion against session.user.tokenVersion and rejects stale tokens with HTTP 401."),

    h2("4.3 Roles, Granular Role Assignments & 14 Capabilities Matrix"),
    p(
      "Access control combines a base Role (Admin, Teacher, Student in the Role table), multiple granular RoleName assignments (in UserRoleAssignment), and 14 fine-grained Capability flags (stored in User.Capabilities[] and evaluated by src/server/security/capabilities.ts):"
    ),
    makeTable(
      ["Capability Flag", "Preset Membership", "Step-Up TOTP Flag", "Permitted Operations"],
      [
        ["MANAGE_USERS", "FULL", "Yes", "Create/deactivate users, reset passwords, assign roles & capability presets."],
        ["MANAGE_STRUCTURE", "FULL", "No", "Create/manage academic terms, class arms, subjects, and teacher allocations."],
        ["MANAGE_STUDENTS", "FULL, REGISTRY", "No", "Review admission applications, enroll students, manage student directory."],
        ["CORRECT_SCORES", "FULL", "Yes", "Perform audited administrative score overrides with mandatory reason."],
        ["APPROVE_RESULTS", "FULL", "No", "Compute class broadsheets and record Principal sign-off."],
        ["PUBLISH_RESULTS", "FULL", "Yes", "Publish signed-off broadsheets and generate immutable ReportCard snapshots."],
        ["UNLOCK_SHEETS", "FULL (Principal)", "Yes", "Approve or reject teacher score-sheet unlock requests (under SoD)."],
        ["FREEZE_TERM", "FULL", "Yes", "Toggle global score-entry freeze (Academic_Term.IsLocked)."],
        ["MANAGE_FINANCE", "FULL, FINANCE", "No", "View payment audit queues, invoices, and financial metrics."],
        ["APPROVE_PAYMENTS", "FULL, FINANCE", "No", "Approve or reject bank teller payment submissions (under SoD)."],
        ["MANAGE_CARDS", "FULL, FINANCE", "Yes", "Generate scratch card batches, issue batches, and unlock locked cards."],
        ["MANAGE_CBT", "FULL", "No", "View CBT integrity dashboard and lift 2-strike CbtDayLock records."],
        ["VIEW_AUDIT", "FULL", "No", "Search AuditLog, run SHA-256 chain verification, and export audited CSVs."],
        ["MANAGE_SYSTEM", "FULL", "Yes", "System-level configuration and administrative overrides."],
      ],
      [24, 18, 14, 44]
    ),

    h2("4.4 Separation of Duties (SoD) & Step-Up TOTP 2FA"),
    bullet(
      "Enforced in both TypeScript (assertSeparationOfDuties in src/server/security/capabilities.ts) and PostgreSQL CHECK constraints (payment_sod on Payment_Record and unlock_sod on UnlockRequest). A staff member who submits a payment record or requests a score-sheet unlock is mathematically blocked from approving or deciding their own request.",
      "Separation of Duties (SoD):"
    ),
    bullet(
      "Implemented in src/server/security/totp.ts and exposed via initiateUserTotpEnrollment(), confirmUserTotpEnrollment(), and verifyStepUpTotpAction() in src/app/actions/admin.ts. Generates a 160-bit Base32 secret, otpauth:// URI for Google/Microsoft Authenticator, 6-digit HMAC-SHA1 codes (30-second window with ±1 step drift tolerance), and 8 single-use recovery codes.",
      "Step-Up TOTP 2FA (RFC 6238):"
    ),

    h2("4.5 Route & Action Protection Mechanisms"),
    makeTable(
      ["Protection Boundary", "Enforcement File", "How It Works"],
      [
        ["Public Portal Allowlist", "src/proxy.ts", "Only /portal/login, /portal/register, /portal/forgot-password, /portal/reset-password, and /portal/unauthorized are accessible without a valid JWT."],
        ["Admin Zone Gate (/portal/admin/*)", "src/proxy.ts + src/app/portal/admin/layout.tsx", "Requires JWT role in {Admin, SUPER_ADMIN, PRINCIPAL, BURSAR, ADMISSIONS}; otherwise redirects to /portal/unauthorized?zone=admin."],
        ["Teacher Zone Gate (/portal/teacher/*)", "src/proxy.ts + src/app/portal/teacher/layout.tsx", "Requires JWT role in {Teacher, TEACHER, FORM_MASTER, PRINCIPAL, SUPER_ADMIN, Admin}; otherwise redirects to /portal/unauthorized?zone=teacher."],
        ["Server Action DAL Guards", "src/lib/authz.ts", "Every hardened Server Action calls requireActiveUser(), requireRole(), requireCapability(), assertTeacherAssigned(), or assertFormMasterAssigned() before touching Prisma."],
      ],
      [28, 28, 44]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 5: MODULES
    // =========================================================================
    h1("5. Feature Modules Deep Dive"),

    h2("5.1 Public Marketing Website, Online Admissions & Faithbot AI"),
    bullet("What It Does: Presents the school's mission, academic programmes, gallery, news, contact information, floating Faithbot AI tutor, and a 3-step Online Admissions application form."),
    bullet("Key Files: src/app/page.tsx, src/app/admissions/page.tsx, src/app/api/admissions/route.ts, src/lib/email.ts, src/components/Faithbot.tsx, src/app/api/chat/route.ts, src/app/portal/admin/admissions/AdmissionsReviewClient.tsx."),
    bullet("Data Flow: Applicant submits Step 1–3 on /admissions -> POST /api/admissions creates Admission_Application (status: 'Pending') and calls sendAdmissionReceivedNotification() -> Admin reviews in /portal/admin/admissions -> enrollApplicantToStudent() creates Student + StudentClaim, updates status to 'Approved', and calls sendAdmissionDecisionNotification() (or rejectAdmissionApplication() for rejections) which emails the parent's registered email address and returns pre-formatted WhatsApp/SMS links for the parent's phone number."),
    bullet("Role Access: Publicly accessible to prospective parents; review/approval restricted to Admin roles (MANAGE_STUDENTS / ADMISSIONS / PRINCIPAL / SUPER_ADMIN)."),

    h2("5.2 Student & Parent Portal"),
    bullet("What It Does: Provides students and parents with an overview dashboard, academic course list, tuition fee payment & receipt upload, terminal result checker, CBT practice/mock exams, profile editor, and teacher messaging."),
    bullet("Key Files: src/app/portal/(authenticated)/dashboard/page.tsx, src/components/dashboard/StudentDashboard.tsx, src/app/portal/(authenticated)/courses/page.tsx, src/app/portal/(authenticated)/profile/page.tsx, src/app/portal/messages/page.tsx, src/app/actions/studentProfile.ts, src/app/actions/messaging.ts."),
    bullet("Data Flow: Student logs in -> /portal/dashboard renders StudentDashboard (or redirects teachers/admins to their workspaces) -> getStudentProfile() queries Student, Class, Teacher_Subject_Map, and Payment_Record (caching in Redis for 24h when available)."),
    bullet("Role Access: Authenticated STUDENT and PARENT accounts (with Admin supervisory access)."),

    h2("5.3 Teacher & Form Master Workspace (Grid + CSV Staging Import)"),
    bullet("What It Does: Enables Subject Teachers to score assigned classes via an interactive grid or offline CSV template, request sheet unlocks, and enables Form Masters to record attendance, behavioral traits (affective/psychomotor), and terminal remarks."),
    bullet("Key Files: src/app/portal/teacher/page.tsx, src/components/dashboard/TeacherDashboard.tsx, src/components/dashboard/TeacherAttendance.tsx, src/app/actions/results.ts, src/app/actions/attendance.ts."),
    bullet("Data Flow (Single Score Write Path): Whether a teacher types scores in the grid (saveTeacherScores) or uploads a CSV file (generateScoreSheetTemplateCsv -> stageScoreSheetImportCsv -> commitScoreSheetImportBatch), both paths validate that the sheet is open, convert decimals to integer tenths (CA 0..400, Exam 0..600), and call upsertSheetScoresInternal() inside a single Prisma transaction. Any score mutation marks the class broadsheet as stale (ClassBroadsheet.isStale = true)."),
    bullet("Role Access: TEACHER, FORM_MASTER, PRINCIPAL, SUPER_ADMIN (enforced at Layer 3 by assertTeacherAssigned and assertFormMasterAssigned to prevent cross-class IDOR)."),

    h2("5.4 Terminal Results, Integer-Tenths Grading, Broadsheets & Report Cards"),
    bullet("What It Does: Eliminates floating-point rounding bugs by storing all scores in integer tenths (e.g., 74.5% is 745 tenths -> B2; 75.0% is 750 tenths -> A1), computes class statistics and standard 1-2-2-4 competition rankings, and manages the Broadsheet -> Sign-Off -> Publish -> ReportCard snapshot pipeline."),
    bullet("Key Files: src/server/domain/grading.ts, src/lib/grading.ts, src/app/actions/results.ts, src/app/portal/admin/results/AdminResultsClient.tsx, src/app/portal/broadsheet/[classId]/page.tsx, src/app/portal/(authenticated)/results/page.tsx."),
    bullet("Data Flow: Teachers submit Subject_Submission sheets -> Principal/Form Master approves sheets -> Admin/Principal clicks Compute Broadsheet (computeClassBroadsheet calculates subject highest/lowest/average over ENTERED rows and ranks active complete students using 1-2-2-4 competition ranking) -> Principal clicks Sign Off (signOffClassBroadsheet) -> Principal clicks Publish (publishClassBroadsheet creates versioned ReportCard JSON + SHA-256 snapshots and supersedes prior versions)."),
    bullet("Role Access: Teachers score assigned subjects; Form Masters & Principals approve sheets and view broadsheets; Principals/Admins with APPROVE_RESULTS and PUBLISH_RESULTS sign off and publish; Students view published results after fee clearance and scratch card verification."),

    h2("5.5 Finance, Tuition Clearance, Paystack Webhooks & Scratch Cards"),
    bullet("What It Does: Manages student fee payment records (Paystack online payments and bank teller uploads), enforces Separation of Duties on teller approvals, derives tuition clearance in integer kobo, and manages cryptographic scratch cards for result checking."),
    bullet("Key Files: src/app/actions/payments.ts, src/app/api/webhooks/paystack/route.ts, src/app/actions/scratchCards.ts, src/app/portal/admin/payments/PaymentsClient.tsx, src/app/portal/admin/cards/CardsClient.tsx, src/app/portal/(authenticated)/fees/page.tsx."),
    bullet("Data Flow: (A) Payments: Student initiates Paystack transaction (initializePayment) or submits teller receipt -> Bursar reviews in /portal/admin/payments -> approvePaymentRecord() checks assertSeparationOfDuties(), marks Payment_Record as Approved, and sets Student.HasPaidFees = true. (B) Scratch Cards: Bursar generates batch in createBatchScratchCards() -> Serial (WOFS-XXXX-XXXX) and 12-digit PIN are hashed via HMAC-SHA256(pepper[keyId], serial + ':' + pin) -> Student redeems in verifyScratchCard(), which checks checkStudentFeeClearance() and atomically binds the card to StudentID + TermID for a 30-day window (max 5 uses, 5-strike 15-minute brute-force lockout)."),
    bullet("Role Access: Students initiate payments and redeem cards; Bursar/Principal/Admin with MANAGE_FINANCE, APPROVE_PAYMENTS, and MANAGE_CARDS manage ledgers and card batches."),

    h2("5.6 Computer-Based Testing (CBT) & 2-Strike Integrity Subsystem"),
    bullet("What It Does: Provides timed WAEC, NECO, and UTME practice and mock examinations with one-question-at-a-time server delivery, dynamic identity watermarking, fullscreen enforcement, and an automated 2-strike proctoring day-lock policy."),
    bullet("Key Files: src/app/actions/cbt.ts, src/lib/cbt-api.ts, src/components/cbt/QuizClient.tsx, src/app/portal/(authenticated)/cbt/page.tsx, src/app/portal/(authenticated)/cbt/quiz/page.tsx, src/app/portal/admin/cbt/AdminCbtClient.tsx."),
    bullet("Data Flow: Student selects subject & exam body -> startAttempt() checks assertNotDayLocked(), pulls questions from CbtQuestion (seeding from SdashAPI -> ALOC API -> local fallback if needed), separates correct answers into CbtAnswerKey, and creates CbtAttempt + shuffled CbtAttemptQuestion rows -> QuizClient.tsx fetches one question at a time via getQuestion(attemptId, position) (answer key is never sent to the client during an active attempt) -> Heartbeats run every 15s (sendAttemptHeartbeat) -> Focus loss >= 3s or fullscreen exit triggers reportIntegrityEvent(): Strike 1 shows a 10-second warning banner; Strike 2 atomically sets status = TERMINATED and creates a CbtDayLock row for the current Africa/Lagos day -> At submission, submitAttempt() joins CbtAnswerKey in a single transaction to grade the attempt."),
    bullet("Role Access: Students take exams; Teachers, Form Masters, Principals, and Admins with MANAGE_CBT or cbt:lift_lock view telemetry and lift day locks with a mandatory written reason in /portal/admin/cbt."),

    h2("5.7 Admin Control Center & Tamper-Evident SHA-256 Audit Explorer"),
    bullet("What It Does: Provides school-wide KPI analytics, user account & capability preset management, and a cryptographic Audit Log Explorer that verifies the unbroken SHA-256 hash chain across all privileged mutations."),
    bullet("Key Files: src/app/portal/admin/page.tsx, src/components/dashboard/AdminDashboard.tsx, src/app/portal/admin/users/UsersClient.tsx, src/app/portal/admin/audit/AuditClient.tsx, src/app/actions/admin.ts."),
    bullet("Data Flow: Every privileged Server Action invokes writeAuditLog(), which fetches the most recent AuditLog.Hash (or 'GENESIS'), computes SHA-256(prevHash + ':' + canonicalJson), and inserts an append-only row protected by PostgreSQL's prevent_audit_tampering trigger. In /portal/admin/audit, verifyAuditHashChain() walks up to 500 sequential entries to confirm every PrevHash matches its predecessor's Hash, and exportAuditLogCsv() exports formula-sanitized CSV files (while logging AUDIT_LOG_EXPORTED)."),
    bullet("Role Access: Admin staff holding VIEW_AUDIT (Audit Explorer) and MANAGE_USERS (User & Capability management)."),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 6: CLASS & TEACHER ALLOCATION
    // =========================================================================
    h1("6. Academic Structure: Sessions, Classes, Arms, Subjects & Allocations"),
    h2("6.1 Academic Sessions & Terms (Active Pointer & Global Freeze)"),
    p(
      "All academic records in the portal are anchored to an Academic_Term row (managed in /portal/admin/terms via src/app/actions/terms.ts):"
    ),
    bullet("Single Active Term Pointer: Only one Academic_Term has IsActive = true at any time. Calling setActiveTerm(termId) or createAcademicTerm({ makeActive: true }) runs an atomic transaction that sets IsActive = false on all other terms before activating the target term."),
    bullet("Global Term Lock (IsLocked): Toggling toggleTermLock(termId, true) sets Academic_Term.IsLocked = true. Every score mutation in src/app/actions/results.ts checks term.IsLocked inside the database transaction and rejects any teacher or form master edits once a term is frozen."),

    h2("6.2 Classes, Arms & Form Master Designation"),
    p(
      "The Class model (managed in /portal/admin/classes) represents a specific class arm such as 'JSS 1 Gold' or 'Primary 4 Diamond':"
    ),
    bullet("Level & Arm Separation: Each Class stores ClassName (unique), Level ('Primary' or 'Secondary', which also determines whether the 'Primary' or 'WAEC secondary' GradeScale is applied), and Arm (default 'Gold')."),
    bullet("Form Master Assignment: Each Class has an optional FormMasterID foreign key pointing to User.UserID. Calling assignFormMaster(classId, teacherUserId) in src/app/actions/admin.ts links a teacher as Form Master of that class arm, granting them access to the Form Master Hub in /portal/teacher to record behavioral traits, terminal remarks, and class attendance."),

    h2("6.3 Subjects, Enrollments & Teacher-Subject-Class Allocations"),
    p(
      "How students, subjects, and teachers are connected across terms:"
    ),
    bullet("Subjects: Stored in the Subject table with SubjectName (e.g., 'Mathematics'), SubjectCode ('MTH'), and ClassLevel ('Primary', 'JSS', 'SSS', 'Secondary')."),
    bullet("Student Class Membership (Student.ClassID vs. Enrollment): When a student is enrolled via enrollApplicantToStudent() or addStudent(), their current class arm is set on Student.ClassID. In addition, the v3 Enrollment table (StudentID, ClassID, TermID, AcademicYear, Status: ACTIVE | PROMOTED | REPEATING | WITHDRAWN) tracks term-by-term historical class membership and withdrawal status for broadsheet ranking."),
    bullet("Teaching Allocations (Teacher_Subject_Map): Created in /portal/admin/teachers via allocateSubjectToTeacher(teacherId, subjectId, classId). Each row in Teacher_Subject_Map links a Teacher (UserID) to a Subject (SubjectID) and a Class arm (ClassID) for a specific TermID (or null for all terms)."),
    bullet("IDOR Enforcement via Allocations: When a teacher requests a student roster or submits scores in src/app/actions/results.ts, assertTeacherAssigned(classId, subjectId, termId) queries Teacher_Subject_Map. If no matching allocation exists for that teacher (and the user is not a Principal/Super Admin acting under supervisory override), an AuthorizationError (HTTP 403) is thrown immediately."),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 7: API / ROUTES REFERENCE
    // =========================================================================
    h1("7. Complete Routes, API Endpoints & Server Actions Reference"),
    h2("7.1 REST API Route Handlers (src/app/api/**)"),
    makeTable(
      ["Endpoint", "HTTP Method(s)", "Source File", "Purpose", "Current Auth Protection"],
      [
        ["/api/auth/[...nextauth]", "GET, POST", "src/app/api/auth/[...nextauth]/route.ts", "NextAuth.js session, sign-in, sign-out, and CSRF token endpoints.", "Public (NextAuth handler with IP rate limit & 5-strike lockout)."],
        ["/api/admissions", "POST", "src/app/api/admissions/route.ts", "Submits a new public online admission application and emails acknowledgment to parentEmail.", "Public (intended for prospective parents)."],
        ["/api/admissions", "GET, PATCH", "src/app/api/admissions/route.ts", "Lists all admission applications (GET) or updates application status and triggers decision email (PATCH).", "UNPROTECTED in route.ts (Flagged in Section 8 — Admin UI uses protected Server Actions instead)."],
        ["/api/chat", "POST", "src/app/api/chat/route.ts", "Streams Faithbot AI study assistant responses using Google Gemini (gemini-flash-lite-latest) and Wikipedia context.", "Public (No session or rate-limit check — Flagged in Section 8)."],
        ["/api/webhooks/paystack", "POST", "src/app/api/webhooks/paystack/route.ts", "Receives Paystack charge.success events and updates Payment_Record.Status to 'Successful'.", "HMAC-SHA512 signature verification via x-paystack-signature header."],
        ["/api/debug-db", "GET", "src/app/api/debug-db/route.ts", "Diagnostic endpoint returning studentCount, userCount, and full Student and User table rows.", "UNPROTECTED (CRITICAL vulnerability — Flagged in Section 8)."],
        ["/api/debug-env", "GET", "src/app/api/debug-env/route.ts", "Diagnostic endpoint returning boolean flags and prefixes of database environment variables.", "UNPROTECTED (MEDIUM vulnerability — Flagged in Section 8)."],
        ["/api/setup", "GET", "src/app/api/setup/route.ts", "Legacy bootstrap endpoint that upserts base roles/users and returns sample credentials in JSON.", "UNPROTECTED (HIGH vulnerability — Flagged in Section 8)."],
      ],
      [20, 12, 24, 24, 20]
    ),

    h2("7.2 Portal & Public Page Routes"),
    makeTable(
      ["URL Path", "Source File", "Purpose", "Required Role / Gate"],
      [
        ["/, /about, /academics, /admissions, /contact, /gallery, /news", "src/app/**/page.tsx", "Public school website, academic programmes, and online admission wizard.", "Public"],
        ["/portal/login, /portal/register, /portal/forgot-password, /portal/reset-password", "src/app/portal/**/page.tsx", "Portal sign-in, student OTP registration, and password recovery pages.", "Public (Allowlisted in src/proxy.ts)"],
        ["/portal/dashboard", "src/app/portal/(authenticated)/dashboard/page.tsx", "Role-aware landing dispatcher (renders StudentDashboard or routes staff to Teacher/Admin views).", "Any Authenticated User"],
        ["/portal/results", "src/app/portal/(authenticated)/results/page.tsx", "Student terminal result checker (requires tuition fee clearance + valid scratch card).", "Authenticated Student / Parent"],
        ["/portal/fees, /portal/fees/history, /portal/fees/status", "src/app/portal/(authenticated)/fees/**/page.tsx", "Tuition payment initiation (Paystack), receipt upload, and payment history.", "Authenticated Student / Parent"],
        ["/portal/cbt, /portal/cbt/quiz", "src/app/portal/(authenticated)/cbt/**/page.tsx", "CBT subject selector and fullscreen 2-strike proctored examination interface.", "Authenticated Student (not day-locked)"],
        ["/portal/courses, /portal/profile, /portal/messages", "src/app/portal/**/page.tsx", "Enrolled subjects list, student profile editor, and staff-student messaging.", "Any Authenticated User"],
        ["/portal/teacher", "src/app/portal/teacher/page.tsx", "Dedicated Educator Workspace (CA/Exam score grid, CSV import wizard, Form Master Hub, attendance).", "Teacher, Form Master, Principal, Super Admin"],
        ["/portal/broadsheet/[classId]", "src/app/portal/broadsheet/[classId]/page.tsx", "Printable class master broadsheet table for a specific class arm.", "Form Master (assigned), Principal, Super Admin"],
        ["/portal/admin", "src/app/portal/admin/page.tsx", "Admin Control Center with school-wide KPIs and revenue/enrollment analytics.", "Admin Staff (SUPER_ADMIN, PRINCIPAL, BURSAR, ADMISSIONS)"],
        ["/portal/admin/terms, /classes, /teachers", "src/app/portal/admin/**/page.tsx", "Academic session/term master, class arm & Form Master setup, and subject allocations.", "Admin Staff (MANAGE_STRUCTURE)"],
        ["/portal/admin/admissions, /students, /users", "src/app/portal/admin/**/page.tsx", "Admissions review & enrollment, student directory, and user/capability provisioning.", "Admin Staff (MANAGE_STUDENTS / MANAGE_USERS)"],
        ["/portal/admin/cards, /payments", "src/app/portal/admin/**/page.tsx", "Cryptographic scratch card batch generator and bank teller approval queue.", "Admin / Bursar (MANAGE_CARDS / APPROVE_PAYMENTS)"],
        ["/portal/admin/results, /cbt, /audit", "src/app/portal/admin/**/page.tsx", "Broadsheet compute/sign-off/publish & unlock queue, CBT day-lock manager, and SHA-256 Audit Explorer.", "Admin / Principal (APPROVE_RESULTS,PUBLISH_RESULTS,MANAGE_CBT,VIEW_AUDIT)"],
      ],
      [24, 26, 28, 22]
    ),

    h2("7.3 Server Actions Reference (All 11 Action Modules)"),
    makeTable(
      ["Action Module", "Exported Server Actions", "Authorization Guard Used"],
      [
        ["src/app/actions/admin.ts", "getAdminAnalytics, createUserAccount, toggleUserActivation, resetUserPassword, updateUserCapabilities, applyUserCapabilityPreset, getClassesAndTeachers, addClassArm, assignFormMaster, createSubject, allocateSubjectToTeacher, removeSubjectAllocation, getStudentsDirectory, promoteStudentsBatch, enrollApplicantToStudent, rejectAdmissionApplication, addStudent, deleteStudent, deleteClass, addClass, addTeacher, deleteTeacher, claimStudentAccountWithCode, getAuditLogExplorerData, verifyAuditHashChain, exportAuditLogCsv, initiateUserTotpEnrollment, confirmUserTotpEnrollment, verifyStepUpTotpAction", "requireAdmin(), requireCapability('MANAGE_USERS' | 'VIEW_AUDIT'), requireActiveUser(). (claimStudentAccountWithCode is public with SHA-256 timing-safe claim verification)."],
        ["src/app/actions/results.ts", "getTeacherAssignedClasses, getClassRosterForScoring, saveTeacherScores, generateScoreSheetTemplateCsv, stageScoreSheetImportCsv, commitScoreSheetImportBatch, requestSubjectSheetUnlock, decideUnlockRequest, unlockSubjectSubmission, computeClassBroadsheet, signOffClassBroadsheet, publishClassBroadsheet, getAdminResultsOverview, approveSubjectSubmission, publishTermResultsForClass, getFormMasterRoster, saveFormMasterEvaluation, submitFormMasterReportsToAdmin, getClassBroadsheet", "assertTeacherAssigned(), assertFormMasterAssigned(), requireCapability('UNLOCK_SHEETS' | 'APPROVE_RESULTS' | 'PUBLISH_RESULTS'), assertSeparationOfDuties()."],
        ["src/app/actions/cbt.ts", "startAttempt, getQuestion, saveAnswer, reportIntegrityEvent, sendAttemptHeartbeat, submitAttempt, getCbtIntegrityDashboard, liftCbtDayLock", "resolveCurrentStudent() (requires active Student session) for exam actions; can(actor, 'cbt:lift_lock') for admin/teacher lock management."],
        ["src/app/actions/scratchCards.ts", "computeSerialPinHmac, hashPin, createBatchScratchCards, issueScratchCardBatch, unlockScratchCard, getScratchCardsList, verifyScratchCard", "requireCardManager() (BURSAR, PRINCIPAL, SUPER_ADMIN + card:generate) for admin actions; requireActiveUser() + checkStudentFeeClearance() for verifyScratchCard."],
        ["src/app/actions/payments.ts", "getAdminPaymentAuditList, approvePaymentRecord, rejectPaymentRecord, initializePayment", "requireCapability(['MANAGE_FINANCE','APPROVE_PAYMENTS']) + assertSeparationOfDuties() for approvals; requireActiveUser() for initializePayment."],
        ["src/app/actions/terms.ts", "getTerms, getActiveTerm, createAcademicTerm, setActiveTerm, toggleTermLock", "requireTermAdmin() (PRINCIPAL, SUPER_ADMIN, Admin) for mutations; read helpers open to authenticated views."],
        ["src/app/actions/auth.ts", "initiateRegistration, verifyRegistration, requestPasswordReset, resetPassword", "Public onboarding/recovery actions protected by rateLimit() and VerificationToken OTP checks."],
        ["src/app/actions/attendance.ts", "markAttendance, getAttendanceForClass", "getServerSession() (Note: markAttendance checks lowercase role !== 'teacher' — flagged in Section 8)."],
        ["src/app/actions/messaging.ts", "sendMessage, getConversation, getMessageContacts", "getServerSession() (Requires any logged-in session; getMessageContacts lacks field projection — flagged in Section 8)."],
        ["src/app/actions/profile.ts", "updateProfile", "getServerSession() checking role === 'Student'."],
        ["src/app/actions/studentProfile.ts", "getStudentProfile, uploadPaymentReceipt", "getServerSession() (Note: uploadPaymentReceipt lacks student ownership check — flagged in Section 8)."],
      ],
      [22, 46, 32]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 8: SECURITY REVIEW
    // =========================================================================
    h1("8. Code-Verified Security Review & Remediation Plan"),
    h2("8.1 Positive Security Controls Implemented in Code"),
    p("Before listing vulnerabilities, it is important to recognize the substantial hardening already present in the codebase:"),
    bullet("Database-Level Separation of Duties & Score Range Constraints: PostgreSQL CHECK constraints (payment_sod, unlock_sod, chk_ca_tenths_range, chk_exam_tenths_range) prevent invalid scores or self-approved payments/unlocks even if application code is bypassed."),
    bullet("Append-Only Cryptographic Audit Trail: AuditLog rows are chained via SHA-256 (PrevHash -> Hash) and protected against UPDATE or DELETE by the PostgreSQL prevent_audit_tampering trigger."),
    bullet("Zero Answer-Key Leakage in CBT: CbtAnswerKey is stored in a separate table from CbtQuestion and is only joined inside submitAttempt() when the exam finishes."),
    bullet("HMAC-SHA256 Scratch Cards with Timing-Safe Comparison: Scratch card PINs are never stored in plaintext; verification uses HMAC-SHA256 with a server pepper and crypto.timingSafeEqual()."),
    bullet("CSV Formula Injection Neutralization: sanitizeCsvCell() in src/lib/authz.ts prefixes leading =, +, -, @, \\t, and \\r characters with a single quote before exporting broadsheets or audit logs."),

    h2("8.2 Identified Vulnerabilities, Severity Ratings & Recommended Fixes"),
    p(
      "The following 10 vulnerabilities were identified by inspecting every route handler, server action, and library file in the repository:"
    ),
    makeTable(
      ["ID & Severity", "File & Location", "Vulnerability Description", "Recommended Fix"],
      [
        [
          "SEC-01\nCRITICAL",
          "src/app/api/debug-db/route.ts (Lines 4–17)",
          "Unauthenticated Database Dump: GET /api/debug-db runs prisma.student.findMany() and prisma.user.findMany() with no authentication check, returning all User records (including PasswordHash, TotpSecret, and TotpBackupCodes) and all Student PII to any anonymous caller.",
          "Delete src/app/api/debug-db/route.ts before production use, or gate it behind requireCapability('MANAGE_SYSTEM') and return only aggregate counts.",
        ],
        [
          "SEC-02\nCRITICAL",
          "src/lib/db.ts (Line 4), src/lib/email.ts (Lines 5–6), src/lib/auth.ts (Line 41), src/proxy.ts (Line 57)",
          "Hardcoded Fallback Secrets in Source Code: NEON_DATABASE_URL (with database password), Gmail SMTP credentials (SMTP_PASSWORD), and 'fallback-secret-for-dev' for NEXTAUTH_SECRET are hardcoded as fallbacks in TypeScript files committed to Git.",
          "Remove all hardcoded credential fallbacks from source code, rotate the Neon DB password and Gmail App Password immediately, and fail fast at startup if process.env.DATABASE_URL or process.env.NEXTAUTH_SECRET is missing.",
        ],
        [
          "SEC-03\nHIGH",
          "src/app/api/setup/route.ts (Lines 5–99)",
          "Unprotected Setup & Credential Reset Endpoint: GET /api/setup is publicly callable without authentication, upserts default accounts, and returns plaintext credentials (admin123, password123) in the JSON response.",
          "Remove src/app/api/setup/route.ts entirely and rely exclusively on CLI seeding (node scripts/apply_v3_sql_and_seed.js).",
        ],
        [
          "SEC-04\nHIGH",
          "src/app/api/admissions/route.ts (Lines 57–96)",
          "Unauthenticated GET and PATCH on /api/admissions: While POST /api/admissions is intentionally public for applicants, GET /api/admissions (which returns all applicant PII) and PATCH /api/admissions (which changes application status and sends decision emails) do not call requireCapability('MANAGE_STUDENTS').",
          "Add await requireCapability('MANAGE_STUDENTS') at the top of GET() and PATCH() in src/app/api/admissions/route.ts.",
        ],
        [
          "SEC-05\nHIGH",
          "src/app/actions/messaging.ts (Lines 58–74)",
          "PasswordHash Exposure in getMessageContacts(): prisma.user.findMany({ include: { Role: true } }) returns full User objects—including PasswordHash, TotpSecret, and TotpBackupCodes—to any logged-in student or teacher browser.",
          "Replace include: { Role: true } with an explicit select: { UserID: true, Email: true, Role: { select: { RoleName: true } } } and scope contacts to relevant teachers/students.",
        ],
        [
          "SEC-06\nHIGH",
          "src/lib/redis.ts (Lines 32–41) & src/lib/rateLimit.ts",
          "Rate Limiter Bypass When REDIS_URL is Unset: Because REDIS_URL is not configured in .env, src/lib/redis.ts falls back to redisMock where incr() always returns 1. As a result, rateLimit() always succeeds and never throttles login, registration, or password reset brute-force attempts.",
          "Provision an Upstash/Redis instance via REDIS_URL, or implement an in-memory Map sliding-window counter with TTL cleanup inside redisMock when Redis is not configured.",
        ],
        [
          "SEC-07\nMEDIUM",
          "src/app/api/debug-env/route.ts (Lines 3–20)",
          "Unauthenticated Environment Metadata Leak: GET /api/debug-env publicly exposes environment variable key names and the first 15 characters of database connection URLs.",
          "Delete src/app/api/debug-env/route.ts or restrict it to SUPER_ADMIN in development mode only (process.env.NODE_ENV !== 'production').",
        ],
        [
          "SEC-08\nMEDIUM",
          "src/app/actions/attendance.ts (Lines 9, 44) & src/app/actions/studentProfile.ts (Lines 13, 94)",
          "Legacy Role-Casing Bugs & IDOR in Attendance/Receipt Actions: (1) markAttendance checks session.user.role !== 'teacher' (lowercase), failing for 'Teacher' role; (2) getAttendanceForClass has no role or class-assignment check; (3) uploadPaymentReceipt(studentId, ...) does not verify that studentId belongs to session.user.id.",
          "Refactor attendance.ts to use assertFormMasterAssigned(classId) / assertTeacherAssigned(), and refactor uploadPaymentReceipt() to resolve the student record directly from requireActiveUser().",
        ],
        [
          "SEC-09\nMEDIUM",
          "src/app/api/chat/route.ts (Lines 7–90)",
          "Unthrottled Public AI Endpoint: POST /api/chat invokes Google Gemini (gemini-flash-lite-latest) without authentication or IP rate limiting, allowing automated bots to exhaust the school's GOOGLE_GENERATIVE_AI_API_KEY quota.",
          "Apply IP rate limiting (e.g., 15 messages per 5 minutes) and cap maximum message history length and attachment payload size in POST /api/chat.",
        ],
        [
          "SEC-10\nLOW",
          "src/app/actions/admin.ts & src/lib/authz.ts",
          "Optional Enforcement of Step-Up TOTP on High-Sensitivity Actions: Although CAPABILITY_METADATA defines requiresStepUpTotp: true for 7 capabilities and verifyStepUpTotpAction() verifies codes, mutations do not yet reject staff who have not enabled TOTP.",
          "Require TotpEnabled === true for all Admin/Principal/Bursar accounts and check a short-lived step-up verification timestamp before executing capabilities where requiresStepUpTotp is true.",
        ],
      ],
      [14, 20, 34, 32]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 9: DEPLOYMENT & CONFIGURATION
    // =========================================================================
    h1("9. Deployment, Configuration & Operations"),
    h2("9.1 Environment Variables Reference"),
    p("The table below lists every environment variable referenced across the codebase:"),
    makeTable(
      ["Variable Name", "Required?", "Used In", "Purpose"],
      [
        ["DATABASE_URL", "Yes", "prisma/schema.prisma, src/lib/db.ts", "Neon PostgreSQL pooled/direct connection string (with ?sslmode=require)."],
        ["NEXTAUTH_SECRET", "Yes", "src/lib/auth.ts, src/proxy.ts, src/app/actions/scratchCards.ts", "Secret key used to sign/verify NextAuth session JWTs and fallback scratch-card HMAC pepper."],
        ["NEXTAUTH_URL", "Yes", "NextAuth, src/lib/email.ts", "Canonical base URL of the deployment (http://localhost:3000 locally; https://wofs.vercel.app in production)."],
        ["NEXT_PUBLIC_APP_URL", "Optional", "src/app/actions/payments.ts", "Base URL used for Paystack payment callback redirect."],
        ["SCRATCH_CARD_PEPPER", "Recommended", "src/app/actions/scratchCards.ts", "Dedicated secret pepper for HMAC-SHA256 scratch card PIN hashing (falls back to NEXTAUTH_SECRET)."],
        ["SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM", "Yes (for Email)", "src/lib/email.ts", "SMTP server credentials (configured for smtp.gmail.com:587) for admission & OTP emails."],
        ["GOOGLE_GENERATIVE_AI_API_KEY", "Yes (for Faithbot)", "src/app/api/chat/route.ts", "Google Gemini API key used by @ai-sdk/google for the Faithbot study assistant."],
        ["SDASH_API_KEY, ALOC_API_KEY", "Optional (CBT)", "src/lib/cbt-api.ts", "External API keys for fetching WAEC/NECO/UTME past questions (falls back to offline bank if unset)."],
        ["PAYSTACK_SECRET_KEY", "Yes (for Online Fees)", "src/app/actions/payments.ts, src/app/api/webhooks/paystack/route.ts", "Paystack secret key for initializing online tuition payments and verifying webhook signatures."],
        ["REDIS_URL", "Recommended", "src/lib/redis.ts, src/worker.ts", "Redis connection string for caching, rate limiting, and BullMQ background worker queues."],
      ],
      [26, 14, 24, 36]
    ),

    h2("9.2 Build Pipeline, Hosting & Setup Steps"),
    bullet("Build Command (package.json): prisma generate && next build --webpack. Note that --webpack is explicitly passed because @serwist/next uses a Webpack plugin to compile src/app/sw.ts into public/sw.js."),
    bullet("External Server Packages (next.config.ts): serverExternalPackages: ['@prisma/client', 'prisma', 'bcryptjs', 'nodemailer'] ensures native/Node-specific dependencies are not bundled improperly in serverless functions."),
    bullet("Database Initialization & Seeding: Run npx prisma db push followed by node scripts/apply_v3_sql_and_seed.js to install all PostgreSQL CHECK constraints, partial unique indexes, the AuditLog immutability trigger, WAEC/Primary grade scales, and the 5 staff accounts."),
    bullet("Acceptance Test Verification: Run npx tsx scripts/run_b7_acceptance_tests.ts and npx tsc --noEmit to verify domain grading, competition ranking, Separation of Duties, capabilities, and RFC 6238 TOTP."),
    new Paragraph({ children: [new PageBreak()] }),

    // =========================================================================
    // SECTION 10: GAPS AND RISKS
    // =========================================================================
    h1("10. Gaps, Technical Debt & Recommended Roadmap"),
    h2("10.1 Incomplete or Stubbed Features (Verified from Code)"),
    p("In accordance with the requirement to flag any missing or stubbed functionality rather than guessing, the following items are partially implemented or stubbed in the current codebase:"),
    makeTable(
      ["Area / Feature", "File Location", "Current State in Code", "Risk & Recommended Completion"],
      [
        [
          "Bank Teller & Avatar File Uploads",
          "src/app/actions/studentProfile.ts (Line 110) & src/app/actions/profile.ts (Line 24)",
          "uploadPaymentReceipt() hardcodes ReceiptUrl: '/uploads/dummy-receipt.pdf', and updateProfile() sets AvatarUrl: '/uploads/' + avatarFile.name without persisting the file binary to cloud object storage.",
          "Integrate S3-compatible private object storage (e.g., Cloudflare R2, AWS S3, or Vercel Blob), compute SHA-256 ReceiptHash on upload to block duplicate teller receipts, and serve receipts via short-lived signed URLs.",
        ],
        [
          "Absentee SMS Dispatch in Attendance",
          "src/app/actions/attendance.ts (Lines 32–35)",
          "When a student is marked 'Absent', markAttendance() logs '[ALERT DISPATCHED] Sending SMS to Parent...' to console.log without calling an SMS gateway or sendEmail().",
          "Connect markAttendance() to src/lib/email.ts and a Nigerian SMS gateway (e.g., Termii or Africa's Talking) to notify Student.ParentEmail and Student.ParentContact.",
        ],
        [
          "Dual Legacy vs. v3 Columns on Result & Payment_Record",
          "prisma/schema.prisma (Lines 351–356, 612–613)",
          "Result stores both legacy Float fields (CAScore, ExamScore, TotalScore) and v3 integer tenths (CAScoreTenths, ExamScoreTenths, TotalScoreTenths). Similarly, Payment_Record stores both AmountPaid (Float) and AmountKobo (BigInt).",
          "Once all legacy UI components read exclusively from *Tenths and AmountKobo, deprecate and drop the floating-point columns to prevent divergence.",
        ],
        [
          "Student.ClassID vs. Term Enrollment Synchronization",
          "src/app/actions/admin.ts (promoteStudentsBatch, enrollApplicantToStudent)",
          "Student promotion and enrollment update Student.ClassID directly, whereas the v3 Enrollment table (which tracks per-term class membership and WITHDRAWN status) is not automatically populated on every student creation/promotion.",
          "Update enrollApplicantToStudent(), addStudent(), and promoteStudentsBatch() to upsert a corresponding Enrollment row for the active Academic_Term.",
        ],
        [
          "Standalone Worker vs. Serverless Execution",
          "src/worker.ts vs. src/lib/queue.ts",
          "src/worker.ts defines BullMQ workers (email-queue, payment-queue) and a midnight node-cron backup job, but Vercel deployments do not run long-lived background processes. src/lib/queue.ts works around this by sending emails inline.",
          "Trigger automated backups via Vercel Cron Jobs (/api/cron/backup) and either remove unused BullMQ worker code or host src/worker.ts on a persistent container (Railway/Render) backed by Upstash Redis.",
        ],
        [
          "Unused Schema Models (StaffInvite, CbtPlan, CbtSubscription)",
          "prisma/schema.prisma (Lines 555–564, 683–705)",
          "The Prisma schema defines StaffInvite, CbtPlan, and CbtSubscription, but administrative UI pages for issuing staff email invite tokens or billing separate CBT subscriptions are not yet wired.",
          "Either wire StaffInvite into /portal/admin/users and CbtSubscription into /portal/cbt, or document them as Phase 2 expansion tables.",
        ],
      ],
      [22, 22, 28, 28]
    ),

    h2("10.2 Prioritized Engineering Roadmap"),
    bullet("Priority 1 (Immediate — Security Lockdown): Remove or protect /api/debug-db, /api/debug-env, and /api/setup; add requireCapability('MANAGE_STUDENTS') to GET/PATCH /api/admissions; add a field select projection to getMessageContacts(); and remove hardcoded credential fallbacks from src/lib/db.ts and src/lib/email.ts."),
    bullet("Priority 2 (Short-Term — Storage & Rate Limiting): Connect REDIS_URL (or an in-memory fallback counter) so rateLimit() actively throttles brute-force attempts, and replace the stubbed receipt/avatar paths with real cloud object storage."),
    bullet("Priority 3 (Medium-Term — Role-Casing Cleanup & Step-Up MFA): Update attendance.ts and studentProfile.ts to use centralized guards in src/lib/authz.ts, auto-sync Enrollment rows during student promotion, and enforce mandatory Step-Up TOTP verification on all capabilities flagged with requiresStepUpTotp."),
  ];

  const doc = new Document({
    creator: "Word of Faith Schools Portal Engineering",
    title: "Word of Faith Group of Schools — Complete System Architecture",
    description: "Complete As-Built System Architecture, Database Reference, Security Review, and Operational Guide",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const rootTarget = path.join(__dirname, "..", "System_Architecture.docx");
  fs.writeFileSync(rootTarget, buffer);
  console.log(`✔ Saved System Architecture Word document to project root: ${rootTarget} (${buffer.length} bytes)`);

  const publicDownloadsDir = path.join(__dirname, "..", "public", "downloads");
  if (!fs.existsSync(publicDownloadsDir)) {
    fs.mkdirSync(publicDownloadsDir, { recursive: true });
  }
  const pubTarget = path.join(publicDownloadsDir, "System_Architecture.docx");
  fs.writeFileSync(pubTarget, buffer);
  console.log(`✔ Saved copy to public downloads: ${pubTarget}`);

  const userDownloadsPath = "C:\\Users\\abasi\\Downloads\\System_Architecture.docx";
  try {
    fs.writeFileSync(userDownloadsPath, buffer);
    console.log(`✔ Saved directly to Windows Downloads folder: ${userDownloadsPath}`);
  } catch (err) {
    console.warn("Could not write to Downloads folder:", err.message);
  }

  const userDesktopPath = "C:\\Users\\abasi\\OneDrive\\Desktop\\System_Architecture.docx";
  try {
    fs.writeFileSync(userDesktopPath, buffer);
    console.log(`✔ Saved directly to Desktop: ${userDesktopPath}`);
  } catch (err) {
    console.warn("Could not write to Desktop folder:", err.message);
  }
}

generateArchitectureDoc().catch((err) => {
  console.error("Failed to generate System_Architecture.docx:", err);
  process.exit(1);
});
