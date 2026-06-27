// Authoritative game logic — the server's source of truth for all numbers and
// outcomes. Mirrors docs §03. Import from here, e.g.
//   import { CROPS, rollMutation, harvestXp } from '../game/index.js';

export * from './types.js';
export * from './crops.js';
export * from './mutations.js';
export * from './mutation.js';
export * from './weather.js';
export * from './levels.js';
export * from './grid.js';
export * from './growth.js';
export * from './rng.js';
