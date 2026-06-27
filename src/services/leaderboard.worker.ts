import type PgBoss from 'pg-boss';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { publishBroadcast } from '../realtime/pubsub.js';
import { type Board, getLeaderboard } from './leaderboard.service.js';

const BOARDS: Board[] = ['harvestValue', 'mutationHunter'];

/**
 * Weekly rollover. Boards are bragging-rights only now (buy-to-play, no in-game
 * currency), so there are no payouts — we simply broadcast the fresh (new-week)
 * boards so connected clients reset. Scores accrue per harvest via addScore.
 */
export async function rolloverLeaderboard(now = new Date()): Promise<void> {
  for (const board of BOARDS) {
    const lb = await getLeaderboard(board, '00000000-0000-0000-0000-000000000000', now);
    publishBroadcast({
      type: 'leaderboard.update',
      board,
      top: lb.entries.slice(0, 10),
      pool: 0,
      resetsAt: lb.resetsAt.toISOString(),
    });
  }
  logger.info('leaderboard rolled over (no payouts; bragging-rights boards)');
}

/** Register the weekly rollover (Mondays 00:00 UTC). */
export async function startLeaderboardScheduler(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.leaderboardRollover, async () => {
    await rolloverLeaderboard();
  });
  await boss.schedule(QUEUES.leaderboardRollover, '0 0 * * 1');
}
