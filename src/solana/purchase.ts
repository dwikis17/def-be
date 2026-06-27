import { PublicKey } from '@solana/web3.js';
import type { ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import { BLOOM_DECIMALS, getBloomMint, getConnection, loadTreasuryKeypair } from './connection.js';
import { bloomAtaFor } from './bloom.js';

/**
 * Result of verifying an on-chain purchase transfer.
 *  - 'verified' : confirmed + every field matched → safe to grant the item.
 *  - 'pending'  : not yet finalized / not found → leave the row pending, retry later.
 *  - 'failed'   : confirmed but the tx errored or a field mismatched → mark failed.
 */
export type VerifyResult =
  | { status: 'verified' }
  | { status: 'pending' }
  | { status: 'failed'; reason: string };

function isParsed(ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction {
  return 'parsed' in ix;
}

/**
 * Find the most recent successful signature that touched `reference` (a Solana
 * Pay reference pubkey we attach to the transfer). This lets the backend locate
 * the payment on-chain EVEN IF the client never reports it back — the basis of
 * recoverable purchases. Returns null if no candidate exists yet.
 */
export async function findReferenceSignature(reference: string): Promise<string | null> {
  let ref: PublicKey;
  try {
    ref = new PublicKey(reference);
  } catch {
    return null;
  }
  const sigs = await getConnection().getSignaturesForAddress(ref, { limit: 10 });
  const ok = sigs.find((s) => !s.err);
  return ok?.signature ?? null;
}

/**
 * Verify that `signature` is a finalized SPL transfer of EXACTLY `expectedBaseUnits`
 * $BLOOM from the player's wallet into the treasury vault ATA, and that it carries
 * `reference` (binding this exact tx to this exact purchase). The client supplies
 * the amount via the purchase intent, but it is NEVER trusted — it is cross-checked
 * against the on-chain instruction in base units.
 *
 * Uses 'finalized' commitment: real value is moving inbound, so we protect against
 * reorgs (stronger than the 'confirmed' default on getConnection()).
 */
export async function verifyPurchaseTx(
  signature: string,
  expectedOwnerPubkey: string,
  expectedBaseUnits: bigint,
  reference: string,
): Promise<VerifyResult> {
  const connection = getConnection();
  const tx = await connection.getParsedTransaction(signature, {
    commitment: 'finalized',
    maxSupportedTransactionVersion: 0,
  });

  // Not indexed / not finalized yet — retry on the next sweep.
  if (!tx) return { status: 'pending' };
  if (tx.meta?.err) return { status: 'failed', reason: 'tx_error' };

  // The reference pubkey must appear in the tx — proves THIS tx is for THIS purchase.
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (!keys.includes(reference)) return { status: 'failed', reason: 'reference_absent' };

  const mint = getBloomMint().toBase58();
  const vaultAta = await bloomAtaFor(loadTreasuryKeypair().publicKey.toBase58());

  // Scan top-level + inner instructions for the matching spl-token transfer.
  const inner = tx.meta?.innerInstructions?.flatMap((i) => i.instructions) ?? [];
  const all = [...tx.transaction.message.instructions, ...inner];

  for (const ix of all) {
    if (!isParsed(ix)) continue;
    if (ix.program !== 'spl-token') continue;
    const { type, info } = ix.parsed as { type?: string; info?: Record<string, unknown> };
    if (type !== 'transferChecked' && type !== 'transfer') continue;
    if (!info) continue;

    const destination = info.destination as string | undefined;
    const authority = (info.authority ?? info.multisigAuthority) as string | undefined;
    const ixMint = info.mint as string | undefined;
    const amount =
      (info.tokenAmount as { amount?: string } | undefined)?.amount ??
      (info.amount as string | undefined);

    if (destination !== vaultAta) continue; // not paid to the vault — ignore
    if (authority !== expectedOwnerPubkey) continue; // not signed by the player
    if (ixMint !== undefined && ixMint !== mint) continue; // wrong token
    if (amount === undefined) continue;
    if (BigInt(amount) !== expectedBaseUnits) {
      return { status: 'failed', reason: 'amount_mismatch' };
    }
    return { status: 'verified' };
  }

  return { status: 'failed', reason: 'no_matching_transfer' };
}

/** Base units (10^decimals) for a whole-$BLOOM ui amount. */
export function toBaseUnits(uiAmount: number | bigint): bigint {
  return BigInt(uiAmount) * 10n ** BigInt(BLOOM_DECIMALS);
}
