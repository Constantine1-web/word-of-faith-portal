"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { validateInput } from "@/lib/security";
import { newsItems as defaultNewsItems } from "@/data/news";
import {
  formatNewsBodyToSafeHtml,
  slugifyNewsTitle,
  validateNewsImageUrl,
} from "@/lib/news-cms";

export interface PublicNewsPostItem {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  img: string;
  content: string;
  rawBody?: string;
  isDefault: boolean;
  isArchived: boolean;
  authorEmail?: string | null;
  updatedAt: string;
}

const NEWS_ADMIN_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "Admin",
];

function buildMergedNewsCatalog(
  auditLogsDesc: Array<{
    Action: string;
    EntityID: string;
    NewValue: unknown;
    CreatedAt: Date;
    Actor?: { Email: string } | null;
  }>
): PublicNewsPostItem[] {
  const bySlug = new Map<string, PublicNewsPostItem>();

  for (const item of defaultNewsItems) {
    bySlug.set(item.slug, {
      slug: item.slug,
      title: item.title,
      date: item.date,
      category: item.category,
      excerpt: item.excerpt,
      img: item.img,
      content: item.content,
      rawBody: "",
      isDefault: true,
      isArchived: false,
      authorEmail: "Word of Faith Editorial",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
  }

  // Apply events chronologically (oldest -> newest)
  const chronological = [...auditLogsDesc].reverse();
  for (const log of chronological) {
    const slug = String(log.EntityID || "").trim();
    if (!slug) continue;
    const val = (log.NewValue || {}) as Record<string, unknown>;

    if (log.Action === "PUBLIC_NEWS_PUBLISHED") {
      const existing = bySlug.get(slug);
      bySlug.set(slug, {
        slug,
        title: String(val.title || existing?.title || "School Update"),
        date: String(val.date || existing?.date || new Date().toDateString()),
        category: String(val.category || existing?.category || "Announcements"),
        excerpt: String(val.excerpt || existing?.excerpt || ""),
        img: validateNewsImageUrl(String(val.img || existing?.img || "")),
        content: String(val.content || existing?.content || ""),
        rawBody: String(val.rawBody || ""),
        isDefault: Boolean(existing?.isDefault),
        isArchived: false,
        authorEmail: log.Actor?.Email || existing?.authorEmail || "School Office",
        updatedAt: log.CreatedAt.toISOString(),
      });
    } else if (log.Action === "PUBLIC_NEWS_DELETED") {
      const existing = bySlug.get(slug);
      if (existing) {
        existing.isArchived = true;
        existing.updatedAt = log.CreatedAt.toISOString();
      }
    }
  }

  return Array.from(bySlug.values()).sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? 1 : -1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getPublicNewsPosts(): Promise<PublicNewsPostItem[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "PublicNewsPost",
        Action: { in: ["PUBLIC_NEWS_PUBLISHED", "PUBLIC_NEWS_DELETED"] },
      },
      include: {
        Actor: { select: { Email: true } },
      },
      orderBy: { CreatedAt: "desc" },
      take: 500,
    });

    return buildMergedNewsCatalog(rows).filter((post) => !post.isArchived);
  } catch (err) {
    console.warn("[PublicNews] Falling back to built-in news items:", err);
    return buildMergedNewsCatalog([]);
  }
}

export async function getPublicNewsPostBySlug(
  slug: string
): Promise<PublicNewsPostItem | null> {
  const posts = await getPublicNewsPosts();
  return posts.find((p) => p.slug === slug) || null;
}

export async function getAdminNewsManagementData() {
  try {
    await requireRole(NEWS_ADMIN_ROLES);
    const rows = await prisma.auditLog.findMany({
      where: {
        Entity: "PublicNewsPost",
        Action: { in: ["PUBLIC_NEWS_PUBLISHED", "PUBLIC_NEWS_DELETED"] },
      },
      include: {
        Actor: { select: { Email: true } },
      },
      orderBy: { CreatedAt: "desc" },
      take: 500,
    });

    const posts = buildMergedNewsCatalog(rows);
    return {
      success: true,
      posts,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load news CMS.",
      posts: [],
    };
  }
}

const PublishNewsSchema = z.object({
  title: z.string().trim().min(4, "Title must be at least 4 characters.").max(180),
  slug: z.string().trim().max(90).optional(),
  category: z.string().trim().min(2).max(40).default("Announcements"),
  dateLabel: z.string().trim().min(3).max(60),
  excerpt: z.string().trim().min(10, "Summary excerpt must be at least 10 characters.").max(360),
  img: z.string().trim().max(400).optional().default("/images/school-bg.jpg"),
  body: z.string().trim().min(15, "Article body must be at least 15 characters.").max(10000),
});

export async function publishPublicNewsPost(
  rawInput: z.infer<typeof PublishNewsSchema>
) {
  try {
    const actor = await requireRole(NEWS_ADMIN_ROLES);
    const data = validateInput(PublishNewsSchema, rawInput);

    const finalSlug = data.slug?.trim()
      ? slugifyNewsTitle(data.slug)
      : slugifyNewsTitle(data.title);
    const safeImg = validateNewsImageUrl(data.img);
    const safeContent = formatNewsBodyToSafeHtml(data.body);

    const payload = {
      slug: finalSlug,
      title: data.title,
      date: data.dateLabel,
      category: data.category,
      excerpt: data.excerpt,
      img: safeImg,
      content: safeContent,
      rawBody: data.body,
      publishedBy: actor.Email,
    };

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PUBLIC_NEWS_PUBLISHED",
      entity: "PublicNewsPost",
      entityId: finalSlug,
      reason: `Published news article: ${data.title}`,
      newValue: payload,
    });

    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${finalSlug}`);
    revalidatePath("/portal/admin/news");

    return { success: true, slug: finalSlug };
  } catch (error: unknown) {
    console.error("publishPublicNewsPost error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish news post.",
    };
  }
}

export async function archivePublicNewsPost(slug: string, reason?: string) {
  try {
    const actor = await requireRole(NEWS_ADMIN_ROLES);
    const cleanSlug = slugifyNewsTitle(slug);

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "PUBLIC_NEWS_DELETED",
      entity: "PublicNewsPost",
      entityId: cleanSlug,
      reason: reason?.trim() || "Archived from public News & Events page",
      newValue: {
        archived: true,
        archivedBy: actor.Email,
      },
    });

    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${cleanSlug}`);
    revalidatePath("/portal/admin/news");

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive news article.",
    };
  }
}
