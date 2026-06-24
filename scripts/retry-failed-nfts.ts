/**
 * Re-process cNFTs stuck in 'failed' (or 'pending') through the chain worker's
 * mint path — now with robust asset-id readback (retries + CnftReadbackError).
 *
 *   npx tsx scripts/retry-failed-nfts.ts
 *
 * NOTE: a 'failed' row created before this fix has no stored txSignature, so it
 * is re-minted from scratch. If that original mint tx had actually landed
 * on-chain, this creates a DUPLICATE cNFT (harmless on devnet). Going forward,
 * partial failures store the signature and are marked 'minted', so they are not
 * re-minted.
 */
import { prisma } from '../src/db/prisma.js';
import { processCnftMint } from '../src/workers/chain.worker.js';

async function main() {
  const rows = await prisma.nft.findMany({
    where: { chainStatus: { in: ['failed', 'pending'] } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${rows.length} NFT(s) to retry.\n`);

  for (const nft of rows) {
    console.log(`Retrying ${nft.mutationLabel} ${nft.cropId} (${nft.id}) [was ${nft.chainStatus}]…`);
    try {
      await processCnftMint({ nftId: nft.id });
    } catch (err) {
      console.error(`  processCnftMint threw: ${(err as Error).message}`);
    }
    const after = await prisma.nft.findUnique({ where: { id: nft.id } });
    console.log(
      `  → now: ${after?.chainStatus}  assetId=${after?.assetId ?? '(pending backfill)'}  sig=${after?.txSignature ?? '-'}\n`,
    );
    // Ease off the (rate-limited) public devnet RPC between mints.
    await new Promise((r) => setTimeout(r, 1500));
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
