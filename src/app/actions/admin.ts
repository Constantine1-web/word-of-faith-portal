"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

// Ensure the user is an admin
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    throw new Error("Unauthorized. Only admins can perform this action.");
  }
  return session;
}

export async function getAdminDashboardStats() {
  await requireAdmin();

  try {
    const totalStudents = await prisma.student.count();
    const totalTeachers = await prisma.user.count({
      where: { Role: { RoleName: "Teacher" } }
    });

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });

    let totalRevenue = 0;
    let paymentCount = 0;
    
    if (activeTerm) {
      const payments = await prisma.payment_Record.aggregate({
        where: { TermID: activeTerm.TermID, Status: "Approved" },
        _sum: { AmountPaid: true },
        _count: { PaymentID: true }
      });
      totalRevenue = payments._sum.AmountPaid || 0;
      paymentCount = payments._count.PaymentID || 0;
    }

    const monthlyRevenue = [
      { name: "Jan", revenue: 400000 },
      { name: "Feb", revenue: 300000 },
      { name: "Mar", revenue: 500000 },
      { name: "Apr", revenue: 700000 },
      { name: "May", revenue: 200000 },
      { name: "Jun", revenue: totalRevenue > 0 ? totalRevenue : 600000 },
    ];

    const studentDistribution = [
      { name: "Primary", value: await prisma.student.count({ where: { Class: { Level: "Primary" } } }) || 1 },
      { name: "Secondary", value: await prisma.student.count({ where: { Class: { Level: "Secondary" } } }) || 1 },
    ];

    const pendingAdmissions = await prisma.admission_Application.count({
      where: { status: "Pending" }
    });

    const pendingPayments = await prisma.payment_Record.count({
      where: { Status: "Pending" }
    });

    return {
      success: true,
      stats: {
        totalStudents,
        totalTeachers,
        totalRevenue,
        paymentCount,
        pendingAdmissions,
        pendingPayments,
        activeTerm: activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "None"
      },
      charts: {
        monthlyRevenue,
        studentDistribution
      }
    };
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return { success: false, error: error.message || "Failed to fetch admin stats" };
  }
}

// ==========================================
// 1. USER PROVISIONING & ACCOUNT MANAGEMENT
// ==========================================

export async function getUsersList(roleFilter?: string) {
  await requireAdmin();

  try {
    const users = await prisma.user.findMany({
      where: roleFilter ? { Role: { RoleName: roleFilter } } : undefined,
      include: {
        Role: true,
        Student: {
          include: { Class: true }
        },
        FormMasterClasses: true,
        TeacherMaps: {
          include: { Subject: true, Class: true }
        }
      },
      orderBy: { UserID: "desc" }
    });

    return { success: true, users };
  } catch (error: any) {
    console.error("getUsersList error:", error);
    return { success: false, error: error.message || "Failed to fetch users" };
  }
}

export async function createUserAccount(data: {
  email: string;
  roleName: string;
  password?: string;
  name?: string;
}) {
  await requireAdmin();

  try {
    const existing = await prisma.user.findUnique({
      where: { Email: data.email.trim().toLowerCase() }
    });

    if (existing) {
      return { success: false, error: "A user account with this email already exists." };
    }

    const role = await prisma.role.findUnique({
      where: { RoleName: data.roleName }
    });

    if (!role) {
      return { success: false, error: `Role '${data.roleName}' does not exist.` };
    }

    const defaultPassword = data.password || "wofschools2026";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const user = await prisma.user.create({
      data: {
        Email: data.email.trim().toLowerCase(),
        PasswordHash: passwordHash,
        RoleID: role.RoleID,
        IsActive: true
      }
    });

    revalidatePath("/portal/admin/users");
    revalidatePath("/portal/admin/teachers");
    return { success: true, user, defaultPassword };
  } catch (error: any) {
    console.error("createUserAccount error:", error);
    return { success: false, error: error.message || "Failed to create user account" };
  }
}

export async function toggleUserStatus(userId: number, isActive: boolean) {
  await requireAdmin();

  try {
    const updated = await prisma.user.update({
      where: { UserID: userId },
      data: { IsActive: isActive }
    });

    revalidatePath("/portal/admin/users");
    return { success: true, isActive: updated.IsActive };
  } catch (error: any) {
    console.error("toggleUserStatus error:", error);
    return { success: false, error: error.message || "Failed to toggle user status" };
  }
}

export async function adminResetPassword(userId: number, newPassword?: string) {
  await requireAdmin();

  try {
    const pass = newPassword || "wofschools2026";
    const passwordHash = await bcrypt.hash(pass, 10);

    await prisma.user.update({
      where: { UserID: userId },
      data: { PasswordHash: passwordHash }
    });

    revalidatePath("/portal/admin/users");
    return { success: true, password: pass };
  } catch (error: any) {
    console.error("adminResetPassword error:", error);
    return { success: false, error: error.message || "Failed to reset password" };
  }
}

