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

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true }
  });

  const teacherRole = await prisma.role.findUnique({ where: { RoleName: "Teacher" } });

  let teachers: any[] = [];
  if (teacherRole) {
    teachers = await prisma.user.findMany({
      where: { RoleID: teacherRole.RoleID },
      orderBy: { UserID: "desc" },
      include: {
        FormMasterClasses: true,
        TeacherMaps: {
          include: { Subject: true, Class: true, Term: true }
        }
      }
    });
  }

  const classes = await prisma.class.findMany({
    orderBy: { ClassName: "asc" }
  });

  const subjects = await prisma.subject.findMany({
    orderBy: { SubjectName: "asc" }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Subject Teacher Allocations</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Assign subject teachers to multiple class arms (1-to-Many). Active Period: <strong>{activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "No active term"}</strong>
          </p>
        </div>
      </div>

      <TeachersClient initialTeachers={teachers} classes={classes} subjects={subjects} activeTerm={activeTerm} />
    </div>
  );
}
