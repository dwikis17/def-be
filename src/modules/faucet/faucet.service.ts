import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, Err } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { chainConfigured } from '../../solana/connection.js';
import { mintBloomTo } from '../../solana/bloom.js';

/** Public faucet config the client uses to show/hide the claim button. */
export function faucetConfig(): { enabled: boolean; amount: number } {
  return { enabled: env.FAUCET_ENABLED, amount: env.FAUCET_AMOUNT };
}

/**
 * Mint FAUCET_AMOUNT $BLOOM straight to the player's wallet. Deliberately
 * repeatable — no once-per-player lock — gated only by the FAUCET_ENABLED
 * kill-switch and an upstream rate limiter. The treasury (mint authority) pays
 * the tx fee and the player's ATA rent on first claim. Returns the tx signature.
 */
export async function claimFaucet(playerId: string): Promise<{ signature: string; amount: number }> {
  if (!env.FAUCET_ENABLED) throw Err.forbidden('Faucet is disabled');
  if (!chainConfigured()) {
    throw new AppError('CHAIN_NOT_CONFIGURED', 'Faucet unavailable: chain is not configured');
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player?.walletPubkey) {
    throw Err.forbidden('Connect a wallet to claim from the faucet');
  }

  const amount = env.FAUCET_AMOUNT;
  const signature = await mintBloomTo(player.walletPubkey, BigInt(amount));
  logger.info({ playerId, wallet: player.walletPubkey, amount, signature }, 'faucet: claimed');
  return { signature, amount };
}
