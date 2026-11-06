import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/dashboard/TeacherDashboard";
import StudentDashboard from "@/components/dashboard/StudentDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ParentDashboard from "@/components/dashboard/ParentDashboard";
import { getTeacherSubjects } from "@/app/actions/results";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/portal/login");
  }

  const role = (session.user as any)?.role;
  const roles: string[] = (session.user as any)?.roles || [role];
  const userId = (session.user as any)?.id;

  const isAdmin = roles.some((r) =>
    ["Admin", "SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS"].includes(r)
  );
  const isTeacher =
    !isAdmin &&
    roles.some((r) => ["Teacher", "TEACHER", "FORM_MASTER"].includes(r));
  const isParent =
    !isAdmin &&
    !isTeacher &&
    roles.some((r) => ["Parent", "PARENT"].includes(r));

  let teacherAssignments: any = [];
  if (isTeacher && userId) {
    teacherAssignments = await getTeacherSubjects(parseInt(userId, 10));
  }

  return (
    <div style={{ padding: "1rem" }}>
      {isAdmin && <AdminDashboard />}
      {isTeacher && (
        <TeacherDashboard
          teacherId={userId}
          initialAssignments={teacherAssignments}
        />
      )}
      {isParent && <ParentDashboard session={session} />}
      {!isAdmin && !isTeacher && !isParent && <StudentDashboard session={session} />}
    </div>
  );
}
