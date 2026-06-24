import { describe, it, expect } from 'vitest';
import {
  splitSeedCost,
  calculateMarketplaceFees,
  payoutForRank,
  rollMutation,
  calculateMutationChance,
  checkHybridBreeding,
  harvestValue,
  resultForTier,
  levelFromXp,
  getXpForLevel,
  canPlantCrop,
  growthProgress,
  canHarvest,
  CROPS,
  seededRng,
  type Plot,
} from '../../src/game/index.js';

describe('produce value', () => {
  it('floor(baseHarvest × tier multiplier) for sellable produce', async () => {
    const { produceUnitValue } = await import('../../src/services/inventory.service.js');
    expect(produceUnitValue('carrot', 'common')).toBe(40); // 40 × 1
    expect(produceUnitValue('tomato', 'frozen')).toBe(65 * 5); // 325
    expect(produceUnitValue('potato', 'wet')).toBe(45 * 2); // 90
  });
});

describe('economy splits', () => {
  it('splits seed cost 50/50 with remainder to treasury', () => {
    expect(splitSeedCost(50)).toEqual({ burned: 25, treasury: 25 });
    expect(splitSeedCost(75)).toEqual({ burned: 37, treasury: 38 });
  });

  it('marketplace fees are 3% total and seller nets the rest', () => {
    const f = calculateMarketplaceFees(1000);
    expect(f).toMatchObject({ burn: 10, reward: 10, treasury: 10, totalFee: 30, sellerReceives: 970 });
  });

  it('leaderboard payout shares by rank', () => {
    expect(payoutForRank(1, 10000)).toBe(1500);
    expect(payoutForRank(2, 10000)).toBe(1000);
    expect(payoutForRank(11, 10000)).toBe(50);
    expect(payoutForRank(200, 10000)).toBe(0);
  });
});

describe('levels', () => {
  it('xp curve is level * 100', () => {
    expect(getXpForLevel(1)).toBe(100);
    expect(getXpForLevel(5)).toBe(500);
  });
  it('levelFromXp accumulates correctly', () => {
    // L1 needs 100, L2 needs 200 -> 300 total reaches level 3 with 0 into it.
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
  });
  it('gates crops by level', () => {
    expect(canPlantCrop(1, 'carrot')).toBe(true);
    expect(canPlantCrop(1, 'strawberry')).toBe(false);
    expect(canPlantCrop(5, 'strawberry')).toBe(true);
  });
});

describe('mutation roll', () => {
  it('common is the fallback when nothing rare hits', () => {
    const tier = rollMutation({}, () => 0.999999);
    expect(tier).toBe('common');
  });

  it('higher context boosts rare-tier chance', () => {
    const neutral = calculateMutationChance('gold', {});
    const boosted = calculateMutationChance('gold', {
      sprinklerBonus: 0.6,
      petBonus: 0.4,
      weatherMultiplier: 3,
      weatherTierBonus: { gold: 1.5 },
    });
    expect(boosted).toBeGreaterThan(neutral);
  });

  it('distribution: ~1.5% shocked over many rolls (neutral)', () => {
    const rng = seededRng(42);
    let shocked = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (rollMutation({}, rng) === 'shocked') shocked++;
    // baseChance 0.015 — allow generous tolerance for RNG.
    expect(shocked / N).toBeGreaterThan(0.008);
    expect(shocked / N).toBeLessThan(0.025);
  });
});

describe('hybrid breeding', () => {
  const cropPlot = (index: number, mutationTier: Plot['mutationTier']): Plot => ({
    index,
    type: 'crop',
    cropId: 'carrot',
    mutationTier,
  });

  it('frostbolt requires adjacent shocked + frozen', () => {
    // 2x2 grid: plot 0 harvested (shocked), plot 1 (right neighbor) frozen.
    const plots: Plot[] = [cropPlot(0, 'shocked'), cropPlot(1, 'frozen'), cropPlot(2, 'common'), cropPlot(3, 'common')];
    const hit = checkHybridBreeding({
      plotIndex: 0,
      plots,
      gridSize: 2,
      rolledTier: 'shocked',
      rng: () => 0, // force the chance to pass
    });
    expect(hit?.key).toBe('frostbolt');
    expect(hit?.isNFT).toBe(true);
  });

  it('no hybrid without a matching neighbour', () => {
    const plots: Plot[] = [cropPlot(0, 'shocked'), cropPlot(1, 'common'), cropPlot(2, 'common'), cropPlot(3, 'common')];
    const hit = checkHybridBreeding({ plotIndex: 0, plots, gridSize: 2, rolledTier: 'shocked', rng: () => 0 });
    expect(hit).toBeNull();
  });

  it('harvestValue floors base × multiplier', () => {
    expect(harvestValue(65, resultForTier('gold'))).toBe(65 * 20);
  });
});

describe('growth timing (server clock)', () => {
  const carrot = CROPS.carrot;
  it('empty/unplanted plot has zero progress', () => {
    const plot: Plot = { index: 0, type: 'empty' };
    expect(growthProgress(plot, carrot, 99999999)).toBe(0);
  });
  it('grows from plantedAt and reaches harvestable after the (scaled) duration', () => {
    const plot: Plot = { index: 0, type: 'crop', cropId: 'carrot', plantedAt: 0 };
    const scale = 360;
    const dur = carrot.growthDurationMs / scale;
    expect(canHarvest(plot, carrot, dur - 1, scale)).toBe(false);
    expect(canHarvest(plot, carrot, dur, scale)).toBe(true);
  });
});