// ==========================================
// 2. CLASS, ARM & TEACHER ALLOCATION
// ==========================================

export async function getClassesWithAllocations() {
  await requireAdmin();

  try {
    const classes = await prisma.class.findMany({
      include: {
        FormMaster: true,
        Students: true,
        TeacherMaps: {
          include: {
            Teacher: true,
            Subject: true,
            Term: true,
          }
        }
      },
      orderBy: { ClassName: "asc" }
    });

    const teachers = await prisma.user.findMany({
      where: { Role: { RoleName: "Teacher" }, IsActive: true },
      orderBy: { Email: "asc" }
    });

    const subjects = await prisma.subject.findMany({
      orderBy: { SubjectName: "asc" }
    });

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true }
    });

    return { success: true, classes, teachers, subjects, activeTerm };
  } catch (error: any) {
    console.error("getClassesWithAllocations error:", error);
    return { success: false, error: error.message || "Failed to fetch classes" };
  }
}

export async function addClassArm(className: string, level: string, formMasterId?: number) {
  await requireAdmin();

  try {
    const existing = await prisma.class.findUnique({
      where: { ClassName: className.trim() }
    });

    if (existing) {
      return { success: false, error: `Class arm '${className}' already exists.` };
    }

    const created = await prisma.class.create({
      data: {
        ClassName: className.trim(),
        Level: level,
        FormMasterID: formMasterId || null
      }
    });

    revalidatePath("/portal/admin/classes");
    return { success: true, class: created };
  } catch (error: any) {
    console.error("addClassArm error:", error);
    return { success: false, error: error.message || "Failed to add class arm" };
  }
}

export async function assignFormMaster(classId: number, teacherUserId: number | null) {
  await requireAdmin();

  try {
    const updated = await prisma.class.update({
      where: { ClassID: classId },
      data: { FormMasterID: teacherUserId }
    });

    revalidatePath("/portal/admin/classes");
    return { success: true, class: updated };
  } catch (error: any) {
    console.error("assignFormMaster error:", error);
    return { success: false, error: error.message || "Failed to assign Form Master" };
  }
}

