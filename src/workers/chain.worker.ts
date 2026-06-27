import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { publishToPlayer } from '../realtime/pubsub.js';
import type { CnftMintJob, PurchaseVerifyJob } from '../services/chain.queue.js';
import { chainConfigured } from '../solana/connection.js';
import { verifyPurchaseTx, findReferenceSignature } from '../solana/purchase.js';
import { mintBloomCnft, CnftReadbackError } from '../solana/cnft.js';
import { grantSeed } from '../services/inventory.service.js';
import { asPlots, expandPlots, lockGarden, plotsForDb } from '../services/garden.state.js';

/**
 * Chain worker (docs §05). Consumes the cnft_mint and claim_transfer queues.
 *
 * Solana effects are gated on configuration: until the treasury keypair + mint
 * are set, handlers leave rows in 'pending' and the reconcile job surfaces them.
 * Both the claim transfer (SPL mint-on-claim) and the cNFT mint (Bubblegum) are
 * wired; cNFT minting tolerates RPC readback flakiness (see CnftReadbackError).
 *
 * Exported so a re-process path (scripts/retry-failed-nfts.ts) can reuse the
 * exact same logic — re-running a 'failed' or 'pending' row is safe/idempotent.
 */

export async function processCnftMint(job: CnftMintJob): Promise<void> {
  const nft = await prisma.nft.findUnique({ where: { id: job.nftId } });
  if (!nft || nft.chainStatus === 'minted') return; // idempotent
  if (!chainConfigured() || !env.MERKLE_TREE_ADDRESS) {
    logger.warn({ nftId: job.nftId }, 'cnft_mint: chain/tree not configured; leaving pending');
    return;
  }
  const player = await prisma.player.findUnique({ where: { id: nft.playerId } });
  if (!player?.walletPubkey) {
    // The mint job is enqueued the instant a rare crop is harvested, which can
    // race the player's wallet-link write (notably the first mint of a session).
    // THROW so pg-boss retries with backoff — returning here marks the job
    // 'completed' and strands the row at 'pending' until the 15-min reconcile.
    logger.warn({ nftId: nft.id }, 'cnft_mint: player wallet not linked yet; throwing to retry');
    throw new Error(`cnft_mint: player ${nft.playerId} has no wallet yet (retryable)`);
  }

  try {
    const name = (nft.metadata as { name?: string })?.name ?? `${nft.mutationLabel} ${nft.cropId}`;
    const uri = `${env.PUBLIC_BASE_URL}/nfts/${nft.id}/metadata`;
    const { signature, assetId } = await mintBloomCnft(player.walletPubkey, { name, uri });
    await prisma.nft.update({
      where: { id: nft.id },
      data: { chainStatus: 'minted', assetId, txSignature: signature, mintedAt: new Date() },
    });
    publishToPlayer(nft.playerId, { type: 'nft.minted', nftId: nft.id, assetId });
  } catch (err) {
    // The mint tx landed on-chain; only the asset-id readback failed (RPC lag /
    // rate limit). Record the signature and mark minted — re-minting would create
    // a DUPLICATE cNFT. The asset id can be backfilled from the signature later.
    if (err instanceof CnftReadbackError) {
      logger.warn(
        { nftId: nft.id, signature: err.signature },
        'cnft_mint: tx confirmed but asset id unresolved; marking minted (asset id pending backfill)',
      );
      await prisma.nft.update({
        where: { id: nft.id },
        data: { chainStatus: 'minted', txSignature: err.signature, mintedAt: new Date() },
      });
      return;
    }
    // The mint never landed — genuinely failed; safe to retry the whole mint.
    logger.error({ err, nftId: nft.id }, 'cnft_mint failed; marking failed (retryable)');
    await prisma.nft.update({ where: { id: nft.id }, data: { chainStatus: 'failed' } });
  }
}

// A pending intent the player never paid for is expired after this long, so we
// stop polling/re-enqueuing it forever.
const PURCHASE_EXPIRY_MS = 60 * 60 * 1000; // 1h

/**
 * Verify a pending on-chain purchase (buy-to-play) and grant the item. Resolves
 * the payment signature either from what the client submitted OR by discovering
 * it on-chain via the purchase's Solana Pay reference — so a payment is granted
 * exactly-once even if the client died right after paying. Idempotent: the
 * `status !== 'pending'` guard (here and inside the settlement tx) plus the unique
 * txSignature make replays no-ops.
 */
