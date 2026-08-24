"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    throw new Error("Unauthorized. Admin privileges required.");
  }
}

export async function getTerms() {
  try {
    const terms = await prisma.academic_Term.findMany({
      orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
      include: {
        _count: {
          select: {
            Results: true,
            ScratchCards: true,
            PaymentRecords: true,
          }
        }
      }
    });
    return { success: true, terms };
  } catch (error: any) {
    console.error("getTerms error:", error);
    return { success: false, error: error.message || "Failed to fetch terms" };
  }
}

export async function getActiveTerm() {
  try {
    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });
    return { success: true, term };
  } catch (error: any) {
    console.error("getActiveTerm error:", error);
    return { success: false, error: error.message || "Failed to fetch active term" };
  }
}

export async function createAcademicTerm(data: {
  sessionName: string;
  termName: string;
  startDate?: string;
  endDate?: string;
  makeActive?: boolean;
}) {
  await requireAdmin();

  try {
    if (!data.sessionName || !data.termName) {
      return { success: false, error: "Session and Term Name are required (e.g. 2026/2027 and First Term)" };
    }

    // If making active, deactivate all others first
    if (data.makeActive) {
      await prisma.academic_Term.updateMany({
        data: { IsActive: false }
      });
    }

    const term = await prisma.academic_Term.create({
      data: {
        SessionName: data.sessionName.trim(),
        TermName: data.termName.trim(),
        IsActive: !!data.makeActive,
        IsLocked: false,
        StartDate: data.startDate ? new Date(data.startDate) : null,
        EndDate: data.endDate ? new Date(data.endDate) : null,
      }
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    return { success: true, term };
  } catch (error: any) {
    console.error("createAcademicTerm error:", error);
    return { success: false, error: error.message || "Failed to create academic term" };
  }
}

export async function setActiveTerm(termId: number) {
  await requireAdmin();

  try {
    await prisma.$transaction([
      prisma.academic_Term.updateMany({
        data: { IsActive: false }
      }),
      prisma.academic_Term.update({
        where: { TermID: termId },
        data: { IsActive: true }
      })
    ]);

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    return { success: true };
  } catch (error: any) {
    console.error("setActiveTerm error:", error);
    return { success: false, error: error.message || "Failed to set active term" };
  }
}

export async function toggleTermLock(termId: number, isLocked: boolean) {
  await requireAdmin();

  try {
    const updated = await prisma.academic_Term.update({
      where: { TermID: termId },
      data: { IsLocked: isLocked }
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    return { success: true, isLocked: updated.IsLocked };
  } catch (error: any) {
    console.error("toggleTermLock error:", error);
    return { success: false, error: error.message || "Failed to toggle term lock" };
  }
}
