import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { balanceOf, writeLedger, writeTreasury } from '../../lib/ledger.js';
import {
  CROPS,
  SPRINKLERS,
  GRID_EXPANSIONS,
  MAX_GRID_SIZE,
  isCropId,
  isSprinklerTier,
  splitSeedCost,
  levelFromXp,
  type ActivePet,
  type Plot,
  type SprinklerTier,
} from '../../game/index.js';
import {
  asPlots,
  expandPlots,
  gardenView,
  lockGarden,
  plotsForDb,
} from '../../services/garden.state.js';
import { performHarvest } from '../../services/harvest.service.js';

function getPlotInRange(plots: Plot[], index: number): Plot {
  const plot = plots[index];
  if (!plot) throw Err.validation(`plotIndex ${index} is out of range`);
  return plot;
}

/** POST /garden/plant */
export async function plant(playerId: string, key: string, plotIndex: number, cropId: string) {
  if (!isCropId(cropId)) throw Err.validation('Unknown crop');
  return withIdempotency(playerId, key, async (tx) => {
    await lockGarden(tx, playerId);
    const [garden, player] = await Promise.all([
      tx.garden.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);
    const plots = asPlots(garden.plots);
    const plot = getPlotInRange(plots, plotIndex);
    if (plot.type !== 'empty') throw new AppError('PLOT_OCCUPIED', 'Plot is not empty');

    const crop = CROPS[cropId];
    if (levelFromXp(player.xp).level < crop.levelRequired) throw Err.notUnlocked(`${crop.label} locked`);

    const cost = BigInt(crop.seedCost);
    const balance = await balanceOf(playerId, tx);
    if (balance < cost) throw Err.insufficientBalance();

    const { burned, treasury } = splitSeedCost(crop.seedCost);
    await writeLedger(tx, [
      { playerId, amount: -cost, reason: 'plant_cost', refType: 'crop', refId: cropId },
    ]);
    await writeTreasury(tx, [
      { kind: 'burn', amount: BigInt(burned), ref: 'plant' },
      { kind: 'treasury', amount: BigInt(treasury), ref: 'plant' },
    ]);

    // Crops grow on their own from plantedAt — there is no watering.
    plots[plotIndex] = { index: plotIndex, type: 'crop', cropId, plantedAt: Date.now() };
    await tx.garden.update({ where: { playerId }, data: { plots: plotsForDb(plots) } });

    const activePet = (garden.activePet as ActivePet | null) ?? null;
    return { garden: gardenView(garden.gridSize, plots, activePet), balance: balance - cost };
  });
}

/** POST /garden/harvest — delegates to the gacha pipeline. */
export async function harvest(playerId: string, key: string, plotIndex: number) {
  return withIdempotency(playerId, key, (tx) => performHarvest(tx, playerId, plotIndex));
}

/** POST /garden/sprinkler — place a sprinkler (100% burned). */
export async function placeSprinkler(
  playerId: string,
  key: string,
  plotIndex: number,
  sprinklerId: string,
) {
  if (!isSprinklerTier(sprinklerId)) throw Err.validation('Unknown sprinkler');
  return withIdempotency(playerId, key, async (tx) => {
    await lockGarden(tx, playerId);
    const [garden, player] = await Promise.all([
      tx.garden.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);
    const plots = asPlots(garden.plots);
    const plot = getPlotInRange(plots, plotIndex);
    if (plot.type !== 'empty') throw new AppError('PLOT_OCCUPIED', 'Plot is not empty');

    const def = SPRINKLERS[sprinklerId as SprinklerTier];
    if (levelFromXp(player.xp).level < def.levelRequired) throw Err.notUnlocked(`${def.label} locked`);

    const cost = BigInt(def.cost);
    const balance = await balanceOf(playerId, tx);
    if (balance < cost) throw Err.insufficientBalance();

    await writeLedger(tx, [
      { playerId, amount: -cost, reason: 'sprinkler_cost', refType: 'sprinkler', refId: sprinklerId },
    ]);
    await writeTreasury(tx, [{ kind: 'burn', amount: cost, ref: 'sprinkler' }]);

    plots[plotIndex] = { index: plotIndex, type: 'sprinkler', sprinklerId: sprinklerId as SprinklerTier };
    await tx.garden.update({ where: { playerId }, data: { plots: plotsForDb(plots) } });

    const activePet = (garden.activePet as ActivePet | null) ?? null;
    return { garden: gardenView(garden.gridSize, plots, activePet), balance: balance - cost };
  });
}

/** POST /garden/expand — grow the grid one step (100% burned). */
export async function expand(playerId: string, key: string, gridSize: number) {
  return withIdempotency(playerId, key, async (tx) => {
    await lockGarden(tx, playerId);
    const [garden, player] = await Promise.all([
      tx.garden.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);
    if (gridSize !== garden.gridSize + 1 || gridSize > MAX_GRID_SIZE) {
      throw Err.validation('Can only expand to the next grid size');
    }
    const expansion = GRID_EXPANSIONS.find((e) => e.gridSize === gridSize);
    if (!expansion) throw Err.validation('Invalid grid size');
    if (levelFromXp(player.xp).level < expansion.levelRequired) {
      throw Err.notUnlocked(`Grid ${gridSize}×${gridSize} locked`);
    }

    const cost = BigInt(expansion.cost);
    const balance = await balanceOf(playerId, tx);
    if (balance < cost) throw Err.insufficientBalance();

    if (cost > 0n) {
      await writeLedger(tx, [
        { playerId, amount: -cost, reason: 'expand_cost', refType: 'grid', refId: String(gridSize) },
      ]);
      await writeTreasury(tx, [{ kind: 'burn', amount: cost, ref: 'expand' }]);
    }

    const plots = expandPlots(asPlots(garden.plots), gridSize);
    await tx.garden.update({ where: { playerId }, data: { gridSize, plots: plotsForDb(plots) } });

    const activePet = (garden.activePet as ActivePet | null) ?? null;
    return { garden: gardenView(gridSize, plots, activePet), balance: balance - cost };
  });
}
