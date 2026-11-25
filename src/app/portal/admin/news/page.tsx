import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getAdminNewsManagementData } from "@/app/actions/news";
import NewsCmsClient from "./NewsCmsClient";

export const dynamic = "force-dynamic";

export default async function AdminNewsPage() {
  try {
    await requireCapability(["MANAGE_SYSTEM", "MANAGE_STUDENTS"]);
  } catch {
    redirect("/portal/unauthorized?zone=news");
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
