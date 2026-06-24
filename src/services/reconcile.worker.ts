import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { economyTotals } from '../lib/ledger.js';

const STALE_MINUTES = 15;

/**
 * Reconciliation (docs §06). Periodically checks invariants and alerts on drift:
 *  - pending claims/mints older than N minutes (chain worker stuck / unconfigured)
 *  - economy totals snapshot for auditing
 *
 * On-chain balance reconciliation (ledger vs minted-on-chain) is added with the
 * Solana phase; the hooks live here.
 */
export async function runReconcile(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_MINUTES * 60 * 1000);

  const [stalePendingClaims, stalePendingNfts, totals] = await Promise.all([
    prisma.claim.count({ where: { status: 'pending', createdAt: { lt: cutoff } } }),
    prisma.nft.count({ where: { chainStatus: 'pending', createdAt: { lt: cutoff } } }),
    economyTotals(),
  ]);

  if (stalePendingClaims > 0) {
    logger.warn({ stalePendingClaims }, 'reconcile: stale pending claims (>15m)');
  }
  if (stalePendingNfts > 0) {
    logger.warn({ stalePendingNfts }, 'reconcile: stale pending cNFT mints (>15m)');
  }

  logger.info(
    {
      totalBurned: totals.totalBurned.toString(),
      rewardPool: totals.rewardPool.toString(),
      treasury: totals.treasury.toString(),
      circulating: totals.circulating.toString(),
    },
    'reconcile snapshot',
  );
}

/** Register the reconcile job (every 15 minutes). */
export async function startReconcileScheduler(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.reconcile, async () => {
    await runReconcile();
  });
  await boss.schedule(QUEUES.reconcile, '*/15 * * * *');
}
