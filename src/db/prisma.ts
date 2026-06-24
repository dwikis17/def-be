import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

/**
 * Single PrismaClient for the process. In dev, reuse across tsx hot-reloads to
 * avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;

/** A Prisma transaction client (passed into service helpers). */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
