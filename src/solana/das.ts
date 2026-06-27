import { clusterApiUrl } from '@solana/web3.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/**
 * Metaplex DAS (Digital Asset Standard) read API — the only way to enumerate a
 * wallet's compressed NFTs, since cNFTs live in a Merkle tree, not in token
 * accounts. Requires a DAS-capable RPC (Helius/Triton); the public cluster RPC
 * does NOT implement these methods.
 */
function dasUrl(): string {
  return env.DAS_RPC_URL || env.SOLANA_RPC_URL || clusterApiUrl(env.SOLANA_CLUSTER);
}

type DasResponse = {
  result?: { items?: { id: string }[]; total?: number };
  error?: { message?: string };
};

/**
 * The set of asset ids the wallet currently owns (compressed + regular),
 * paginated through `getAssetsByOwner`. Throws a clear, actionable error when
 * the configured RPC doesn't support DAS so the caller can surface it.
 */
export async function getOwnedAssetIds(owner: string): Promise<Set<string>> {
  const url = dasUrl();
  const ids = new Set<string>();
  const limit = 1000;
  for (let page = 1; page <= 10; page++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'yield-owner',
          method: 'getAssetsByOwner',
          params: { ownerAddress: owner, page, limit },
        }),
      });
    } catch (err) {
      throw new AppError('CHAIN_NOT_CONFIGURED', `DAS RPC unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new AppError(
        'CHAIN_NOT_CONFIGURED',
        `DAS RPC error ${res.status}; set DAS_RPC_URL to a Helius/Triton endpoint`,
      );
    }
    const json = (await res.json()) as DasResponse;
    if (json.error) {
      throw new AppError(
        'CHAIN_NOT_CONFIGURED',
        `getAssetsByOwner unsupported by this RPC (${json.error.message ?? 'method not found'}); set DAS_RPC_URL to a DAS-capable endpoint`,
      );
    }
    const items = json.result?.items ?? [];
    for (const it of items) ids.add(it.id);
    if (items.length < limit) break; // last page
  }
  return ids;
}
