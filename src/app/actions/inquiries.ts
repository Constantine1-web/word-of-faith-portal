"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { escapeHtml, validateInput } from "@/lib/security";

export type InquiryStatus = "NEW" | "IN_REVIEW" | "REPLIED" | "RESOLVED";

export interface ContactInquiryItem {
  referenceCode: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  ipAddress: string | null;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    action: string;
    actorEmail: string | null;
    status?: string;
    note?: string;
    createdAt: string;
  }>;
}

const INQUIRY_ADMIN_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "BURSAR",
  "Admin",
];

export async function getContactInquiries(filters?: {
  status?: string;
  search?: string;
}) {
  try {
    await requireRole(INQUIRY_ADMIN_ROLES);

    const logsDesc = await prisma.auditLog.findMany({
      where: {
        Entity: "ContactMessage",
        Action: {
          in: ["PUBLIC_CONTACT_INQUIRY", "CONTACT_INQUIRY_STATUS", "CONTACT_INQUIRY_REPLY"],
        },
      },
      include: {
        Actor: {
          select: { UserID: true, Email: true },
        },
      },
      orderBy: { CreatedAt: "desc" },
      take: 2500,
    });

    const logs = logsDesc.reverse();
    const grouped = new Map<string, ContactInquiryItem>();

    for (const log of logs) {
      const ref = String(log.EntityID || log.id);
      const val = (log.NewValue || {}) as Record<string, unknown>;
      const ts = log.CreatedAt.toISOString();

      if (log.Action === "PUBLIC_CONTACT_INQUIRY") {
        grouped.set(ref, {
          referenceCode: ref,
          name: String(val.name || "Website Visitor"),
          email: String(val.email || ""),
          subject: String(val.subject || "General School Inquiry"),
          message: String(val.message || ""),
          ipAddress: log.IpAddress || null,
          status: "NEW",
          createdAt: ts,
          updatedAt: ts,
          history: [],
        });
      } else {
        const existing = grouped.get(ref);
        if (existing) {
          const nextStatus = String(val.status || existing.status).toUpperCase() as InquiryStatus;
          if (["NEW", "IN_REVIEW", "REPLIED", "RESOLVED"].includes(nextStatus)) {
            existing.status = nextStatus;
          }
          existing.updatedAt = ts;
          existing.history.push({
            action: log.Action,
            actorEmail: log.Actor?.Email || (log.ActorID ? `Staff #${log.ActorID}` : "System"),
            status: nextStatus,
            note: String(val.replyMessage || val.note || log.Reason || ""),
            createdAt: ts,
          });
        }
      }
    }

    const allInquiries = Array.from(grouped.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const summary = {
      total: allInquiries.length,
      newCount: allInquiries.filter((i) => i.status === "NEW").length,
      inReviewCount: allInquiries.filter((i) => i.status === "IN_REVIEW").length,
      repliedCount: allInquiries.filter((i) => i.status === "REPLIED").length,
      resolvedCount: allInquiries.filter((i) => i.status === "RESOLVED").length,
    };

    const statusFilter = (filters?.status || "ALL").toUpperCase();
    const q = (filters?.search || "").trim().toLowerCase();

    const filtered = allInquiries.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.referenceCode.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
      );
    });

    return {
      success: true,
      inquiries: filtered,
      summary,
    };
  } catch (error: unknown) {
    console.error("getContactInquiries error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load inquiries.",
    };
  }
}

const StatusUpdateSchema = z.object({
  referenceCode: z.string().trim().min(3).max(80),
  status: z.enum(["IN_REVIEW", "REPLIED", "RESOLVED"]),
  note: z.string().trim().max(500).optional(),
});

export async function updateContactInquiryStatus(raw: z.infer<typeof StatusUpdateSchema>) {
  try {
    const actor = await requireRole(INQUIRY_ADMIN_ROLES);
    const data = validateInput(StatusUpdateSchema, raw);

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CONTACT_INQUIRY_STATUS",
      entity: "ContactMessage",
      entityId: data.referenceCode,
      reason: data.note || `Marked as ${data.status}`,
      newValue: {
        status: data.status,
        note: data.note || "",
        updatedBy: actor.Email,
      },
    });

    revalidatePath("/portal/admin/inquiries");
    revalidatePath("/portal/admin");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update inquiry status.",
    };
  }
}

const InquiryReplySchema = z.object({
  referenceCode: z.string().trim().min(3).max(80),
  recipientEmail: z.string().trim().email().max(160),
  recipientName: z.string().trim().min(1).max(120),
  originalSubject: z.string().trim().max(200),
  replyMessage: z.string().trim().min(5, "Reply must be at least 5 characters.").max(3000),
});

export async function replyToContactInquiry(raw: z.infer<typeof InquiryReplySchema>) {
  try {
    const actor = await requireRole(INQUIRY_ADMIN_ROLES);
    const data = validateInput(InquiryReplySchema, raw);

    const safeName = escapeHtml(data.recipientName);
    const safeSubject = escapeHtml(data.originalSubject || "Your Inquiry");
    const safeReply = escapeHtml(data.replyMessage);
    const safeRef = escapeHtml(data.referenceCode);

    const emailRes = await sendEmail({
      to: data.recipientEmail,
      subject: `Re: [${data.referenceCode}] ${data.originalSubject || "Word of Faith Schools Inquiry"}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #0A2540; color: #ffffff; padding: 20px 24px; border-bottom: 4px solid #16a34a;">
            <h2 style="margin: 0; font-size: 18px; color: #ffffff;">Word of Faith Group of Schools</h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #86efac;">Official Office Response &bull; Ref: ${safeRef}</p>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.65;">
            <p style="margin-top: 0;">Dear <strong>${safeName}</strong>,</p>
            <p style="color: #475569; font-size: 13px;">Thank you for contacting us regarding: <em>&ldquo;${safeSubject}&rdquo;</em></p>
            <div style="background: #f8fafc; border-left: 4px solid #14532D; padding: 14px 18px; border-radius: 6px; white-space: pre-wrap; margin: 16px 0;">${safeReply}</div>
            <p style="margin-bottom: 0;">Warm regards,<br/><strong>School Administrative Office</strong><br/>Word of Faith Schools</p>
          </div>
        </div>
      `,
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CONTACT_INQUIRY_REPLY",
      entity: "ContactMessage",
      entityId: data.referenceCode,
      reason: `Reply dispatched to ${data.recipientEmail}`,
      newValue: {
        status: "REPLIED",
        recipientEmail: data.recipientEmail,
        replyMessage: data.replyMessage.slice(0, 1000),
        emailSent: Boolean(emailRes?.success),
        repliedBy: actor.Email,
      },
    });

    revalidatePath("/portal/admin/inquiries");
    revalidatePath("/portal/admin");

    return {
      success: true,
      emailSent: Boolean(emailRes?.success),
      message: emailRes?.success
        ? `Reply emailed to ${data.recipientEmail} and logged under ${data.referenceCode}.`
        : `Reply logged under ${data.referenceCode} (note: email server credentials are not configured in this environment, so no external email was sent).`,
    };
  } catch (error: unknown) {
    console.error("replyToContactInquiry error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send inquiry reply.",
    };
  }
}
