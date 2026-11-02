import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  sendAdmissionReceivedNotification,
  sendAdmissionDecisionNotification,
} from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Basic validation
    if (
      !body.childFirstName ||
      !body.childLastName ||
      !body.parentName ||
      !body.parentEmail ||
      !body.parentPhone ||
      !body.applyingClass
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const application = await prisma.admission_Application.create({
      data: {
        childFirstName: body.childFirstName.trim(),
        childLastName: body.childLastName.trim(),
        dateOfBirth: new Date(body.dateOfBirth),
        gender: body.gender || "Not Specified",
        parentName: body.parentName.trim(),
        parentEmail: body.parentEmail.trim(),
        parentPhone: body.parentPhone.trim(),
        applyingClass: body.applyingClass,
        previousSchool: body.previousSchool || null,
        status: "Pending",
      },
    });

    // Send confirmation email to the email address submitted during application
    await sendAdmissionReceivedNotification({
      parentName: application.parentName,
      parentEmail: application.parentEmail,
      parentPhone: application.parentPhone,
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
      applyingClass: application.applyingClass,
    });

    return NextResponse.json({ success: true, application }, { status: 201 });
  } catch (error: any) {
    console.error("Admission application error:", error);
    return NextResponse.json(
      { error: "Failed to submit application. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const applications = await prisma.admission_Application.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ applications });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status, reason } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const updated = await prisma.admission_Application.update({
      where: { id: Number(id) },
      data: { status },
    });

    if (status === "Approved" || status === "Rejected") {
      await sendAdmissionDecisionNotification({
        status,
        parentName: updated.parentName,
        parentEmail: updated.parentEmail,
        parentPhone: updated.parentPhone,
        childFirstName: updated.childFirstName,
        childLastName: updated.childLastName,
        applyingClass: updated.applyingClass,
        reason,
      });
    }

    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
