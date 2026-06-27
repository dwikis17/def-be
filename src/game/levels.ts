import type { CropId, MutationResult } from './types.js';
import { CROPS } from './crops.js';

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

// ── Unlock gates ─────────────────────────────────────────────────────────────
export function canPlantCrop(level: number, cropId: CropId): boolean {
  return level >= CROPS[cropId].levelRequired;
}
