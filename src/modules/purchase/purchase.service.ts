import { Prisma } from '@prisma/client';
import { Keypair } from '@solana/web3.js';
import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { prisma } from '../../db/prisma.js';
import {
  CROPS,
  GRID_EXPANSIONS,
  MAX_GRID_SIZE,
  isCropId,
  levelFromXp,
} from '../../game/index.js';
import { BLOOM_DECIMALS, getBloomMint, loadTreasuryKeypair } from '../../solana/connection.js';
import { bloomAtaFor } from '../../solana/bloom.js';
import { toBaseUnits } from '../../solana/purchase.js';
import { enqueuePurchaseVerify } from '../../services/chain.queue.js';

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Where to pay + how to denominate it — included in every intent response. */
async function payInfo() {
  return {
    vaultAta: await bloomAtaFor(loadTreasuryKeypair().publicKey.toBase58()),
    mint: getBloomMint().toBase58(),
    decimals: BLOOM_DECIMALS,
  };
}

type IntentResult = {
  purchaseId: string;
  reference: string;
  uiAmount: number;
  vaultAta: string;
  mint: string;
  decimals: number;
};

/**
 * Create a pending purchase BEFORE any on-chain payment (Solana Pay flow). Returns
 * a unique `reference` pubkey the client must attach to its $BLOOM transfer; the
 * backend can then find + verify the payment on-chain even if the client crashes
 * after paying. No money has moved yet.
 */
async function createIntent(
  playerId: string,
  key: string,
  kind: 'seed' | 'expand',
  itemId: string,
  quantity: number,
  uiAmount: number,
): Promise<IntentResult> {
  const info = await payInfo();
  const result = await withIdempotency(playerId, key, async (tx) => {
    const reference = Keypair.generate().publicKey.toBase58();
    try {
      const purchase = await tx.purchase.create({
        data: {
          playerId,
          kind,
          itemId,
          quantity,
          amount: toBaseUnits(uiAmount),
          reference,
          status: 'pending',
        },
      });
      return { purchaseId: purchase.id, reference };
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Reference collision — retry');
      throw e;
    }
  });
  return { ...result, uiAmount, ...info };
}

export async function createSeedIntent(playerId: string, key: string, cropId: string, qty: number) {
  if (!isCropId(cropId)) throw Err.validation('Unknown crop');
  if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw Err.validation('qty must be 1..99');

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  const crop = CROPS[cropId];
  if (levelFromXp(player.xp).level < crop.levelRequired) throw Err.notUnlocked(`${crop.label} locked`);

  return createIntent(playerId, key, 'seed', cropId, qty, qty * crop.seedCost);
}

export async function createExpandIntent(playerId: string, key: string, gridSize: number) {
  const garden = await prisma.garden.findUniqueOrThrow({ where: { playerId } });
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });

  if (gridSize !== garden.gridSize + 1 || gridSize > MAX_GRID_SIZE) {
    throw Err.validation('Can only expand to the next grid size');
  }
  const expansion = GRID_EXPANSIONS.find((e) => e.gridSize === gridSize);
  if (!expansion || expansion.cost <= 0) throw Err.validation('Invalid grid size');
  if (levelFromXp(player.xp).level < expansion.levelRequired) {
    throw Err.notUnlocked(`Grid ${gridSize}×${gridSize} locked`);
  }

  return createIntent(playerId, key, 'expand', String(gridSize), 1, expansion.cost);
}

/**
 * POST /purchase/:id/submit — the client reports it has paid. `signature` is
 * best-effort: if the client has it we attach it (fast path); if not (its send
 * threw after the tx landed) we still enqueue a verify, which discovers the tx by
 * reference. Either way the purchase becomes recoverable.
 */
export async function attachSignature(playerId: string, purchaseId: string, signature?: string) {
  const p = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!p || p.playerId !== playerId) throw Err.notFound('Purchase not found');

  if (signature && p.status === 'pending' && !p.txSignature) {
    try {
      await prisma.purchase.update({ where: { id: p.id }, data: { txSignature: signature } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // signature already attached elsewhere — ignore
    }
  }
  await enqueuePurchaseVerify({ purchaseId: p.id });
  return { purchaseId: p.id, status: p.status };
}

export async function getPurchase(playerId: string, purchaseId: string) {
  const p = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!p || p.playerId !== playerId) throw Err.notFound('Purchase not found');
  return {
    purchaseId: p.id,
    kind: p.kind,
    itemId: p.itemId,
    quantity: p.quantity,
    status: p.status,
    signature: p.txSignature,
    createdAt: p.createdAt,
    settledAt: p.settledAt,
  };
}
