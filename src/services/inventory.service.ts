import { prisma, type Tx } from '../db/prisma.js';
import { CROPS, isCropId } from '../game/index.js';

type Client = Tx | typeof prisma;

const SEED_KIND = 'seed';

/**
 * Add `qty` seeds of a crop to the player's inventory (within a tx). Seeds are
 * bought on-chain (see modules/purchase) and consumed at plant time. `mutationKey`
 * is '' for seeds (they have no tier until planted + harvested).
 */
export async function grantSeed(
  tx: Tx,
  playerId: string,
  cropId: string,
  qty = 1,
): Promise<void> {
  await tx.inventory.upsert({
    where: {
      playerId_kind_itemId_mutationKey: {
        playerId,
        kind: SEED_KIND,
        itemId: cropId,
        mutationKey: '',
      },
    },
    create: { playerId, kind: SEED_KIND, itemId: cropId, mutationKey: '', quantity: qty },
    update: { quantity: { increment: qty } },
  });
}

export type InventoryItem = {
  cropId: string;
  label: string;
  quantity: number;
};

/** The player's owned seeds (kind 'seed', quantity > 0). */
export async function getInventory(
  playerId: string,
  client: Client = prisma,
): Promise<InventoryItem[]> {
  const rows = await client.inventory.findMany({
    where: { playerId, kind: SEED_KIND, quantity: { gt: 0 } },
    orderBy: [{ itemId: 'asc' }],
  });
  return rows.map((r: { itemId: string; quantity: number }) => ({
    cropId: r.itemId,
    label: isCropId(r.itemId) ? CROPS[r.itemId].label : r.itemId,
    quantity: r.quantity,
  }));
}
