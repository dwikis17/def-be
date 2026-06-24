import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey, none, generateSigner, type Umi } from '@metaplex-foundation/umi';
import {
  mplBubblegum,
  createTree,
  mintV1,
  parseLeafFromMintV1Transaction,
} from '@metaplex-foundation/mpl-bubblegum';
import { clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { loadTreasuryKeypair } from './connection.js';

/**
 * Compressed NFTs via Metaplex Bubblegum (docs §05). Rare harvests (Shocked+)
 * mint a cNFT into a pre-allocated Merkle tree — cheap at scale. The treasury
 * keypair is the tree authority + minter.
 */
function getUmi() {
  const rpc = env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER);
  const umi = createUmi(rpc).use(mplBubblegum());
  const treasury = loadTreasuryKeypair();
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(treasury.secretKey)));
  return umi;
}

/** Allocate a Merkle tree to hold cNFTs. Returns its address. One-time setup. */
export async function createBloomTree(): Promise<string> {
  const umi = getUmi();
  const merkleTree = generateSigner(umi);
  const builder = await createTree(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64 });
  await builder.sendAndConfirm(umi);
  return merkleTree.publicKey.toString();
}

export type CnftMeta = { name: string; uri: string };

/**
 * Thrown when the cNFT mint transaction confirmed on-chain but the new leaf
 * (asset id) could not be read back — typically RPC indexing lag or rate limits
 * on `getTransaction`. Carries the confirmed `signature` so the caller can record
 * it and mark the NFT minted, instead of re-minting (which would duplicate it).
 */
export class CnftReadbackError extends Error {
  constructor(
    message: string,
    readonly signature: string,
  ) {
    super(message);
    this.name = 'CnftReadbackError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the new leaf / asset id from a confirmed mint tx, retrying through RPC
 * indexing lag and rate limits (the tx isn't always parseable the instant
 * sendAndConfirm resolves). Backoff: 0.5, 1, 2, 4, 8, 8s.
 */
async function resolveAssetId(umi: Umi, signature: Uint8Array): Promise<string> {
  const sigB58 = bs58.encode(signature);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const leaf = await parseLeafFromMintV1Transaction(umi, signature);
      return leaf.id.toString();
    } catch (err) {
      lastErr = err;
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new CnftReadbackError(
    `cNFT minted (sig ${sigB58}) but asset id unresolved after retries: ${(lastErr as Error)?.message}`,
    sigB58,
  );
}

/**
 * Mint a cNFT to `ownerPubkey`. Returns the tx signature + derived asset id.
 *
 * Two distinct failure modes the caller must treat differently:
 * - `mintV1(...).sendAndConfirm` throws → the mint never landed; safe to retry.
 * - `resolveAssetId` throws `CnftReadbackError` → the mint DID land; only the
 *   asset-id readback failed. Record the signature; do NOT re-mint.
 */
export async function mintBloomCnft(
  ownerPubkey: string,
  meta: CnftMeta,
): Promise<{ signature: string; assetId: string }> {
  if (!env.MERKLE_TREE_ADDRESS) {
    throw new AppError('CHAIN_NOT_CONFIGURED', 'MERKLE_TREE_ADDRESS is not set');
  }
  const umi = getUmi();
  const merkleTree = publicKey(env.MERKLE_TREE_ADDRESS);

  const { signature } = await mintV1(umi, {
    leafOwner: publicKey(ownerPubkey),
    merkleTree,
    metadata: {
      name: meta.name.slice(0, 32), // on-chain name cap
      uri: meta.uri,
      sellerFeeBasisPoints: 0,
      collection: none(),
      creators: [],
    },
  }).sendAndConfirm(umi);

  const assetId = await resolveAssetId(umi, signature);
  return { signature: bs58.encode(signature), assetId };
}
