import type { MutationTier, Rarity } from './types.js';

/**
 * Canonical mutation tiers — docs §03. `baseChance` is the per-roll probability
 * with a neutral context (fraction 0..1). These are the REAL (canon) odds; the
 * server is authoritative, so there are no boosted "demo" odds here.
 */
export type MutationDef = {
  tier: MutationTier;
  label: string;
  multiplier: number;
  baseChance: number;
  rarity: Rarity;
  /** Mints a compressed NFT when rolled. */
  isNFT: boolean;
};

/** Ordered RAREST → COMMON. `rollMutation` walks this order; first hit wins. */
export const MUTATION_ORDER: MutationTier[] = [
  'dawnbound',
  'diamond',
  'crystal',
  'gold',
  'shocked',
  'frozen',
  'wet',
  'common',
];

export const MUTATIONS: Record<MutationTier, MutationDef> = {
  dawnbound: { tier: 'dawnbound', label: 'Dawnbound', multiplier: 150, baseChance: 0.00005, rarity: 'mythic', isNFT: true },
  diamond: { tier: 'diamond', label: 'Diamond', multiplier: 100, baseChance: 0.0002, rarity: 'legendary', isNFT: true },
  crystal: { tier: 'crystal', label: 'Crystal', multiplier: 50, baseChance: 0.001, rarity: 'legendary', isNFT: true },
  gold: { tier: 'gold', label: 'Gold', multiplier: 20, baseChance: 0.005, rarity: 'epic', isNFT: true },
  shocked: { tier: 'shocked', label: 'Shocked', multiplier: 10, baseChance: 0.015, rarity: 'epic', isNFT: true },
  frozen: { tier: 'frozen', label: 'Frozen', multiplier: 5, baseChance: 0.05, rarity: 'rare', isNFT: false },
  wet: { tier: 'wet', label: 'Wet', multiplier: 2, baseChance: 0.15, rarity: 'uncommon', isNFT: false },
  common: { tier: 'common', label: 'Common', multiplier: 1, baseChance: 1, rarity: 'common', isNFT: false },
};

/** Tiers that mint a cNFT (Shocked+). */
export const NFT_THRESHOLD_TIERS: MutationTier[] = ['shocked', 'gold', 'crystal', 'diamond', 'dawnbound'];

/** "Epic+" — used for hybrid-breeding eligibility (docs §03). */
export const EPIC_PLUS_TIERS: MutationTier[] = ['shocked', 'gold', 'crystal', 'diamond', 'dawnbound'];

export function isEpicPlus(tier: MutationTier): boolean {
  return EPIC_PLUS_TIERS.includes(tier);
}
