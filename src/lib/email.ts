import nodemailer from "nodemailer";
import { escapeHtml, sanitizeEmailHeader } from "./security";

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpUser = process.env.SMTP_USER?.trim() || "";
const smtpPass = process.env.SMTP_PASSWORD?.trim() || "";
const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || "noreply@wordoffaith.edu.ng";

// Resilient Nodemailer transport configured with SSL / TLS options
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: smtpUser && smtpPass
    ? {
        user: smtpUser,
        pass: smtpPass,
      }
    : undefined,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
    minVersion: "TLSv1.2",
  },
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 15000,
});

/**
 * Dispatches transactional email via Resend HTTP REST API.
 * Eliminates serverless socket latency, avoids Gmail personal throttling,
 * and ensures sub-second inbox placement.
 */
async function sendViaResend(
  apiKey: string,
  { to, subject, html }: { to: string; subject: string; html: string }
): Promise<{ success: boolean; messageId?: string }> {
  const fromAddress = process.env.RESEND_FROM || "Word of Faith Schools <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [sanitizeEmailHeader(to, 160)],
      subject: sanitizeEmailHeader(subject, 200),
      html,
    }),
  });

  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`Resend API HTTP ${res.status}: ${errorData}`);
  }

  const data = await res.json();
  return { success: true, messageId: data.id };
}

/**
 * Universal email dispatcher:
 * 1. Checks if RESEND_API_KEY is configured (instant HTTP delivery via Resend API)
 * 2. Falls back to Nodemailer SMTP (smtp.gmail.com) with resilient TLS handling
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const safeTo = sanitizeEmailHeader(to, 160);
  const safeSubject = sanitizeEmailHeader(subject, 200);
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const result = await sendViaResend(resendApiKey, { to: safeTo, subject: safeSubject, html });
      console.log("[Email] Dispatched via Resend API:", result.messageId);
      return result;
    } catch (err: any) {
      console.warn("[Email] Resend API failed, falling back to SMTP:", err?.message || err);
    }
  }

  if (!smtpUser || !smtpPass) {
    console.warn("[Email] Skipped SMTP dispatch: SMTP_USER / SMTP_PASSWORD not configured in environment.");
    return { success: false, error: "SMTP credentials not configured" };
  }

  // Fallback to Nodemailer SMTP
  try {
    const info = await transporter.sendMail({
      from: `Word of Faith Schools <${smtpFrom}>`,
      to: safeTo,
      subject: safeSubject,
      html,
    });
    console.log("[Email] Dispatched via SMTP: %s", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Email] SMTP sending error:", error?.message || error);
    return { success: false, error };
  }
}

/**
 * Formats a Nigerian/international phone number for WhatsApp/SMS links.
 */
export function formatPhoneForMessaging(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Sends an acknowledgment email when a parent/applicant submits an online admission application.
 */
export async function sendAdmissionReceivedNotification(params: {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  childFirstName: string;
  childLastName: string;
  applyingClass: string;
}) {
  const fullName = `${params.childFirstName} ${params.childLastName}`.trim();
  const safeParentName = escapeHtml(params.parentName);
  const safeFullName = escapeHtml(fullName);
  const safeClass = escapeHtml(params.applyingClass);
  const safeEmail = escapeHtml(params.parentEmail);
  const safePhone = escapeHtml(params.parentPhone);
  const subject = `Admission Application Received — ${fullName} (${params.applyingClass})`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #143424; color: #ffffff; padding: 24px 28px; border-bottom: 4px solid #D4AF37;">
        <h2 style="margin: 0; font-size: 20px;">Word of Faith Group of Schools</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Admissions Office Notification</p>
      </div>
      <div style="padding: 28px; color: #1f2937; line-height: 1.6;">
        <p style="margin-top: 0;">Dear <strong>${safeParentName}</strong>,</p>
        <p>Thank you for submitting an online admission application for <strong>${safeFullName}</strong> into <strong>${safeClass}</strong> at Word of Faith Group of Schools.</p>
        <div style="background: #f9fafb; border-left: 4px solid #143424; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
          <div><strong>Applicant Name:</strong> ${safeFullName}</div>
          <div><strong>Class Applied For:</strong> ${safeClass}</div>
          <div><strong>Registered Email:</strong> ${safeEmail}</div>
          <div><strong>Registered Phone:</strong> ${safePhone}</div>
          <div><strong>Current Status:</strong> Pending Admissions Review</div>
        </div>
        <p>Our Admissions Committee is reviewing the application. You will receive an official confirmation of approval or decision via this email address (<strong>${safeEmail}</strong>) and your contact phone number (<strong>${safePhone}</strong>) as soon as the review is complete.</p>
        <p style="margin-bottom: 0;">Warm regards,<br/><strong>Admissions Office</strong><br/>Word of Faith Group of Schools</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: params.parentEmail.trim(),
    subject,
    html,
  });
}

