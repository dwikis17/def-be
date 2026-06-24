import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { balanceOf, writeLedger } from '../../lib/ledger.js';
import { prisma } from '../../db/prisma.js';
import { enqueueClaimTransfer } from '../../services/chain.queue.js';

// Testnet faucet: top up $BLOOM when you're broke so the game stays playable.
const FAUCET_AMOUNT = 1000n;
const FAUCET_THRESHOLD = 200n; // only when you're low
const FAUCET_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * POST /wallet/faucet — grant test $BLOOM when the player is low on funds.
 * Gated by a balance threshold + a 6h cooldown so it isn't an infinite-money tap.
 */
export async function faucet(playerId: string, key: string) {
  return withIdempotency(playerId, key, async (tx) => {
    const balance = await balanceOf(playerId, tx);
    if (balance >= FAUCET_THRESHOLD) {
      throw new AppError('CONFLICT', `The faucet is for when you're low — you still have ${balance} $BLOOM.`);
    }
    const last = await tx.ledger.findFirst({
      where: { playerId, reason: 'faucet' },
      orderBy: { id: 'desc' },
    });
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime();
      if (elapsed < FAUCET_COOLDOWN_MS) {
        const mins = Math.ceil((FAUCET_COOLDOWN_MS - elapsed) / 60_000);
        throw new AppError('RATE_LIMITED', `Faucet on cooldown — try again in ~${mins} min.`);
      }
    }
    await writeLedger(tx, [{ playerId, amount: FAUCET_AMOUNT, reason: 'faucet' }]);
    return { granted: Number(FAUCET_AMOUNT), balance: balance + FAUCET_AMOUNT };
  });
}

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
