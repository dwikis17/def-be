import type { SprinklerTier } from './types.js';

/**
 * Sprinklers — docs §03. Placed in a plot; add a mutation bonus to plots within
 * their Manhattan coverage radius. Purchase is 100% burned (see economy.ts).
 */
export type SprinklerDef = {
  tier: SprinklerTier;
  label: string;
  /** Additive mutation bonus (fraction) applied to covered plots. */
  mutationBonus: number;
  /** Manhattan coverage radius; Infinity = whole garden (Godly). */
  coverageRadius: number;
  cost: number;
  levelRequired: number;
};

export const SPRINKLERS: Record<SprinklerTier, SprinklerDef> = {
  basic: { tier: 'basic', label: 'Basic Sprinkler', mutationBonus: 0.1, coverageRadius: 1, cost: 500, levelRequired: 3 },
  advanced: { tier: 'advanced', label: 'Advanced Sprinkler', mutationBonus: 0.25, coverageRadius: 2, cost: 2500, levelRequired: 10 },
  master: { tier: 'master', label: 'Master Sprinkler', mutationBonus: 0.4, coverageRadius: 3, cost: 10000, levelRequired: 18 },
  godly: { tier: 'godly', label: 'Godly Sprinkler', mutationBonus: 0.6, coverageRadius: Infinity, cost: 50000, levelRequired: 25 },
};

export const SPRINKLER_ORDER: SprinklerTier[] = ['basic', 'advanced', 'master', 'godly'];

export function isSprinklerTier(value: string): value is SprinklerTier {
  return value in SPRINKLERS;
}
