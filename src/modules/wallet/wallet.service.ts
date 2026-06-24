import { Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { balanceOf, writeLedger } from '../../lib/ledger.js';
import { prisma } from '../../db/prisma.js';
import { enqueueClaimTransfer } from '../../services/chain.queue.js';

/**
 * POST /wallet/claim (docs §02 §8). Moves `amount` from the in-game ledger to a
 * 'claim_hold' (debit now), creates a pending Claim, and enqueues the chain
 * transfer. The chain worker settles it idempotently by claimId.
 */
export async function createClaim(playerId: string, key: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw Err.validation('amount must be a positive integer');
  const amt = BigInt(amount);

  return withIdempotency(playerId, key, async (tx) => {
    const balance = await balanceOf(playerId, tx);
    if (balance < amt) throw Err.insufficientBalance();

    const claim = await tx.claim.create({ data: { playerId, amount: amt, status: 'pending' } });
    await writeLedger(tx, [
      { playerId, amount: -amt, reason: 'claim_hold', refType: 'claim', refId: claim.id },
    ]);

    await enqueueClaimTransfer({ claimId: claim.id });
    return { claimId: claim.id, status: claim.status, amount: amt };
  });
}

export async function getClaim(playerId: string, claimId: string) {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim || claim.playerId !== playerId) throw Err.notFound('Claim not found');
  return {
    claimId: claim.id,
    status: claim.status,
    amount: claim.amount,
    signature: claim.txSignature,
    createdAt: claim.createdAt,
    settledAt: claim.settledAt,
  };
}
