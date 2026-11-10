"use server";

import prisma from "@/lib/db";
import { requireActiveUser } from "@/lib/authz";
import { invalidateCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";

const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export async function updateProfile(formData: FormData) {
  try {
    const actor = await requireActiveUser();
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
      const bytes = await avatarFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      avatarUrl = `data:${avatarFile.type};base64,${base64}`;
    }

    const updateData: { ParentContact?: string; AvatarUrl?: string } = {};
    if (rawContact) updateData.ParentContact = rawContact;
    if (avatarUrl) updateData.AvatarUrl = avatarUrl;

    const student = await prisma.student.findUnique({
      where: { UserID: userId },
    });

    if (student) {
      if (Object.keys(updateData).length > 0) {
        await prisma.student.update({
          where: { StudentID: student.StudentID },
          data: updateData,
        });
      }
    } else {
      const parent = await prisma.parent.findUnique({
        where: { UserID: userId },
        include: { Children: true },
      });

      if (parent) {
        if (rawContact) {
          await prisma.parent.update({
            where: { id: parent.id },
            data: { Phone: rawContact },
          });
        }
        if (parent.Children.length > 0 && Object.keys(updateData).length > 0) {
          await prisma.student.update({
            where: { StudentID: parent.Children[0].StudentID },
            data: updateData,
          });
        }
      }
    }

    await invalidateCache(`profile:${userId}`);
    revalidatePath("/portal/profile");
    revalidatePath("/portal/dashboard");

    return { success: true, message: "Profile updated successfully." };
  } catch (error: any) {
    console.error("Profile update error:", error);
    return { success: false, error: "Internal server error." };
  }
}
