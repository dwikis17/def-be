import type { MutationResult, MutationTier, Plot, Rarity } from './types.js';
import { MUTATION_ORDER, MUTATIONS, isEpicPlus } from './mutations.js';
import { neighbors4 } from './grid.js';
import type { Rng } from './rng.js';
import { serverRng } from './rng.js';

/**
 * Context fed into a harvest roll. Built server-side from the crop and the
 * currently-persisted weather (docs §02 §4).
 */
export type MutationContext = {
  cropMutationModifier?: number;
  weatherMultiplier?: number;
  weatherTierBonus?: Partial<Record<MutationTier, number>>;
};

/**
 * Effective per-tier chance — docs §03 formula:
 *   (base + base*weatherTierBonus) * cropMod * weatherMult
 */
export function calculateMutationChance(tier: MutationTier, ctx: MutationContext): number {
  const def = MUTATIONS[tier];
  const cropMod = ctx.cropMutationModifier ?? 1;
  const weatherMult = ctx.weatherMultiplier ?? 1;
  const tierBonus = ctx.weatherTierBonus?.[tier] ?? 0;
  return (def.baseChance + def.baseChance * tierBonus) * cropMod * weatherMult;
}

/** Roll a base mutation tier, rarest → common; first hit wins (else common). */
export function rollMutation(ctx: MutationContext, rng: Rng = serverRng): MutationTier {
  for (const tier of MUTATION_ORDER) {
    if (tier === 'common') break; // fallback
    if (rng() < calculateMutationChance(tier, ctx)) return tier;
  }
  return 'common';
}

/** Build the resolved result for a base tier. */
export function resultForTier(tier: MutationTier): MutationResult {
  const def = MUTATIONS[tier];
  return {
    key: tier,
    label: def.label,
    multiplier: def.multiplier,
    rarity: def.rarity,
    isNFT: def.isNFT,
    isHybrid: false,
  };
}

// ── Hybrid breeding ─────────────────────────────────────────────────────────
// docs §03: ≥2 ADJACENT Epic+ crops forming a known pair can roll a rare hybrid,
// checked before/over the normal roll. We treat the "cluster" as the harvested
// plot's just-rolled tier plus the rolled tiers of its orthogonal neighbours.

type HybridDef = {
  key: MutationResult['key'];
  label: string;
  multiplier: number;
  rarity: Rarity;
  chance: number;
  /** Returns true if the candidate tier multiset satisfies the pair. */
  matches: (tiers: MutationTier[]) => boolean;
};

function hasBoth(tiers: MutationTier[], a: MutationTier, b: MutationTier): boolean {
  if (a === b) return tiers.filter((t) => t === a).length >= 2;
  return tiers.includes(a) && tiers.includes(b);
}

/** Rarest → most common; first match whose roll succeeds wins. */
const HYBRIDS: HybridDef[] = [
  {
    key: 'dawnbloom',
    label: 'Dawnbloom',
    multiplier: 300,
    rarity: 'mythic',
    chance: 0.001,
    matches: (t) => t.includes('dawnbound') && t.filter((x) => isEpicPlus(x)).length >= 2,
  },
  {
    key: 'prismatic_diamond',
    label: 'Prismatic Diamond',
    multiplier: 200,
    rarity: 'mythic',
    chance: 0.005,
    matches: (t) => hasBoth(t, 'diamond', 'diamond'),
  },
  {
    key: 'gilded_crystal',
    label: 'Gilded Crystal',
    multiplier: 120,
    rarity: 'legendary',
    chance: 0.01,
    matches: (t) => hasBoth(t, 'gold', 'crystal'),
  },
  {
    key: 'frostbolt',
    label: 'Frostbolt',
    multiplier: 75,
    rarity: 'legendary',
    chance: 0.03,
    matches: (t) => hasBoth(t, 'shocked', 'frozen'),
  },
];

/**
 * Check whether the harvested plot breeds a hybrid. Returns a hybrid result or
 * null. Hybrids always mint a cNFT (Epic+ outcome).
 */
export function checkHybridBreeding(args: {
  plotIndex: number;
  plots: Plot[];
  gridSize: number;
  rolledTier: MutationTier;
  rng?: Rng;
}): MutationResult | null {
  const { plotIndex, plots, gridSize, rolledTier, rng = serverRng } = args;

  const cluster: MutationTier[] = [rolledTier];
  for (const n of neighbors4(plotIndex, gridSize)) {
    const neighbor = plots[n];
    if (neighbor?.type === 'crop' && neighbor.mutationTier) cluster.push(neighbor.mutationTier);
  }

  for (const h of HYBRIDS) {
    if (h.matches(cluster) && rng() < h.chance) {
      return {
        key: h.key,
        label: h.label,
        multiplier: h.multiplier,
        rarity: h.rarity,
        isNFT: true,
        isHybrid: true,
      };
    }
  }
  return null;
}

/** Final harvest value = floor(baseHarvest × finalMultiplier). */
export function harvestValue(baseHarvest: number, result: MutationResult): number {
  return Math.floor(baseHarvest * result.multiplier);
}
