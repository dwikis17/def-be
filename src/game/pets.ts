import type { PetTier } from './types.js';

/**
 * Pets — docs §03. Provide a mutation bonus, may auto-water plots, alert on
 * weather, and grant free rerolls. Pets level up; +0.02 mutation per 10 levels.
 */
export type PetDef = {
  tier: PetTier;
  label: string;
  /** Base additive mutation bonus (fraction). */
  mutationBonus: number;
  /** Plots auto-watered per cycle (Infinity = all). */
  autoWater: number;
  weatherAlert: boolean;
  freeReroll: boolean;
  cost: number;
  levelRequired: number;
};

export const PETS: Record<PetTier, PetDef> = {
  common: { tier: 'common', label: 'Garden Cat', mutationBonus: 0.05, autoWater: 0, weatherAlert: false, freeReroll: false, cost: 0, levelRequired: 2 },
  rare: { tier: 'rare', label: 'Water Sprite', mutationBonus: 0.15, autoWater: 1, weatherAlert: false, freeReroll: false, cost: 5000, levelRequired: 5 },
  epic: { tier: 'epic', label: 'Storm Owl', mutationBonus: 0.25, autoWater: 4, weatherAlert: true, freeReroll: false, cost: 25000, levelRequired: 12 },
  mythic: { tier: 'mythic', label: 'Dawn Phoenix', mutationBonus: 0.4, autoWater: Infinity, weatherAlert: true, freeReroll: true, cost: 100000, levelRequired: 20 },
};

export const PET_ORDER: PetTier[] = ['common', 'rare', 'epic', 'mythic'];

export const PET_LEVEL_XP_PER_LEVEL = 50;
export const PET_MAX_LEVEL = 50;

export function isPetTier(value: string): value is PetTier {
  return value in PETS;
}

/** Effective mutation bonus for a pet at a given level (+0.02 per 10 levels). */
export function petMutationBonus(tier: PetTier, level: number): number {
  const lvl = Math.min(Math.max(level, 1), PET_MAX_LEVEL);
  return PETS[tier].mutationBonus + Math.floor(lvl / 10) * 0.02;
}
