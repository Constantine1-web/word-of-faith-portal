import { PrismaClient } from "@prisma/client";

function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) {
    throw new Error(
      "CRITICAL_CONFIGURATION_ERROR: DATABASE_URL environment variable must be set. Fallback credentials are strictly prohibited."
    );
  }
  return configured;
}

const resolvedDatabaseUrl = resolveDatabaseUrl();

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
