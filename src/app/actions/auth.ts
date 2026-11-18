"use server";

import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmail, sendDirectStudentCommunication } from "@/lib/email";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rateLimit";
import {
  generateSecureOtp6,
  hashTokenSha256,
  timingSafeCompare,
  escapeHtml,
  incrementOtpAttemptAndCheckLocked,
  clearOtpAttempts,
} from "@/lib/security";
import { writeAuditLog } from "@/lib/authz";
import {
  normalizeWofsCode,
  generateManualVerificationRef,
} from "@/lib/student-id";
import {
  detectPotentialStudentDuplicates,
  computeVerificationImageFingerprint,
} from "@/lib/duplicate-detector";

// Validate password strength: letters, numbers, and special characters, min 8 chars
function validatePasswordStrength(password: string) {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasLetter && hasNumber && hasSpecial && password.length >= 8 && password.length <= 128;
}

export async function initiateRegistration(admissionNo: string, email: string, claimCode?: string) {
  try {
    const cleanAdmissionNo = (admissionNo || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanClaimCode = (claimCode || "").trim().toUpperCase();

    if (!cleanAdmissionNo || !cleanEmail) {
      return { success: false, error: "Registration number and email address are required." };
    }

    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rlIp = await rateLimit(`register_init:${ip}`, 5, 300); // 5 attempts per 5 minutes per IP
    const rlAcct = await rateLimit(`register_init:acct:${cleanAdmissionNo.toLowerCase()}`, 5, 300);
    if (!rlIp.success || !rlAcct.success) {
      return { success: false, error: "Too many registration attempts. Please wait a few minutes." };
    }

    // 1. Verify Admission Number exists (case-insensitive)
    const student = await prisma.student.findFirst({
      where: {
        AdmissionNo: {
          equals: cleanAdmissionNo,
          mode: "insensitive",
        },
      },
      include: {
        User: true,
      },
    });

    if (!student) {
      return { success: false, error: "Invalid Registration Number. Please verify or contact the school office." };
    }

    // Prevent account takeover: if student already has an active portal user account
    if (student.UserID && student.User && student.User.IsActive) {
      return {
        success: false,
        error: "This Registration Number already has an active portal account. If you forgot your password, please use the Reset Password page.",
      };
    }

    // If an unclaimed student record has a ClaimCodeHash, enforce authorization
    if (student.ClaimCodeHash) {
      const parentEmail = (student.ParentEmail || "").toLowerCase().trim();
      const isParentEmailMatch = parentEmail && parentEmail === cleanEmail;

      if (!isParentEmailMatch) {
        if (!cleanClaimCode) {
          return {
            success: false,
            error: "A valid One-Time Claim Code is required to claim this admission number, or register using the primary guardian email on file.",
          };
        }

        const inputHash = crypto.createHash("sha256").update(cleanClaimCode).digest("hex");
        if (student.ClaimCodeExpiresAt && new Date(student.ClaimCodeExpiresAt) < new Date()) {
          return {
            success: false,
            error: "The One-Time Claim Code for this student has expired. Please contact the school administration.",
          };
        }

        const isMatch = timingSafeCompare(student.ClaimCodeHash, inputHash);
        if (!isMatch) {
          return {
            success: false,
            error: "Invalid One-Time Claim Code for this admission number.",
          };
        }
      }
    }

    // 2. Check if email is in use by a DIFFERENT user account
    const existingUser = await prisma.user.findFirst({
      where: {
        Email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
      },
    });

    if (existingUser && (!student.UserID || existingUser.UserID !== student.UserID)) {
      return { success: false, error: "This Email Address is already registered to another portal account." };
    }

    // 3. Generate CSPRNG 6-digit OTP and store SHA-256 hash bound to student.AdmissionNo + OTP
    const otp = generateSecureOtp6();
    const otpHash = hashTokenSha256(`${student.AdmissionNo.toUpperCase()}:${otp}`);
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert token & reset attempt counter
    await prisma.verificationToken.deleteMany({
      where: { email: cleanEmail, type: "EMAIL_VERIFICATION" },
    });
    await clearOtpAttempts(cleanEmail, "EMAIL_VERIFICATION");

    await prisma.verificationToken.create({
      data: {
        email: cleanEmail,
        token: otpHash,
        type: "EMAIL_VERIFICATION",
        expires,
      },
    });

    const safeStudentDisplay = escapeHtml(student.PreferredName || student.AdmissionNo);

    // Send email directly
    const emailRes = await sendEmail({
      to: cleanEmail,
      subject: "Word of Faith Schools — Email Verification Code",
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #143424; color: #ffffff; padding: 22px 26px; border-bottom: 3px solid #D4AF37;">
            <h2 style="margin: 0; font-size: 19px;">Word of Faith Group of Schools</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Student Portal Registration</p>
          </div>
          <div style="padding: 26px; color: #1f2937; line-height: 1.6;">
            <p style="margin-top: 0;">Welcome to Word of Faith Schools!</p>
            <p>Your 6-digit portal registration verification code for <strong>${safeStudentDisplay}</strong> is:</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; text-align: center; margin: 22px 0;">
              <h1 style="letter-spacing: 8px; color: #143424; margin: 10px 0; font-size: 34px; font-family: monospace;">${otp}</h1>
              <span style="font-size: 12px; color: #64748b;">This code expires in 15 minutes.</span>
            </div>
            <p style="font-size: 13px; color: #64748b;">If you did not request this registration, please contact the school administration.</p>
            <p style="margin-bottom: 0;">Warm regards,<br/><strong>Portal Administration</strong><br/>Word of Faith Group of Schools</p>
          </div>
        </div>
      `,
    });

    if (!emailRes.success) {
      console.error("[Auth] Registration OTP email failed:", (emailRes as any).error);
      return {
        success: false,
        error: "Unable to send verification email. Mail server is currently unreachable. Please try again shortly.",
      };
    }

    return { success: true, message: `Verification code sent to ${cleanEmail}. Please check your inbox and spam folder.` };
  } catch (error: any) {
    console.error("Init registration error:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function verifyRegistration(
  admissionNo: string,
  preferredName: string,
  email: string,
  password: string,
  otp: string,
  phone?: string
) {
  try {
    const cleanAdmissionNo = (admissionNo || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();
    const cleanPhone = (phone || "").trim();

    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rlIp = await rateLimit(`register_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    const rlEmail = await rateLimit(`register_verify:email:${cleanEmail}`, 5, 300);
    if (!rlIp.success || !rlEmail.success) {
      return { success: false, error: "Too many verification attempts. Please wait." };
    }

    if (!validatePasswordStrength(password)) {
      return {
        success: false,
        error: "Password must be at least 8 characters and contain letters, numbers, and special characters.",
      };
    }

    // Look up student record first so we can verify the admission-bound OTP hash
    const student = await prisma.student.findFirst({
      where: {
        AdmissionNo: {
          equals: cleanAdmissionNo,
          mode: "insensitive",
        },
      },
      include: { User: true, Class: true },
    });

    if (!student) {
      return { success: false, error: "Invalid Registration Number." };
    }

    if (student.UserID && student.User && student.User.IsActive) {
      return {
        success: false,
        error: "This Registration Number already has an active portal account.",
      };
    }

    // Look up active verification token for this email
    const tokenRecord = await prisma.verificationToken.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
        type: "EMAIL_VERIFICATION",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid verification code. Please check the code sent to your email." };
    }

    if (new Date() > tokenRecord.expires) {
      await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
      return { success: false, error: "Verification code has expired. Please request a new one." };
    }

    const boundExpectedHash = hashTokenSha256(`${student.AdmissionNo.toUpperCase()}:${cleanOtp}`);
    const legacyExpectedHash = hashTokenSha256(cleanOtp);
    const otpValid =
      timingSafeCompare(tokenRecord.token, boundExpectedHash) ||
      (!student.ClaimCodeHash &&
        (timingSafeCompare(tokenRecord.token, legacyExpectedHash) ||
          timingSafeCompare(tokenRecord.token, cleanOtp)));

    if (!otpValid) {
      const attemptState = await incrementOtpAttemptAndCheckLocked(cleanEmail, "EMAIL_VERIFICATION", 5, 900);
      if (attemptState.locked) {
        await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
        return {
          success: false,
          error: "Too many invalid code attempts. Your verification code has been invalidated; please request a new code.",
        };
      }
      return { success: false, error: "Invalid verification code. Please check the code sent to your email." };
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const studentRole = await prisma.role.findUnique({ where: { RoleName: "Student" } });

    if (!studentRole) return { success: false, error: "System Error: Role not found." };

    const finalPhone = cleanPhone || student.ParentContact || "";
    const finalName = preferredName.trim() || student.PreferredName || student.AdmissionNo;

    if (student.UserID && student.User) {
      // Pre-provisioned user profile: update password & activate with registration email
      await prisma.user.update({
        where: { UserID: student.UserID },
        data: {
          Email: cleanEmail,
          PasswordHash: hashedPassword,
          IsActive: true,
        },
      });

      await prisma.student.update({
        where: { StudentID: student.StudentID },
        data: {
          PreferredName: finalName,
          ParentContact: finalPhone || student.ParentContact,
          ParentEmail: student.ParentEmail || cleanEmail,
          ClaimCodeHash: null,
          ClaimCodeExpiresAt: null,
        },
      });
    } else {
      // Fresh claim: create user with registration email and link to student
      const newUser = await prisma.user.create({
        data: {
          Email: cleanEmail,
          PasswordHash: hashedPassword,
          RoleID: studentRole.RoleID,
          IsActive: true,
        },
      });

      await prisma.student.update({
        where: { StudentID: student.StudentID },
        data: {
          UserID: newUser.UserID,
          PreferredName: finalName,
          ParentContact: finalPhone || student.ParentContact,
          ParentEmail: student.ParentEmail || cleanEmail,
          ClaimCodeHash: null,
          ClaimCodeExpiresAt: null,
        },
      });
    }

    // Clean up token and attempt counter
    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
    await clearOtpAttempts(cleanEmail, "EMAIL_VERIFICATION");

    // Dispatch direct welcome email to the registration email address and prepare WhatsApp/SMS for the phone number
    const welcomeDispatch = await sendDirectStudentCommunication({
      studentName: finalName,
      admissionNo: student.AdmissionNo,
      className: student.Class?.ClassName,
      registrationEmail: cleanEmail,
      studentPhone: finalPhone,
      subject: "Portal Account Activated — Welcome to Word of Faith Schools",
      message: `Your student portal account (${student.AdmissionNo}) is now active. Your registered email (${cleanEmail}) and phone number (${finalPhone || "on file"}) have been linked for official school notifications, terminal results, and CBT updates.`,
      senderName: "Portal Registration Desk",
      channels: ["EMAIL", "WHATSAPP", "SMS"],
    }).catch(() => null);

    return {
      success: true,
      message: "Account verified and created successfully! A confirmation has been dispatched to your registered email.",
      whatsappUrl: welcomeDispatch?.whatsappUrl || null,
      smsUrl: welcomeDispatch?.smsUrl || null,
    };
  } catch (error: any) {
    console.error("Verify registration error:", error);
    return { success: false, error: "An internal server error occurred." };
  }
}

export async function requestPasswordReset(identifier: string) {
  try {
    const cleanInput = (identifier || "").trim();
    if (!cleanInput) {
      return { success: false, error: "Please enter your email address or registration number." };
    }

    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const normalized = cleanInput.toLowerCase();

    const rlIp = await rateLimit(`reset_req:${ip}`, 5, 300); // 5 attempts per 5 mins per IP
    const rlAcct = await rateLimit(`reset_req:acct:${normalized}`, 5, 300);
    if (!rlIp.success || !rlAcct.success) {
      return { success: false, error: "Too many reset attempts. Please wait a few minutes." };
    }

    // 1. Look for user by email (case-insensitive)
    let user = await prisma.user.findFirst({
      where: {
        Email: {
          equals: normalized,
          mode: "insensitive",
        },
      },
    });

    let targetEmail = user?.Email?.toLowerCase().trim();

    // 2. If not found by email, check if input is a Student Admission Number (e.g. WOF/2026/045 or WOFS/...)
    if (!user) {
      const student = await prisma.student.findFirst({
        where: {
          AdmissionNo: {
            equals: cleanInput,
            mode: "insensitive",
          },
        },
        include: {
          User: true,
        },
      });

      if (student?.User) {
        user = student.User;
        targetEmail = student.User.Email.toLowerCase().trim();
      } else if (student && !student.UserID) {
        return {
          success: false,
          error: `Registration number ${student.AdmissionNo} has not yet claimed a portal account. Please click "Claim Account / Register" to set up your account.`,
        };
      }
    }

    // Uniform response when account is not found to prevent user enumeration
    if (!user || !targetEmail) {
      return {
        success: true,
        email: normalized.includes("@") ? normalized : "",
        message: "If an active account matches that identifier, a 6-digit reset code has been dispatched to the registered email address.",
      };
    }

    const otp = generateSecureOtp6();
    const otpHash = hashTokenSha256(otp);
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.verificationToken.deleteMany({
      where: { email: targetEmail, type: "PASSWORD_RESET" },
    });
    await clearOtpAttempts(targetEmail, "PASSWORD_RESET");

    await prisma.verificationToken.create({
      data: {
        email: targetEmail,
        token: otpHash,
        type: "PASSWORD_RESET",
        expires,
      },
    });

    const safeTargetEmail = escapeHtml(targetEmail);

    // Send email directly
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: "Word of Faith Schools — Password Reset Code",
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #143424; color: #ffffff; padding: 22px 26px; border-bottom: 3px solid #D4AF37;">
            <h2 style="margin: 0; font-size: 19px;">Word of Faith Group of Schools</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Student & Staff Portal Security</p>
          </div>
          <div style="padding: 26px; color: #1f2937; line-height: 1.6;">
            <p style="margin-top: 0;">Hello,</p>
            <p>You requested a password reset code for your Word of Faith Schools portal account (<strong>${safeTargetEmail}</strong>).</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; text-align: center; margin: 22px 0;">
              <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; font-weight: bold;">Your 6-Digit Password Reset Code</span>
              <h1 style="letter-spacing: 8px; color: #143424; margin: 10px 0; font-size: 34px; font-family: monospace;">${otp}</h1>
              <span style="font-size: 12px; color: #64748b;">This code expires in 15 minutes.</span>
            </div>
            <p style="font-size: 13px; color: #64748b;">If you did not request this, please ignore this email or contact the school office if you suspect unauthorized access.</p>
            <p style="margin-bottom: 0;">Warm regards,<br/><strong>Portal Administration</strong><br/>Word of Faith Group of Schools</p>
          </div>
        </div>
      `,
    });

    if (!emailResult.success) {
      console.error("[Auth] Password reset email dispatch failed:", (emailResult as any).error);
      return {
        success: false,
        error: "Unable to dispatch email. The mail server could not be reached. Please check your network or try again shortly.",
      };
    }

    // Mask email for student privacy if they entered registration number
    const atIndex = targetEmail.indexOf("@");
    const maskedEmail =
      atIndex > 2 ? `${targetEmail.slice(0, 2)}***${targetEmail.slice(atIndex - 1)}` : targetEmail;

    return {
      success: true,
      email: targetEmail,
      message: `A 6-digit reset code has been sent to ${maskedEmail}. Please check your inbox and spam folder.`,
    };
  } catch (error) {
    console.error("Forgot password error", error);
    return { success: false, error: "An internal server error occurred while processing your request." };
  }
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  try {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();

    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rlIp = await rateLimit(`reset_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    const rlEmail = await rateLimit(`reset_verify:email:${cleanEmail}`, 5, 300);
    if (!rlIp.success || !rlEmail.success) {
      return { success: false, error: "Too many reset attempts. Please wait." };
    }

    if (!validatePasswordStrength(newPassword)) {
      return {
        success: false,
        error: "Password must be at least 8 characters and contain letters, numbers, and special characters.",
      };
    }

    const tokenRecord = await prisma.verificationToken.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
        type: "PASSWORD_RESET",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid reset code. Please check the code sent to your email." };
    }

    if (new Date() > tokenRecord.expires) {
      await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
      return { success: false, error: "Reset code has expired. Please request a new one." };
    }

    const expectedHash = hashTokenSha256(cleanOtp);
    const otpValid =
      timingSafeCompare(tokenRecord.token, expectedHash) ||
      timingSafeCompare(tokenRecord.token, cleanOtp);

    if (!otpValid) {
      const attemptState = await incrementOtpAttemptAndCheckLocked(cleanEmail, "PASSWORD_RESET", 5, 900);
      if (attemptState.locked) {
        await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
        return {
          success: false,
          error: "Too many invalid reset code attempts. Your reset code has been invalidated; please request a new one.",
        };
      }
      return { success: false, error: "Invalid reset code. Please check the code sent to your email." };
    }

    const user = await prisma.user.findFirst({
      where: {
        Email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      return { success: false, error: "User account not found." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { UserID: user.UserID },
      data: {
        PasswordHash: hashedPassword,
        FailedLoginAttempts: 0,
        LockedUntil: null,
        TokenVersion: { increment: 1 },
      },
    });

    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
    await clearOtpAttempts(cleanEmail, "PASSWORD_RESET");

    return { success: true, message: "Password reset successfully! You can now log in with your new password." };
  } catch (error) {
    console.error("Reset password error", error);
    return { success: false, error: "Internal server error" };
  }
}

// ============================================================================
// INVITATION-BASED STUDENT ACCOUNT CLAIMING & MANUAL VERIFICATION WORKFLOW
// ============================================================================

function maskEmailAddress(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.trim().split("@");
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhoneNumber(phone?: string | null): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits || digits === "08000000000" || digits.length < 7) return null;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

async function resolveActiveStudentInvitation(rawInviteInput: string) {
  const trimmed = (rawInviteInput || "").trim();
  if (!trimmed) return { error: "Please enter a valid registration invitation code." };

  const normalizedCode = normalizeWofsCode(trimmed);
  const codeHash = crypto.createHash("sha256").update(normalizedCode).digest("hex");
  const tokenHash = crypto.createHash("sha256").update(trimmed).digest("hex");

  let claim = await prisma.studentClaim.findFirst({
    where: {
      OR: [{ codeHash }, { tokenHash }],
    },
    include: {
      student: {
        include: {
          Class: true,
          User: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fallback for legacy ClaimCodeHash on Student row
  if (!claim) {
    const legacyStudent = await prisma.student.findFirst({
      where: { ClaimCodeHash: codeHash },
      include: { Class: true, User: true },
    });
    if (legacyStudent) {
      claim = await prisma.studentClaim.create({
        data: {
          studentId: legacyStudent.StudentID,
          codeHash,
          maskedCode: `WOFS-INV-****${normalizedCode.slice(-4)}`,
          status: "ACTIVE",
          expiresAt:
            legacyStudent.ClaimCodeExpiresAt ||
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        include: {
          student: {
            include: { Class: true, User: true },
          },
        },
      });
    }
  }

  if (!claim || !claim.student) {
    return {
      error:
        "Invalid registration invitation code. Please check your invitation slip or request manual verification.",
    };
  }

  if (claim.status === "REVOKED" || claim.revokedAt) {
    return {
      error:
        "This registration invitation has been revoked by the school administration. Please contact the school office for a new invitation.",
    };
  }

  if (claim.usedAt || claim.status === "REDEEMED") {
    return {
      error:
        "This single-use registration invitation has already been redeemed and cannot be used again.",
    };
  }

  if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
    await prisma.studentClaim
      .update({
        where: { id: claim.id },
        data: { status: "EXPIRED" },
      })
      .catch(() => {});
    return {
      error:
        "This registration invitation has expired. Please contact the school office or submit a manual verification request.",
    };
  }

  if (claim.attempts >= 5) {
    return {
      error:
        "This invitation has been locked due to too many failed verification attempts. Please contact the school office.",
    };
  }

  if (claim.student.UserID && claim.student.User?.IsActive) {
    return {
      error:
        "This student record has already claimed an active portal account. Please sign in on the Login page.",
    };
  }

  return { claim, student: claim.student };
}

export async function getPublicRegistrationClasses() {
  try {
    const classes = await prisma.class.findMany({
      select: {
        ClassID: true,
        ClassName: true,
        Level: true,
        Arm: true,
      },
      orderBy: { ClassName: "asc" },
    });
    return { success: true, classes };
  } catch {
    return { success: false, classes: [] };
  }
}

/**
 * Step 1 of Invitation Claiming:
 * Validates a single-use registration invitation and returns the locked school student record.
 * The student cannot modify their assigned name, class, or WOFS Student ID.
 */
export async function validateRegistrationInvitation(inviteCodeOrToken: string) {
  try {
    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rl = await rateLimit(`invite_validate:${ip}`, 10, 300);
    if (!rl.success) {
      return {
        success: false,
        error: "Too many invitation validation attempts. Please wait a few minutes.",
      };
    }

    const resolved = await resolveActiveStudentInvitation(inviteCodeOrToken);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }

    const { claim, student } = resolved;
    const fullName =
      student.PreferredName ||
      [student.FirstName, student.MiddleName, student.LastName].filter(Boolean).join(" ") ||
      student.AdmissionNo;

    const maskedEmail = maskEmailAddress(student.ParentEmail);
    const maskedPhone = maskPhoneNumber(student.ParentContact);

    return {
      success: true,
      invitation: {
        claimId: claim.id,
        expiresAt: claim.expiresAt.toISOString(),
        student: {
          wofsStudentId: student.AdmissionNo,
          fullName,
          firstName: student.FirstName || "",
          lastName: student.LastName || "",
          className: student.Class?.ClassName || "Assigned Class",
          level: student.Class?.Level || "Secondary",
          hasGuardianContact: Boolean(maskedEmail || maskedPhone),
          maskedGuardianEmail: maskedEmail,
          maskedGuardianPhone: maskedPhone,
        },
      },
    };
  } catch (error: any) {
    console.error("validateRegistrationInvitation error:", error);
    return { success: false, error: "Unable to validate invitation at this time." };
  }
}

/**
 * Step 2 of Invitation Claiming:
 * Sends a 6-digit verification OTP to the guardian/student email address and binds it to the invitation.
 */
export async function sendInvitationGuardianOtp(params: {
  inviteCodeOrToken: string;
  email: string;
  phone?: string;
}) {
  try {
    const cleanEmail = (params.email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { success: false, error: "Please provide a valid email address to receive your verification code." };
    }

    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rl = await rateLimit(`invite_otp:${ip}`, 5, 300);
    if (!rl.success) {
      return { success: false, error: "Too many OTP requests. Please wait a few minutes." };
    }

    const resolved = await resolveActiveStudentInvitation(params.inviteCodeOrToken);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }

    const { claim, student } = resolved;

    // Ensure email is not already bound to another User account
    const existingUser = await prisma.user.findFirst({
      where: {
        Email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
      },
    });

    if (existingUser && (!student.UserID || existingUser.UserID !== student.UserID)) {
      return {
        success: false,
        error: "This email address is already linked to another portal account. Please use a unique email for this student.",
      };
    }

    const otp = generateSecureOtp6();
    const boundHash = hashTokenSha256(`INVITE:${claim.id}:${cleanEmail}:${otp}`);
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { email: cleanEmail, type: "EMAIL_VERIFICATION" },
    });
    await clearOtpAttempts(cleanEmail, "EMAIL_VERIFICATION");

    await prisma.verificationToken.create({
      data: {
        email: cleanEmail,
        token: boundHash,
        type: "EMAIL_VERIFICATION",
        expires,
      },
    });

    await prisma.$transaction([
      prisma.studentClaim.update({
        where: { id: claim.id },
        data: { status: "PENDING_OTP" },
      }),
      prisma.student.update({
        where: { StudentID: student.StudentID },
        data: { RegistrationStatus: "PENDING_OTP" },
      }),
    ]);

    const studentDisplayName = escapeHtml(
      student.PreferredName ||
        `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
        student.AdmissionNo
    );

    const emailRes = await sendEmail({
      to: cleanEmail,
      subject: `Word of Faith Schools — Verification Code for ${student.AdmissionNo}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #0A2540; color: #ffffff; padding: 20px 24px; border-bottom: 4px solid #16a34a;">
            <h2 style="margin: 0; font-size: 19px; color: #ffffff;">Word of Faith Schools</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #86efac;">Student Account Claim Verification</p>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p style="margin-top: 0;">You are claiming the student portal account for:</p>
            <p style="margin: 0 0 12px 0;"><strong>${studentDisplayName}</strong> &middot; Permanent ID: <code>${escapeHtml(student.AdmissionNo)}</code></p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
              <h1 style="letter-spacing: 8px; color: #14532D; margin: 8px 0; font-size: 32px; font-family: monospace;">${otp}</h1>
              <span style="font-size: 12px; color: #64748b;">Valid for 15 minutes. Single-use only.</span>
            </div>
          </div>
        </div>
      `,
    });

    if (!emailRes.success) {
      return {
        success: false,
        error: "Unable to send verification code to that email address right now. Please verify the address or try again.",
      };
    }

    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}.`,
    };
  } catch (error: any) {
    console.error("sendInvitationGuardianOtp error:", error);
    return { success: false, error: "Failed to dispatch verification code." };
  }
}

/**
 * Step 3 of Invitation Claiming:
 * Verifies the OTP, records identity verification evidence separately from AvatarUrl,
 * checks for multi-signal or biometric duplicate collisions, activates the account,
 * and permanently invalidates the single-use invitation.
 */
export async function completeInvitationClaim(params: {
  inviteCodeOrToken: string;
  email: string;
  phone?: string;
  preferredName?: string;
  password: string;
  otp: string;
  verificationPhotoDataUrl?: string;
}) {
  try {
    const cleanEmail = (params.email || "").trim().toLowerCase();
    const cleanOtp = (params.otp || "").trim();
    const cleanPhone = (params.phone || "").trim();

    if (!validatePasswordStrength(params.password || "")) {
      return {
        success: false,
        error:
          "Password must be at least 8 characters and include letters, numbers, and a special character.",
      };
    }

    const resolved = await resolveActiveStudentInvitation(params.inviteCodeOrToken);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }

    const { claim, student } = resolved;

    const tokenRecord = await prisma.verificationToken.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
        type: "EMAIL_VERIFICATION",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) {
      return {
        success: false,
        error: "Verification code not found. Please request a new 6-digit code.",
      };
    }

    if (new Date() > tokenRecord.expires) {
      await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
      return {
        success: false,
        error: "Your 6-digit verification code has expired. Please request a new code.",
      };
    }

    const expectedHash = hashTokenSha256(`INVITE:${claim.id}:${cleanEmail}:${cleanOtp}`);
    const isOtpValid = timingSafeCompare(tokenRecord.token, expectedHash);

    if (!isOtpValid) {
      await prisma.studentClaim.update({
        where: { id: claim.id },
        data: { attempts: { increment: 1 } },
      });
      const attemptState = await incrementOtpAttemptAndCheckLocked(
        cleanEmail,
        "EMAIL_VERIFICATION",
        5,
        900
      );
      if (attemptState.locked) {
        await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
        return {
          success: false,
          error:
            "Too many invalid verification attempts. Please request a fresh verification code.",
        };
      }
      return { success: false, error: "Invalid 6-digit verification code." };
    }

    // Check if email is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        Email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
      },
    });
    if (existingUser && (!student.UserID || existingUser.UserID !== student.UserID)) {
      return {
        success: false,
        error: "This email address is already registered to another portal account.",
      };
    }

    // Biometric / Verification Photo perceptual hash check (stored independently of AvatarUrl)
    const photoHash = computeVerificationImageFingerprint(params.verificationPhotoDataUrl);
    let flaggedBiometricDuplicateStudentId: number | null = null;
    if (photoHash) {
      const matchingVerification = await prisma.identityVerificationRecord.findFirst({
        where: {
          perceptualHash: photoHash,
          studentId: { not: student.StudentID },
        },
      });
      if (matchingVerification) {
        flaggedBiometricDuplicateStudentId = matchingVerification.studentId;
      }
    }

    const hashedPassword = await bcrypt.hash(params.password, 12);
    const finalPreferredName =
      params.preferredName?.trim() ||
      student.PreferredName ||
      [student.FirstName, student.MiddleName, student.LastName].filter(Boolean).join(" ") ||
      student.AdmissionNo;
    const finalPhone = cleanPhone || student.ParentContact || "08000000000";

    await prisma.$transaction(async (tx) => {
      // Double-check inside transaction that the invitation was not concurrently redeemed
      const freshClaim = await tx.studentClaim.findUnique({ where: { id: claim.id } });
      if (!freshClaim || freshClaim.usedAt || freshClaim.status === "REDEEMED" || freshClaim.status === "REVOKED") {
        throw new Error("This invitation has already been redeemed or revoked.");
      }

      const studentRole = await tx.role.findUnique({ where: { RoleName: "Student" } });
      if (!studentRole) throw new Error("Student role not found.");

      let userId = student.UserID;
      if (userId) {
        await tx.user.update({
          where: { UserID: userId },
          data: {
            Email: cleanEmail,
            PasswordHash: hashedPassword,
            IsActive: true,
          },
        });
      } else {
        const createdUser = await tx.user.create({
          data: {
            Email: cleanEmail,
            PasswordHash: hashedPassword,
            RoleID: studentRole.RoleID,
            IsActive: true,
          },
        });
        userId = createdUser.UserID;
      }

      await tx.student.update({
        where: { StudentID: student.StudentID },
        data: {
          UserID: userId,
          PreferredName: finalPreferredName,
          ParentContact: finalPhone,
          ParentEmail: student.ParentEmail || cleanEmail,
          GuardianVerified: true,
          RegistrationStatus: flaggedBiometricDuplicateStudentId ? "FLAGGED_DUPLICATE" : "CLAIMED",
          IdentityVerified: !flaggedBiometricDuplicateStudentId,
          IdentityVerifiedAt: flaggedBiometricDuplicateStudentId ? null : new Date(),
          ClaimCodeHash: null,
          ClaimCodeExpiresAt: null,
        },
      });

      // Immediately invalidate single-use invitation
      await tx.studentClaim.update({
        where: { id: claim.id },
        data: {
          status: "REDEEMED",
          usedAt: new Date(),
        },
      });

      // Record identity verification evidence independently of Student.AvatarUrl
      if (params.verificationPhotoDataUrl) {
        await tx.identityVerificationRecord.create({
          data: {
            studentId: student.StudentID,
            method: "CLAIM_PHOTO",
            captureDataUrl: params.verificationPhotoDataUrl,
            perceptualHash: photoHash,
            status: flaggedBiometricDuplicateStudentId ? "FLAGGED" : "VERIFIED",
            notes: flaggedBiometricDuplicateStudentId
              ? `Flagged potential photo match with Student #${flaggedBiometricDuplicateStudentId}`
              : "Captured during invitation claim verification",
          },
        });
      }

      if (flaggedBiometricDuplicateStudentId) {
        await tx.duplicateReviewCase.create({
          data: {
            primaryStudentId: flaggedBiometricDuplicateStudentId,
            candidateStudentId: student.StudentID,
            matchType: "BIOMETRIC_MATCH",
            signalsJson: {
              perceptualHash: photoHash,
              claimedEmail: cleanEmail,
            },
            status: "OPEN",
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: userId,
        action: "STUDENT_INVITATION_REDEEMED",
        entity: "Student",
        entityId: student.StudentID,
        newValue: {
          wofsStudentId: student.AdmissionNo,
          claimId: claim.id,
          email: cleanEmail,
          flaggedBiometricMatch: Boolean(flaggedBiometricDuplicateStudentId),
        },
      });
    });

    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
    await clearOtpAttempts(cleanEmail, "EMAIL_VERIFICATION");

    await sendDirectStudentCommunication({
      studentName: finalPreferredName,
      admissionNo: student.AdmissionNo,
      className: student.Class?.ClassName,
      registrationEmail: cleanEmail,
      studentPhone: finalPhone,
      subject: `Portal Account Activated — ${student.AdmissionNo}`,
      message: `Welcome to Word of Faith Schools! Your student portal account has been claimed and activated. Your permanent WOFS Student ID is ${student.AdmissionNo}. You may sign in using either ${cleanEmail} or ${student.AdmissionNo}.`,
      senderName: "Portal Registration Desk",
      channels: ["EMAIL"],
    }).catch(() => null);

    return {
      success: true,
      wofsStudentId: student.AdmissionNo,
      studentName: finalPreferredName,
      className: student.Class?.ClassName || "Assigned Class",
      flaggedForReview: Boolean(flaggedBiometricDuplicateStudentId),
      message: `Account activated! Your permanent WOFS Student ID is ${student.AdmissionNo}.`,
    };
  } catch (error: any) {
    console.error("completeInvitationClaim error:", error);
    return {
      success: false,
      error: error.message || "Failed to complete account claim.",
    };
  }
}

/**
 * Alternative Registration Pathway (Requirement 4):
 * Submits a Manual Registration Verification Request when a student does not have
 * reliable guardian contact info on file or needs administrative verification.
 */
export async function submitManualVerificationRequest(params: {
  wofsStudentIdInput?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  gender?: string;
  requestedClassId: number;
  guardianName?: string;
  guardianPhone?: string;
  contactEmail: string;
  contactPhone?: string;
  password: string;
  reasonForManual: string;
  verificationPhotoDataUrl?: string;
}) {
  try {
    const headersList = await headers();
    const ip = (headersList.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rl = await rateLimit(`manual_verify_req:${ip}`, 5, 900);
    if (!rl.success) {
      return {
        success: false,
        error: "Too many verification requests from this network. Please wait 15 minutes.",
      };
    }

    const firstName = (params.firstName || "").trim();
    const lastName = (params.lastName || "").trim();
    const middleName = (params.middleName || "").trim() || null;
    const contactEmail = (params.contactEmail || "").trim().toLowerCase();
    const reasonForManual = (params.reasonForManual || "").trim();
    const requestedClassId = Number(params.requestedClassId) || null;

    if (!firstName || !lastName || !contactEmail || !contactEmail.includes("@") || !reasonForManual) {
      return {
        success: false,
        error: "First Name, Last Name, Contact Email, Class, and Reason for Manual Verification are required.",
      };
    }

    if (!validatePasswordStrength(params.password || "")) {
      return {
        success: false,
        error:
          "Password must be at least 8 characters and include letters, numbers, and a special character.",
      };
    }

    const parsedDob = new Date(params.dateOfBirth);
    if (Number.isNaN(parsedDob.getTime())) {
      return { success: false, error: "Please enter a valid Date of Birth." };
    }

    // Check if contactEmail is already registered
    const existingEmailUser = await prisma.user.findFirst({
      where: {
        Email: {
          equals: contactEmail,
          mode: "insensitive",
        },
      },
    });
    if (existingEmailUser) {
      return {
        success: false,
        error: "This email address is already registered to an active portal account.",
      };
    }

    // Check if an unclaimed Student record matches wofsStudentIdInput or name+DOB
    let matchedStudentId: number | null = null;
    const cleanWofsInput = (params.wofsStudentIdInput || "").trim().toUpperCase();
    if (cleanWofsInput) {
      const byId = await prisma.student.findFirst({
        where: {
          AdmissionNo: {
            equals: cleanWofsInput,
            mode: "insensitive",
          },
        },
      });
      if (byId) {
        if (byId.UserID) {
          return {
            success: false,
            error: "That WOFS Student ID has already been claimed. Please use the Login or Forgot Password page.",
          };
        }
        matchedStudentId = byId.StudentID;
      }
    }

    const dupCheck = await detectPotentialStudentDuplicates({
      firstName,
      lastName,
      middleName,
      dateOfBirth: parsedDob,
      classId: requestedClassId,
      parentContact: params.guardianPhone || params.contactPhone,
      parentEmail: contactEmail,
      verificationPhotoDataUrl: params.verificationPhotoDataUrl,
    });

    if (!matchedStudentId && dupCheck.matches.length > 0 && !dupCheck.matches[0].hasClaimedAccount) {
      matchedStudentId = dupCheck.matches[0].studentId;
    }

    const passwordHash = await bcrypt.hash(params.password, 12);
    const referenceCode = generateManualVerificationRef();
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

    const createdReq = await prisma.$transaction(async (tx) => {
      const reqRow = await tx.studentVerificationRequest.create({
        data: {
          referenceCode,
          studentId: matchedStudentId,
          wofsStudentIdInput: cleanWofsInput || null,
          firstName,
          lastName,
          middleName,
          dateOfBirth: parsedDob,
          gender: (params.gender || "Unspecified").trim(),
          requestedClassId,
          guardianName: (params.guardianName || "").trim() || null,
          guardianPhone: (params.guardianPhone || "").trim() || null,
          contactEmail,
          contactPhone: (params.contactPhone || "").trim() || null,
          passwordHash,
          verificationPhotoData: params.verificationPhotoDataUrl || null,
          reasonForManual,
          status: "PENDING",
          ipHash,
        },
      });

      if (matchedStudentId) {
        await tx.student.update({
          where: { StudentID: matchedStudentId },
          data: { RegistrationStatus: "PENDING_MANUAL_VERIFICATION" },
        });
      }

      if (dupCheck.matches.some((m) => m.hasClaimedAccount)) {
        const claimedMatch = dupCheck.matches.find((m) => m.hasClaimedAccount)!;
        await tx.duplicateReviewCase.create({
          data: {
            primaryStudentId: claimedMatch.studentId,
            verificationRequestId: reqRow.id,
            matchType: claimedMatch.matchType,
            signalsJson: claimedMatch.signals as any,
            status: "OPEN",
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: null,
        action: "MANUAL_VERIFICATION_REQUEST_SUBMITTED",
        entity: "StudentVerificationRequest",
        entityId: reqRow.id,
        newValue: {
          referenceCode,
          firstName,
          lastName,
          contactEmail,
          matchedStudentId,
        },
      });

      return reqRow;
    });

    return {
      success: true,
      referenceCode: createdReq.referenceCode,
      message:
        "Your registration request has been placed in the school's verification queue. An administrator will verify your details against school records and notify you by email.",
    };
  } catch (error: any) {
    console.error("submitManualVerificationRequest error:", error);
    return {
      success: false,
      error: "Failed to submit manual verification request. Please try again.",
    };
  }
}

