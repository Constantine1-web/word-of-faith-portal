import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/authz";
import { timingSafeCompare, rateLimit } from "@/lib/security";

export async function GET(req: Request) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "local-setup";
    const rl = await rateLimit(`api_setup:${ip}`, 5, 900);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many setup requests." }, { status: 429 });
    }

    const existingAdminCount = await prisma.user.count({
      where: {
        Role: { RoleName: { in: ["Admin", "SUPER_ADMIN", "PRINCIPAL"] } },
      },
    });

    const setupSecret = process.env.SETUP_SECRET?.trim() || "";
    const providedSecret = req.headers.get("x-setup-secret")?.trim() || "";
    const hasSecretMatch =
      setupSecret.length >= 16 &&
      providedSecret.length > 0 &&
      timingSafeCompare(setupSecret, providedSecret);

    // If an admin already exists or running in production, require SUPER_ADMIN session or valid X-Setup-Secret header
    if (existingAdminCount > 0 || process.env.NODE_ENV === "production") {
      if (!hasSecretMatch) {
        try {
          await requireRole(["SUPER_ADMIN", "Admin"]);
        } catch {
          return NextResponse.json(
            { error: "Setup endpoint is locked because administrator accounts are already provisioned." },
            { status: 403 }
          );
        }
      }
    }

    const configuredAdminPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
    if (process.env.NODE_ENV === "production" && (!configuredAdminPassword || configuredAdminPassword.length < 12)) {
      return NextResponse.json(
        { error: "INITIAL_ADMIN_PASSWORD (min 12 chars) is required in production." },
        { status: 500 }
      );
    }

    // 1. Roles
    const adminRole = await prisma.role.upsert({
      where: { RoleName: "Admin" },
      update: {},
      create: { RoleName: "Admin", Permissions: '{"all": true}' },
    });

    const teacherRole = await prisma.role.upsert({
      where: { RoleName: "Teacher" },
      update: {},
      create: { RoleName: "Teacher", Permissions: '{"view_classes": true, "edit_results": true}' },
    });

    const studentRole = await prisma.role.upsert({
      where: { RoleName: "Student" },
      update: {},
      create: { RoleName: "Student", Permissions: '{"view_results": true}' },
    });

    // 2. Admin user
    const initialAdminPassword = configuredAdminPassword || "wofschools2026";
    const adminHash = await bcrypt.hash(initialAdminPassword, 12);
    await prisma.user.upsert({
      where: { Email: "admin@wordoffaith.com" },
      update: {},
      create: {
        Email: "admin@wordoffaith.com",
        PasswordHash: adminHash,
        RoleID: adminRole.RoleID,
        IsActive: true,
      },
    });

    // 3. Class & Term
    const jss1 = await prisma.class.upsert({
      where: { ClassName: "JSS 1A" },
      update: {},
      create: { ClassName: "JSS 1A", Level: "Secondary" },
    });

    await prisma.academic_Term.upsert({
      where: { TermID: 1 },
      update: {},
      create: { SessionName: "2026/2027", TermName: "First Term", IsActive: true },
    });

    // 4. Teacher user
    const teacherHash = await bcrypt.hash(initialAdminPassword, 12);
    await prisma.user.upsert({
      where: { Email: "teacher@wordoffaith.edu.ng" },
      update: {},
      create: {
        Email: "teacher@wordoffaith.edu.ng",
        PasswordHash: teacherHash,
        RoleID: teacherRole.RoleID,
        IsActive: true,
      },
    });

    // 5. Student user + student record
    const studentHash = await bcrypt.hash(initialAdminPassword, 12);
    const studentUser = await prisma.user.upsert({
      where: { Email: "student1@wordoffaith.edu.ng" },
      update: {},
      create: {
        Email: "student1@wordoffaith.edu.ng",
        PasswordHash: studentHash,
        RoleID: studentRole.RoleID,
        IsActive: true,
      },
    });

    await prisma.student.upsert({
      where: { AdmissionNo: "WOF/2026/001" },
      update: {},
      create: {
        UserID: studentUser.UserID,
        AdmissionNo: "WOF/2026/001",
        ClassID: jss1.ClassID,
        DateOfBirth: new Date("2014-01-01"),
        ParentContact: "08000000000",
        ParentEmail: "student1@wordoffaith.edu.ng",
        PreferredName: "John Doe",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Database bootstrap verified successfully.",
      accounts: [
        { email: "admin@wordoffaith.com", role: "Admin" },
        { email: "teacher@wordoffaith.edu.ng", role: "Teacher" },
        { email: "student1@wordoffaith.edu.ng", role: "Student" },
      ],
    });
  } catch (error: unknown) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: "Setup failed." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
