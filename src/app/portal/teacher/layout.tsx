import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";
import { requireActiveUser } from "@/lib/authz";
import PortalShell from "@/components/portal/PortalShell";
import TeacherNav from "@/components/portal/TeacherNav";

export const dynamic = "force-dynamic";

const EDUCATOR_ROLES = [
  "TEACHER",
  "FORM_MASTER",
  "PRINCIPAL",
  "SUPER_ADMIN",
  "Teacher",
  "Admin",
];

export default async function TeacherPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    redirect("/portal/login?callbackUrl=/portal/teacher");
  }

  const isAuthorized = actor.roles.some((r) => EDUCATOR_ROLES.includes(r));
  if (!isAuthorized) {
    redirect("/portal/unauthorized?zone=teacher");
  }

  const isAdminSupervisor = actor.roles.some((r) =>
    ["SUPER_ADMIN", "PRINCIPAL", "Admin"].includes(r)
  );

  return (
    <AuthProvider>
      {/* Educator Workspace: sidebar collapses to a drawer below 1024px */}
      <PortalShell
        title="Educator Workspace"
        sidebarBackground="linear-gradient(180deg, #0A2540 0%, #0F3456 100%)"
        sidebarWidth="265px"
        sidebar={
          <TeacherNav
            email={actor.Email}
            roles={actor.roles}
            isAdminSupervisor={isAdminSupervisor}
          />
        }
      >
        {children}
      </PortalShell>
    </AuthProvider>
  );
}
