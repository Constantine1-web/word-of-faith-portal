"use server";

import prisma from "@/lib/db";
import { z } from "zod";
import { validateInput } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import {
  DEFAULT_FEE_SCHEDULES,
  ensureAndListFeeSchedules,
  type FeeLevelGroup,
} from "@/lib/fee-schedule";
import {
  formatAdmissionReference,
  parseAdmissionReference,
} from "@/lib/admissions-lookup";

export interface PublicFeeScheduleItem {
  levelGroup: FeeLevelGroup;
  displayName: string;
  tuitionNaira: number;
  leviesNaira: number;
  maintenanceFeeNaira: number;
  totalNaira: number;
}

export interface PublicAdmissionLookupResultItem {
  reference: string;
  childName: string;
  applyingClass: string;
  status: string;
  submittedAt: string;
  wofsStudentId?: string;
  assignedClassName?: string;
  registrationStatus?: string;
}

export async function getPublicAdmissionsSchedules(): Promise<PublicFeeScheduleItem[]> {
  try {
    const rows = await ensureAndListFeeSchedules();
    return rows.map((r) => ({
      levelGroup: r.levelGroup,
      displayName: r.displayName,
      tuitionNaira: r.tuitionNaira,
      leviesNaira: r.leviesNaira,
      maintenanceFeeNaira: r.maintenanceFeeNaira,
      totalNaira: r.totalNaira,
    }));
  } catch (err) {
    console.warn("[PublicAdmissions] Using fallback fee schedule preview:", err);
    return DEFAULT_FEE_SCHEDULES.map((d) => ({
      ...d,
      totalNaira: d.tuitionNaira + d.leviesNaira + d.maintenanceFeeNaira,
    }));
  }
}

const LookupSchema = z.object({
  parentEmail: z.string().trim().email("Enter the guardian email used on the application.").max(160),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the child's valid date of birth."),
  applicationRef: z.string().trim().max(40).optional(),
});

export async function lookupPublicAdmissionStatus(rawInput: {
  parentEmail: string;
  dateOfBirth: string;
  applicationRef?: string;
}): Promise<{
  success: boolean;
  error?: string;
  applications: PublicAdmissionLookupResultItem[];
}> {
  try {
    const data = validateInput(LookupSchema, rawInput);
    const normalizedEmail = data.parentEmail.toLowerCase();

    const rl = await rateLimit(`adm_lookup:${normalizedEmail}`, 10, 300);
    if (!rl.success) {
      return {
        success: false,
        error: "Too many status checks for this email. Please wait 5 minutes before trying again.",
        applications: [],
      };
    }

    const parsedRefId = parseAdmissionReference(data.applicationRef);
    if (data.applicationRef?.trim() && parsedRefId === null) {
      return {
        success: false,
        error: "Invalid application reference format. Expected e.g. WOF-ADM-00012 or 12.",
        applications: [],
      };
    }

    const dobStart = new Date(`${data.dateOfBirth}T00:00:00.000Z`);
    const dobEnd = new Date(`${data.dateOfBirth}T23:59:59.999Z`);
    if (Number.isNaN(dobStart.getTime())) {
      return { success: false, error: "Invalid date of birth.", applications: [] };
    }

    const matches = await prisma.admission_Application.findMany({
      where: {
        parentEmail: { equals: normalizedEmail, mode: "insensitive" },
        dateOfBirth: { gte: dobStart, lte: dobEnd },
        ...(parsedRefId !== null ? { id: parsedRefId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (matches.length === 0) {
      return {
        success: false,
        error:
          "No application matched that guardian email, date of birth, and reference combination.",
        applications: [],
      };
    }

    const enrolledIds = matches
      .map((m) => m.enrolledStudentId)
      .filter((id): id is number => typeof id === "number" && id > 0);

    const students =
      enrolledIds.length > 0
        ? await prisma.student.findMany({
            where: { StudentID: { in: enrolledIds } },
            select: {
              StudentID: true,
              AdmissionNo: true,
              RegistrationStatus: true,
              Class: { select: { ClassName: true } },
            },
          })
        : [];

    const studentMap = new Map(students.map((s) => [s.StudentID, s]));

    return {
      success: true,
      applications: matches.map((m) => {
        const linkedStudent = m.enrolledStudentId ? studentMap.get(m.enrolledStudentId) : undefined;
        return {
          reference: formatAdmissionReference(m.id),
          childName: `${m.childFirstName} ${m.childLastName}`.trim(),
          applyingClass: m.applyingClass,
          status: m.status,
          submittedAt: m.createdAt.toISOString(),
          wofsStudentId: linkedStudent?.AdmissionNo,
          assignedClassName: linkedStudent?.Class?.ClassName,
          registrationStatus: linkedStudent?.RegistrationStatus,
        };
      }),
    };
  } catch (error: unknown) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unable to check application status right now.",
      applications: [],
    };
  }
}
