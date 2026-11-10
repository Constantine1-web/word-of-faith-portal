import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/dashboard/TeacherDashboard";
import { requireActiveUser } from "@/lib/authz";
import { getTeacherSubjects } from "@/app/actions/results";

export const dynamic = "force-dynamic";

export default async function TeacherWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    redirect("/portal/login?callbackUrl=/portal/teacher");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const teacherAssignments = await getTeacherSubjects(actor.UserID);

  return (
    <div>
      <TeacherDashboard
        teacherId={String(actor.UserID)}
        initialAssignments={teacherAssignments}
        initialTab={resolvedParams?.tab}
      />
    </div>
  );
}
