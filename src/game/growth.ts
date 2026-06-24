import type { CropDef } from './crops.js';
import type { Plot } from './types.js';
import { clamp } from './types.js';

/**
 * Time-based growth. Growth is measured from `plantedAt` against the crop's
 * `growthDurationMs`, divided by `timeScale` (DEV_TIME_SCALE = 360 in dev, 1 in
 * prod). ALL timing uses the server clock; `now` is server-supplied. There is no
 * watering — a crop grows on its own from the moment it's planted.
 */
export function growthProgress(plot: Plot, def: CropDef, now: number, timeScale = 1): number {
  if (plot.type !== 'crop' || plot.plantedAt == null) return 0;
  const duration = def.growthDurationMs / Math.max(timeScale, 1e-9);
  return clamp((now - plot.plantedAt) / duration, 0, 1);
}

/** True once the crop is fully grown (progress >= 1). */
export function canHarvest(plot: Plot, def: CropDef, now: number, timeScale = 1): boolean {
  return plot.type === 'crop' && growthProgress(plot, def, now, timeScale) >= 1;
}

