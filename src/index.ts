import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { attachWebSocketServer } from './realtime/ws.js';
import { startJobQueue, stopJobQueue } from './jobs/boss.js';
import { startWeatherScheduler } from './services/weather.scheduler.js';
import { startLeaderboardScheduler } from './services/leaderboard.worker.js';
import { startReconcileScheduler } from './services/reconcile.worker.js';
import { startChainWorker } from './workers/chain.worker.js';

/**
 * Process entrypoint. Boots the HTTP + WebSocket server, then starts background
 * services (job queue, schedulers, chain worker). Background startup is
 * best-effort: a queue/DB hiccup logs but doesn't stop the API from serving.
 */
async function main(): Promise<void> {
  const app = createApp();
  const server = createServer(app);
  attachWebSocketServer(server);

  server.listen(env.PORT, () => {
    logger.info(`Bloom Garden backend listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  startBackground().catch((err) => logger.error({ err }, 'background services failed to start'));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
    await stopJobQueue().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/** Start pg-boss queue + all workers/schedulers. */
async function startBackground(): Promise<void> {
  const boss = await startJobQueue();
  await startWeatherScheduler(boss);
  await startLeaderboardScheduler(boss);
  await startReconcileScheduler(boss);
  await startChainWorker(boss);
  logger.info('background services started');
}

main().catch((err) => {
  logger.error({ err }, 'Fatal boot error');
  process.exit(1);
});
