import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpUser = process.env.SMTP_USER || "edidiongakpan1420@gmail.com";
const smtpPass = process.env.SMTP_PASSWORD || "ngankradtxsnkmuu";
const smtpFrom = process.env.SMTP_FROM || smtpUser;

// Resilient Nodemailer transport configured with direct SSL / TLS options
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false,
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
      to: [to],
      subject,
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
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const result = await sendViaResend(resendApiKey, { to, subject, html });
      console.log("[Email] Dispatched via Resend API:", result.messageId);
      return result;
    } catch (err: any) {
      console.warn("[Email] Resend API failed, falling back to SMTP:", err?.message || err);
    }
  }

  // Fallback to Nodemailer SMTP
  try {
    const info = await transporter.sendMail({
      from: `Word of Faith Schools <${smtpFrom}>`,
      to,
      subject,
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
  const subject = `Admission Application Received — ${fullName} (${params.applyingClass})`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #143424; color: #ffffff; padding: 24px 28px; border-bottom: 4px solid #D4AF37;">
        <h2 style="margin: 0; font-size: 20px;">Word of Faith Group of Schools</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Admissions Office Notification</p>
      </div>
      <div style="padding: 28px; color: #1f2937; line-height: 1.6;">
        <p style="margin-top: 0;">Dear <strong>${params.parentName}</strong>,</p>
        <p>Thank you for submitting an online admission application for <strong>${fullName}</strong> into <strong>${params.applyingClass}</strong> at Word of Faith Group of Schools.</p>
        <div style="background: #f9fafb; border-left: 4px solid #143424; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
          <div><strong>Applicant Name:</strong> ${fullName}</div>
          <div><strong>Class Applied For:</strong> ${params.applyingClass}</div>
          <div><strong>Registered Email:</strong> ${params.parentEmail}</div>
          <div><strong>Registered Phone:</strong> ${params.parentPhone}</div>
          <div><strong>Current Status:</strong> Pending Admissions Review</div>
        </div>
        <p>Our Admissions Committee is reviewing the application. You will receive an official confirmation of approval or decision via this email address (<strong>${params.parentEmail}</strong>) and your contact phone number (<strong>${params.parentPhone}</strong>) as soon as the review is complete.</p>
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
        <p style="margin-top: 0;">Dear <strong>${params.parentName}</strong>,</p>
        <p>We are delighted to inform you that the admission application for <strong>${fullName}</strong> has been <strong>APPROVED</strong>!</p>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 18px; border-radius: 8px; margin: 20px 0; font-size: 14px;">
          <div style="margin-bottom: 6px;"><strong>Student Name:</strong> ${fullName}</div>
          <div style="margin-bottom: 6px;"><strong>Assigned Class Arm:</strong> ${params.assignedClassName || params.applyingClass}</div>
          <div style="margin-bottom: 6px;"><strong>Registration / Admission Number:</strong> <span style="font-family: monospace; font-weight: bold; color: #065f46;">${params.admissionNo || "Assigned"}</span></div>
          ${
            params.claimCode
              ? `<div style="margin-bottom: 6px;"><strong>One-Time Portal Claim Code:</strong> <span style="font-family: monospace; font-weight: bold; background: #143424; color: #ffffff; padding: 2px 8px; border-radius: 4px;">${params.claimCode}</span> <em>(valid for 7 days)</em></div>`
              : ""
          }
          <div style="margin-bottom: 6px;"><strong>Registered Email:</strong> ${params.parentEmail}</div>
          <div><strong>Registered Phone:</strong> ${params.parentPhone}</div>
        </div>
        <p>You can access the Student & Parent Portal using the button below with your Registration Number:</p>
        <p style="margin: 24px 0;">
          <a href="${portalUrl}" style="background: #143424; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; display: inline-block;">
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
        <p style="margin-top: 0;">Dear <strong>${params.parentName}</strong>,</p>
        <p>Thank you for your interest in Word of Faith Group of Schools and for submitting an admission application for <strong>${fullName}</strong> (${params.applyingClass}).</p>
        <p>After careful consideration of the application, we regret to inform you that we are unable to offer admission for <strong>${fullName}</strong> at this time.</p>
        ${
          params.reason
            ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin: 18px 0; font-size: 14px;"><strong>Admissions Note:</strong> ${params.reason}</div>`
            : ""
        }
        <div style="background: #f8fafc; padding: 14px 18px; border-radius: 6px; margin: 18px 0; font-size: 13px; color: #475569;">
          <div><strong>Applicant:</strong> ${fullName} (${params.applyingClass})</div>
          <div><strong>Contact Email:</strong> ${params.parentEmail}</div>
          <div><strong>Contact Phone:</strong> ${params.parentPhone}</div>
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
