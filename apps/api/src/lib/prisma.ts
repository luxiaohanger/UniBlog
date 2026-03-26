import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.PRISMA_LOG ? ['query', 'error'] : ['error'] });

if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;

