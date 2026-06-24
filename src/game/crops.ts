import type { CropId } from './types.js';

/**
 * Canonical crop definitions — docs §03 (constants/crops.ts mirror).
 * Growth is real-time, measured from `plantedAt` against `growthDurationMs`.
 */
export type CropDef = {
  id: CropId;
  label: string;
  /** $BLOOM spent to plant a seed. */
  seedCost: number;
  /** Real growth duration in milliseconds (before DEV_TIME_SCALE). */
  growthDurationMs: number;
  /** Base $BLOOM value before the mutation multiplier. */
  baseHarvest: number;
  /** Per-crop multiplier applied to mutation odds. */
  mutationModifier: number;
  /** Player level required to plant. */
  levelRequired: number;
};

const HOUR = 60 * 60 * 1000;

export const CROPS: Record<CropId, CropDef> = {
  carrot: { id: 'carrot', label: 'Carrot', seedCost: 50, growthDurationMs: 1 * HOUR, baseHarvest: 40, mutationModifier: 1.0, levelRequired: 1 },
  potato: { id: 'potato', label: 'Potato', seedCost: 50, growthDurationMs: 1.5 * HOUR, baseHarvest: 45, mutationModifier: 1.0, levelRequired: 1 },
  tomato: { id: 'tomato', label: 'Tomato', seedCost: 75, growthDurationMs: 2 * HOUR, baseHarvest: 65, mutationModifier: 1.05, levelRequired: 1 },
  strawberry: { id: 'strawberry', label: 'Strawberry', seedCost: 200, growthDurationMs: 4 * HOUR, baseHarvest: 170, mutationModifier: 1.15, levelRequired: 5 },
  watermelon: { id: 'watermelon', label: 'Watermelon', seedCost: 350, growthDurationMs: 8 * HOUR, baseHarvest: 310, mutationModifier: 1.2, levelRequired: 8 },
  pumpkin: { id: 'pumpkin', label: 'Pumpkin', seedCost: 500, growthDurationMs: 12 * HOUR, baseHarvest: 450, mutationModifier: 1.25, levelRequired: 12 },
  dragonfruit: { id: 'dragonfruit', label: 'Dragon Fruit', seedCost: 1000, growthDurationMs: 16 * HOUR, baseHarvest: 850, mutationModifier: 1.5, levelRequired: 18 },
  starfruit: { id: 'starfruit', label: 'Star Fruit', seedCost: 1500, growthDurationMs: 20 * HOUR, baseHarvest: 1300, mutationModifier: 1.6, levelRequired: 22 },
  ghostpepper: { id: 'ghostpepper', label: 'Ghost Pepper', seedCost: 2500, growthDurationMs: 24 * HOUR, baseHarvest: 2200, mutationModifier: 1.8, levelRequired: 28 },
};

export const CROP_ORDER: CropId[] = [
  'carrot',
  'potato',
  'tomato',
  'strawberry',
  'watermelon',
  'pumpkin',
  'dragonfruit',
  'starfruit',
  'ghostpepper',
];

export function getCrop(id: CropId): CropDef {
  return CROPS[id];
}

export function isCropId(value: string): value is CropId {
  return value in CROPS;
}
