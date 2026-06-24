/**
 * $BLOOM amounts are stored as Postgres BIGINT (Prisma `bigint`). JSON.stringify
 * throws on BigInt by default, so teach it to serialize as a JS number.
 *
 * Safe because game economy values stay far below Number.MAX_SAFE_INTEGER
 * (2^53 ≈ 9e15). Import this module once at boot (see app.ts).
 */
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function toJSON(this: bigint): number {
    return Number(this);
  };
}

export {};
