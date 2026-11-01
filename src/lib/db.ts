import { PrismaClient } from "@prisma/client";

const NEON_DATABASE_URL =
  "postgresql://neondb_owner:npg_HCF5Druwz9kP@ep-young-paper-ayb1ixkz.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=30";

const resolvedDatabaseUrl = process.env.DATABASE_URL || NEON_DATABASE_URL;

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: resolvedDatabaseUrl,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
