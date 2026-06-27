import { prisma } from '../../db/prisma.js';
import { CROP_ORDER, CROPS, GRID_EXPANSIONS, levelFromXp } from '../../game/index.js';

/**
 * GET /shop/catalog — the on-chain price list. Seeds and grid expansions are
 * bought with real $BLOOM on-chain (see /purchase); this endpoint just tells the
 * client what each costs and whether the player has unlocked it. There is no
 * in-game currency and nothing is purchased here.
 */
export async function getCatalog(playerId: string) {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  const level = levelFromXp(player.xp).level;

  return {
    level,
    seeds: CROP_ORDER.map((id) => ({
      id,
      label: CROPS[id].label,
      cost: CROPS[id].seedCost,
      levelRequired: CROPS[id].levelRequired,
      unlocked: level >= CROPS[id].levelRequired,
      purchaseVia: 'purchase/seed',
    })),
    expansions: GRID_EXPANSIONS.filter((e) => e.cost > 0).map((e) => ({
      gridSize: e.gridSize,
      cost: e.cost,
      levelRequired: e.levelRequired,
      unlocked: level >= e.levelRequired,
      purchaseVia: 'purchase/expand',
    })),
  };
}
