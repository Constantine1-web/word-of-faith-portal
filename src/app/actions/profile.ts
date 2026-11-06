"use server";

import prisma from "@/lib/db";
import { requireRole } from "@/lib/authz";

const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export async function updateProfile(formData: FormData) {
  try {
    const actor = await requireRole(["STUDENT", "Student"]);
    const userId = actor.UserID;
    const rawContact = ((formData.get("parentContact") as string) || "").trim();

    if (rawContact && !/^[0-9+\-\s()]{7,20}$/.test(rawContact)) {
      return { success: false, error: "Invalid phone number format." };
    }

    const avatarFile = formData.get("avatar") as File | null;
    let avatarUrl: string | null = null;

    if (avatarFile && avatarFile.size > 0) {
      if (avatarFile.size > MAX_AVATAR_BYTES) {
        return { success: false, error: "Avatar image must not exceed 2 MB." };
      }
      if (!ALLOWED_AVATAR_MIME.has(avatarFile.type)) {
        return { success: false, error: "Only JPG, PNG, and WebP avatar images are allowed." };
      }
      const safeBaseName = avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-64);
      avatarUrl = `/uploads/${userId}_${safeBaseName}`;
    }

    const updateData: { ParentContact?: string; AvatarUrl?: string } = {};
    if (rawContact) updateData.ParentContact = rawContact;
    if (avatarUrl) updateData.AvatarUrl = avatarUrl;

    await prisma.student.update({
      where: { UserID: userId },
      data: updateData,
    });

    return { success: true, message: "Profile updated successfully." };
  } catch (error: any) {
    console.error("Profile update error:", error);
    return { success: false, error: "Internal server error." };
  }
}