export async function processPurchaseVerify(job: PurchaseVerifyJob): Promise<void> {
  const purchase = await prisma.purchase.findUnique({ where: { id: job.purchaseId } });
  if (!purchase || purchase.status !== 'pending') return; // idempotent
  if (!chainConfigured()) {
    logger.warn({ purchaseId: job.purchaseId }, 'purchase_verify: chain not configured; leaving pending');
    return;
  }

  const player = await prisma.player.findUnique({ where: { id: purchase.playerId } });
  if (!player?.walletPubkey) {
    logger.warn({ purchaseId: purchase.id }, 'purchase_verify: player has no wallet; leaving pending');
    return;
  }

  // Resolve the payment signature: client-submitted (fast path), else discover it
  // on-chain by the reference (recovery path).
  const submitted = purchase.txSignature;
  const signature = submitted ?? (await findReferenceSignature(purchase.reference));
  if (!signature) {
    // No payment seen yet. Expire stale intents the player never paid for; until
    // then THROW so pg-boss retries with backoff (a payment may still be landing).
    if (Date.now() - purchase.createdAt.getTime() > PURCHASE_EXPIRY_MS) {
      await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'expired' } });
      publishToPlayer(purchase.playerId, { type: 'purchase.settled', purchaseId: purchase.id, kind: purchase.kind });
      return;
    }
    throw new Error(`purchase_verify: payment for ${purchase.id} not seen yet (retryable)`);
  }

  const v = await verifyPurchaseTx(signature, player.walletPubkey, purchase.amount, purchase.reference);
  // Not finalized yet — THROW so pg-boss retries with backoff (devnet finality is
  // ~10-30s); the 15-min reconcile is the final backstop.
  if (v.status === 'pending') throw new Error(`purchase_verify: ${purchase.id} tx not finalized yet (retryable)`);
  if (v.status === 'failed') {
    if (submitted) {
      // The client explicitly claimed THIS signature is the payment and it doesn't
      // check out — a definitive failure.
      logger.warn({ purchaseId: purchase.id, reason: v.reason }, 'purchase_verify: submitted tx invalid; marking failed');
      await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'failed' } });
      publishToPlayer(purchase.playerId, { type: 'purchase.settled', purchaseId: purchase.id, kind: purchase.kind });
    } else {
      // A reference-discovered candidate didn't verify (noise on the reference, or
      // the real tx hasn't finalized). Leave pending — expiry eventually closes it.
      logger.warn({ purchaseId: purchase.id, reason: v.reason }, 'purchase_verify: reference candidate did not verify; leaving pending');
    }
    return;
  }

  // Verified — grant the item idempotently, record the signature, mark settled.
  await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.findUnique({ where: { id: purchase.id } });
    if (!p || p.status !== 'pending') return; // replay-safe re-check inside the tx
    await lockGarden(tx, p.playerId);

    if (p.kind === 'seed') {
      await grantSeed(tx, p.playerId, p.itemId, p.quantity);
    } else {
      const garden = await tx.garden.findUniqueOrThrow({ where: { playerId: p.playerId } });
      const target = Number(p.itemId);
      if (garden.gridSize + 1 === target) {
        const plots = expandPlots(asPlots(garden.plots), target);
        await tx.garden.update({
          where: { playerId: p.playerId },
          data: { gridSize: target, plots: plotsForDb(plots) },
        });
      } else {
        // Already at/above target (double-buy or out-of-order). Payment is
        // irreversible and there's no ledger to refund — settle without shrinking.
        logger.warn(
          { purchaseId: p.id, target, current: garden.gridSize },
          'purchase_verify: expand no-op (already expanded)',
        );
      }
    }

    await tx.purchase.update({
      where: { id: p.id },
      data: { status: 'settled', settledAt: new Date(), txSignature: signature },
    });
  });

  publishToPlayer(purchase.playerId, { type: 'purchase.settled', purchaseId: purchase.id, kind: purchase.kind });
}

export async function startChainWorker(boss: PgBoss): Promise<void> {
  await boss.work<CnftMintJob>(QUEUES.cnftMint, async (jobs) => {
    for (const j of jobs) await processCnftMint(j.data);
  });
  await boss.work<PurchaseVerifyJob>(QUEUES.purchaseVerify, async (jobs) => {
    for (const j of jobs) await processPurchaseVerify(j.data);
  });
  logger.info('chain worker registered');
}
