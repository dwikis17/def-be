import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/** $BLOOM SPL token decimals. A claim of N $BLOOM mints N * 10^9 base units. */
export const BLOOM_DECIMALS = 9;

/** True once the treasury keypair + mint are configured (RPC defaults to cluster). */
export function chainConfigured(): boolean {
  return Boolean(env.BLOOM_MINT_ADDRESS && env.TREASURY_KEYPAIR);
}

let conn: Connection | null = null;
export function getConnection(): Connection {
  if (!conn) {
    const url = env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER);
    conn = new Connection(url, 'confirmed');
  }
  return conn;
}

/**
 * The treasury / mint-authority keypair. Accepts a base58-encoded secret key or
 * a JSON byte array (Solana CLI format). NEVER commit a real key — it lives only
 * in env/secrets.
 */
export function loadTreasuryKeypair(): Keypair {
  const raw = env.TREASURY_KEYPAIR;
  if (!raw) throw new AppError('CHAIN_NOT_CONFIGURED', 'TREASURY_KEYPAIR is not set');
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith('[')) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch {
    throw new AppError('CHAIN_NOT_CONFIGURED', 'TREASURY_KEYPAIR is malformed');
  }
}

export function getBloomMint(): PublicKey {
  if (!env.BLOOM_MINT_ADDRESS) throw new AppError('CHAIN_NOT_CONFIGURED', 'BLOOM_MINT_ADDRESS is not set');
  return new PublicKey(env.BLOOM_MINT_ADDRESS);
}