/**
 * Sends an official Admission Approval or Rejection confirmation email
 * and prepares an SMS/WhatsApp message for the phone number provided during application.
 */
export async function sendAdmissionDecisionNotification(params: {
  status: "Approved" | "Rejected";
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  childFirstName: string;
  childLastName: string;
  applyingClass: string;
  assignedClassName?: string;
  admissionNo?: string;
  claimCode?: string;
  reason?: string;
}) {
  const fullName = `${params.childFirstName} ${params.childLastName}`.trim();
  const safeParentName = escapeHtml(params.parentName);
  const safeFullName = escapeHtml(fullName);
  const safeApplyingClass = escapeHtml(params.applyingClass);
  const safeAssignedClass = escapeHtml(params.assignedClassName || params.applyingClass);
  const safeAdmissionNo = escapeHtml(params.admissionNo || "Assigned");
  const safeClaimCode = params.claimCode ? escapeHtml(params.claimCode) : "";
  const safeEmail = escapeHtml(params.parentEmail);
  const safePhone = escapeHtml(params.parentPhone);
  const safeReason = params.reason ? escapeHtml(params.reason) : "";

  const portalUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL.replace(/\/$/, "")}/portal/login`
    : "https://wofs.vercel.app/portal/login";

  const isApproved = params.status === "Approved";
  const subject = isApproved
    ? `Congratulations! Admission Approved for ${fullName} — Word of Faith Schools`
    : `Update on Admission Application for ${fullName} — Word of Faith Schools`;

  const html = isApproved
    ? `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #143424; color: #ffffff; padding: 24px 28px; border-bottom: 4px solid #D4AF37;">
        <h2 style="margin: 0; font-size: 20px;">Word of Faith Group of Schools</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Official Offer of Provisional Admission</p>
      </div>
      <div style="padding: 28px; color: #1f2937; line-height: 1.6;">
        <p style="margin-top: 0;">Dear <strong>${safeParentName}</strong>,</p>
        <p>We are delighted to inform you that the admission application for <strong>${safeFullName}</strong> has been <strong>APPROVED</strong>!</p>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 18px; border-radius: 8px; margin: 20px 0; font-size: 14px;">
          <div style="margin-bottom: 6px;"><strong>Student Name:</strong> ${safeFullName}</div>
          <div style="margin-bottom: 6px;"><strong>Assigned Class Arm:</strong> ${safeAssignedClass}</div>
          <div style="margin-bottom: 6px;"><strong>Registration / Admission Number:</strong> <span style="font-family: monospace; font-weight: bold; color: #065f46;">${safeAdmissionNo}</span></div>
          ${
            safeClaimCode
              ? `<div style="margin-bottom: 6px;"><strong>One-Time Portal Claim Code:</strong> <span style="font-family: monospace; font-weight: bold; background: #143424; color: #ffffff; padding: 2px 8px; border-radius: 4px;">${safeClaimCode}</span> <em>(valid for 7 days)</em></div>`
              : ""
          }
          <div style="margin-bottom: 6px;"><strong>Registered Email:</strong> ${safeEmail}</div>
          <div><strong>Registered Phone:</strong> ${safePhone}</div>
        </div>
        <p>You can access the Student & Parent Portal using the button below with your Registration Number:</p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(portalUrl)}" style="background: #143424; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; display: inline-block;">
            Open Student & Parent Portal
          </a>
        </p>
        <p style="margin-bottom: 0;">Welcome to the Word of Faith family!<br/><strong>Admissions Office</strong><br/>Word of Faith Group of Schools</p>
      </div>
    </div>
  `
    : `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #1e293b; color: #ffffff; padding: 24px 28px; border-bottom: 4px solid #D4AF37;">
        <h2 style="margin: 0; font-size: 20px;">Word of Faith Group of Schools</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #cbd5e1;">Admissions Decision Notification</p>
      </div>
      <div style="padding: 28px; color: #1f2937; line-height: 1.6;">
        <p style="margin-top: 0;">Dear <strong>${safeParentName}</strong>,</p>
        <p>Thank you for your interest in Word of Faith Group of Schools and for submitting an admission application for <strong>${safeFullName}</strong> (${safeApplyingClass}).</p>
        <p>After careful consideration of the application, we regret to inform you that we are unable to offer admission for <strong>${safeFullName}</strong> at this time.</p>
        ${
          safeReason
            ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin: 18px 0; font-size: 14px;"><strong>Admissions Note:</strong> ${safeReason}</div>`
            : ""
        }
        <div style="background: #f8fafc; padding: 14px 18px; border-radius: 6px; margin: 18px 0; font-size: 13px; color: #475569;">
          <div><strong>Applicant:</strong> ${safeFullName} (${safeApplyingClass})</div>
          <div><strong>Contact Email:</strong> ${safeEmail}</div>
          <div><strong>Contact Phone:</strong> ${safePhone}</div>
        </div>
        <p>If you have any questions or wish to inquire about future admission windows, please contact our Admissions Office.</p>
        <p style="margin-bottom: 0;">Sincerely,<br/><strong>Admissions Committee</strong><br/>Word of Faith Group of Schools</p>
      </div>
    </div>
  `;

  const smsText = isApproved
    ? `Word of Faith Schools: Congratulations ${params.parentName}! Admission for ${fullName} into ${params.assignedClassName || params.applyingClass} has been APPROVED. Reg No: ${params.admissionNo || ""}${params.claimCode ? `, Claim Code: ${params.claimCode}` : ""}. Portal: ${portalUrl}`
    : `Word of Faith Schools: Dear ${params.parentName}, thank you for applying for ${fullName} (${params.applyingClass}). We regret to inform you that the admission application was not approved at this time. Check ${params.parentEmail} for details.`;

  const formattedPhone = formatPhoneForMessaging(params.parentPhone);
  const whatsappUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(smsText)}`
    : null;
  const smsUrl = params.parentPhone
    ? `sms:${params.parentPhone.trim()}?body=${encodeURIComponent(smsText)}`
    : null;

  let emailResult: { success: boolean; messageId?: string; error?: unknown } = {
    success: false,
  };
  if (params.parentEmail && params.parentEmail.includes("@")) {
    emailResult = await sendEmail({
      to: params.parentEmail.trim(),
      subject,
      html,
    });
  }

  return {
    emailSent: emailResult.success,
    recipientEmail: params.parentEmail,
    recipientPhone: params.parentPhone,
    smsText,
    whatsappUrl,
    smsUrl,
  };
}

