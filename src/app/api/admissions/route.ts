import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Basic validation
    if (!body.childFirstName || !body.childLastName || !body.parentName || !body.parentEmail || !body.parentPhone || !body.applyingClass) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const application = await prisma.admission_Application.create({
      data: {
        childFirstName: body.childFirstName,
        childLastName: body.childLastName,
        dateOfBirth: new Date(body.dateOfBirth),
        gender: body.gender || "Not Specified",
        parentName: body.parentName,
        parentEmail: body.parentEmail,
        parentPhone: body.parentPhone,
        applyingClass: body.applyingClass,
        previousSchool: body.previousSchool || null,
        status: "Pending"
      }
    });

    return NextResponse.json({ success: true, application }, { status: 201 });
  } catch (error: any) {
    console.error("Admission application error:", error);
    return NextResponse.json({ error: "Failed to submit application. Please try again." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const applications = await prisma.admission_Application.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ applications });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json();
    
    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const updated = await prisma.admission_Application.update({
      where: { id },
      data: { status }
    });

    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
