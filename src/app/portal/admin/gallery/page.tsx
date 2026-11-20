import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminGalleryManagementData } from "@/app/actions/gallery";
import GalleryCmsClient from "./GalleryCmsClient";

export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
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

  const res = await getAdminGalleryManagementData();
  const photos = res.success && res.photos ? res.photos : [];

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
          Public Photo Gallery CMS
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
          Upload photos, edit captions, set category tags and display order, or archive items shown on the public /gallery showcase. Every change is logged on the immutable AuditLog chain.
        </p>
      </div>

      <GalleryCmsClient initialPhotos={photos} initialError={res.success ? undefined : res.error} />
    </div>
  );
}
