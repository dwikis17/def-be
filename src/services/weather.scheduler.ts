import type PgBoss from 'pg-boss';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUES } from '../jobs/boss.js';
import { CLEAR_DURATION_MS, WEATHER, pickNextWeather, serverRng } from '../game/index.js';
import { publishBroadcast } from '../realtime/pubsub.js';
import { getActiveWeatherView } from './weather.service.js';

/**
 * Server-driven weather (docs §02 §6). A once-a-minute tick rotates weather:
 * when the current event (or clear gap) ends, pick the next per the documented
 * frequencies, persist it, and broadcast to all clients. Harvest reads the
 * persisted row so clients can never spoof a high-multiplier event.
 */
export async function rotateWeatherIfNeeded(): Promise<void> {
  const now = new Date();
  const latest = await prisma.weather.findFirst({ orderBy: { startedAt: 'desc' } });

  if (latest && latest.endsAt > now) return; // still active

  const lastWasEvent = latest && latest.event !== 'clear';
  if (lastWasEvent) {
    // Insert a clear gap after an event.
    await prisma.weather.create({
      data: { event: 'clear', startedAt: now, endsAt: new Date(now.getTime() + CLEAR_DURATION_MS) },
    });
  } else {
    // Start a new weather event.
    const def = pickNextWeather(serverRng);
    await prisma.weather.create({
      data: { event: def.id, startedAt: now, endsAt: new Date(now.getTime() + WEATHER[def.id].durationMs) },
    });
  }

  const view = await getActiveWeatherView();
  publishBroadcast({
    type: 'weather.update',
    event: view.event,
    endsAt: view.endsAt ? new Date(view.endsAt).toISOString() : null,
    mutationMultiplier: view.mutationMultiplier,
    bonusTiers: view.bonusTiers as Record<string, number>,
  });
  logger.info({ event: view.event }, 'weather rotated');
}

/** Register the weather worker + once-a-minute schedule. */
export async function startWeatherScheduler(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.weatherTick, async () => {
    await rotateWeatherIfNeeded();
  });
  await boss.schedule(QUEUES.weatherTick, '* * * * *');
  await rotateWeatherIfNeeded(); // seed immediately at boot
}
