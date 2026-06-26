"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

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
