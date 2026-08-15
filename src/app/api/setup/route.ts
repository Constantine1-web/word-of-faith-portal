import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    // ── 1. Roles ──────────────────────────────────────────────────
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

    // ── 2. Admin user ─────────────────────────────────────────────
    const adminHash = await bcrypt.hash("admin123", 10);
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

    // ── 3. Class & Term ───────────────────────────────────────────
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

    // ── 4. Teacher user ───────────────────────────────────────────
    const teacherHash = await bcrypt.hash("password123", 10);
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

    // ── 5. Student user + student record ──────────────────────────
    const studentHash = await bcrypt.hash("password123", 10);
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
        PreferredName: "John Doe",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully!",
      accounts: [
        { email: "admin@wordoffaith.com", password: "admin123", role: "Admin" },
        { email: "teacher@wordoffaith.edu.ng", password: "password123", role: "Teacher" },
        { email: "student1@wordoffaith.edu.ng", password: "password123", role: "Student" },
      ],
    });
  } catch (error: unknown) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
