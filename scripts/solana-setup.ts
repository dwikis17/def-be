/**
 * One-time Solana devnet setup. Creates (or reuses) the treasury keypair and the
 * $BLOOM SPL mint, and prints the values to put in .env:
 *
 *   npx tsx scripts/solana-setup.ts
 *
 * Idempotent-ish: if TREASURY_KEYPAIR is already set it's reused; if
 * BLOOM_MINT_ADDRESS is set the script just reports it.
 *
 * Devnet airdrops are rate-limited; if the airdrop fails, fund the printed
 * treasury address from https://faucet.solana.com and re-run.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import bs58 from 'bs58';
import { env } from '../src/config/env.js';
import { BLOOM_DECIMALS } from '../src/solana/connection.js';
import { createBloomTree } from '../src/solana/cnft.js';

async function ensureFunded(connection: Connection, kp: Keypair): Promise<boolean> {
  const balance = await connection.getBalance(kp.publicKey);
  if (balance >= 0.5 * LAMPORTS_PER_SOL) {
    console.log(`Treasury balance: ${balance / LAMPORTS_PER_SOL} SOL (sufficient)`);
    return true;
  }
  // Devnet airdrop is flaky/rate-limited — retry a few times.
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`Requesting devnet airdrop (1 SOL), attempt ${attempt}/5…`);
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      console.log('Airdrop confirmed.');
      return true;
    } catch (err) {
      console.warn(`  airdrop attempt ${attempt} failed: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.warn(
    `\nAll airdrops failed. Fund the treasury, then re-run this script (it reuses the\n` +
      `keypair printed above):\n` +
      `  solana airdrop 2 ${kp.publicKey.toBase58()} --url devnet\n` +
      `  (or paste the address into https://faucet.solana.com)`,
  );
  return false;
}

async function main() {
  const connection = new Connection(env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER), 'confirmed');

  const treasury = env.TREASURY_KEYPAIR
    ? Keypair.fromSecretKey(
        env.TREASURY_KEYPAIR.trim().startsWith('[')
          ? Uint8Array.from(JSON.parse(env.TREASURY_KEYPAIR))
          : bs58.decode(env.TREASURY_KEYPAIR.trim()),
      )
    : Keypair.generate();

  console.log(`Cluster: ${env.SOLANA_CLUSTER}`);
  console.log(`Treasury pubkey: ${treasury.publicKey.toBase58()}`);
  // Print the secret up front so it can be saved to .env even if funding fails.
  console.log(`TREASURY_KEYPAIR=${bs58.encode(treasury.secretKey)}\n`);

  const funded = await ensureFunded(connection, treasury);
  if (!funded) process.exit(1);

  let mintAddress = env.BLOOM_MINT_ADDRESS;
  if (mintAddress) {
    console.log(`BLOOM_MINT_ADDRESS already set: ${mintAddress}`);
  } else {
    console.log('Creating $BLOOM mint…');
    const mint = await createMint(connection, treasury, treasury.publicKey, null, BLOOM_DECIMALS);
    mintAddress = mint.toBase58();
    console.log(`Created mint: ${mintAddress}`);
  }

  let treeAddress = env.MERKLE_TREE_ADDRESS;
  if (treeAddress) {
    console.log(`MERKLE_TREE_ADDRESS already set: ${treeAddress}`);
  } else {
    console.log('Creating Merkle tree for cNFTs…');
    try {
      treeAddress = await createBloomTree();
      console.log(`Created tree: ${treeAddress}`);
    } catch (err) {
      console.warn(`Tree creation failed (${(err as Error).message}). Re-run after the mint exists.`);
      treeAddress = '';
    }
  }

  console.log('\n── Add these to be/.env ─────────────────────────────────');
  console.log(`TREASURY_KEYPAIR=${bs58.encode(treasury.secretKey)}`);
  console.log(`BLOOM_MINT_ADDRESS=${mintAddress}`);
  if (treeAddress) console.log(`MERKLE_TREE_ADDRESS=${treeAddress}`);
  console.log(`SOLANA_RPC_URL=${env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER)}`);
  console.log('─────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
