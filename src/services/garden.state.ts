import type { Plot } from '../game/index.js';
import { plotCount } from '../game/index.js';
import type { Tx } from '../db/prisma.js';
import { Prisma } from '@prisma/client';

/** Garden size a new player starts with (3×3 = 9 plots). */
export const STARTING_GRID_SIZE = 3;

export function emptyPlot(index: number): Plot {
  return { index, type: 'empty' };
}

/** Fresh plots array for a given grid size (row-major, all empty). */
export function initialPlots(gridSize: number): Plot[] {
  return Array.from({ length: plotCount(gridSize) }, (_, i) => emptyPlot(i));
}

/**
 * Grow the plots array to a larger grid, preserving existing plots and adding
 * empty ones. Never shrinks (expansion only).
 */
export function expandPlots(plots: Plot[], newGridSize: number): Plot[] {
  const target = plotCount(newGridSize);
  const next = plots.slice(0, target);
  for (let i = next.length; i < target; i++) next.push(emptyPlot(i));
  return next;
}

/** Parse the JSONB plots column into a typed Plot[]. */
export function asPlots(json: unknown): Plot[] {
  return (json as Plot[]) ?? [];
}

/** Serialize plots for a Prisma JSON column write. */
export function plotsForDb(plots: Plot[]): Prisma.InputJsonValue {
  return plots as unknown as Prisma.InputJsonValue;
}

/**
 * Row-lock a player's garden (SELECT … FOR UPDATE) inside a transaction so two
 * concurrent value actions can't clobber each other's plots JSON.
 */
export async function lockGarden(tx: Tx, playerId: string): Promise<void> {
  // Column is camelCase ("playerId") because the schema maps tables but not columns.
  await tx.$queryRaw`SELECT "playerId" FROM gardens WHERE "playerId" = ${playerId}::uuid FOR UPDATE`;
}

/** Client-facing garden snapshot. */
export function gardenView(gridSize: number, plots: Plot[]) {
  return { gridSize, plots };
}
