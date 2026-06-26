"use server";

import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { emailQueue } from "@/lib/queue";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rateLimit";

// Validate password strength: letters, numbers, and special characters
function validatePasswordStrength(password: string) {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasLetter && hasNumber && hasSpecial && password.length >= 8;
}

export async function initiateRegistration(admissionNo: string, email: string) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`register_init:${ip}`, 3, 300); // 3 attempts per 5 minutes
    if (!rl.success) return { success: false, error: "Too many registration attempts. Please wait a few minutes." };
    // 1. Verify Admission Number exists
    const student = await prisma.student.findUnique({
      where: { AdmissionNo: admissionNo }
    });

    if (!student) {
      return { success: false, error: "Invalid Registration Number. Please contact administration." };
    }

    if (student.UserID) {
      return { success: false, error: "This Registration Number has already been claimed." };
    }

    // 2. Check if email is in use
    const existingUser = await prisma.user.findUnique({
      where: { Email: email }
    });

    if (existingUser) {
      return { success: false, error: "This Email Address is already registered." };
    }

    // 3. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert token
    await prisma.verificationToken.deleteMany({
      where: { email, type: "EMAIL_VERIFICATION" }
    });
    
    await prisma.verificationToken.create({
      data: {
        email,
        token: otp,
        type: "EMAIL_VERIFICATION",
        expires
      }
    });

    // Send email via Background Queue
    await emailQueue.add('verification-email', {
      to: email,
      subject: "Word of Faith Schools - Email Verification",
      html: `<h2>Welcome to Word of Faith Schools!</h2>
             <p>Your portal registration verification code is:</p>
             <h1 style="letter-spacing: 5px; color: #4ade80;">${otp}</h1>
             <p>This code expires in 15 minutes.</p>`
    });

    return { success: true, message: "Verification email is being dispatched in the background." };
  } catch (error: any) {
    console.error("Init registration error:", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function verifyRegistration(admissionNo: string, preferredName: string, email: string, password: string, otp: string) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`register_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    if (!rl.success) return { success: false, error: "Too many verification attempts. Please wait." };
    if (!validatePasswordStrength(password)) {
      return { success: false, error: "Password must be at least 8 characters and contain letters, numbers, and special characters." };
    }

    // Verify OTP
    const tokenRecord = await prisma.verificationToken.findFirst({
      where: { email, token: otp, type: "EMAIL_VERIFICATION" }
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid verification code." };
    }

    if (new Date() > tokenRecord.expires) {
      return { success: false, error: "Verification code has expired." };
    }

    // Re-verify student constraints to be safe
    const student = await prisma.student.findUnique({ where: { AdmissionNo: admissionNo } });
    if (!student || student.UserID) return { success: false, error: "Invalid or claimed Registration Number." };

    const hashedPassword = await bcrypt.hash(password, 10);
    const studentRole = await prisma.role.findUnique({ where: { RoleName: "Student" } });

    if (!studentRole) return { success: false, error: "System Error: Role not found." };

    const newUser = await prisma.user.create({
      data: {
        Email: email,
        PasswordHash: hashedPassword,
        RoleID: studentRole.RoleID
      }
    });

    await prisma.student.update({
      where: { StudentID: student.StudentID },
      data: { 
        UserID: newUser.UserID,
        PreferredName: preferredName
      }
    });

    // Clean up token
    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } });

    return { success: true, message: "Account verified and created successfully! You can now log in." };
  } catch (error: any) {
    console.error("Verify registration error:", error);
    return { success: false, error: "An internal server error occurred." };
  }
}

export async function requestPasswordReset(email: string) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`reset_req:${ip}`, 3, 300); // 3 attempts per 5 mins
    if (!rl.success) return { success: true, message: "If your email is registered, you will receive a reset code." }; // Fail silently for security
    const user = await prisma.user.findUnique({ where: { Email: email } });
    if (!user) {
      // For security, don't reveal if user exists or not
      return { success: true, message: "If your email is registered, you will receive a reset code." };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { email, type: "PASSWORD_RESET" }
    });

    await prisma.verificationToken.create({
      data: {
        email,
        token: otp,
        type: "PASSWORD_RESET",
        expires
      }
    });

    // Send email via Background Queue
    await emailQueue.add('password-reset', {
      to: email,
      subject: "Password Reset Request",
      html: `<h2>Password Reset Request</h2>
             <p>Your password reset code is:</p>
             <h1 style="letter-spacing: 5px; color: #3b82f6;">${otp}</h1>
             <p>If you did not request this, please ignore this email.</p>`
    });

    return { success: true, message: "If your email is registered, you will receive a reset code shortly." };
  } catch (error) {
    console.error("Forgot password error", error);
    return { success: false, error: "Internal server error" };
  }
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(`reset_verify:${ip}`, 5, 300); // 5 attempts per 5 mins
    if (!rl.success) return { success: false, error: "Too many reset attempts. Please wait." };
    if (!validatePasswordStrength(newPassword)) {
      return { success: false, error: "Password must be at least 8 characters and contain letters, numbers, and special characters." };
    }

    const tokenRecord = await prisma.verificationToken.findFirst({
      where: { email, token: otp, type: "PASSWORD_RESET" }
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid reset code." };
    }

    if (new Date() > tokenRecord.expires) {
      return { success: false, error: "Reset code has expired." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { Email: email },
      data: { PasswordHash: hashedPassword }
    });

    await prisma.verificationToken.delete({ where: { id: tokenRecord.id } });

    return { success: true, message: "Password reset successfully!" };
  } catch (error) {
    console.error("Reset password error", error);
    return { success: false, error: "Internal server error" };
  }
}

