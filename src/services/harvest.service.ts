import type { Tx } from '../db/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { balanceOf, writeLedger } from '../lib/ledger.js';
import {
  CROPS,
  canHarvest,
  rollMutation,
  checkHybridBreeding,
  resultForTier,
  harvestValue,
  harvestXp,
  levelFromXp,
  petMutationBonus,
  type ActivePet,
  type MutationContext,
  type MutationResult,
  type Plot,
  type Rng,
  serverRng,
} from '../game/index.js';
import {
  asPlots,
  emptyPlot,
  gardenView,
  lockGarden,
  plotsForDb,
  sprinklerCoverageBonus,
} from './garden.state.js';
import { weatherContext, activeWeatherLabel } from './weather.service.js';
import { addScore, mutationHunterPoints, weekStartOf } from './leaderboard.service.js';
import { enqueueCnftMint } from './chain.queue.js';

/** Metaplex-style metadata for a rare-harvest cNFT (docs §05). */
function buildNftMetadata(cropId: string, result: MutationResult, weather: string | null) {
  const cropLabel = CROPS[cropId as keyof typeof CROPS]?.label ?? cropId;
  return {
    name: `${result.label} ${cropLabel}`,
    symbol: 'BLOOM',
    description: `A ${result.label} ${cropLabel} harvested in Bloom Garden.`,
    attributes: [
      { trait_type: 'Crop', value: cropLabel },
      { trait_type: 'Mutation', value: result.label },
      { trait_type: 'Multiplier', value: result.multiplier },
      { trait_type: 'Weather', value: weather ?? 'Clear' },
      { trait_type: 'Hybrid', value: result.isHybrid ? 'Yes' : 'No' },
    ],
  };
}

export type HarvestOutcome = {
  result: MutationResult;
  value: bigint;
  xp: number;
  level: number;
  leveledUp: boolean;
  nftPending: boolean;
  balance: bigint;
  garden: ReturnType<typeof gardenView>;
};

/**
 * The critical gacha flow (docs §02 §4) — runs inside the harvest transaction.
 * Server is the ONLY source of the tier/value; the client just renders it.
 */
export async function performHarvest(
  tx: Tx,
  playerId: string,
  plotIndex: number,
  rng: Rng = serverRng,
): Promise<HarvestOutcome> {
  await lockGarden(tx, playerId);

  const [garden, player] = await Promise.all([
    tx.garden.findUniqueOrThrow({ where: { playerId } }),
    tx.player.findUniqueOrThrow({ where: { id: playerId } }),
  ]);

  const plots = asPlots(garden.plots);
  const plot: Plot | undefined = plots[plotIndex];
  if (!plot || plot.type !== 'crop' || !plot.cropId) {
    throw new AppError('PLOT_EMPTY', 'No crop to harvest in that plot');
  }

  const crop = CROPS[plot.cropId];
  const now = Date.now();
  if (!canHarvest(plot, crop, now, env.DEV_TIME_SCALE)) {
    throw new AppError('NOT_READY', 'Crop is not fully grown yet');
  }

  // Build the mutation context from authoritative server state.
  const activePet = (garden.activePet as ActivePet | null) ?? null;
  const ctx: MutationContext = {
    cropMutationModifier: crop.mutationModifier,
    sprinklerBonus: sprinklerCoverageBonus(plots, plotIndex, garden.gridSize),
    petBonus: activePet ? petMutationBonus(activePet.tier, activePet.level) : 0,
    ...(await weatherContext(tx)),
  };

  // Roll: hybrid (if an adjacent pair breeds) overrides the normal roll.
  const rolledTier = rollMutation(ctx, rng);
  const hybrid = checkHybridBreeding({
    plotIndex,
    plots,
    gridSize: garden.gridSize,
    rolledTier,
    rng,
  });
  const result = hybrid ?? resultForTier(rolledTier);

  const value = BigInt(harvestValue(crop.baseHarvest, result));
  const xp = harvestXp(result);
  const weatherLabel = await activeWeatherLabel(tx);

  // Record the harvested item.
  const item = await tx.harvestedItem.create({
    data: {
      playerId,
      cropId: plot.cropId,
      mutationKey: String(result.key),
      mutationLabel: result.label,
      multiplier: result.multiplier,
      value,
      weather: weatherLabel,
      plotPosition: plotIndex,
      isNft: result.isNFT,
    },
  });

  // Credit $BLOOM.
  await writeLedger(tx, [
    { playerId, amount: value, reason: 'harvest', refType: 'harvest', refId: item.id },
  ]);

  // XP + level.
  const before = levelFromXp(player.xp).level;
  const newXp = player.xp + xp;
  const after = levelFromXp(newXp).level;
  await tx.player.update({
    where: { id: playerId },
    data: { xp: newXp, level: after, lastSeenAt: new Date() },
  });

  // Weekly leaderboard accrual.
  const week = weekStartOf(new Date(now));
  await addScore(tx, playerId, 'harvestValue', value, week);
  await addScore(tx, playerId, 'mutationHunter', BigInt(mutationHunterPoints(result)), week);

  // Rare harvest → mint a cNFT (async; enqueued after the row is created).
  let nftPending = false;
  if (result.isNFT) {
    const nft = await tx.nft.create({
      data: {
        playerId,
        harvestedItemId: item.id,
        cropId: plot.cropId,
        mutationKey: String(result.key),
        mutationLabel: result.label,
        multiplier: result.multiplier,
        metadata: buildNftMetadata(plot.cropId, result, weatherLabel),
        chainStatus: 'pending',
      },
    });
    await enqueueCnftMint({ nftId: nft.id });
    nftPending = true;
  }

  // Clear the plot.
  plots[plotIndex] = emptyPlot(plotIndex);
  await tx.garden.update({ where: { playerId }, data: { plots: plotsForDb(plots) } });

  const balance = await balanceOf(playerId, tx);
  return {
    result,
    value,
    xp,
    level: after,
    leveledUp: after > before,
    nftPending,
    balance,
    garden: gardenView(garden.gridSize, plots, activePet),
  };
}
