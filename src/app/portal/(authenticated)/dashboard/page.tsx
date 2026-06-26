import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/dashboard/TeacherDashboard";
import StudentDashboard from "@/components/dashboard/StudentDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { getTeacherSubjects } from "@/app/actions/results";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/portal/login");
  }

  const role = (session.user as any)?.role;
  const userId = (session.user as any)?.id;
  
  let teacherAssignments: any = [];
  if (role === 'Teacher' && userId) {
    teacherAssignments = await getTeacherSubjects(parseInt(userId, 10));
  }

  return (
    <div style={{ padding: "1rem" }}>
      {role === 'Admin' && <AdminDashboard />}
      {role === 'Teacher' && <TeacherDashboard teacherId={userId} initialAssignments={teacherAssignments} />}
      {role === 'Student' && <StudentDashboard session={session} />}
    </div>
  );
}
