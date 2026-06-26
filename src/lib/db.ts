import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        // Enforce strict connection limits to prevent SQLite lock exhaustion
        // In a Postgres environment, this acts as the pooler config (e.g. ?connection_limit=5&pool_timeout=10)
        url: process.env.DATABASE_URL + "?connection_limit=1&socket_timeout=10",
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
