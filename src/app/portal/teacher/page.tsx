import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/dashboard/TeacherDashboard";
import { requireActiveUser } from "@/lib/authz";
import { getTeacherSubjects } from "@/app/actions/results";

export default async function TeacherWorkspacePage() {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    redirect("/portal/login?callbackUrl=/portal/teacher");
  }

  const teacherAssignments = await getTeacherSubjects(actor.UserID);

  return (
    <div>
      <TeacherDashboard
        teacherId={String(actor.UserID)}
        initialAssignments={teacherAssignments}
      />
    </div>
  );
}
