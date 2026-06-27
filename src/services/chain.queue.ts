import { logger } from '../lib/logger.js';
import { QUEUES, getBoss } from '../jobs/boss.js';

/**
 * Chain-job enqueue surface (docs §05). Pushes onto the pg-boss queue consumed
 * by the chain worker. If the queue isn't running (e.g. tests, or DB down), it
 * logs instead — the DB rows (Nft 'pending', Claim 'pending') remain the source
 * of truth so the reconcile job / worker can still pick them up later.
 */
export type CnftMintJob = { nftId: string };
export type PurchaseVerifyJob = { purchaseId: string };

/**
 * Retry-with-backoff for chain jobs. The mint/transfer is enqueued the instant a
 * harvest/claim commits, which can race a not-yet-committed wallet link (see the
 * wallet guard in chain.worker). A thrown handler error retries on this schedule
 * — 5s, 10s, 20s … — so a transient miss self-heals in seconds instead of being
 * stranded at 'pending' until the 15-min reconcile sweep (still the backstop).
 */
const CHAIN_RETRY = { retryLimit: 8, retryDelay: 5, retryBackoff: true } as const;

async function enqueue(queue: string, data: object): Promise<void> {
  try {
    await getBoss().send(queue, data, CHAIN_RETRY);
  } catch (err) {
    logger.warn({ err, queue, data }, 'enqueue skipped (queue unavailable); row remains pending');
  }
}

export async function enqueueCnftMint(job: CnftMintJob): Promise<void> {
  await enqueue(QUEUES.cnftMint, job);
}

export async function enqueuePurchaseVerify(job: PurchaseVerifyJob): Promise<void> {
  await enqueue(QUEUES.purchaseVerify, job);
}
