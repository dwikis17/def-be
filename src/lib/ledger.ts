import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db/prisma.js';

/** Ledger reason codes (docs §04). */
export type LedgerReason =
  | 'signup_bonus'
  | 'faucet'
  | 'plant_cost'
  | 'harvest'
  | 'market_buy'
  | 'market_sell_net'
  | 'fee_burn'
  | 'fee_reward'
  | 'fee_treasury'
  | 'leaderboard_payout'
  | 'shop_buy'
  | 'expand_cost'
  | 'sprinkler_cost'
  | 'claim_hold'
  | 'claim_settle'
  | 'claim_release';

export type TreasuryKind = 'burn' | 'reward_pool' | 'treasury';

export type LedgerEntry = {
  playerId: string;
  amount: bigint; // + credit / - debit
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  idempotencyKey?: string;
};

export type TreasuryEntry = {
  kind: TreasuryKind;
  amount: bigint;
  ref?: string;
};

type Client = Tx | typeof prisma;

/** Current balance = SUM(ledger.amount) for a player. */
export async function balanceOf(playerId: string, client: Client = prisma): Promise<bigint> {
  const res = await client.ledger.aggregate({ where: { playerId }, _sum: { amount: true } });
  return res._sum.amount ?? 0n;
}

/** Append ledger rows (must run inside the action's transaction). */
export async function writeLedger(tx: Client, entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await tx.ledger.createMany({
    data: entries.map((e) => ({
      playerId: e.playerId,
      amount: e.amount,
      reason: e.reason,
      refType: e.refType ?? null,
      refId: e.refId ?? null,
      idempotencyKey: e.idempotencyKey ?? null,
    })),
  });
}

/** Append system-sink rows (burn / reward_pool / treasury). */
export async function writeTreasury(tx: Client, entries: TreasuryEntry[]): Promise<void> {
  const nonzero = entries.filter((e) => e.amount > 0n);
  if (nonzero.length === 0) return;
  await tx.treasuryLedger.createMany({
    data: nonzero.map((e) => ({ kind: e.kind, amount: e.amount, ref: e.ref ?? null })),
  });
}

export type EconomyTotals = {
  totalBurned: bigint;
  rewardPool: bigint;
  treasury: bigint;
  circulating: bigint;
};

/** Auditable economy totals — all sums over the treasury + ledger. */
export async function economyTotals(client: Client = prisma): Promise<EconomyTotals> {
  const byKind = await client.treasuryLedger.groupBy({ by: ['kind'], _sum: { amount: true } });
  const get = (kind: TreasuryKind) =>
    byKind.find((r: { kind: string; _sum: { amount: bigint | null } }) => r.kind === kind)?._sum
      .amount ?? 0n;

  // Circulating = sum of all positive player balances (credits − debits in ledger).
  const all = await client.ledger.aggregate({ _sum: { amount: true } });
  return {
    totalBurned: get('burn'),
    rewardPool: get('reward_pool'),
    treasury: get('treasury'),
    circulating: all._sum.amount ?? 0n,
  };
}

/** Reward-pool balance available for leaderboard payouts (credits − payouts). */
export async function rewardPoolBalance(client: Client = prisma): Promise<bigint> {
  const pool = await client.treasuryLedger.aggregate({
    where: { kind: 'reward_pool' },
    _sum: { amount: true },
  });
  return pool._sum.amount ?? 0n;
}

export type { Prisma };
