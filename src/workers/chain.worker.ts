import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { publishToPlayer } from '../realtime/pubsub.js';
import type { CnftMintJob, ClaimTransferJob } from '../services/chain.queue.js';
import { chainConfigured } from '../solana/connection.js';
import { mintBloomTo } from '../solana/bloom.js';
import { mintBloomCnft, CnftReadbackError } from '../solana/cnft.js';

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
    logger.warn({ nftId: nft.id }, 'cnft_mint: player has no wallet; leaving pending');
    return;
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

async function processClaimTransfer(job: ClaimTransferJob): Promise<void> {
  const claim = await prisma.claim.findUnique({ where: { id: job.claimId } });
  if (!claim || claim.status !== 'pending') return; // idempotent
  if (!chainConfigured()) {
    logger.warn({ claimId: job.claimId }, 'claim_transfer: chain not configured; leaving pending');
    return;
  }

  const player = await prisma.player.findUnique({ where: { id: claim.playerId } });
  if (!player?.walletPubkey) {
    logger.warn({ claimId: claim.id }, 'claim_transfer: player has no wallet; leaving pending');
    return;
  }

  let txSignature: string;
  try {
    // Mint-on-claim: treasury (mint authority) mints $BLOOM to the player's ATA.
    txSignature = await mintBloomTo(player.walletPubkey, claim.amount);
  } catch (err) {
    // Permanent failure → release the hold (credit back) and mark failed.
    logger.error({ err, claimId: claim.id }, 'claim_transfer failed; releasing hold');
    await prisma.$transaction(async (tx) => {
      await tx.ledger.create({
        data: {
          playerId: claim.playerId,
          amount: claim.amount,
          reason: 'claim_release',
          refType: 'claim',
          refId: claim.id,
        },
      });
      await tx.claim.update({ where: { id: claim.id }, data: { status: 'failed' } });
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ledger.create({
      data: {
        playerId: claim.playerId,
        amount: 0n, // settlement moves off-ledger to chain; hold already debited
        reason: 'claim_settle',
        refType: 'claim',
        refId: claim.id,
      },
    });
    await tx.claim.update({
      where: { id: claim.id },
      data: { status: 'settled', txSignature, settledAt: new Date() },
    });
  });
  publishToPlayer(claim.playerId, { type: 'claim.settled', claimId: claim.id, signature: txSignature });
}

export async function startChainWorker(boss: PgBoss): Promise<void> {
  await boss.work<CnftMintJob>(QUEUES.cnftMint, async (jobs) => {
    for (const j of jobs) await processCnftMint(j.data);
  });
  await boss.work<ClaimTransferJob>(QUEUES.claimTransfer, async (jobs) => {
    for (const j of jobs) await processClaimTransfer(j.data);
  });
  logger.info('chain worker registered');
}
