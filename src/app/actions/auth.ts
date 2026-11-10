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
