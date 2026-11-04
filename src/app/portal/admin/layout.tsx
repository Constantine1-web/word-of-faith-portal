import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";
import { requireActiveUser } from "@/lib/authz";
import PortalShell from "@/components/portal/PortalShell";
import AdminNav from "@/components/portal/AdminNav";

export const dynamic = "force-dynamic";

const ADMIN_STAFF_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "ADMISSIONS",
  "Admin",
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    redirect("/portal/login?callbackUrl=/portal/admin");
  }

  // Strict server-side role verification (no developer email bypass)
  const isAuthorized = actor.roles.some((r) => ADMIN_STAFF_ROLES.includes(r));
  if (!isAuthorized) {
    redirect("/portal/unauthorized?zone=admin");
  }

  return (
    <AuthProvider>
      {/* Admin Control Center: sidebar collapses to a drawer below 1024px */}
      <PortalShell
        title="Admin Control Center"
        sidebarBackground="linear-gradient(180deg, #0A2540 0%, #07192C 100%)"
        sidebarWidth="270px"
        sidebar={<AdminNav email={actor.Email} roles={actor.roles} />}
      >
        {children}
      </PortalShell>
    </AuthProvider>
  );
}
