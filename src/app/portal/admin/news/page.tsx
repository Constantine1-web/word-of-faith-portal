import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminNewsManagementData } from "@/app/actions/news";
import NewsCmsClient from "./NewsCmsClient";

export const dynamic = "force-dynamic";

export default async function AdminNewsPage() {
  const session = await getServerSession(authOptions);
  const roleUpper = (session?.user?.role || "").toUpperCase();
  const isAuthorizedAdmin =
    roleUpper === "ADMIN" ||
    roleUpper === "SUPER_ADMIN" ||
    roleUpper === "PRINCIPAL" ||
    roleUpper === "BURSAR" ||
    roleUpper === "ADMISSIONS";

  if (!session || !isAuthorizedAdmin) {
    redirect("/portal/login");
  }

  const res = await getAdminNewsManagementData();
  const posts = res.success && res.posts ? res.posts : [];

  return (
    <div>
      <div
        style={{
          marginBottom: "2rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
          Public News & Events CMS Publisher
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
          Publish, update, or archive articles displayed on the public Word of Faith website (/news). Every action is recorded on the immutable AuditLog chain.
        </p>
      </div>

      <NewsCmsClient initialPosts={posts} initialError={res.success ? undefined : res.error} />
    </div>
  );
}
