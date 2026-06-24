import { prisma, type Tx } from '../db/prisma.js';
import { AppError, Err } from '../lib/errors.js';
import { withIdempotency } from '../lib/idempotency.js';
import { balanceOf, writeLedger } from '../lib/ledger.js';
import { CROPS, MUTATIONS, isCropId, type CropId, type MutationTier } from '../game/index.js';

type Client = Tx | typeof prisma;

const INVENTORY_KIND = 'harvest';

function isBaseTier(key: string): key is MutationTier {
  return key in MUTATIONS;
}

/**
 * Sell value of one produce unit = floor(baseHarvest × tier multiplier). Produce
 * only ever holds base tiers (rare/hybrid tiers mint cNFTs, not produce), so the
 * MUTATIONS lookup is sufficient.
 */
export function produceUnitValue(cropId: string, mutationKey: string): number {
  if (!isCropId(cropId)) throw Err.validation('Unknown crop');
  if (!isBaseTier(mutationKey)) throw Err.validation('Unknown or non-fungible mutation tier');
  return Math.floor(CROPS[cropId].baseHarvest * MUTATIONS[mutationKey].multiplier);
}

/** Add `qty` of a harvested produce item to the player's inventory (within a tx). */
export async function depositProduce(
  tx: Tx,
  playerId: string,
  cropId: CropId,
  mutationKey: MutationTier,
  qty = 1,
): Promise<void> {
  await tx.inventory.upsert({
    where: {
      playerId_kind_itemId_mutationKey: {
        playerId,
        kind: INVENTORY_KIND,
        itemId: cropId,
        mutationKey,
      },
    },
    create: { playerId, kind: INVENTORY_KIND, itemId: cropId, mutationKey, quantity: qty },
    update: { quantity: { increment: qty } },
  });
}

export type InventoryItem = {
  cropId: string;
  label: string;
  mutationKey: string;
  mutationLabel: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
};

/** The player's sellable produce (kind 'harvest', quantity > 0). */
export async function getInventory(
  playerId: string,
  client: Client = prisma,
): Promise<InventoryItem[]> {
  const rows = await client.inventory.findMany({
    where: { playerId, kind: INVENTORY_KIND, quantity: { gt: 0 } },
    orderBy: [{ itemId: 'asc' }, { mutationKey: 'asc' }],
  });
  return rows.map((r: { itemId: string; mutationKey: string; quantity: number }) => {
    const unitValue = produceUnitValue(r.itemId, r.mutationKey);
    return {
      cropId: r.itemId,
      label: isCropId(r.itemId) ? CROPS[r.itemId].label : r.itemId,
      mutationKey: r.mutationKey,
      mutationLabel: isBaseTier(r.mutationKey) ? MUTATIONS[r.mutationKey].label : r.mutationKey,
      quantity: r.quantity,
      unitValue,
      totalValue: unitValue * r.quantity,
    };
  });
}

/** POST /inventory/sell — vendor sell at full value; credits $BLOOM, decrements inventory. */
export async function sellProduce(
  playerId: string,
  key: string,
  cropId: string,
  mutationTier: string,
  qty: number,
) {
  if (!Number.isInteger(qty) || qty <= 0) throw Err.validation('qty must be a positive integer');
  const unitValue = produceUnitValue(cropId, mutationTier); // validates crop + tier

  return withIdempotency(playerId, key, async (tx) => {
    const row = await tx.inventory.findUnique({
      where: {
        playerId_kind_itemId_mutationKey: {
          playerId,
          kind: INVENTORY_KIND,
          itemId: cropId,
          mutationKey: mutationTier,
        },
      },
    });
    if (!row || row.quantity < qty) {
      throw new AppError('CONFLICT', 'You do not have that many to sell');
    }

    await tx.inventory.update({ where: { id: row.id }, data: { quantity: { decrement: qty } } });

    const total = BigInt(unitValue * qty);
    await writeLedger(tx, [
      { playerId, amount: total, reason: 'produce_sell', refType: 'produce', refId: `${cropId}:${mutationTier}` },
    ]);

    const balance = await balanceOf(playerId, tx);
    return { sold: qty, unitValue, total, balance };
  });
}
