import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey, none, generateSigner } from '@metaplex-foundation/umi';
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

/** Mint a cNFT to `ownerPubkey`. Returns the tx signature + derived asset id. */
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

  const leaf = await parseLeafFromMintV1Transaction(umi, signature);
  return { signature: bs58.encode(signature), assetId: leaf.id.toString() };
}
