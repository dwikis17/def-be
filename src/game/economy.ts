/**
 * Token economy splits — docs §03 (constants/economy.ts + utils/economy.ts).
 * All amounts are integer $BLOOM base units.
 */

/** Seed purchase: 50% burned, 50% to treasury. */
export function splitSeedCost(cost: number): { burned: number; treasury: number } {
  const burned = Math.floor(cost * 0.5);
  return { burned, treasury: cost - burned };
}

/** Sprinkler / pet purchase: 100% burned. */
export function splitBurnAll(cost: number): { burned: number } {
  return { burned: cost };
}

export type MarketplaceFees = {
  burn: number;
  reward: number;
  treasury: number;
  totalFee: number;
  sellerReceives: number;
};

/** Marketplace fee: 3% total = 1% burn + 1% reward-pool + 1% treasury. */
export function calculateMarketplaceFees(price: number): MarketplaceFees {
  const burn = Math.floor(price * 0.01);
  const reward = Math.floor(price * 0.01);
  const treasury = Math.floor(price * 0.01);
  const totalFee = burn + reward + treasury;
  return { burn, reward, treasury, totalFee, sellerReceives: price - totalFee };
}

/** Share of the weekly reward pool that funds the mutation-hunter board. */
export const MUTATION_HUNTER_POOL_RATIO = 0.3;

/**
 * Weekly leaderboard payout shares (fraction of the reward pool) by rank — docs §03.
 * Returns 0 for ranks outside the paid range.
 */
export function payoutShareForRank(rank: number): number {
  if (rank === 1) return 0.15;
  if (rank === 2) return 0.1;
  if (rank === 3) return 0.07;
  if (rank >= 4 && rank <= 10) return 0.03;
  if (rank >= 11 && rank <= 50) return 0.005;
  if (rank >= 51 && rank <= 100) return 0.002;
  return 0;
}

/** Payout amount for a rank given a pool size (floored to integer $BLOOM). */
export function payoutForRank(rank: number, pool: number): number {
  return Math.floor(pool * payoutShareForRank(rank));
}
