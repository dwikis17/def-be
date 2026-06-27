import { describe, it, expect } from 'vitest';
import {
  CROPS,
  MUTATIONS,
  WEATHER,
  GRID_EXPANSIONS,
  XP_REWARDS,
} from '../../src/game/index.js';

/**
 * Drift guard: snapshots the canonical constants so any accidental edit to a
 * number is caught in review. Update intentionally with `vitest -u` when the
 * game design genuinely changes.
 */
describe('canonical constants snapshot', () => {
  it('crops', () => expect(CROPS).toMatchSnapshot());
  it('mutations', () => expect(MUTATIONS).toMatchSnapshot());
  it('weather', () => expect(WEATHER).toMatchSnapshot());
  it('grid expansions', () => expect(GRID_EXPANSIONS).toMatchSnapshot());
  it('xp rewards', () => expect(XP_REWARDS).toMatchSnapshot());
});
