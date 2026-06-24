import type { MutationTier, WeatherId } from './types.js';

/**
 * Server-scheduled weather — docs §03. While active, an event boosts mutation
 * odds globally (multiplier) and specific tiers (bonusTiers). `weight` drives
 * the scheduler's weighted random pick (roughly proportional to the documented
 * frequency); the scheduler interleaves CLEAR gaps between events.
 */
export type WeatherDef = {
  id: WeatherId;
  label: string;
  durationMs: number;
  mutationMultiplier: number;
  bonusTiers: Partial<Record<MutationTier, number>>;
  /** Relative selection weight (≈ events per week). */
  weight: number;
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const WEATHER: Record<WeatherId, WeatherDef> = {
  rain: { id: 'rain', label: 'Rain', durationMs: 2 * HOUR, mutationMultiplier: 1.5, bonusTiers: { wet: 0.5 }, weight: 2.5 },
  thunderstorm: { id: 'thunderstorm', label: 'Thunderstorm', durationMs: 1 * HOUR, mutationMultiplier: 2.0, bonusTiers: { shocked: 1.0 }, weight: 1 },
  frost: { id: 'frost', label: 'Frost', durationMs: 1.5 * HOUR, mutationMultiplier: 1.75, bonusTiers: { frozen: 0.75 }, weight: 1.5 },
  solar_flare: { id: 'solar_flare', label: 'Solar Flare', durationMs: 30 * MIN, mutationMultiplier: 3.0, bonusTiers: { gold: 1.5 }, weight: 0.5 },
  meteor_shower: { id: 'meteor_shower', label: 'Meteor Shower', durationMs: 15 * MIN, mutationMultiplier: 2.5, bonusTiers: { crystal: 2.0, diamond: 2.0 }, weight: 0.25 },
  aurora: { id: 'aurora', label: 'Aurora', durationMs: 10 * MIN, mutationMultiplier: 5.0, bonusTiers: { dawnbound: 5.0 }, weight: 0.08 },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

/** Gap of clear weather between events, in ms (also affected by scheduler). */
export const CLEAR_DURATION_MS = 20 * MIN;

export function isWeatherId(value: string): value is WeatherId {
  return value in WEATHER;
}

/** Weighted random pick of the next weather event. */
export function pickNextWeather(rng: () => number): WeatherDef {
  const total = WEATHER_IDS.reduce((sum, id) => sum + WEATHER[id].weight, 0);
  let roll = rng() * total;
  for (const id of WEATHER_IDS) {
    roll -= WEATHER[id].weight;
    if (roll <= 0) return WEATHER[id];
  }
  return WEATHER.rain;
}
