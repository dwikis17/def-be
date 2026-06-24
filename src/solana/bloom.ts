import { PublicKey } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { BLOOM_DECIMALS, getBloomMint, getConnection, loadTreasuryKeypair } from './connection.js';
import { AppError } from '../lib/errors.js';

/**
 * Mint $BLOOM SPL tokens to a player's wallet (mint-on-claim model). The
 * treasury keypair holds mint authority. Returns the confirmed tx signature.
 *
 * `uiAmount` is whole $BLOOM (ledger units); scaled by 10^decimals on-chain.
 */
export async function mintBloomTo(ownerPubkey: string, uiAmount: bigint): Promise<string> {
  if (uiAmount <= 0n) throw new AppError('VALIDATION', 'Claim amount must be positive');

  const connection = getConnection();
  const treasury = loadTreasuryKeypair();
  const mint = getBloomMint();
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerPubkey);
  } catch {
    throw new AppError('VALIDATION', 'Player wallet pubkey is invalid');
  }

  // Treasury pays to create the player's ATA if it doesn't exist yet.
  const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, owner);
  const baseAmount = uiAmount * 10n ** BigInt(BLOOM_DECIMALS);

  const signature = await mintTo(connection, treasury, mint, ata.address, treasury, baseAmount);
  return signature;
}

/** The player's $BLOOM associated-token-account address (for display/links). */
export async function bloomAtaFor(ownerPubkey: string): Promise<string> {
  const mint = getBloomMint();
  const ata = await getAssociatedTokenAddress(mint, new PublicKey(ownerPubkey));
  return ata.toBase58();
}
