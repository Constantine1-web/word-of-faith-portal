import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/security";
import { writeAuditLog } from "@/lib/authz";

const ContactPostSchema = z.object({
  name: z.string().trim().min(2, "Please provide your full name.").max(120),
  email: z.string().trim().email("Please enter a valid email address.").max(160),
  subject: z.string().trim().max(160).optional().default("General School Inquiry"),
  message: z.string().trim().min(10, "Please write a brief message (at least 10 characters).").max(3000),
});

export async function POST(req: Request) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "local-visitor";
    const rl = await rateLimit(`contact:${ip}`, 5, 600);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many messages sent from this device. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = ContactPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid contact form submission." },
        { status: 400 }
      );
    }

    const { name, email, subject, message } = parsed.data;
    const referenceCode = `WOF-INQ-${Date.now().toString().slice(-6)}`;

    // Record inquiry in immutable audit trail so school administrators never miss an inquiry
    await writeAuditLog({
      actorId: null,
      action: "PUBLIC_CONTACT_INQUIRY",
      entity: "ContactMessage",
      entityId: referenceCode,
      newValue: {
        name,
        email: email.toLowerCase(),
        subject: subject || "General School Inquiry",
        message: message.slice(0, 1000),
      },
      ipAddress: ip,
    });

    const recipientDesk =
      process.env.SCHOOL_CONTACT_EMAIL?.trim() ||
      process.env.SMTP_USER?.trim() ||
      "info@wofs.vercel.app";

    const emailRes = await sendEmail({
      to: recipientDesk,
      subject: `[Website Contact ${referenceCode}] ${subject || "General Inquiry"} — ${name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #0A2540; color: #ffffff; padding: 18px 24px; border-bottom: 4px solid #16a34a;">
            <h2 style="margin: 0; font-size: 18px; color: #ffffff;">New Website Inquiry (${escapeHtml(referenceCode)})</h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #86efac;">Word of Faith Schools Portal</p>
          </div>
          <div style="padding: 22px; color: #1e293b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;"><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
            <p style="margin: 0 0 12px 0;"><strong>Subject:</strong> ${escapeHtml(subject || "General School Inquiry")}</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; white-space: pre-wrap;">${escapeHtml(message)}</div>
          </div>
        </div>
      `,
    }).catch(() => ({ success: false }));

    return NextResponse.json(
      {
        success: true,
        referenceCode,
        emailDispatched: Boolean(emailRes?.success),
        message: `Thank you, ${name}! Your message (${referenceCode}) has been received by the School Office.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contact API error:", error);
    return NextResponse.json(
      { error: "Unable to send your message right now. Please try again later." },
      { status: 500 }
    );
  }
}
