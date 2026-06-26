"use server";

import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function sendMessage(receiverId: number, content: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const message = await prisma.message.create({
      data: {
        SenderID: session.user.id,
        ReceiverID: receiverId,
        Content: content
      }
    });
    return { success: true, message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function getConversation(otherUserId: number) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { SenderID: session.user.id, ReceiverID: otherUserId },
          { SenderID: otherUserId, ReceiverID: session.user.id }
        ]
      },
      orderBy: { CreatedAt: "asc" }
    });

    // Mark received messages as read
    await prisma.message.updateMany({
      where: {
        ReceiverID: session.user.id,
        SenderID: otherUserId,
        IsRead: false
      },
      data: { IsRead: true }
    });

    return { success: true, messages };
  } catch (error) {
    console.error("Failed to fetch conversation:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function getMessageContacts() {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    // For simplicity, just fetch all active users except self (In a real app, restrict based on parent-teacher maps)
    const users = await prisma.user.findMany({
      where: { UserID: { not: session.user.id }, IsActive: true },
      include: { Role: true },
      take: 20
    });

    return { success: true, contacts: users };
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return { success: false, error: "Internal server error" };
  }
}