/**
 * Dispatches a direct WhatsApp message via Meta WhatsApp Cloud API or Termii WhatsApp API
 * when credentials are configured, and returns the direct wa.me deep link for instant launch.
 */
export async function dispatchDirectWhatsApp(phone: string, message: string): Promise<{
  apiDispatched: boolean;
  whatsappUrl: string | null;
  formattedPhone: string;
}> {
  const formattedPhone = formatPhoneForMessaging(phone);
  const whatsappUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : null;

  if (!formattedPhone) {
    return { apiDispatched: false, whatsappUrl: null, formattedPhone: "" };
  }

  // 1. Meta WhatsApp Cloud API (if configured)
  const whatsappToken = process.env.WHATSAPP_API_TOKEN?.trim();
  const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (whatsappToken && whatsappPhoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: message },
        }),
      });
      if (res.ok) {
        return { apiDispatched: true, whatsappUrl, formattedPhone };
      }
    } catch (err) {
      console.warn("[WhatsApp Cloud API] Dispatch warning:", err);
    }
  }

  // 2. Termii WhatsApp / Messaging API (if configured)
  const termiiKey = process.env.TERMII_API_KEY?.trim();
  if (termiiKey) {
    try {
      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formattedPhone,
          from: process.env.TERMII_SENDER_ID || "WOFSchools",
          sms: message,
          type: "plain",
          channel: "whatsapp",
          api_key: termiiKey,
        }),
      });
      if (res.ok) {
        return { apiDispatched: true, whatsappUrl, formattedPhone };
      }
    } catch (err) {
      console.warn("[Termii WhatsApp] Dispatch warning:", err);
    }
  }

  return { apiDispatched: false, whatsappUrl, formattedPhone };
}

/**
 * Dispatches a direct SMS message via Termii SMS Gateway when configured,
 * and returns the direct sms: URI for instant device dispatch.
 */
export async function dispatchDirectSms(phone: string, message: string): Promise<{
  apiDispatched: boolean;
  smsUrl: string | null;
  formattedPhone: string;
}> {
  const formattedPhone = formatPhoneForMessaging(phone);
  const cleanRawPhone = (phone || "").trim();
  const smsUrl = cleanRawPhone
    ? `sms:${cleanRawPhone}?body=${encodeURIComponent(message)}`
    : null;

  if (!formattedPhone) {
    return { apiDispatched: false, smsUrl: null, formattedPhone: "" };
  }

  const termiiKey = process.env.TERMII_API_KEY?.trim();
  if (termiiKey) {
    try {
      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formattedPhone,
          from: process.env.TERMII_SENDER_ID || "WOFSchools",
          sms: message,
          type: "plain",
          channel: "generic",
          api_key: termiiKey,
        }),
      });
      if (res.ok) {
        return { apiDispatched: true, smsUrl, formattedPhone };
      }
    } catch (err) {
      console.warn("[Termii SMS] Dispatch warning:", err);
    }
  }

  return { apiDispatched: false, smsUrl, formattedPhone };
}

