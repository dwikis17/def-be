import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter, valueActionLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import { getInventory, sellProduce } from '../../services/inventory.service.js';

export const inventoryRouter: Router = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get('/', generalLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json({ items: await getInventory(player.id) });
});

const sellBody = z.object({
  cropId: z.string(),
  mutationTier: z.string(),
  qty: z.number().int().positive().max(9999),
});
inventoryRouter.post(
  '/sell',
  valueActionLimiter,
  requireIdempotency,
  validate({ body: sellBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof sellBody>>(req);
    res.json(
      await sellProduce(player.id, req.idempotencyKey!, body!.cropId, body!.mutationTier, body!.qty),
    );
  },
);
