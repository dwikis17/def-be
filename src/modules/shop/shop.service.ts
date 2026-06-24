import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { balanceOf, writeLedger, writeTreasury } from '../../lib/ledger.js';
import { prisma } from '../../db/prisma.js';
import {
  CROP_ORDER,
  CROPS,
  SPRINKLER_ORDER,
  SPRINKLERS,
  PET_ORDER,
  PETS,
  isPetTier,
  levelFromXp,
  type ActivePet,
  type PetTier,
} from '../../game/index.js';
import { gardenView, asPlots } from '../../services/garden.state.js';

/**
 * GET /shop/catalog — every purchasable item with its cost, level gate, and
 * whether the player has unlocked it. Seeds & sprinklers are charged when
 * planted/placed (garden endpoints); pets are bought here.
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
      purchaseVia: 'garden/plant',
    })),
    sprinklers: SPRINKLER_ORDER.map((id) => ({
      id,
      label: SPRINKLERS[id].label,
      cost: SPRINKLERS[id].cost,
      mutationBonus: SPRINKLERS[id].mutationBonus,
      levelRequired: SPRINKLERS[id].levelRequired,
      unlocked: level >= SPRINKLERS[id].levelRequired,
      purchaseVia: 'garden/sprinkler',
    })),
    pets: PET_ORDER.map((id) => ({
      id,
      label: PETS[id].label,
      cost: PETS[id].cost,
      mutationBonus: PETS[id].mutationBonus,
      levelRequired: PETS[id].levelRequired,
      unlocked: level >= PETS[id].levelRequired,
      purchaseVia: 'shop/buy',
    })),
  };
}

/**
 * POST /shop/buy — currently buys + activates a pet (100% burned). Seeds and
 * sprinklers are charged at planting/placement time, so they're rejected here.
 */
export async function buy(playerId: string, key: string, kind: string, id: string) {
  if (kind !== 'pet') {
    throw Err.validation(
      kind === 'seed'
        ? 'Seeds are purchased when you plant them (garden/plant)'
        : kind === 'sprinkler'
          ? 'Sprinklers are purchased when placed (garden/sprinkler)'
          : 'Unknown shop kind',
    );
  }
  if (!isPetTier(id)) throw Err.validation('Unknown pet');

  return withIdempotency(playerId, key, async (tx) => {
    const [garden, player] = await Promise.all([
      tx.garden.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);

    const def = PETS[id as PetTier];
    if (levelFromXp(player.xp).level < def.levelRequired) throw Err.notUnlocked(`${def.label} locked`);

    const current = (garden.activePet as ActivePet | null) ?? null;
    if (current?.tier === id) throw new AppError('CONFLICT', `${def.label} is already active`);

    const cost = BigInt(def.cost);
    const balance = await balanceOf(playerId, tx);
    if (balance < cost) throw Err.insufficientBalance();

    if (cost > 0n) {
      await writeLedger(tx, [
        { playerId, amount: -cost, reason: 'shop_buy', refType: 'pet', refId: id },
      ]);
      await writeTreasury(tx, [{ kind: 'burn', amount: cost, ref: 'pet' }]);
    }

    const activePet: ActivePet = { tier: id as PetTier, level: 1 };
    await tx.garden.update({ where: { playerId }, data: { activePet } });
    await tx.inventory.upsert({
      where: { playerId_kind_itemId_mutationKey: { playerId, kind: 'pet', itemId: id, mutationKey: '' } },
      create: { playerId, kind: 'pet', itemId: id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    return {
      balance: balance - cost,
      activePet,
      garden: gardenView(garden.gridSize, asPlots(garden.plots), activePet),
    };
  });
}
