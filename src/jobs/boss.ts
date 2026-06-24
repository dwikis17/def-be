import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * pg-boss is our Postgres-backed job queue + scheduler (Postgres-only infra).
 *
 * IMPORTANT: pg-boss needs a SESSION connection (LISTEN/NOTIFY, advisory locks),
 * which Supabase's transaction-mode PgBouncer pooler (port 6543) does NOT
 * support. So it connects via DIRECT_URL (port 5432) when available.
 */
let boss: PgBoss | null = null;

export const QUEUES = {
  weatherTick: 'weather-tick',
  leaderboardRollover: 'leaderboard-rollover',
  reconcile: 'reconcile',
  cnftMint: 'cnft_mint',
  claimTransfer: 'claim_transfer',
} as const;

export async function startJobQueue(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  boss = new PgBoss({ connectionString, schema: 'pgboss' });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  // Ensure all queues exist before scheduling/working them. Sequential, not
  // parallel: pg-boss runs schema DDL on first createQueue and concurrent calls
  // deadlock on the catalog.
  for (const q of Object.values(QUEUES)) {
    await boss.createQueue(q);
  }
  logger.info('pg-boss started');
  return boss;
}

export function getBoss(): PgBoss {
  if (!boss) throw new Error('Job queue not started');
  return boss;
}

export async function stopJobQueue(): Promise<void> {
  await boss?.stop();
  boss = null;
}
