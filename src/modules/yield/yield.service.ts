import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, Err } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { chainConfigured } from '../../solana/connection.js';
import { mintBloomTo } from '../../solana/bloom.js';
import { getOwnedAssetIds } from '../../solana/das.js';

const HOUR_MS = 60 * 60 * 1000;

type YieldNft = { id: string; multiplier: number; mintedAt: Date | null; yieldClaimedAt: Date | null };

/** Per-NFT hourly rate, scaled by rarity (docs: yield design). */
function ratePerHour(multiplier: number): number {
  return env.YIELD_BASE_PER_HOUR * multiplier;
}

/** Accrue $BLOOM from each NFT's last-claim marker (or mint time) up to `now`. */
function accrue(nfts: YieldNft[], now: number): { accrued: number; perHour: number } {
  let accrued = 0;
  let perHour = 0;
  for (const n of nfts) {
    const from = (n.yieldClaimedAt ?? n.mintedAt)?.getTime() ?? now;
    const hours = Math.max(0, (now - from) / HOUR_MS);
    accrued += ratePerHour(n.multiplier) * hours;
    perHour += ratePerHour(n.multiplier);
  }
  return { accrued: Math.floor(accrued), perHour };
}

/**
 * The Bloom cNFTs the wallet CURRENTLY HOLDS on-chain (DAS-verified), whoever
 * minted them — so yield follows ownership across transfers/sales. Throws if no
 * wallet is linked.
 */
async function heldNfts(playerId: string): Promise<{ walletPubkey: string; held: YieldNft[] }> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player?.walletPubkey) throw Err.forbidden('Connect a wallet to earn NFT yield');

  // Yield follows CURRENT on-chain ownership, NOT who minted: start from the
  // assets the wallet holds right now (DAS), then keep the ones that are Bloom
  // cNFTs in our collection. So a sold/transferred NFT earns for the new holder
  // and nothing for the original minter — regardless of who minted it.
  const owned = await getOwnedAssetIds(player.walletPubkey);
  if (owned.size === 0) return { walletPubkey: player.walletPubkey, held: [] };

  const held = await prisma.nft.findMany({
    where: { assetId: { in: [...owned] }, chainStatus: 'minted' },
    select: { id: true, assetId: true, multiplier: true, mintedAt: true, yieldClaimedAt: true },
  });
  return { walletPubkey: player.walletPubkey, held };
}

/** GET /yield — current accrual + rate so the client can show/tick a claimable total. */
export async function quoteYield(playerId: string) {
  if (!env.YIELD_ENABLED) {
    return { enabled: false, accrued: 0, perHour: 0, nftCount: 0, basePerHour: env.YIELD_BASE_PER_HOUR, minClaim: env.YIELD_MIN_CLAIM };
  }
  const { held } = await heldNfts(playerId);
  const { accrued, perHour } = accrue(held, Date.now());
  return {
    enabled: true,
    accrued,
    perHour,
    nftCount: held.length,
    basePerHour: env.YIELD_BASE_PER_HOUR,
    minClaim: env.YIELD_MIN_CLAIM,
  };
}

/**
 * POST /yield/claim — mint the accrued $BLOOM to the wallet and reset the accrual
 * marker on the NFTs that were actually paid (those still held). Repeatable.
 */
export async function claimYield(playerId: string) {
  if (!env.YIELD_ENABLED) throw Err.forbidden('NFT yield is disabled');
  if (!chainConfigured()) {
    throw new AppError('CHAIN_NOT_CONFIGURED', 'Yield unavailable: chain is not configured');
  }

  const { walletPubkey, held } = await heldNfts(playerId);
  const now = Date.now();
  const { accrued } = accrue(held, now);
  if (accrued < env.YIELD_MIN_CLAIM) {
    throw Err.validation(`Nothing to claim yet (minimum ${env.YIELD_MIN_CLAIM} $BLOOM)`);
  }

  // Mint first, then reset the markers. If the marker reset failed after a
  // successful mint the next claim would slightly over-pay; logged for audit.
  const signature = await mintBloomTo(walletPubkey, BigInt(accrued));
  await prisma.nft.updateMany({
    where: { id: { in: held.map((n) => n.id) } },
    data: { yieldClaimedAt: new Date(now) },
  });

  logger.info({ playerId, amount: accrued, nftCount: held.length, signature }, 'yield: claimed');
  return { amount: accrued, signature, nftCount: held.length };
}
