import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { z } from "zod";
import {
  sendAdmissionReceivedNotification,
  sendAdmissionDecisionNotification,
} from "@/lib/email";

const AdmissionPostSchema = z.object({
  childFirstName: z.string().trim().min(1).max(100),
  childLastName: z.string().trim().min(1).max(100),
  dateOfBirth: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), { message: "Invalid dateOfBirth" }),
  gender: z.string().trim().max(30).optional().default("Not Specified"),
  parentName: z.string().trim().min(1).max(140),
  parentEmail: z.string().trim().email().max(160),
  parentPhone: z.string().trim().min(7).max(40),
  applyingClass: z.string().trim().min(1).max(60),
  previousSchool: z.string().trim().max(160).optional().nullable(),
});

const AdmissionPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["Pending", "Approved", "Rejected"]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "local-applicant";
    const rl = await rateLimit(`admissions:${ip}`, 10, 900);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many admission submissions from this IP. Please try again shortly." },
        { status: 429 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = AdmissionPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid admission application fields." },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const application = await prisma.admission_Application.create({
      data: {
        childFirstName: body.childFirstName,
        childLastName: body.childLastName,
        dateOfBirth: new Date(body.dateOfBirth),
        gender: body.gender,
        parentName: body.parentName,
        parentEmail: body.parentEmail.toLowerCase(),
        parentPhone: body.parentPhone,
        applyingClass: body.applyingClass,
        previousSchool: body.previousSchool || null,
        status: "Pending",
      },
    });

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
    await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMISSIONS", "Admin"]);
    const applications = await prisma.admission_Application.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ applications });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized or failed to fetch applications" },
      { status: 403 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMISSIONS", "Admin"]);
    const rawBody = await req.json().catch(() => null);
    const parsed = AdmissionPatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid id or status" },
        { status: 400 }
      );
    }

    const { id, status, reason } = parsed.data;

    const updated = await prisma.admission_Application.update({
      where: { id },
      data: { status },
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "ADMISSION_STATUS_UPDATED",
      entity: "Admission_Application",
      entityId: updated.id,
      reason: reason || `Status changed to ${status}`,
      newValue: { status: updated.status },
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized or failed to update status" },
      { status: 403 }
    );
  }
}
