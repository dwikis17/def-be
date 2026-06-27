import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import {
  CROPS,
  isCropId,
  levelFromXp,
  rollMutation,
  type MutationContext,
  type Plot,
} from '../../game/index.js';
import { asPlots, gardenView, lockGarden, plotsForDb } from '../../services/garden.state.js';
import { performHarvest } from '../../services/harvest.service.js';
import { weatherContext } from '../../services/weather.service.js';

function getPlotInRange(plots: Plot[], index: number): Plot {
  const plot = plots[index];
  if (!plot) throw Err.validation(`plotIndex ${index} is out of range`);
  return plot;
}

/** POST /garden/plant — consume one owned seed and plant it. No in-game currency. */
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

    // Consume one seed from inventory (bought on-chain via /purchase/seed).
    const seed = await tx.inventory.findUnique({
      where: {
        playerId_kind_itemId_mutationKey: { playerId, kind: 'seed', itemId: cropId, mutationKey: '' },
      },
    });
    if (!seed || seed.quantity < 1) {
      throw new AppError('CONFLICT', `You have no ${crop.label} seeds — buy some in the shop`);
    }
    await tx.inventory.update({ where: { id: seed.id }, data: { quantity: { decrement: 1 } } });

    // Decide the mutation tier NOW (at plant), server-authoritative, from the same
    // context the gacha uses. It is persisted on the plot and revealed by the client
    // only once the crop is ripe. Idempotency makes the roll stable across retries.
    const ctx: MutationContext = {
      cropMutationModifier: crop.mutationModifier,
      ...(await weatherContext(tx)),
    };
    const mutationTier = rollMutation(ctx);

    // Crops grow on their own from plantedAt — there is no watering.
    plots[plotIndex] = { index: plotIndex, type: 'crop', cropId, plantedAt: Date.now(), mutationTier };
    await tx.garden.update({ where: { playerId }, data: { plots: plotsForDb(plots) } });

    return { garden: gardenView(garden.gridSize, plots) };
  });
}

/** POST /garden/harvest — delegates to the gacha pipeline. */
export async function harvest(playerId: string, key: string, plotIndex: number) {
  return withIdempotency(playerId, key, (tx) => performHarvest(tx, playerId, plotIndex));
}
