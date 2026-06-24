import type { Player } from '@prisma/client';
import { prisma, type Tx } from '../db/prisma.js';
import { balanceOf } from '../lib/ledger.js';
import { levelFromXp, type ActivePet } from '../game/index.js';
import { STARTING_BLOOM, STARTING_GRID_SIZE, initialPlots, asPlots } from './garden.state.js';
import { getActiveWeatherView } from './weather.service.js';

/** Create a player + initial garden + starting-balance ledger grant (one tx). */
export async function createPlayerWithGarden(
  tx: Tx,
  opts: { isGuest: boolean; walletPubkey?: string; displayName?: string },
): Promise<Player> {
  const player = await tx.player.create({
    data: {
      isGuest: opts.isGuest,
      walletPubkey: opts.walletPubkey ?? null,
      displayName: opts.displayName ?? null,
    },
  });
  await tx.garden.create({
    data: {
      playerId: player.id,
      gridSize: STARTING_GRID_SIZE,
      plots: initialPlots(STARTING_GRID_SIZE) as object[],
    },
  });
  await tx.ledger.create({
    data: { playerId: player.id, amount: STARTING_BLOOM, reason: 'signup_bonus' },
  });
  return player;
}

/** Public-facing player shape (level derived from xp). */
export function toPlayerView(player: Player) {
  const info = levelFromXp(player.xp);
  return {
    id: player.id,
    isGuest: player.isGuest,
    walletPubkey: player.walletPubkey,
    displayName: player.displayName,
    level: info.level,
    xp: player.xp,
    xpIntoLevel: info.intoLevel,
    xpForNextLevel: info.levelNeed,
    createdAt: player.createdAt,
  };
}

/** Paginated ledger history (newest first), cursor by ledger id. */
export async function getLedgerPage(playerId: string, cursor?: string, take = 50) {
  const limit = Math.min(Math.max(take, 1), 100);
  const rows = await prisma.ledger.findMany({
    where: { playerId },
    orderBy: { id: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: page.map((r) => ({
      id: r.id.toString(),
      amount: r.amount,
      reason: r.reason,
      refType: r.refType,
      refId: r.refId,
      createdAt: r.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id.toString() : null,
  };
}

/** Full `/me` snapshot: player, garden, pet, weather, balance. */
export async function getMeSnapshot(playerId: string) {
  const [player, garden, balance, weather] = await Promise.all([
    prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
    prisma.garden.findUniqueOrThrow({ where: { playerId } }),
    balanceOf(playerId),
    getActiveWeatherView(),
  ]);

  return {
    player: toPlayerView(player),
    garden: {
      gridSize: garden.gridSize,
      plots: asPlots(garden.plots),
      activePet: (garden.activePet as ActivePet | null) ?? null,
    },
    weather,
    balance,
  };
}
