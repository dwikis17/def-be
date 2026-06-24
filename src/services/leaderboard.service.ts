import type { MutationResult } from '../game/index.js';
import { MUTATION_HUNTER_POOL_RATIO } from '../game/index.js';
import { prisma, type Tx } from '../db/prisma.js';
import { rewardPoolBalance } from '../lib/ledger.js';

export type Board = 'harvestValue' | 'mutationHunter';

type Client = Tx | typeof prisma;

/** ISO date 'YYYY-MM-DD' for the Monday (UTC) of the week containing `date`. */
export function weekStartOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** The next weekly reset instant (next Monday 00:00 UTC after `date`). */
export function nextResetAt(date: Date): Date {
  const monday = new Date(`${weekStartOf(date)}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

/** Fraction of the reward pool allocated to a board. */
export function boardPoolRatio(board: Board): number {
  return board === 'mutationHunter' ? MUTATION_HUNTER_POOL_RATIO : 1 - MUTATION_HUNTER_POOL_RATIO;
}

/** GET /leaderboard — top entries, the caller's rank, the board pool, reset time. */
export async function getLeaderboard(board: Board, playerId: string, now = new Date()) {
  const weekStart = weekStartOf(now);
  const [rows, pool] = await Promise.all([
    prisma.leaderboardScore.findMany({
      where: { weekStart, board },
      orderBy: { score: 'desc' },
      take: 100,
      include: { player: { select: { displayName: true, walletPubkey: true } } },
    }),
    rewardPoolBalance(),
  ]);

  const mine = await prisma.leaderboardScore.findUnique({
    where: { playerId_weekStart_board: { playerId, weekStart, board } },
  });
  let myRank: number | null = null;
  if (mine) {
    const above = await prisma.leaderboardScore.count({
      where: { weekStart, board, score: { gt: mine.score } },
    });
    myRank = above + 1;
  }

  return {
    board,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      playerId: r.playerId,
      name: r.player.displayName ?? r.player.walletPubkey?.slice(0, 6) ?? 'Gardener',
      score: r.score,
    })),
    myRank,
    pool: BigInt(Math.floor(Number(pool) * boardPoolRatio(board))),
    resetsAt: nextResetAt(now),
  };
}

/** Points a harvest contributes to the mutation-hunter board (rarity-weighted). */
export function mutationHunterPoints(result: MutationResult): number {
  return result.multiplier; // bigger mutation = more points
}

/** Increment a player's weekly score on a board (upsert). */
export async function addScore(
  tx: Client,
  playerId: string,
  board: Board,
  points: bigint,
  weekStart: string,
): Promise<void> {
  if (points <= 0n) return;
  await tx.leaderboardScore.upsert({
    where: { playerId_weekStart_board: { playerId, weekStart, board } },
    create: { playerId, weekStart, board, score: points },
    update: { score: { increment: points } },
  });
}
