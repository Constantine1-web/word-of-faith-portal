"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireActiveUser, requireCapability, writeAuditLog } from "@/lib/authz";
import { getStudentTermBillingSummary } from "@/lib/payment-ledger";

async function requireStructureManager() {
  return requireCapability("MANAGE_STRUCTURE");
}

async function syncStudentsFeeClearanceForTerm(termId: number) {
  const students = await prisma.student.findMany({
    select: { StudentID: true },
  });
  for (const st of students) {
    const summary = await getStudentTermBillingSummary(prisma, st.StudentID, termId);
    await prisma.student.update({
      where: { StudentID: st.StudentID },
      data: { HasPaidFees: summary.isCleared },
    });
  }
}

export async function getTerms() {
  try {
    await requireActiveUser();
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
  } catch (error: unknown) {
    console.error("getTerms error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch terms" };
  }
}

export async function getActiveTerm() {
  try {
    await requireActiveUser();
    const term = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    });
    return { success: true, term };
  } catch (error: unknown) {
    console.error("getActiveTerm error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch active term" };
  }
}

export async function createAcademicTerm(data: {
  sessionName: string;
  termName: string;
  startDate?: string;
  endDate?: string;
  makeActive?: boolean;
}) {
  const actor = await requireStructureManager();

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

    if (data.makeActive) {
      await syncStudentsFeeClearanceForTerm(term.TermID).catch(() => {});
    }

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "TERM_CREATE",
      targetTable: "Academic_Term",
      targetId: String(term.TermID),
      afterState: { sessionName: term.SessionName, termName: term.TermName, isActive: term.IsActive },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, term };
  } catch (error: unknown) {
    console.error("createAcademicTerm error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create academic term" };
  }
}

export async function setActiveTerm(termId: number) {
  const actor = await requireStructureManager();

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

    // Synchronize cached active-term fee clearance flags so previous-term payments never carry over
    await syncStudentsFeeClearanceForTerm(termId).catch(() => {});

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "TERM_SET_ACTIVE",
      targetTable: "Academic_Term",
      targetId: String(termId),
      afterState: { isActive: true },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true };
  } catch (error: unknown) {
    console.error("setActiveTerm error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to set active term",
    };
  }
}

export async function toggleTermLock(termId: number, isLocked: boolean) {
  const actor = await requireCapability("FREEZE_TERM");

  try {
    const updated = await prisma.academic_Term.update({
      where: { TermID: termId },
      data: { IsLocked: isLocked },
    });

    await writeAuditLog({
      actorUserId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: isLocked ? "TERM_FREEZE" : "TERM_UNFREEZE",
      targetTable: "Academic_Term",
      targetId: String(termId),
      afterState: { isLocked: updated.IsLocked },
    });

    revalidatePath("/portal/admin/terms");
    revalidatePath("/portal/dashboard");
    revalidatePath("/portal/teacher");
    return { success: true, isLocked: updated.IsLocked };
  } catch (error: unknown) {
    console.error("toggleTermLock error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle term lock",
    };
  }
}
