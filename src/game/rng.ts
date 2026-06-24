import { randomInt } from 'node:crypto';

/**
 * Randomness seam. ALL game randomness enters through an injected `Rng` so the
 * server can swap Level-1 CSPRNG → Level-2 commit-reveal → Level-3 VRF without
 * touching game logic (docs §06).
 *
 * An Rng returns a float in [0, 1).
 */
export type Rng = () => number;

/** Level-1 server CSPRNG. 53 bits of entropy from crypto.randomInt. */
export const serverRng: Rng = () => {
  // randomInt max is 2^48; combine two draws for full 53-bit float precision.
  const hi = randomInt(0, 0x2000000); // 25 bits
  const lo = randomInt(0, 0x10000000); // 28 bits
  return (hi * 0x10000000 + lo) / 0x20000000000000; // / 2^53
};

/** Deterministic Rng for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
