import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { payoutForRank } from '../game/index.js';
import { publishBroadcast } from '../realtime/pubsub.js';
import {
  type Board,
  boardPoolRatio,
  getLeaderboard,
  weekStartOf,
} from './leaderboard.service.js';
import { rewardPoolBalance } from '../lib/ledger.js';

const BOARDS: Board[] = ['harvestValue', 'mutationHunter'];

/**
 * Weekly payout (docs §02 §7). Aggregates the finished week's scores, pays each
 * paid rank a share of that board's slice of the reward pool, snapshots the
 * board, and deducts the payout from the pool. Idempotent: if payouts for the
 * week already exist, it no-ops.
 */
export async function rolloverLeaderboard(now = new Date()): Promise<void> {
  // The week that just ended (yesterday relative to the Monday reset).
  const finishedWeek = weekStartOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const already = await prisma.leaderboardPayout.findFirst({ where: { weekStart: finishedWeek } });
  if (already) {
    logger.info({ finishedWeek }, 'leaderboard already rolled over; skipping');
    return;
  }

  const pool = await rewardPoolBalance();
  if (pool <= 0n) {
    logger.info('reward pool empty; no leaderboard payouts');
    return;
  }

  await prisma.$transaction(async (tx) => {
    let totalPaid = 0n;
    for (const board of BOARDS) {
      const boardPool = BigInt(Math.floor(Number(pool) * boardPoolRatio(board)));
      const scores = await tx.leaderboardScore.findMany({
        where: { weekStart: finishedWeek, board },
        orderBy: { score: 'desc' },
        take: 100,
      });

      for (let i = 0; i < scores.length; i++) {
        const rank = i + 1;
        const amount = BigInt(payoutForRank(rank, Number(boardPool)));
        if (amount <= 0n) continue;
        await tx.ledger.create({
          data: {
            playerId: scores[i]!.playerId,
            amount,
            reason: 'leaderboard_payout',
            refType: 'leaderboard',
            refId: `${finishedWeek}:${board}:${rank}`,
          },
        });
        await tx.leaderboardPayout.create({
          data: { weekStart: finishedWeek, board, playerId: scores[i]!.playerId, rank, amount },
        });
        totalPaid += amount;
      }
    }

    if (totalPaid > 0n) {
      // Deduct paid rewards from the pool (negative reward_pool entry).
      await tx.treasuryLedger.create({
        data: { kind: 'reward_pool', amount: -totalPaid, ref: `payout:${finishedWeek}` },
      });
    }
    logger.info({ finishedWeek, totalPaid: totalPaid.toString() }, 'leaderboard rolled over');
  });

  // Broadcast the fresh (new week) boards.
  for (const board of BOARDS) {
    const lb = await getLeaderboard(board, '00000000-0000-0000-0000-000000000000', now);
    publishBroadcast({
      type: 'leaderboard.update',
      board,
      top: lb.entries.slice(0, 10),
      pool: Number(lb.pool),
      resetsAt: lb.resetsAt.toISOString(),
    });
  }
}

/** Register the weekly rollover (Mondays 00:00 UTC). */
export async function startLeaderboardScheduler(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.leaderboardRollover, async () => {
    await rolloverLeaderboard();
  });
  await boss.schedule(QUEUES.leaderboardRollover, '0 0 * * 1');
}
