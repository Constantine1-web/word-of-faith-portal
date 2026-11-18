"use server";

import prisma from "@/lib/db";
import { requireActiveUser, writeAuditLog } from "@/lib/authz";
import { invalidateCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";

const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Updates the student's portal profile (AvatarUrl, PreferredName, ParentContact).
 *
 * SECURITY & ARCHITECTURAL INVARIANT (Requirement 6):
 * Profile pictures (`Student.AvatarUrl`) are stored completely independently of biometric/identity
 * verification records (`IdentityVerificationRecord` and `Student.IdentityVerified`).
 * Uploading, cropping, replacing, or removing a profile picture NEVER modifies the student's
 * identity verification status, verification records, or permanent WOFS Student ID.
 */
export async function updateProfile(formData: FormData) {
  try {
    const actor = await requireActiveUser();
    const userId = actor.UserID;
    const rawContact = ((formData.get("parentContact") as string) || "").trim();
    const rawPreferredName = ((formData.get("preferredName") as string) || "").trim();
    const removeAvatar = formData.get("removeAvatar") === "true";
    const croppedAvatarDataUrl = ((formData.get("croppedAvatarDataUrl") as string) || "").trim();

    if (rawContact && !/^[0-9+\-\s()]{7,20}$/.test(rawContact)) {
      return { success: false, error: "Invalid phone number format." };
    }

    let avatarAction: "KEEP" | "SET" | "REMOVE" = "KEEP";
    let nextAvatarUrl: string | null = null;

    if (removeAvatar) {
      avatarAction = "REMOVE";
      nextAvatarUrl = null;
    } else if (croppedAvatarDataUrl) {
      const match = croppedAvatarDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return {
          success: false,
          error: "Invalid cropped image format. Only JPEG, PNG, and WebP images are supported.",
        };
      }
      const byteLength = Buffer.from(match[2], "base64").byteLength;
      if (byteLength > MAX_AVATAR_BYTES) {
        return { success: false, error: "Avatar image must not exceed 2 MB." };
      }
      avatarAction = "SET";
      nextAvatarUrl = croppedAvatarDataUrl;
    } else {
      const avatarFile = formData.get("avatar") as File | null;
      if (avatarFile && avatarFile.size > 0) {
        if (avatarFile.size > MAX_AVATAR_BYTES) {
          return { success: false, error: "Avatar image must not exceed 2 MB." };
        }
        if (!ALLOWED_AVATAR_MIME.has(avatarFile.type)) {
          return { success: false, error: "Only JPG, PNG, and WebP avatar images are allowed." };
        }
        const bytes = await avatarFile.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        avatarAction = "SET";
        nextAvatarUrl = `data:${avatarFile.type};base64,${base64}`;
      }
    }

    const updateData: {
      ParentContact?: string;
      PreferredName?: string;
      AvatarUrl?: string | null;
    } = {};

    if (rawContact) updateData.ParentContact = rawContact;
    if (rawPreferredName && rawPreferredName.length >= 2 && rawPreferredName.length <= 120) {
      updateData.PreferredName = rawPreferredName;
    }
    if (avatarAction === "SET") {
      updateData.AvatarUrl = nextAvatarUrl;
    } else if (avatarAction === "REMOVE") {
      updateData.AvatarUrl = null;
    }

    const student = await prisma.student.findUnique({
      where: { UserID: userId },
    });

    if (student) {
      if (Object.keys(updateData).length > 0) {
        await prisma.student.update({
          where: { StudentID: student.StudentID },
          data: updateData,
        });

        await writeAuditLog({
          actorId: userId,
          action:
            avatarAction === "REMOVE"
              ? "STUDENT_AVATAR_REMOVED"
              : avatarAction === "SET"
              ? "STUDENT_AVATAR_UPDATED"
              : "STUDENT_PROFILE_UPDATED",
          entity: "Student",
          entityId: student.StudentID,
          newValue: {
            wofsStudentId: student.AdmissionNo,
            avatarAction,
            preferredNameUpdated: Boolean(updateData.PreferredName),
            contactUpdated: Boolean(updateData.ParentContact),
            identityVerifiedUnchanged: student.IdentityVerified,
          },
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

    return {
      success: true,
      message:
        avatarAction === "REMOVE"
          ? "Profile picture removed. Default avatar restored."
          : avatarAction === "SET"
          ? "Profile picture and details updated successfully!"
          : "Profile updated successfully.",
    };
  } catch (error: any) {
    console.error("Profile update error:", error);
    return { success: false, error: "Internal server error." };
  }
}