export async function assignSubjectTeacher(data: {
  teacherId: number;
  subjectId: number;
  classId: number;
  termId?: number;
}) {
  await requireAdmin();

  try {
    // If no term specified, default to active term
    let termId = data.termId;
    if (!termId) {
      const active = await prisma.academic_Term.findFirst({ where: { IsActive: true } });
      termId = active?.TermID;
    }

    const mapping = await prisma.teacher_Subject_Map.upsert({
      where: {
        TeacherID_SubjectID_ClassID_TermID: {
          TeacherID: data.teacherId,
          SubjectID: data.subjectId,
          ClassID: data.classId,
          TermID: termId || 1
        }
      },
      update: {},
      create: {
        TeacherID: data.teacherId,
        SubjectID: data.subjectId,
        ClassID: data.classId,
        TermID: termId || null
      }
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/classes");
    return { success: true, mapping };
  } catch (error: any) {
    console.error("assignSubjectTeacher error:", error);
    return { success: false, error: error.message || "Failed to assign subject teacher" };
  }
}

export async function removeSubjectTeacherMap(mapId: number) {
  await requireAdmin();

  try {
    await prisma.teacher_Subject_Map.delete({
      where: { id: mapId }
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("removeSubjectTeacherMap error:", error);
    return { success: false, error: error.message || "Failed to remove mapping" };
  }
}

// ==========================================
// 5. ADMISSIONS & STUDENT ENROLLMENT
// ==========================================

export async function getAdmissionApplications() {
  await requireAdmin();

  try {
    const applications = await prisma.admission_Application.findMany({
      orderBy: { createdAt: "desc" }
    });
    return { success: true, applications };
  } catch (error: any) {
    console.error("getAdmissionApplications error:", error);
    return { success: false, error: error.message || "Failed to fetch applications" };
  }
}

export async function enrollApplicantToStudent(data: {
  applicationId: number;
  classId: number;
  admissionNo?: string;
  parentContact: string;
  parentEmail?: string;
}) {
  await requireAdmin();

  try {
    const app = await prisma.admission_Application.findUnique({
      where: { id: data.applicationId }
    });

    if (!app) {
      return { success: false, error: "Application record not found." };
    }

    if (app.status === "Approved") {
      return { success: false, error: "This application has already been approved and enrolled." };
    }

    const selectedClass = await prisma.class.findUnique({
      where: { ClassID: data.classId }
    });

    if (!selectedClass) {
      return { success: false, error: "Target class arm not found." };
    }

    // Auto-generate formatted registration number if not provided
    let admissionNo = data.admissionNo?.trim();
    if (!admissionNo) {
      const year = new Date().getFullYear();
      const prefix = selectedClass.Level.toLowerCase().includes("primary") ? "PRY" : "SEC";
      const count = await prisma.student.count();
      const sequence = (count + 1).toString().padStart(3, "0");
      admissionNo = `WOFS/${year}/${prefix}/${sequence}`;
    }

    // Create the student profile
    const student = await prisma.student.create({
      data: {
        AdmissionNo: admissionNo,
        ClassID: data.classId,
        DateOfBirth: app.dateOfBirth,
        ParentContact: data.parentContact || app.parentPhone,
        ParentEmail: data.parentEmail || app.parentEmail,
        PreferredName: `${app.childFirstName} ${app.childLastName}`,
        HasPaidFees: false
      }
    });

    // Update application status
    await prisma.admission_Application.update({
      where: { id: data.applicationId },
      data: {
        status: "Approved",
        enrolledStudentId: student.StudentID
      }
    });

    revalidatePath("/portal/admin/admissions");
    revalidatePath("/portal/admin/students");
    return { success: true, student, admissionNo };
  } catch (error: any) {
    console.error("enrollApplicantToStudent error:", error);
    return { success: false, error: error.message || "Failed to enroll student" };
  }
}

export async function rejectAdmissionApplication(applicationId: number) {
  await requireAdmin();

  try {
    await prisma.admission_Application.update({
      where: { id: applicationId },
      data: { status: "Rejected" }
    });

    revalidatePath("/portal/admin/admissions");
    return { success: true };
  } catch (error: any) {
    console.error("rejectAdmissionApplication error:", error);
    return { success: false, error: error.message || "Failed to reject application" };
  }
}

export async function addStudent(data: {
  firstName: string;
  lastName: string;
  email: string;
  admissionNo: string;
  classId: number;
  parentContact?: string;
  parentEmail?: string;
}) {
  await requireAdmin();

  try {
    const defaultPassword = await bcrypt.hash("wofschools2026", 10);
    
    await prisma.$transaction(async (tx) => {
      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found in database.");

      const user = await tx.user.create({
        data: {
          Email: data.email.trim().toLowerCase(),
          PasswordHash: defaultPassword,
          RoleID: studentRole.RoleID,
          IsActive: true
        }
      });

      await tx.student.create({
        data: {
          UserID: user.UserID,
          AdmissionNo: data.admissionNo.trim(),
          ClassID: data.classId,
          DateOfBirth: new Date(),
          ParentContact: data.parentContact || "08000000000",
          ParentEmail: data.parentEmail || data.email,
          PreferredName: `${data.firstName} ${data.lastName}`
        }
      });
    });

    revalidatePath("/portal/admin/students");
    return { success: true };
  } catch (error: any) {
    console.error("Add student error:", error);
    return { error: error.message || "Failed to add student." };
  }
}

export async function deleteStudent(studentId: number) {
  await requireAdmin();

  try {
    const student = await prisma.student.findUnique({ where: { StudentID: studentId } });
    if (!student) throw new Error("Student not found.");

    await prisma.$transaction(async (tx) => {
      await tx.student.delete({ where: { StudentID: studentId } });
      if (student.UserID) {
        await tx.user.delete({ where: { UserID: student.UserID } });
      }
    });

    revalidatePath("/portal/admin/students");
    return { success: true };
  } catch (error: any) {
    console.error("Delete student error:", error);
    return { error: error.message || "Failed to delete student." };
  }
}

export async function deleteClass(classId: number) {
  await requireAdmin();

  try {
    const classRecord = await prisma.class.findUnique({
      where: { ClassID: classId },
      include: { Students: true }
    });
    if (!classRecord) throw new Error("Class not found.");

    if (classRecord.Students.length > 0) {
      throw new Error("Cannot delete a class that has students in it. Move or reassign the students first.");
    }

    await prisma.class.delete({ where: { ClassID: classId } });

    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("Delete class error:", error);
    return { error: error.message || "Failed to delete class." };
  }
}

export async function addClass(className: string, level: string) {
  return addClassArm(className, level);
}

export async function addTeacher(email: string) {
  return createUserAccount({ email, roleName: "Teacher" });
}

export async function deleteTeacher(userId: number) {
  await requireAdmin();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.teacher_Subject_Map.deleteMany({ where: { TeacherID: userId } });
      await tx.user.delete({ where: { UserID: userId } });
    });

    revalidatePath("/portal/admin/teachers");
    revalidatePath("/portal/admin/users");
    return { success: true };
  } catch (error: any) {
    console.error("Delete teacher error:", error);
    return { error: error.message || "Failed to delete teacher." };
  }
}

