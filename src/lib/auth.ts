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

const DUMMY_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oL9.xK0S2";

function resolveNextAuthSecret(): string {
  const configured = process.env.NEXTAUTH_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL_SECURITY_ERROR: NEXTAUTH_SECRET must be configured in production.");
  }
  return configured || "dev-ephemeral-nextauth-secret-local-only-2026";
}

const isProd = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours absolute session lifetime
    updateAge: 60 * 60, // Rotate session token every 1 hour
  },
  secret: resolveNextAuthSecret(),
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
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
        const ip = (Array.isArray(rawIp) ? rawIp[0] : String(rawIp)).split(",")[0].trim();

        // 1. Per-IP Throttling for Login
        const ipRateLimit = await rateLimit(`login:ip:${ip}`, 10, 60);
        if (!ipRateLimit.success) {
          throw new Error("Too many login attempts from this network. Please try again shortly.");
        }

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();

        // 2. Per-Account Throttling for Login (blocks distributed credential stuffing)
        const acctRateLimit = await rateLimit(`login:acct:${normalizedEmail}`, 5, 300);
        if (!acctRateLimit.success) {
          throw new Error("Too many login attempts for this account. Please wait 5 minutes and try again.");
        }

        // Find user case-insensitively to handle legacy seeded emails while enforcing normalized comparison
        let user: any = null;
        try {
          user = await prisma.user.findFirst({
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
        } catch {
          user = await prisma.user.findFirst({
            where: {
              Email: {
                equals: normalizedEmail,
                mode: "insensitive",
              },
            },
            include: {
              Role: true,
            },
          });
        }

        // Generic failure path with constant-time dummy bcrypt check to prevent timing enumeration
        if (!user || !user.IsActive) {
          await bcrypt.compare(credentials.password, DUMMY_BCRYPT_HASH).catch(() => {});
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

        const assignedRoles = user.RoleAssignments?.map((r: any) => r.Role) || [];
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
    async redirect({ url, baseUrl }) {
      // Allow relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allow callback URLs on the same origin
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // Ignore invalid URLs
      }
      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = Number(user.id);
        token.role = user.role as string;
        token.roles = user.roles || [user.role as string];
        token.tokenVersion = user.tokenVersion ?? 1;
      } else if (!token.id && token.sub) {
        token.id = Number(token.sub);
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const resolvedId = Number(token.id ?? token.sub);
        if (!Number.isNaN(resolvedId) && resolvedId > 0) {
          session.user.id = resolvedId;
        }
        session.user.role = (token.role as string) || "Student";
        session.user.roles = (token.roles as string[]) || [session.user.role];
        session.user.tokenVersion = (token.tokenVersion as number) ?? 1;
      }
      return session;
    },
  },
};

