"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { rateLimit } from "@/lib/security";

const ALLOWED_PARENT_ROLES = ["PARENT", "Parent", "SUPER_ADMIN", "PRINCIPAL", "ADMISSIONS", "Admin"];

export async function getParentDashboardData() {
  try {
    const actor = await requireRole(ALLOWED_PARENT_ROLES);
    const userId = actor.UserID;
    const userEmail = actor.Email?.toLowerCase().trim() || "";

    const user = await prisma.user.findUnique({
      where: { UserID: userId },
      include: {
        ParentProfile: {
          include: {
            Children: {
              include: {
                Student: {
                  include: {
                    Class: {
                      include: {
                        FormMaster: {
                          select: { Email: true },
                        },
                        Broadsheets: true,
                      },
                    },
                    User: {
                      select: { Email: true },
                    },
                    Results: {
                      include: { Subject: true },
                    },
                    PaymentRecords: {
                      orderBy: { PaymentDate: "desc" },
                      take: 10,
                    },
                    Invoices: true,
                    Attendances: {
                      orderBy: { Date: "desc" },
                      take: 30,
                    },
                    CbtAttempts: {
                      orderBy: { startedAt: "desc" },
                      take: 5,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
    });

    let parentProfile = user.ParentProfile;

    if (!parentProfile) {
      parentProfile = await prisma.parent.create({
        data: {
          UserID: userId,
          Phone: `0800000${userId}`,
        },
        include: {
          Children: {
            include: {
              Student: {
                include: {
                  Class: {
                    include: {
                      FormMaster: { select: { Email: true } },
                      Broadsheets: true,
                    },
                  },
                  User: { select: { Email: true } },
                  Results: { include: { Subject: true } },
                  PaymentRecords: true,
                  Invoices: true,
                  Attendances: true,
                  CbtAttempts: true,
                },
              },
            },
          },
        },
      });
    }

    // Smart auto-linking: if parent has 0 children linked, search students with matching parent email
    if (parentProfile.Children.length === 0 && userEmail) {
      const matchingStudents = await prisma.student.findMany({
        where: {
          ParentEmail: {
            equals: userEmail,
            mode: "insensitive",
          },
        },
      });

      for (const st of matchingStudents) {
        await prisma.parentStudentLink
          .upsert({
            where: {
              ParentID_StudentID: {
                ParentID: parentProfile.id,
                StudentID: st.StudentID,
              },
            },
            update: {},
            create: {
              ParentID: parentProfile.id,
              StudentID: st.StudentID,
              Relationship: "GUARDIAN",
              IsEmergencyContact: true,
            },
          })
          .catch(() => {});
      }

      if (matchingStudents.length > 0) {
        const refreshed = await prisma.parent.findUnique({
          where: { id: parentProfile.id },
          include: {
            Children: {
              include: {
                Student: {
                  include: {
                    Class: {
                      include: {
                        FormMaster: { select: { Email: true } },
                        Broadsheets: true,
                      },
                    },
                    User: { select: { Email: true } },
                    Results: { include: { Subject: true } },
                    PaymentRecords: {
                      orderBy: { PaymentDate: "desc" },
                      take: 10,
                    },
                    Invoices: true,
                    Attendances: {
                      orderBy: { Date: "desc" },
                      take: 30,
                    },
                    CbtAttempts: {
                      orderBy: { startedAt: "desc" },
                      take: 5,
                    },
                  },
                },
              },
            },
          },
        });
        if (refreshed) parentProfile = refreshed;
      }
    }

    const wards = parentProfile.Children.map((c) => {
      const s = c.Student;
      const termPayments = activeTerm
        ? s.PaymentRecords.filter((p) => p.TermID === activeTerm.TermID)
        : s.PaymentRecords;
      const isFeeCleared =
        s.HasPaidFees ||
        termPayments.some((p) => p.Status === "Approved" || p.Status === "Successful");

      // Enforce Result Publication AND Fee Clearance gate before exposing scores to parents
      const classBroadsheetPublished = Boolean(
        activeTerm &&
          (s.Class as any)?.Broadsheets?.some(
            (b: any) => b.termId === activeTerm.TermID && b.status === "PUBLISHED"
          )
      );
      const isTermPublished = Boolean(activeTerm?.IsLocked || classBroadsheetPublished);
      const canViewResults = isTermPublished && isFeeCleared;

      const rawTermResults = activeTerm
        ? s.Results.filter((r) => r.TermID === activeTerm.TermID)
        : s.Results;
      const termResults = canViewResults ? rawTermResults : [];

      const totalScore = termResults.reduce((acc, r) => acc + (r.TotalScore || 0), 0);
      const averageScore =
        termResults.length > 0 ? (totalScore / termResults.length).toFixed(1) : "0.0";

      const presentDays = s.Attendances.filter((a) => a.Status === "Present").length;
      const totalDays = s.Attendances.length;
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

      return {
        studentId: s.StudentID,
        admissionNo: s.AdmissionNo,
        fullName:
          s.PreferredName ||
          `${s.FirstName || ""} ${s.LastName || ""}`.trim() ||
          s.AdmissionNo,
        className: s.Class?.ClassName || "Unassigned",
        classLevel: s.Class?.Level || "Secondary",
        formMasterEmail: s.Class?.FormMaster?.Email || "Not Assigned",
        avatarUrl: s.AvatarUrl || null,
        isFeeCleared,
        isResultsPublished: isTermPublished,
        totalScore,
        averageScore,
        results: termResults.map((r) => ({
          subject: r.Subject?.SubjectName || `Subject ${r.SubjectID}`,
          caScore: r.CAScore,
          examScore: r.ExamScore,
          totalScore: r.TotalScore,
          grade: r.Grade,
          remark: r.Remark,
        })),
        recentPayments: termPayments.map((p) => ({
          paymentId: p.PaymentID,
          amount: p.AmountPaid,
          channel: p.Channel,
          status: p.Status,
          reference: p.Reference,
          date: p.PaymentDate.toISOString(),
          description: p.Description,
        })),
        attendance: {
          presentDays,
          totalDays,
          attendanceRate,
        },
        cbtAttempts: s.CbtAttempts.map((a) => ({
          id: a.id,
          subjectCode: a.subjectCode,
          scorePercent: a.scoreTenths ? Math.round(a.scoreTenths / 10) : 0,
          status: a.status,
          date: a.startedAt.toISOString(),
        })),
      };
    });

    return {
      success: true,
      parent: {
        parentId: parentProfile.id,
        phone: parentProfile.Phone,
        address: parentProfile.Address,
        email: user.Email,
      },
      activeTerm: activeTerm ? `${activeTerm.SessionName} (${activeTerm.TermName})` : "Current Term",
      activeTermId: activeTerm?.TermID || 1,
      wards,
    };
  } catch (error: any) {
    console.error("getParentDashboardData error:", error);
    return { success: false, error: error.message || "Failed to load parent dashboard" };
  }
}

export async function linkChildByAdmissionNo(
  admissionNo: string,
  dateOfBirthStr: string,
  relationship = "GUARDIAN"
) {
  try {
    const actor = await requireRole(ALLOWED_PARENT_ROLES);
    const userId = actor.UserID;
    const cleanAdmissionNo = String(admissionNo || "").trim().slice(0, 50);

    if (!cleanAdmissionNo || !dateOfBirthStr) {
      return { success: false, error: "Registration number and date of birth are required." };
    }

    // Per-user AND per-student rate limits to block 365-day DOB brute-forcing
    const userRl = await rateLimit(`parent:link:user:${userId}`, 5, 900);
    const studentRl = await rateLimit(`parent:link:student:${cleanAdmissionNo.toLowerCase()}`, 5, 900);
    if (!userRl.success || !studentRl.success) {
      return {
        success: false,
        error: "Too many ward-linking attempts. Please wait 15 minutes or contact the school admissions office.",
      };
    }

    let parent = await prisma.parent.findUnique({
      where: { UserID: userId },
    });

    if (!parent) {
      parent = await prisma.parent.create({
        data: {
          UserID: userId,
          Phone: `0800000${userId}`,
        },
      });
    }

    const student = await prisma.student.findUnique({
      where: { AdmissionNo: cleanAdmissionNo },
      include: { ParentLinks: true },
    });

    if (!student) {
      return {
        success: false,
        error: "Unable to verify student credentials. Please check the registration number and date of birth.",
      };
    }

    const parsedDob = new Date(dateOfBirthStr);
    if (isNaN(parsedDob.getTime())) {
      return { success: false, error: "Invalid date of birth provided." };
    }

    const studentDob = new Date(student.DateOfBirth);
    const isDobMatch =
      studentDob.toISOString().slice(0, 10) === parsedDob.toISOString().slice(0, 10);

    if (!isDobMatch) {
      return {
        success: false,
        error: "Unable to verify student credentials. Please check the registration number and date of birth.",
      };
    }

    // Prevent hijacking a child already linked to a different parent unless parent email matches
    const alreadyLinkedToOther = student.ParentLinks.some((l) => l.ParentID !== parent!.id);
    const emailMatchesRecord =
      Boolean(student.ParentEmail) &&
      student.ParentEmail!.toLowerCase().trim() === actor.Email.toLowerCase().trim();
    const isAdmin =
      actor.roles.has("SUPER_ADMIN") ||
      actor.roles.has("PRINCIPAL") ||
      actor.roles.has("ADMISSIONS") ||
      actor.roles.has("Admin");

    if (alreadyLinkedToOther && !emailMatchesRecord && !isAdmin) {
      return {
        success: false,
        error:
          "This student is already linked to a primary guardian account. Please contact the Admissions Office to authorize additional guardian access.",
      };
    }

    const validRel = ["FATHER", "MOTHER", "GUARDIAN", "SPONSOR"].includes(
      String(relationship).toUpperCase()
    )
      ? String(relationship).toUpperCase()
      : "GUARDIAN";

    await prisma.parentStudentLink.upsert({
      where: {
        ParentID_StudentID: {
          ParentID: parent.id,
          StudentID: student.StudentID,
        },
      },
      update: {
        Relationship: validRel as any,
      },
      create: {
        ParentID: parent.id,
        StudentID: student.StudentID,
        Relationship: validRel as any,
        IsEmergencyContact: true,
      },
    });

    await writeAuditLog({
      actorId: userId,
      action: "PARENT_LINKED_CHILD",
      entity: "Student",
      entityId: student.StudentID,
      newValue: { admissionNo: student.AdmissionNo, parentId: parent.id },
    });

    revalidatePath("/portal/dashboard");
    return {
      success: true,
      message: `Successfully linked ${student.PreferredName || student.AdmissionNo} to your parent portal!`,
    };
  } catch (error: any) {
    console.error("linkChildByAdmissionNo error:", error);
    return { success: false, error: error.message || "Failed to link student" };
  }
}

