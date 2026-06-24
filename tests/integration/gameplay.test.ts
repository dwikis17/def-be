import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * DB-backed integration tests. Run with a DISPOSABLE Postgres:
 *   RUN_DB_TESTS=1 DATABASE_URL=... DIRECT_URL=... npm run prisma:deploy && npm test
 *
 * Proves the core integrity invariants (docs §06):
 *   (a) balance = SUM(ledger)        (b) idempotent retries don't double-apply
 *   (c) harvest tier/value come only from the server
 *   (d) a listing can't be double-bought
 */
const RUN = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!RUN)('gameplay (DB)', () => {
  let app: Express;
  let prisma: typeof import('../../src/db/prisma.js')['prisma'];
  let CROPS: typeof import('../../src/game/index.js')['CROPS'];
  let START = 0;

  beforeAll(async () => {
    process.env.DEV_TIME_SCALE = '360';
    ({ prisma } = await import('../../src/db/prisma.js'));
    ({ CROPS } = await import('../../src/game/index.js'));
    const { STARTING_BLOOM } = await import('../../src/services/garden.state.js');
    START = Number(STARTING_BLOOM);
    const { createApp } = await import('../../src/app.js');
    app = createApp();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE players, gardens, ledger, treasury_ledger, harvested_items, nfts, inventory, listings, trades, weather, leaderboard_scores, leaderboard_payouts, claims, auth_nonces, idempotency_records RESTART IDENTITY CASCADE`,
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

  it('wallet sign-in grants the starting balance', async () => {
    const { token } = await signIn();
    const me = await request(app).get('/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.balance).toBe(START);
    expect(me.body.garden.gridSize).toBe(3);
    expect(me.body.garden.plots).toHaveLength(9);
  });

  it('plant debits cost and is idempotent on retry', async () => {
    const { token } = await signIn();
    const key = 'plant-key-1';
    const body = { plotIndex: 0, cropId: 'carrot' };

    const first = await request(app).post('/garden/plant').set(auth(token)).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(200);
    expect(first.body.balance).toBe(START - CROPS.carrot.seedCost);

    const retry = await request(app).post('/garden/plant').set(auth(token)).set('Idempotency-Key', key).send(body);
    expect(retry.body.balance).toBe(first.body.balance); // no double-debit

    const me = await request(app).get('/me').set(auth(token));
    expect(me.body.balance).toBe(START - CROPS.carrot.seedCost);

    const stats = await request(app).get('/economy/stats').set(auth(token));
    expect(stats.body.totalBurned + stats.body.treasury).toBe(CROPS.carrot.seedCost);
  });

  it('harvest value comes from the server, credits the ledger, clears the plot', async () => {
    const { token, player } = await signIn();
    await request(app).post('/garden/plant').set(auth(token)).set('Idempotency-Key', 'p').send({ plotIndex: 0, cropId: 'carrot' });

    // Fast-forward growth by back-dating plantedAt past the scaled duration.
    const garden = await prisma.garden.findUniqueOrThrow({ where: { playerId: player.id } });
    const plots = garden.plots as Array<{ index: number; plantedAt?: number }>;
    plots[0]!.plantedAt = Date.now() - (CROPS.carrot.growthDurationMs / 360) - 5000;
    await prisma.garden.update({ where: { playerId: player.id }, data: { plots: plots as object[] } });

    const harvest = await request(app).post('/garden/harvest').set(auth(token)).set('Idempotency-Key', 'h').send({ plotIndex: 0 });
    expect(harvest.status).toBe(200);
    expect(harvest.body.result.key).toBeDefined();
    expect(harvest.body.value).toBeGreaterThanOrEqual(CROPS.carrot.baseHarvest);

    const me = await request(app).get('/me').set(auth(token));
    expect(me.body.garden.plots[0].type).toBe('empty');

    // Replay returns the identical roll (no re-roll, no double credit).
    const replay = await request(app).post('/garden/harvest').set(auth(token)).set('Idempotency-Key', 'h').send({ plotIndex: 0 });
    expect(replay.body.value).toBe(harvest.body.value);
    expect(replay.body.result.key).toBe(harvest.body.result.key);
  });

  it('a listing cannot be double-bought', async () => {
    const seller = await signIn();
    const buyer1 = await signIn();
    const buyer2 = await signIn();

    // Give the seller produce + the buyers funds directly.
    await prisma.inventory.create({
      data: { playerId: seller.player.id, kind: 'harvest', itemId: 'carrot', mutationKey: 'common', quantity: 1 },
    });
    for (const b of [buyer1, buyer2]) {
      await prisma.ledger.create({ data: { playerId: b.player.id, amount: 1000n, reason: 'signup_bonus' } });
    }

    const listed = await request(app)
      .post('/market/listings')
      .set(auth(seller.token))
      .set('Idempotency-Key', 'list')
      .send({ cropId: 'carrot', mutationTier: 'common', quantity: 1, pricePerUnit: 100 });
    expect(listed.status).toBe(200);
    const listingId = listed.body.listing.id;

    const buy1 = await request(app).post(`/market/listings/${listingId}/buy`).set(auth(buyer1.token)).set('Idempotency-Key', 'b1').send({});
    expect(buy1.status).toBe(200);

    const buy2 = await request(app).post(`/market/listings/${listingId}/buy`).set(auth(buyer2.token)).set('Idempotency-Key', 'b2').send({});
    expect(buy2.status).toBe(409); // LISTING_GONE
    expect(buy2.body.error.code).toBe('LISTING_GONE');
  });
});
