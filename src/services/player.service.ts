import type { Player } from '@prisma/client';
import { prisma, type Tx } from '../db/prisma.js';
import { levelFromXp } from '../game/index.js';
import { STARTING_GRID_SIZE, initialPlots, asPlots } from './garden.state.js';
import { getActiveWeatherView } from './weather.service.js';
import { getInventory } from './inventory.service.js';

/** Create a wallet player + initial garden (one tx). New players own no seeds. */
export async function createPlayerWithGarden(
  tx: Tx,
  opts: { walletPubkey: string; displayName?: string },
): Promise<Player> {
  const player = await tx.player.create({
    data: {
      isGuest: false,
      walletPubkey: opts.walletPubkey,
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

/** Full `/me` snapshot: player, garden, weather, owned seeds. */
export async function getMeSnapshot(playerId: string) {
  const [player, garden, weather, inventory] = await Promise.all([
    prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
    prisma.garden.findUniqueOrThrow({ where: { playerId } }),
    getActiveWeatherView(),
    getInventory(playerId),
  ]);

  return {
    player: toPlayerView(player),
    garden: {
      gridSize: garden.gridSize,
      plots: asPlots(garden.plots),
    },
    weather,
    inventory,
  };
}
