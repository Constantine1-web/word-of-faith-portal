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

  // 1c. Section 5 Partial Unique Index: One active CBT attempt per student
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt
    ON "CbtAttempt" ("studentId")
    WHERE "status" = 'ACTIVE';
  `);

  console.log("✔ PostgreSQL CHECK constraints, AuditLog immutability trigger, and one_active_attempt index installed.");

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

  // 4. Provision v3 Staff Accounts & Granular Role Assignments
  const defaultPasswordHash = await bcrypt.hash("WordOfFaith@2026", 10);

  const staffAccounts = [
    {
      email: "admin@wordoffaith.com",
      baseRole: "Admin",
      granularRoles: ["SUPER_ADMIN", "PRINCIPAL"],
    },
    {
      email: "admin@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["SUPER_ADMIN"],
    },
    {
      email: "principal@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["PRINCIPAL"],
    },
    {
      email: "bursar@wordoffaith.edu.ng",
      baseRole: "Admin",
      granularRoles: ["BURSAR"],
    },
    {
      email: "teacher@wordoffaith.edu.ng",
      baseRole: "Teacher",
      granularRoles: ["TEACHER", "FORM_MASTER"],
    },
  ];

  const staffUserMap = {};
  for (const acc of staffAccounts) {
    const user = await prisma.user.upsert({
      where: { Email: acc.email },
      update: {
        IsActive: true,
        Uuid: crypto.randomUUID(),
      },
      create: {
        Uuid: crypto.randomUUID(),
        Email: acc.email,
        PasswordHash: defaultPasswordHash,
        RoleID: roleMap[acc.baseRole],
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
    console.log(`✔ Provisioned ${acc.email} with roles: [${acc.granularRoles.join(", ")}]`);
  }

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
