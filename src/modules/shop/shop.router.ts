import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter, valueActionLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import * as shop from './shop.service.js';

export const shopRouter: Router = Router();

shopRouter.use(requireAuth);

shopRouter.get('/catalog', generalLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json(await shop.getCatalog(player.id));
});

const buyBody = z.object({
  kind: z.enum(['seed', 'sprinkler', 'pet']),
  id: z.string(),
  qty: z.number().int().positive().max(99).optional(),
});
shopRouter.post(
  '/buy',
  valueActionLimiter,
  requireIdempotency,
  validate({ body: buyBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof buyBody>>(req);
    res.json(await shop.buy(player.id, req.idempotencyKey!, body!.kind, body!.id));
  },
);
