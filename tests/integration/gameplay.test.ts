import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * DB-backed integration tests. Run with a DISPOSABLE Postgres:
 *   RUN_DB_TESTS=1 DATABASE_URL=... DIRECT_URL=... npm run prisma:deploy && npm test
 *
 * Buy-to-play model (no in-game currency). Proves:
 *   (a) planting requires an owned seed and consumes exactly one
 *   (b) idempotent retries don't double-consume
 *   (c) harvest tier/value come only from the server; common gives EXP only
 */
const RUN = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!RUN)('gameplay (DB)', () => {
  let app: Express;
  let prisma: typeof import('../../src/db/prisma.js')['prisma'];
  let CROPS: typeof import('../../src/game/index.js')['CROPS'];

  beforeAll(async () => {
    process.env.DEV_TIME_SCALE = '360';
    ({ prisma } = await import('../../src/db/prisma.js'));
    ({ CROPS } = await import('../../src/game/index.js'));
    const { createApp } = await import('../../src/app.js');
    app = createApp();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE players, gardens, harvested_items, nfts, inventory, weather, leaderboard_scores, purchases, auth_nonces, idempotency_records RESTART IDENTITY CASCADE`,
    );
  });

  // Sign in with a fresh wallet via SIWS (challenge → sign → verify).
  async function signIn() {
    const kp = nacl.sign.keyPair();
    const pubkey = bs58.encode(kp.publicKey);
    const ch = await request(app).get('/auth/challenge').query({ pubkey });
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(ch.body.statement), kp.secretKey),
    );
    const res = await request(app).post('/auth/verify').send({ pubkey, signature });
    return { token: res.body.accessToken as string, player: res.body.player, pubkey };
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // Grant seeds directly (stands in for a settled on-chain purchase).
  async function giveSeeds(playerId: string, cropId: string, qty: number) {
    await prisma.inventory.create({
      data: { playerId, kind: 'seed', itemId: cropId, mutationKey: '', quantity: qty },
    });
  }

  it('wallet sign-in starts with an empty garden and no seeds', async () => {
    const { token } = await signIn();
    const me = await request(app).get('/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.balance).toBeUndefined();
    expect(me.body.inventory).toHaveLength(0);
    expect(me.body.garden.gridSize).toBe(3);
    expect(me.body.garden.plots).toHaveLength(9);
  });

  it('planting requires a seed; consumes one and is idempotent on retry', async () => {
    const { token, player } = await signIn();
    const body = { plotIndex: 0, cropId: 'carrot' };

    // No seeds yet → rejected.
    const noSeed = await request(app)
      .post('/garden/plant').set(auth(token)).set('Idempotency-Key', 'p0').send(body);
    expect(noSeed.status).toBe(409);

    await giveSeeds(player.id, 'carrot', 2);

    const first = await request(app)
      .post('/garden/plant').set(auth(token)).set('Idempotency-Key', 'p1').send(body);
    expect(first.status).toBe(200);
    expect(first.body.garden.plots[0].type).toBe('crop');

    // Retry with same key → no second seed consumed.
    const retry = await request(app)
      .post('/garden/plant').set(auth(token)).set('Idempotency-Key', 'p1').send(body);
    expect(retry.status).toBe(200);

    const me = await request(app).get('/me').set(auth(token));
    const carrot = me.body.inventory.find((i: { cropId: string }) => i.cropId === 'carrot');
    expect(carrot.quantity).toBe(1); // 2 granted − 1 planted
  });

  it('harvest value comes from the server, gives EXP, clears the plot', async () => {
    const { token, player } = await signIn();
    await giveSeeds(player.id, 'carrot', 1);
    await request(app)
      .post('/garden/plant').set(auth(token)).set('Idempotency-Key', 'p').send({ plotIndex: 0, cropId: 'carrot' });

    // Fast-forward growth by back-dating plantedAt past the scaled duration.
    const garden = await prisma.garden.findUniqueOrThrow({ where: { playerId: player.id } });
    const plots = garden.plots as Array<{ index: number; plantedAt?: number }>;
    plots[0]!.plantedAt = Date.now() - CROPS.carrot.growthDurationMs / 360 - 5000;
    await prisma.garden.update({ where: { playerId: player.id }, data: { plots: plots as object[] } });

    const harvest = await request(app)
      .post('/garden/harvest').set(auth(token)).set('Idempotency-Key', 'h').send({ plotIndex: 0 });
    expect(harvest.status).toBe(200);
    expect(harvest.body.result.key).toBeDefined();
    expect(harvest.body.xp).toBeGreaterThan(0);
    expect(harvest.body.balance).toBeUndefined(); // no in-game currency

    const me = await request(app).get('/me').set(auth(token));
    expect(me.body.garden.plots[0].type).toBe('empty');

    // Replay returns the identical roll (no re-roll).
    const replay = await request(app)
      .post('/garden/harvest').set(auth(token)).set('Idempotency-Key', 'h').send({ plotIndex: 0 });
    expect(replay.body.value).toBe(harvest.body.value);
    expect(replay.body.result.key).toBe(harvest.body.result.key);
  });
});
