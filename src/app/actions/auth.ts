"use server";

import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/email";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rateLimit";

// Validate password strength: letters, numbers, and special characters, min 8 chars
function validatePasswordStrength(password: string) {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasLetter && hasNumber && hasSpecial && password.length >= 8;
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
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`register_init:${ip}`, 5, 300); // 5 attempts per 5 minutes
    if (!rl.success) {
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

    // Check if account already fully claimed and in use with a different email
    if (student.UserID && student.User) {
      const studentEmail = (student.User.Email || "").toLowerCase().trim();
      const parentEmail = (student.ParentEmail || "").toLowerCase().trim();

      // If user provided a different email from the pre-provisioned one, check if it's already an active claimed account
      const isEmailMatch = studentEmail === cleanEmail || parentEmail === cleanEmail;
      if (!isEmailMatch && student.User.CreatedAt && (Date.now() - new Date(student.User.CreatedAt).getTime() > 30 * 24 * 60 * 60 * 1000)) {
        return {
          success: false,
          error: "This Registration Number has already been claimed. If you forgot your password, please use the Reset Password page.",
        };
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

    // 3. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert token
    await prisma.verificationToken.deleteMany({
      where: { email: cleanEmail, type: "EMAIL_VERIFICATION" },
    });

    await prisma.verificationToken.create({
      data: {
        email: cleanEmail,
        token: otp,
        type: "EMAIL_VERIFICATION",
        expires,
      },
    });

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
            <p>Your 6-digit portal registration verification code for <strong>${student.PreferredName || student.AdmissionNo}</strong> is:</p>
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
  otp: string
) {
  try {
    const cleanAdmissionNo = (admissionNo || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`register_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    if (!rl.success) return { success: false, error: "Too many verification attempts. Please wait." };
    if (!validatePasswordStrength(password)) {
      return {
        success: false,
        error: "Password must be at least 8 characters and contain letters, numbers, and special characters.",
      };
    }

    // Verify OTP
    const tokenRecord = await prisma.verificationToken.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
        token: cleanOtp,
        type: "EMAIL_VERIFICATION",
      },
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid verification code. Please check the code sent to your email." };
    }

    if (new Date() > tokenRecord.expires) {
      return { success: false, error: "Verification code has expired. Please request a new one." };
    }

    // Re-verify student constraints to be safe
    const student = await prisma.student.findFirst({
      where: {
        AdmissionNo: {
          equals: cleanAdmissionNo,
          mode: "insensitive",
        },
      },
      include: { User: true },
    });

    if (!student) {
      return { success: false, error: "Invalid Registration Number." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const studentRole = await prisma.role.findUnique({ where: { RoleName: "Student" } });

    if (!studentRole) return { success: false, error: "System Error: Role not found." };

    if (student.UserID && student.User) {
      // Pre-provisioned user profile (like Mercy James added by admin): update password & activate
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
          PreferredName: preferredName.trim() || student.PreferredName,
        },
      });
    } else {
      // Fresh claim: create user and link to student
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
          PreferredName: preferredName.trim(),
        },
      });
    }

    // Clean up token
    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } });

    return { success: true, message: "Account verified and created successfully! You can now log in." };
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
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`reset_req:${ip}`, 5, 300); // 5 attempts per 5 mins
    if (!rl.success) {
      return { success: false, error: "Too many reset attempts from this network. Please wait a few minutes." };
    }

    const normalized = cleanInput.toLowerCase();

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

    if (!user || !targetEmail) {
      return {
        success: false,
        error: "We could not find an active account matching this email or registration number. Please check your spelling or contact the school office.",
      };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.verificationToken.deleteMany({
      where: { email: targetEmail, type: "PASSWORD_RESET" },
    });

    await prisma.verificationToken.create({
      data: {
        email: targetEmail,
        token: otp,
        type: "PASSWORD_RESET",
        expires,
      },
    });

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
            <p>You requested a password reset code for your Word of Faith Schools portal account (<strong>${targetEmail}</strong>).</p>
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
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`reset_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    if (!rl.success) return { success: false, error: "Too many reset attempts. Please wait." };
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
        token: cleanOtp,
        type: "PASSWORD_RESET",
      },
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid reset code. Please check the code sent to your email." };
    }

    if (new Date() > tokenRecord.expires) {
      return { success: false, error: "Reset code has expired. Please request a new one." };
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { UserID: user.UserID },
      data: {
        PasswordHash: hashedPassword,
        FailedLoginAttempts: 0,
        LockedUntil: null,
        TokenVersion: { increment: 1 },
      },
    });

    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } });

    return { success: true, message: "Password reset successfully! You can now log in with your new password." };
  } catch (error) {
    console.error("Reset password error", error);
    return { success: false, error: "Internal server error" };
  }
}
