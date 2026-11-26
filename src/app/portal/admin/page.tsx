import { redirect } from "next/navigation";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { requireActiveUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

const ADMIN_OVERVIEW_ROLES = new Set([
  "SUPER_ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "ADMISSIONS",
  "Admin",
]);

export default async function AdminControlCenterPage() {
  const actor = await requireActiveUser();
  const canViewExecutiveOverview = actor.roles.some((r) => ADMIN_OVERVIEW_ROLES.has(r));
  if (!canViewExecutiveOverview) {
    if (actor.capabilities.has("MANAGE_CBT")) {
      redirect("/portal/admin/cbt");
    }
    redirect("/portal/unauthorized?zone=admin");
  }
  return <AdminDashboard />;
}
