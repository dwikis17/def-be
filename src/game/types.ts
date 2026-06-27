// Canonical game types for the authoritative server. These mirror the frontend
// shapes in defi-game/app/game/* but carry the FULL docs spec (9 crops,
// time-based growth, weather/pets/sprinklers). The server owns these numbers.

export type CropId =
  | 'carrot'
  | 'potato'
  | 'tomato'
  | 'strawberry'
  | 'watermelon'
  | 'pumpkin'
  | 'dragonfruit'
  | 'starfruit'
  | 'ghostpepper';

/** Base mutation rarity tiers (rarest → common). Rolled when a crop ripens. */
export type MutationTier =
  | 'common'
  | 'wet'
  | 'frozen'
  | 'shocked'
  | 'gold'
  | 'crystal'
  | 'diamond'
  | 'dawnbound';

/** Special tiers produced only by hybrid breeding of adjacent Epic+ crops. */
export type HybridTier = 'frostbolt' | 'gilded_crystal' | 'prismatic_diamond' | 'dawnbloom';

/** Coarse rarity bucket used for XP rewards and Epic+ gating. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type WeatherId =
  | 'rain'
  | 'thunderstorm'
  | 'frost'
  | 'solar_flare'
  | 'meteor_shower'
  | 'aurora';

/** Growth stage index (4 sprite frames). */
export type GrowthStage = 0 | 1 | 2 | 3;

/**
 * One garden cell. Persisted as JSONB in `gardens.plots` (a Plot[]). All
 * timestamps are epoch milliseconds assigned by the SERVER clock.
 */
export type Plot = {
  index: number;
  type: 'empty' | 'crop';
  cropId?: CropId;
  /** When the seed was planted (server clock) — growth is measured from here. */
  plantedAt?: number;
  /** Base mutation tier, rolled + persisted at PLANT time (server-authoritative).
   *  Sent to the client, which reveals it only once the crop is ripe. */
  mutationTier?: MutationTier;
};

/** A fully-resolved mutation outcome (normal roll or hybrid). */
export type MutationResult = {
  /** Base tier or hybrid id. */
  key: MutationTier | HybridTier;
  label: string;
  multiplier: number;
  rarity: Rarity;
  /** Whether this outcome mints a compressed NFT (Shocked+ or any hybrid). */
  isNFT: boolean;
  isHybrid: boolean;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
