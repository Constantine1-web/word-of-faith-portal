"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireRole, writeAuditLog } from "@/lib/authz";

async function requireTermAdmin() {
  return requireRole(["PRINCIPAL", "SUPER_ADMIN", "Admin"]);
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
          },
        },
      },
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
      where: { IsActive: true },
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
  const actor = await requireTermAdmin();

  try {
    if (!data.sessionName || !data.termName) {
      return {
        success: false,
        error: "Session and Term Name are required (e.g. 2026/2027 and First Term)",
      };
    }

    if (data.makeActive) {
      await prisma.academic_Term.updateMany({
        data: { IsActive: false },
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
      },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "TERM_CREATE",
      targetTable: "Academic_Term",
      targetId: String(term.TermID),
      afterState: { sessionName: term.SessionName, termName: term.TermName, isActive: term.IsActive },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, term };
  } catch (error: any) {
    console.error("createAcademicTerm error:", error);
    return { success: false, error: error.message || "Failed to create academic term" };
  }
}

export async function setActiveTerm(termId: number) {
  const actor = await requireTermAdmin();

  try {
    await prisma.$transaction([
      prisma.academic_Term.updateMany({
        data: { IsActive: false },
      }),
      prisma.academic_Term.update({
        where: { TermID: termId },
        data: { IsActive: true },
      }),
    ]);

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: "TERM_SET_ACTIVE",
      targetTable: "Academic_Term",
      targetId: String(termId),
      afterState: { isActive: true },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true };
  } catch (error: any) {
    console.error("setActiveTerm error:", error);
    return { success: false, error: error.message || "Failed to set active term" };
  }
}

export async function toggleTermLock(termId: number, isLocked: boolean) {
  const actor = await requireTermAdmin();

  try {
    const updated = await prisma.academic_Term.update({
      where: { TermID: termId },
      data: { IsLocked: isLocked },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: actor.roles.join(","),
      action: isLocked ? "TERM_FREEZE" : "TERM_UNFREEZE",
      targetTable: "Academic_Term",
      targetId: String(termId),
      afterState: { isLocked: updated.IsLocked },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, isLocked: updated.IsLocked };
  } catch (error: any) {
    console.error("toggleTermLock error:", error);
    return { success: false, error: error.message || "Failed to toggle term lock" };
  }
}
