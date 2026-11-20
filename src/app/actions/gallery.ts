"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { validateInput } from "@/lib/security";
import {
  DEFAULT_GALLERY_PHOTOS,
  sanitizeGallerySpan,
  slugifyGalleryId,
  validateGalleryImageSrc,
  type GalleryPhotoItem,
} from "@/lib/gallery-cms";

const GALLERY_ADMIN_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "Admin",
];

function buildMergedGalleryCatalog(
  auditLogsDesc: Array<{
    Action: string;
    EntityID: string;
    NewValue: unknown;
    CreatedAt: Date;
    Actor?: { Email: string } | null;
  }>
): GalleryPhotoItem[] {
  const byId = new Map<string, GalleryPhotoItem>();

  for (const item of DEFAULT_GALLERY_PHOTOS) {
    byId.set(item.id, { ...item });
  }

  // Replay chronologically (oldest -> newest)
  const chronological = [...auditLogsDesc].reverse();
  for (const log of chronological) {
    const id = String(log.EntityID || "").trim();
    if (!id) continue;
    const val = (log.NewValue || {}) as Record<string, unknown>;

    if (log.Action === "PUBLIC_GALLERY_PUBLISHED") {
      const existing = byId.get(id);
      const parsedOrder = Number(val.sortOrder);
      byId.set(id, {
        id,
        src: validateGalleryImageSrc(String(val.src || existing?.src || "")),
        alt: String(val.alt || existing?.alt || "School Event Photo"),
        caption: String(val.caption || existing?.caption || ""),
        category: String(val.category || existing?.category || "Events"),
        span: sanitizeGallerySpan(
          val.span !== undefined ? String(val.span) : existing?.span || "col-span-2"
        ),
        sortOrder:
          Number.isFinite(parsedOrder) && parsedOrder > 0
            ? Math.round(parsedOrder)
            : existing?.sortOrder || 10,
        isDefault: Boolean(existing?.isDefault),
        isArchived: false,
        authorEmail: log.Actor?.Email || existing?.authorEmail || "School Office",
        updatedAt: log.CreatedAt.toISOString(),
      });
    } else if (log.Action === "PUBLIC_GALLERY_ARCHIVED") {
      const existing = byId.get(id);
      if (existing) {
        existing.isArchived = true;
        existing.updatedAt = log.CreatedAt.toISOString();
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getPublicGalleryPhotos(): Promise<GalleryPhotoItem[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "PublicGalleryPhoto",
        Action: { in: ["PUBLIC_GALLERY_PUBLISHED", "PUBLIC_GALLERY_ARCHIVED"] },
      },
      include: {
        Actor: { select: { Email: true } },
      },
      orderBy: { CreatedAt: "desc" },
      take: 500,
    });

    return buildMergedGalleryCatalog(rows).filter((photo) => !photo.isArchived);
  } catch (err) {
    console.warn("[PublicGallery] Falling back to built-in gallery items:", err);
    return buildMergedGalleryCatalog([]);
  }
}

export async function getAdminGalleryManagementData() {
  try {
    await requireRole(GALLERY_ADMIN_ROLES);
    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "PublicGalleryPhoto",
        Action: { in: ["PUBLIC_GALLERY_PUBLISHED", "PUBLIC_GALLERY_ARCHIVED"] },
      },
      include: {
        Actor: { select: { Email: true } },
      },
      orderBy: { CreatedAt: "desc" },
      take: 500,
    });

    return {
      success: true,
      photos: buildMergedGalleryCatalog(rows),
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load photo gallery CMS.",
      photos: [] as GalleryPhotoItem[],
    };
  }
}

const PublishGallerySchema = z.object({
  id: z.string().trim().max(80).optional(),
  alt: z.string().trim().min(3, "Photo title must be at least 3 characters.").max(140),
  caption: z.string().trim().min(6, "Caption must be at least 6 characters.").max(360),
  category: z.string().trim().min(2).max(50).default("Events"),
  src: z.string().trim().min(5, "Please choose or upload an image.").max(1_250_000),
  span: z.string().trim().max(40).optional().default("col-span-2"),
  sortOrder: z.number().int().min(1).max(999).default(10),
});

export async function publishGalleryPhoto(
  rawInput: z.infer<typeof PublishGallerySchema>
) {
  try {
    const actor = await requireRole(GALLERY_ADMIN_ROLES);
    const data = validateInput(PublishGallerySchema, rawInput);

    const finalId = data.id?.trim()
      ? slugifyGalleryId(data.id)
      : slugifyGalleryId(data.alt);

    const isValidLocalPath = data.src.startsWith("/") && !data.src.startsWith("//");
    const isValidRemoteUrl = /^https?:\/\//i.test(data.src);
    const isValidRasterDataUri = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(data.src);

    if (!isValidLocalPath && !isValidRemoteUrl && !isValidRasterDataUri) {
      return {
        success: false,
        error: "Unsupported image source. Use a local /images path, HTTPS URL, or uploaded JPEG/PNG/WEBP image.",
      };
    }

    const safeSrc = validateGalleryImageSrc(data.src);

    const safeSpan = sanitizeGallerySpan(data.span);

    const payload = {
      id: finalId,
      alt: data.alt,
      caption: data.caption,
      category: data.category,
      src: safeSrc,
      span: safeSpan,
      sortOrder: data.sortOrder,
      publishedBy: actor.Email,
    };

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PUBLIC_GALLERY_PUBLISHED",
      entity: "PublicGalleryPhoto",
      entityId: finalId,
      reason: `Published gallery photo: ${data.alt}`,
      newValue: payload,
    });

    revalidatePath("/gallery");
    revalidatePath("/portal/admin/gallery");

    return { success: true, id: finalId };
  } catch (error: unknown) {
    console.error("publishGalleryPhoto error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish gallery photo.",
    };
  }
}

export async function archiveGalleryPhoto(photoId: string, reason?: string) {
  try {
    const actor = await requireRole(GALLERY_ADMIN_ROLES);
    const cleanId = slugifyGalleryId(photoId);

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PUBLIC_GALLERY_ARCHIVED",
      entity: "PublicGalleryPhoto",
      entityId: cleanId,
      reason: reason?.trim() || "Archived from public Photo Gallery",
      newValue: {
        archived: true,
        archivedBy: actor.Email,
      },
    });

    revalidatePath("/gallery");
    revalidatePath("/portal/admin/gallery");

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive gallery photo.",
    };
  }
}
