const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

async function main() {
  console.log("1. Applying PostgreSQL v3 CHECK constraints & AuditLog immutability trigger...");

  // 1a. Score range CHECK constraints (idempotent DO block)
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ca_tenths_range'
      ) THEN
        ALTER TABLE "Result"
          ADD CONSTRAINT "chk_ca_tenths_range"
          CHECK ("CAScoreTenths" IS NULL OR ("CAScoreTenths" >= 0 AND "CAScoreTenths" <= 400));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_tenths_range'
      ) THEN
        ALTER TABLE "Result"
          ADD CONSTRAINT "chk_exam_tenths_range"
          CHECK ("ExamScoreTenths" IS NULL OR ("ExamScoreTenths" >= 0 AND "ExamScoreTenths" <= 600));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_kobo_nonnegative'
      ) THEN
        ALTER TABLE "Invoice"
          ADD CONSTRAINT "chk_invoice_kobo_nonnegative"
          CHECK ("AmountKobo" >= 0);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_kobo_nonnegative'
      ) THEN
        ALTER TABLE "Payment_Record"
          ADD CONSTRAINT "chk_payment_kobo_nonnegative"
          CHECK ("AmountKobo" >= 0);
      END IF;

      -- Section B.5 Separation of Duties CHECK constraints
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_sod'
      ) THEN
        ALTER TABLE "Payment_Record"
          ADD CONSTRAINT "payment_sod"
          CHECK ("ReviewedBy" IS NULL OR "SubmittedBy" IS NULL OR "ReviewedBy" <> "SubmittedBy");
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unlock_sod'
      ) THEN
        ALTER TABLE "UnlockRequest"
          ADD CONSTRAINT "unlock_sod"
          CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");
      END IF;
    END $$;
  `);

  // 1b. Append-only AuditLog trigger
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION trg_protect_audit_log()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'CRITICAL: The AuditLog table is append-only. Modifying or deleting audit records is strictly prohibited.';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS prevent_audit_tampering ON "AuditLog";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER prevent_audit_tampering
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION trg_protect_audit_log();
  `);

  // 1c. Section 5 & B.5 Partial Unique Indexes
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt
    ON "CbtAttempt" ("studentId")
    WHERE "status" = 'ACTIVE';
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_unlock
    ON "UnlockRequest" ("sheetId")
    WHERE "status" IN ('REQUESTED','APPROVED');
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_current_report_card
    ON "ReportCard" ("studentId","termId")
    WHERE "supersededAt" IS NULL;
  `);

  console.log("✔ PostgreSQL CHECK constraints (including payment_sod & unlock_sod), AuditLog trigger, and partial unique indexes installed.");

  // 2. Ensure base Roles exist
  const baseRoles = [
    { RoleName: "Admin", Permissions: JSON.stringify({ all: true }) },
    { RoleName: "Teacher", Permissions: JSON.stringify({ view_classes: true, edit_results: true }) },
    { RoleName: "Student", Permissions: JSON.stringify({ view_results: true }) },
  ];

  const roleMap = {};
  for (const r of baseRoles) {
    const role = await prisma.role.upsert({
      where: { RoleName: r.RoleName },
      update: {},
      create: r,
    });
    roleMap[r.RoleName] = role.RoleID;
  }

  // 3. Ensure active Academic Term exists
  let activeTerm = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
  if (!activeTerm) {
    activeTerm = await prisma.academic_Term.create({
      data: {
        Uuid: crypto.randomUUID(),
        SessionName: "2026/2027",
        TermName: "First Term",
        IsActive: true,
        IsLocked: false,
        StartDate: new Date("2026-09-14"),
        EndDate: new Date("2026-12-18"),
      },
    });
  }
  console.log(`✔ Active Term: ${activeTerm.SessionName} - ${activeTerm.TermName} (TermID: ${activeTerm.TermID})`);

  // 4. Provision v3 Staff Accounts & Granular Role Assignments + Section B.2 Capabilities
  const defaultPasswordHash = await bcrypt.hash("WordOfFaith@2026", 10);

  const FULL_CAPABILITIES = [
    "MANAGE_USERS",
    "MANAGE_STRUCTURE",
    "MANAGE_STUDENTS",
    "CORRECT_SCORES",
    "APPROVE_RESULTS",
    "PUBLISH_RESULTS",
    "UNLOCK_SHEETS",
    "FREEZE_TERM",
    "MANAGE_FINANCE",
    "APPROVE_PAYMENTS",
    "MANAGE_CARDS",
    "MANAGE_CBT",
    "VIEW_AUDIT",
    "MANAGE_SYSTEM",
  ];

  const FINANCE_CAPABILITIES = [
    "MANAGE_FINANCE",
    "APPROVE_PAYMENTS",
    "MANAGE_CARDS",
  ];

  const staffAccounts = [
    {
      email: "admin@wordoffaith.com",
      baseRole: "Admin",
      granularRoles: ["SUPER_ADMIN", "PRINCIPAL"],
      capabilities: FULL_CAPABILITIES,
    },
    {
      email: "admin@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["SUPER_ADMIN"],
      capabilities: FULL_CAPABILITIES,
    },
    {
      email: "principal@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["PRINCIPAL"],
      capabilities: FULL_CAPABILITIES,
    },
    {
      email: "bursar@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["BURSAR"],
      capabilities: FINANCE_CAPABILITIES,
    },
    {
      email: "teacher@wordoffaith.edu.ng",
      baseRole: "Teacher",
      granularRoles: ["TEACHER", "FORM_MASTER"],
      capabilities: [],
    },
  ];

  const staffUserMap = {};
  for (const acc of staffAccounts) {
    const user = await prisma.user.upsert({
      where: { Email: acc.email },
      update: {
        PasswordHash: defaultPasswordHash,
        IsActive: true,
        FailedLoginAttempts: 0,
        LockedUntil: null,
        Uuid: crypto.randomUUID(),
        Capabilities: acc.capabilities,
      },
      create: {
        Uuid: crypto.randomUUID(),
        Email: acc.email,
        PasswordHash: defaultPasswordHash,
        RoleID: roleMap[acc.baseRole],
        Capabilities: acc.capabilities,
        IsActive: true,
        TokenVersion: 1,
      },
    });
    staffUserMap[acc.email] = user;

    for (const gr of acc.granularRoles) {
      await prisma.userRoleAssignment.upsert({
        where: {
          UserID_Role: {
            UserID: user.UserID,
            Role: gr,
          },
        },
        update: {},
        create: {
          UserID: user.UserID,
          Role: gr,
          AssignedBy: "SYSTEM_V3_SEED",
        },
      });
    }
    console.log(`✔ Provisioned ${acc.email} with roles: [${acc.granularRoles.join(", ")}] & capabilities: ${acc.capabilities.length}`);
  }

  // 4b. Seed Section B.5 GradeScales ("WAEC secondary" and "Primary") & GradeBands
  const waecBands = [
    { grade: "A1", minTenths: 750, remark: "Excellent" },
    { grade: "B2", minTenths: 700, remark: "Very Good" },
    { grade: "B3", minTenths: 650, remark: "Good" },
    { grade: "C4", minTenths: 600, remark: "Credit" },
    { grade: "C5", minTenths: 550, remark: "Credit" },
    { grade: "C6", minTenths: 500, remark: "Credit" },
    { grade: "D7", minTenths: 450, remark: "Pass" },
    { grade: "E8", minTenths: 400, remark: "Pass" },
    { grade: "F9", minTenths: 0, remark: "Fail" },
  ];

  const scalesToSeed = [
    { name: "WAEC secondary", levelGroup: "SECONDARY", bands: waecBands },
    { name: "Primary", levelGroup: "PRIMARY", bands: waecBands },
  ];

  for (const s of scalesToSeed) {
    const scale = await prisma.gradeScale.upsert({
      where: { name: s.name },
      update: { levelGroup: s.levelGroup },
      create: {
        name: s.name,
        levelGroup: s.levelGroup,
      },
    });

    for (const b of s.bands) {
      await prisma.gradeBand.upsert({
        where: {
          scaleId_grade: {
            scaleId: scale.id,
            grade: b.grade,
          },
        },
        update: {
          minTenths: b.minTenths,
          remark: b.remark,
        },
        create: {
          scaleId: scale.id,
          grade: b.grade,
          minTenths: b.minTenths,
          remark: b.remark,
        },
      });
    }
  }
  console.log("✔ Seeded WAEC secondary and Primary GradeScales (A1=750 .. F9=0 tenths).");

  // 5. Ensure sample Classes and Subjects exist and assign teacher@wordoffaith.edu.ng
  const teacherUser = staffUserMap["teacher@wordoffaith.edu.ng"];
  const jss1 = await prisma.class.upsert({
    where: { ClassName: "JSS 1 Gold" },
    update: { FormMasterID: teacherUser.UserID },
    create: {
      Uuid: crypto.randomUUID(),
      ClassName: "JSS 1 Gold",
      Level: "Secondary",
      Arm: "Gold",
      FormMasterID: teacherUser.UserID,
    },
  });

  let mathSubject = await prisma.subject.findFirst({ where: { SubjectName: "Mathematics" } });
  if (!mathSubject) {
    mathSubject = await prisma.subject.create({
      data: {
        Uuid: crypto.randomUUID(),
        SubjectName: "Mathematics",
        SubjectCode: "MTH",
        ClassLevel: "Secondary",
      },
    });
  }

  const existingAssignment = await prisma.teacher_Subject_Map.findFirst({
    where: {
      TeacherID: teacherUser.UserID,
      ClassID: jss1.ClassID,
      SubjectID: mathSubject.SubjectID,
    },
  });

  if (!existingAssignment) {
    await prisma.teacher_Subject_Map.create({
      data: {
        Uuid: crypto.randomUUID(),
        TeacherID: teacherUser.UserID,
        ClassID: jss1.ClassID,
        SubjectID: mathSubject.SubjectID,
        TermID: activeTerm.TermID,
        IsFormMaster: true,
        AssignedBy: "SYSTEM_V3_SEED",
      },
    });
  }

  console.log("✔ Teacher assignment & Form Master link verified for JSS 1 Gold - Mathematics.");
}

main()
  .catch((err) => {
    console.error("Error in v3 SQL & Seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
