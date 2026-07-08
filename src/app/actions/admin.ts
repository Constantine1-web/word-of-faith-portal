"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getAdminDashboardStats() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Basic stats
    const totalStudents = await prisma.student.count();
    const totalTeachers = await prisma.teacher_Subject_Map.groupBy({
      by: ['TeacherID'],
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

    // Chart Data (Mocking monthly revenue for demonstration, normally would group by Date)
    const monthlyRevenue = [
      { name: "Jan", revenue: 400000 },
      { name: "Feb", revenue: 300000 },
      { name: "Mar", revenue: 500000 },
      { name: "Apr", revenue: 700000 },
      { name: "May", revenue: 200000 },
      { name: "Jun", revenue: totalRevenue > 0 ? totalRevenue : 600000 },
    ];

    const studentDistribution = [
      { name: "Primary", value: 300 },
      { name: "JSS", value: 450 },
      { name: "SSS", value: 200 },
    ];

    return {
      success: true,
      stats: {
        totalStudents,
        totalTeachers: totalTeachers.length,
        totalRevenue,
        paymentCount,
      },
      charts: {
        monthlyRevenue,
        studentDistribution
      }
    };
  } catch (error) {
    console.error("Admin stats error:", error);
    return { success: false, error: "Failed to fetch admin stats" };
  }
}

// Ensure the user is an admin
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    throw new Error("Unauthorized. Only admins can perform this action.");
  }
}

export async function addStudent(data: {
  firstName: string;
  lastName: string;
  email: string;
  admissionNo: string;
  classId: number;
}) {
  await requireAdmin();
  const bcrypt = await import("bcryptjs");

  try {
    const defaultPassword = await bcrypt.hash("wofschools", 10);
    
    // Create User and Student in a transaction
    await prisma.$transaction(async (tx) => {
      // Find Student role
      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found in database.");

      const user = await tx.user.create({
        data: {
          Email: data.email,
          PasswordHash: defaultPassword,
          RoleID: studentRole.RoleID,
          IsActive: true
        }
      });

      await tx.student.create({
        data: {
          UserID: user.UserID,
          AdmissionNo: data.admissionNo,
          ClassID: data.classId,
          DateOfBirth: new Date(), // Mocking DOB for simplicity
          ParentContact: "08000000000", // Default phone
          PreferredName: `${data.firstName} ${data.lastName}`
        }
      });
    });

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

    return { success: true };
  } catch (error: any) {
    console.error("Delete student error:", error);
    return { error: error.message || "Failed to delete student." };
  }
}

export async function addTeacher(email: string) {
  await requireAdmin();
  const bcrypt = await import("bcryptjs");

  try {
    const defaultPassword = await bcrypt.hash("wofschools", 10);
    
    // Find Teacher role
    const teacherRole = await prisma.role.findUnique({ where: { RoleName: "Teacher" } });
    if (!teacherRole) throw new Error("Teacher role not found in database.");

    // Create User
    await prisma.user.create({
      data: {
        Email: email,
        PasswordHash: defaultPassword,
        RoleID: teacherRole.RoleID,
        IsActive: true
      }
    });

    revalidatePath("/portal/admin/teachers");
    return { success: true };
  } catch (error: any) {
    console.error("Add teacher error:", error);
    return { error: error.message || "Failed to add teacher." };
  }
}

export async function deleteTeacher(userId: number) {
  await requireAdmin();

  try {
    const user = await prisma.user.findUnique({ where: { UserID: userId } });
    if (!user) throw new Error("Teacher not found.");

    await prisma.$transaction(async (tx) => {
      // Delete any mappings
      await tx.teacher_Subject_Map.deleteMany({ where: { TeacherID: userId } });
      await tx.user.delete({ where: { UserID: userId } });
    });

    revalidatePath("/portal/admin/teachers");
    return { success: true };
  } catch (error: any) {
    console.error("Delete teacher error:", error);
    return { error: error.message || "Failed to delete teacher." };
  }
}

export async function addClass(className: string, level: string) {
  await requireAdmin();

  try {
    await prisma.class.create({
      data: {
        ClassName: className,
        Level: level
      }
    });

    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("Add class error:", error);
    return { error: error.message || "Failed to add class." };
  }
}

export async function deleteClass(classId: number) {
  await requireAdmin();

  try {
    const classRecord = await prisma.class.findUnique({ where: { ClassID: classId }, include: { Students: true } });
    if (!classRecord) throw new Error("Class not found.");

    if (classRecord.Students.length > 0) {
      throw new Error("Cannot delete a class that has students in it. Move the students first.");
    }

    await prisma.class.delete({ where: { ClassID: classId } });

    revalidatePath("/portal/admin/classes");
    return { success: true };
  } catch (error: any) {
    console.error("Delete class error:", error);
    return { error: error.message || "Failed to delete class." };
  }
}
