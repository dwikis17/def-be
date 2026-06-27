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

const harvestBody = z.object({ plotIndex });
gardenRouter.post('/harvest', validate({ body: harvestBody }), async (req, res) => {
  const player = getPlayer(req);
  const { body } = validated<z.infer<typeof harvestBody>>(req);
  res.json(await garden.harvest(player.id, req.idempotencyKey!, body!.plotIndex));
});
