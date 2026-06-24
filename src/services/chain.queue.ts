import { logger } from '../lib/logger.js';
import { QUEUES, getBoss } from '../jobs/boss.js';

/**
 * Chain-job enqueue surface (docs §05). Pushes onto the pg-boss queue consumed
 * by the chain worker. If the queue isn't running (e.g. tests, or DB down), it
 * logs instead — the DB rows (Nft 'pending', Claim 'pending') remain the source
 * of truth so the reconcile job / worker can still pick them up later.
 */
export type CnftMintJob = { nftId: string };
export type ClaimTransferJob = { claimId: string };

async function enqueue(queue: string, data: object): Promise<void> {
  try {
    await getBoss().send(queue, data);
  } catch (err) {
    logger.warn({ err, queue, data }, 'enqueue skipped (queue unavailable); row remains pending');
  }
}

export async function enqueueCnftMint(job: CnftMintJob): Promise<void> {
  await enqueue(QUEUES.cnftMint, job);
}

export async function enqueueClaimTransfer(job: ClaimTransferJob): Promise<void> {
  await enqueue(QUEUES.claimTransfer, job);
}
