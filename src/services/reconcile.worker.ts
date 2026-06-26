import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { economyTotals } from '../lib/ledger.js';
import { enqueueClaimTransfer, enqueueCnftMint } from './chain.queue.js';

const STALE_MINUTES = 15;

/**
 * Reconciliation (docs §06). Periodically checks invariants, recovers drift, and
 * alerts:
 *  - pending claims/mints older than N minutes (chain worker missed the job, or
 *    it was enqueued before the row committed) are RE-ENQUEUED. The chain worker
 *    is idempotent (it no-ops rows already settled/minted), so this is safe and
 *    is the backstop that guarantees a 'pending' claim eventually settles.
 *  - economy totals snapshot for auditing
 *
 * On-chain balance reconciliation (ledger vs minted-on-chain) is added with the
 * Solana phase; the hooks live here.
 */
export async function runReconcile(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_MINUTES * 60 * 1000);

  const [stalePendingClaims, stalePendingNfts, totals] = await Promise.all([
    prisma.claim.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true },
    }),
    prisma.nft.findMany({
      where: { chainStatus: 'pending', createdAt: { lt: cutoff } },
      select: { id: true },
    }),
    economyTotals(),
  ]);

  if (stalePendingClaims.length > 0) {
    logger.warn(
      { stalePendingClaims: stalePendingClaims.length },
      'reconcile: re-enqueuing stale pending claims (>15m)',
    );
    for (const c of stalePendingClaims) await enqueueClaimTransfer({ claimId: c.id });
  }
  if (stalePendingNfts.length > 0) {
    logger.warn(
      { stalePendingNfts: stalePendingNfts.length },
      'reconcile: re-enqueuing stale pending cNFT mints (>15m)',
    );
    for (const n of stalePendingNfts) await enqueueCnftMint({ nftId: n.id });
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
