import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./db";
import bcrypt from "bcryptjs";
import { rateLimit } from "./rateLimit";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      role: string;
      roles?: string[];
      tokenVersion?: number;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
  interface User {
    id: number;
    role: string;
    roles?: string[];
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: number;
    role: string;
    roles?: string[];
    tokenVersion?: number;
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours absolute session lifetime
  },
  secret: process.env.NEXTAUTH_SECRET || "fallback-secret-for-dev",
  pages: {
    signIn: "/portal/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const rawIp = req?.headers?.["x-forwarded-for"] || "127.0.0.1";
        const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);

        // IP Throttling for Login
        const rateLimitResult = await rateLimit(`login:${ip}`, 10, 60);
        if (!rateLimitResult.success) {
          throw new Error("Too many login attempts from this network. Please try again shortly.");
        }

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();

        // Find user case-insensitively to handle legacy seeded emails while enforcing normalized comparison
        const user = await prisma.user.findFirst({
          where: {
            Email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
          include: {
            Role: true,
            RoleAssignments: true,
          },
        });

        // Generic failure path to prevent account enumeration
        if (!user || !user.IsActive) {
          return null;
        }

        // Check account lockout (v3 Finding 11)
        if (user.LockedUntil && new Date(user.LockedUntil) > new Date()) {
          throw new Error("Account temporarily locked due to repeated failed attempts. Try again in 15 minutes.");
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.PasswordHash);

        if (!isPasswordValid) {
          const nextAttempts = (user.FailedLoginAttempts || 0) + 1;
          const shouldLock = nextAttempts >= 5;
          await prisma.user.update({
            where: { UserID: user.UserID },
            data: {
              FailedLoginAttempts: nextAttempts,
              LockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : user.LockedUntil,
            },
          }).catch(() => {});

          await prisma.auditLog.create({
            data: {
              ActorID: user.UserID,
              Action: shouldLock ? "ACCOUNT_LOCKOUT" : "LOGIN_FAILED",
              Entity: "User",
              EntityID: String(user.UserID),
              NewValue: { attempts: nextAttempts, locked: shouldLock },
              IpAddress: ip,
            },
          }).catch(() => {});

          return null;
        }

        // Reset failed login counter on successful authentication
        if (user.FailedLoginAttempts > 0 || user.LockedUntil) {
          await prisma.user.update({
            where: { UserID: user.UserID },
            data: {
              FailedLoginAttempts: 0,
              LockedUntil: null,
            },
          }).catch(() => {});
        }

        const assignedRoles = user.RoleAssignments?.map((r) => r.Role) || [];
        const allRoles = Array.from(new Set([user.Role.RoleName, ...assignedRoles]));

        return {
          id: user.UserID,
          email: user.Email,
          role: user.Role.RoleName,
          roles: allRoles,
          tokenVersion: user.TokenVersion ?? 1,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = Number(user.id);
        token.role = user.role as string;
        token.roles = user.roles || [user.role as string];
        token.tokenVersion = user.tokenVersion ?? 1;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = Number(token.id);
        session.user.role = token.role as string;
        session.user.roles = (token.roles as string[]) || [token.role as string];
        session.user.tokenVersion = (token.tokenVersion as number) ?? 1;
      }
      return session;
    },
  },
};
