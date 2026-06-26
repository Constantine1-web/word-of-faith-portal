"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function updateProfile(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "Student") {
      return { success: false, error: "Unauthorized" };
    }

    const userId = parseInt((session.user as any).id);
    const parentContact = formData.get("parentContact") as string;
    
    // In a real app, you would handle the file upload (e.g. to S3, Cloudinary)
    // For this prototype, we'll just accept a URL or fake the upload path
    // Let's pretend the avatar is uploaded and we get a string back
    const avatarFile = formData.get("avatar") as File | null;
    let avatarUrl = null;

    if (avatarFile && avatarFile.size > 0) {
      avatarUrl = `/uploads/${avatarFile.name}`; // Mock URL
    }

    const updateData: any = { ParentContact: parentContact };
    if (avatarUrl) updateData.AvatarUrl = avatarUrl;

    await prisma.student.update({
      where: { UserID: userId },
      data: updateData
    });

    return { success: true, message: "Profile updated successfully." };

  } catch (error: any) {
    console.error("Profile update error:", error);
    return { success: false, error: "Internal server error." };
  }
}
