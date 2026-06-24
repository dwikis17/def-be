import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db/prisma.js';
import { AppError } from './errors.js';

/** Recursively convert BigInt → number so a response can be stored as JSON. */
export function toJsonSafe<T>(value: T): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Run a value action exactly once per (playerId, Idempotency-Key).
 *
 *  - If a record already exists, returns the stored response (safe retry).
 *  - Otherwise runs `fn` inside ONE transaction together with the idempotency
 *    record insert, so the ledger writes and the dedupe marker commit atomically.
 *  - A concurrent duplicate (unique violation on commit) re-reads the stored
 *    response instead of double-applying.
 *
 * `fn` receives the transaction client and must perform ALL its writes on it.
 */
export async function withIdempotency<T>(
  playerId: string,
  key: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { playerId_key: { playerId, key } },
  });
  if (existing) return existing.response as T;

  try {
    return await prisma.$transaction(async (tx) => {
      const result = await fn(tx);
      await tx.idempotencyRecord.create({
        data: { playerId, key, response: toJsonSafe(result) as Prisma.InputJsonValue },
      });
      return result;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const rec = await prisma.idempotencyRecord.findUnique({
        where: { playerId_key: { playerId, key } },
      });
      if (rec) return rec.response as T;
    }
    throw e;
  }
}

/** Guard: require an Idempotency-Key for value actions. */
export function requireIdempotencyKey(key: string | undefined): string {
  if (!key || key.trim().length === 0) {
    throw new AppError('IDEMPOTENCY_REQUIRED', 'Idempotency-Key header is required');
  }
  return key.trim();
}
