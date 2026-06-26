import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./db";
import bcrypt from "bcryptjs";
import { rateLimit } from "./rateLimit";

declare module "next-auth" {
  interface Session {
    user: { id: number; role: string; email?: string | null; name?: string | null; image?: string | null };
  }
  interface User {
    id: number; role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: number;
    role: string;
  }
}


export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        // IP Throttling for Login
        const ip = req?.headers?.["x-forwarded-for"] || "127.0.0.1";
        const rateLimitResult = await rateLimit(`login:${ip}`, 5, 60); // 5 attempts per minute
        
        if (!rateLimitResult.success) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { Email: credentials.email },
          include: { Role: true }
        });

        if (!user || !user.IsActive) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.PasswordHash);

        if (!isPasswordValid) {
          return null;
        }

        // Locking down payload to essential fields only
        return {
          id: user.UserID,
          email: user.Email,
          role: user.Role.RoleName,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = Number(user.id);
        token.role = user.role as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as string;
      }
      return session;
    }
  }
};
