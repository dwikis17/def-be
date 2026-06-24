import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { valueActionLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import * as garden from './garden.service.js';

export const gardenRouter: Router = Router();

// All garden actions are authenticated, rate-limited value actions requiring an
// Idempotency-Key (docs §04).
gardenRouter.use(requireAuth, valueActionLimiter, requireIdempotency);

const plotIndex = z.number().int().min(0).max(35);

const plantBody = z.object({ plotIndex, cropId: z.string() });
gardenRouter.post('/plant', validate({ body: plantBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof plantBody>>(req);
  res.json(await garden.plant(player.id, req.idempotencyKey!, body!.plotIndex, body!.cropId));
});

const waterBody = z.object({ plotIndex });
gardenRouter.post('/water', validate({ body: waterBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof waterBody>>(req);
  res.json(await garden.water(player.id, req.idempotencyKey!, body!.plotIndex));
});

const harvestBody = z.object({ plotIndex });
gardenRouter.post('/harvest', validate({ body: harvestBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof harvestBody>>(req);
  res.json(await garden.harvest(player.id, req.idempotencyKey!, body!.plotIndex));
});

const sprinklerBody = z.object({ plotIndex, sprinklerId: z.string() });
gardenRouter.post('/sprinkler', validate({ body: sprinklerBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof sprinklerBody>>(req);
  res.json(
    await garden.placeSprinkler(player.id, req.idempotencyKey!, body!.plotIndex, body!.sprinklerId),
  );
});

const expandBody = z.object({ gridSize: z.number().int().min(3).max(6) });
gardenRouter.post('/expand', validate({ body: expandBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof expandBody>>(req);
  res.json(await garden.expand(player.id, req.idempotencyKey!, body!.gridSize));
});
