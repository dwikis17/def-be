import type { CropId, MutationResult, PetTier, Rarity, SprinklerTier } from './types.js';
import { CROPS, CROP_ORDER } from './crops.js';
import { SPRINKLERS, SPRINKLER_ORDER } from './sprinklers.js';
import { PETS, PET_ORDER } from './pets.js';
import { GRID_EXPANSIONS } from './grid.js';

/** XP required to clear a given level — docs §03: getXpForLevel(L) = L * 100. */
export function getXpForLevel(level: number): number {
  return level * 100;
}

/** XP rewards — docs §03. */
export const XP_REWARDS = {
  harvest: 5,
  harvestWithMutation: 15,
  harvestEpicPlus: 50,
  harvestLegendaryPlus: 200,
  dailyWatering: 20,
  marketSell: 10,
} as const;

/** Daily watering XP cap (anti-grind; docs §02/§06). */
export const DAILY_WATERING_XP_CAP = 200;

export type LevelInfo = { level: number; intoLevel: number; levelNeed: number; totalXp: number };

/** Resolve total XP into a level + progress within it. */
export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let need = getXpForLevel(level);
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = getXpForLevel(level);
  }
  return { level, intoLevel: remaining, levelNeed: need, totalXp: Math.max(0, totalXp) };
}

/** XP awarded for a harvest, scaled by the outcome's rarity. */
export function harvestXp(result: MutationResult): number {
  switch (result.rarity) {
    case 'common':
      return XP_REWARDS.harvest;
    case 'uncommon':
    case 'rare':
      return XP_REWARDS.harvestWithMutation;
    case 'epic':
      return XP_REWARDS.harvestEpicPlus;
    case 'legendary':
    case 'mythic':
      return XP_REWARDS.harvestLegendaryPlus;
    default:
      return XP_REWARDS.harvest;
  }
}

const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export function rarityAtLeast(r: Rarity, min: Rarity): boolean {
  return RARITY_RANK[r] >= RARITY_RANK[min];
}

// ── Unlock gates ─────────────────────────────────────────────────────────────
export function canPlantCrop(level: number, cropId: CropId): boolean {
  return level >= CROPS[cropId].levelRequired;
}
export function canBuySprinkler(level: number, tier: SprinklerTier): boolean {
  return level >= SPRINKLERS[tier].levelRequired;
}
export function canBuyPet(level: number, tier: PetTier): boolean {
  return level >= PETS[tier].levelRequired;
}

/** Everything a player has unlocked at a given level (for the shop catalog). */
export function unlocksForLevel(level: number): {
  crops: CropId[];
  sprinklers: SprinklerTier[];
  pets: PetTier[];
  maxGridSize: number;
} {
  return {
    crops: CROP_ORDER.filter((c) => canPlantCrop(level, c)),
    sprinklers: SPRINKLER_ORDER.filter((s) => canBuySprinkler(level, s)),
    pets: PET_ORDER.filter((p) => canBuyPet(level, p)),
    maxGridSize: GRID_EXPANSIONS.filter((e) => level >= e.levelRequired).reduce(
      (max, e) => Math.max(max, e.gridSize),
      2,
    ),
  };
}
