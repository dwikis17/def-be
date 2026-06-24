import type { Weather } from '@prisma/client';
import { prisma, type Tx } from '../db/prisma.js';
import { WEATHER, isWeatherId, type MutationContext } from '../game/index.js';

type Client = Tx | typeof prisma;

/**
 * The currently-active weather row (latest with endsAt in the future), or null
 * if it's clear. Harvest reads this PERSISTED value so clients can't spoof a
 * high-multiplier event (docs §02 §6).
 */
export async function getActiveWeather(client: Client = prisma): Promise<Weather | null> {
  const row = await client.weather.findFirst({
    where: { endsAt: { gt: new Date() } },
    orderBy: { startedAt: 'desc' },
  });
  if (!row || row.event === 'clear' || !isWeatherId(row.event)) return null;
  return row;
}

/** Client-facing weather snapshot for /me and the WS `weather.update` push. */
export async function getActiveWeatherView(client: Client = prisma) {
  const row = await getActiveWeather(client);
  if (!row) return { event: 'clear' as const, endsAt: null, mutationMultiplier: 1, bonusTiers: {} };
  const def = WEATHER[row.event as keyof typeof WEATHER];
  return {
    event: def.id,
    label: def.label,
    endsAt: row.endsAt,
    mutationMultiplier: def.mutationMultiplier,
    bonusTiers: def.bonusTiers,
  };
}

/** Weather contribution to a harvest's MutationContext. */
export async function weatherContext(client: Client = prisma): Promise<Partial<MutationContext>> {
  const row = await getActiveWeather(client);
  if (!row) return {};
  const def = WEATHER[row.event as keyof typeof WEATHER];
  return { weatherMultiplier: def.mutationMultiplier, weatherTierBonus: def.bonusTiers };
}

/** The weather label to stamp on a HarvestedItem (or null when clear). */
export async function activeWeatherLabel(client: Client = prisma): Promise<string | null> {
  const row = await getActiveWeather(client);
  return row?.event ?? null;
}
