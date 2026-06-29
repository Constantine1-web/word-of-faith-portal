import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    // Ensure a default class exists
    const defaultClass = await prisma.class.upsert({
      where: { ClassName: "JSS 1A" },
      update: {},
      create: {
        ClassName: "JSS 1A",
        Level: "Secondary"
      }
    });

    // Create a dummy student for the registration
    const student = await prisma.student.upsert({
      where: { AdmissionNo: "WOF/2026/001" },
      update: {},
      create: {
        AdmissionNo: "WOF/2026/001",
        ClassID: defaultClass.ClassID,
        DateOfBirth: new Date("2010-01-01"),
        ParentContact: "edidiongakpan1420@gmail.com",
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Database seeded successfully. You can now register with WOF/2026/001",
      student 
    });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
