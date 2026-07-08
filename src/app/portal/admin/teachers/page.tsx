import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TeachersClient from "./TeachersClient";

export default async function AdminTeachersPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const teacherRole = await prisma.role.findUnique({ where: { RoleName: "Teacher" } });

  let teachers: any[] = [];
  if (teacherRole) {
    teachers = await prisma.user.findMany({
      where: { RoleID: teacherRole.RoleID },
      orderBy: { UserID: "desc" },
      include: {
        TeacherMaps: {
          include: { Subject: true, Class: true }
        }
      }
    });
  }

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Manage Teachers</h1>
      <TeachersClient initialTeachers={teachers} />
    </div>
  );
}