/**
 * Sends a direct message to a student across Email (using their portal registration email),
 * WhatsApp (using their student phone number), and/or SMS (using their student phone number).
 */
export async function sendDirectStudentCommunication(params: {
  studentName: string;
  admissionNo: string;
  className?: string;
  registrationEmail: string;
  studentPhone: string;
  subject: string;
  message: string;
  senderName?: string;
  channels: ("EMAIL" | "WHATSAPP" | "SMS")[];
}) {
  const cleanEmail = (params.registrationEmail || "").trim().toLowerCase();
  const cleanPhone = (params.studentPhone || "").trim();
  const senderLabel = params.senderName || "School Administration";

  const safeStudentName = escapeHtml(params.studentName);
  const safeAdmissionNo = escapeHtml(params.admissionNo);
  const safeClassName = params.className ? escapeHtml(params.className) : "";
  const safeCleanEmail = escapeHtml(cleanEmail);
  const safeCleanPhone = escapeHtml(cleanPhone);
  const safeSubject = escapeHtml(params.subject);
  const safeMessage = escapeHtml(params.message);
  const safeSenderLabel = escapeHtml(senderLabel);

  const plainTextPayload = `Word of Faith Schools (${senderLabel})\nTo: ${params.studentName} (${params.admissionNo})\nSubject: ${params.subject}\n\n${params.message}`;

  let emailSent = false;
  if (params.channels.includes("EMAIL") && cleanEmail && cleanEmail.includes("@")) {
    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: #143424; color: #ffffff; padding: 22px 26px; border-bottom: 4px solid #D4AF37;">
          <h2 style="margin: 0; font-size: 19px;">Word of Faith Group of Schools</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Direct Student Portal Dispatch — ${safeSenderLabel}</p>
        </div>
        <div style="padding: 26px; color: #1f2937; line-height: 1.6;">
          <p style="margin-top: 0;">Dear <strong>${safeStudentName}</strong>,</p>
          <div style="background: #f8fafc; border-left: 4px solid #143424; padding: 12px 16px; border-radius: 6px; margin-bottom: 18px; font-size: 13px; color: #475569;">
            <div><strong>Registration No:</strong> ${safeAdmissionNo}</div>
            ${safeClassName ? `<div><strong>Class:</strong> ${safeClassName}</div>` : ""}
            <div><strong>Registered Portal Email:</strong> ${safeCleanEmail}</div>
            ${cleanPhone && cleanPhone !== "08000000000" ? `<div><strong>Registered Phone:</strong> ${safeCleanPhone}</div>` : ""}
          </div>
          <h3 style="color: #0a2540; margin: 0 0 10px 0; font-size: 16px;">${safeSubject}</h3>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; white-space: pre-wrap; color: #111827; font-size: 14px;">${safeMessage}</div>
          <p style="font-size: 12px; color: #64748b; margin-top: 20px;">This message was sent to your registered portal email address (${safeCleanEmail}). You can also view portal messages by signing in to your student dashboard.</p>
          <p style="margin-bottom: 0;">Warm regards,<br/><strong>${safeSenderLabel}</strong><br/>Word of Faith Group of Schools</p>
        </div>
      </div>
    `;
    const res = await sendEmail({
      to: cleanEmail,
      subject: `${params.subject} — Word of Faith Schools`,
      html,
    });
    emailSent = res.success;
  }

  let whatsappResult = {
    apiDispatched: false,
    whatsappUrl: null as string | null,
    formattedPhone: formatPhoneForMessaging(cleanPhone),
  };
  if (params.channels.includes("WHATSAPP") && cleanPhone) {
    whatsappResult = await dispatchDirectWhatsApp(cleanPhone, plainTextPayload);
  } else if (cleanPhone) {
    const fp = formatPhoneForMessaging(cleanPhone);
    whatsappResult.whatsappUrl = fp
      ? `https://wa.me/${fp}?text=${encodeURIComponent(plainTextPayload)}`
      : null;
  }

  let smsResult = {
    apiDispatched: false,
    smsUrl: null as string | null,
    formattedPhone: formatPhoneForMessaging(cleanPhone),
  };
  if (params.channels.includes("SMS") && cleanPhone) {
    smsResult = await dispatchDirectSms(cleanPhone, plainTextPayload);
  } else if (cleanPhone) {
    smsResult.smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(plainTextPayload)}`;
  }

  return {
    emailSent,
    whatsappApiDispatched: whatsappResult.apiDispatched,
    smsApiDispatched: smsResult.apiDispatched,
    whatsappUrl: whatsappResult.whatsappUrl,
    smsUrl: smsResult.smsUrl,
    recipientEmail: cleanEmail,
    recipientPhone: cleanPhone,
    formattedPhone: whatsappResult.formattedPhone,
  };
}

