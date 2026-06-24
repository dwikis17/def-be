import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter, valueActionLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import * as market from './market.service.js';

export const marketRouter: Router = Router();

marketRouter.use(requireAuth);

const listQuery = z.object({
  crop: z.string().optional(),
  tier: z.string().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest']).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).optional(),
});
marketRouter.get('/listings', generalLimiter, validate({ query: listQuery }), async (req, res) => {
  const { query } = validated<unknown, z.infer<typeof listQuery>>(req);
  res.json(await market.listListings(query ?? {}));
});

const createBody = z
  .object({
    nftId: z.string().uuid().optional(),
    cropId: z.string().optional(),
    mutationTier: z.string().optional(),
    quantity: z.number().int().positive().optional(),
    pricePerUnit: z.number().int().positive(),
  })
  .refine((b) => b.nftId || (b.cropId && b.mutationTier), {
    message: 'Provide nftId, or cropId + mutationTier',
  });
marketRouter.post(
  '/listings',
  valueActionLimiter,
  requireIdempotency,
  validate({ body: createBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof createBody>>(req);
    res.json(await market.createListing(player.id, req.idempotencyKey!, body!));
  },
);

const idParams = z.object({ id: z.string().uuid() });
marketRouter.post(
  '/listings/:id/buy',
  valueActionLimiter,
  requireIdempotency,
  validate({ params: idParams }),
  async (req, res) => {
    const player = getPlayer(req);
    const { params } = validated<unknown, unknown, z.infer<typeof idParams>>(req);
    res.json(await market.buyListing(player.id, req.idempotencyKey!, params!.id));
  },
);

marketRouter.delete('/listings/:id', validate({ params: idParams }), async (req, res) => {
  const player = getPlayer(req);
  const { params } = validated<unknown, unknown, z.infer<typeof idParams>>(req);
  res.json(await market.cancelListing(player.id, params!.id));
});

const historyQuery = z.object({ me: z.coerce.boolean().optional() });
marketRouter.get('/history', generalLimiter, validate({ query: historyQuery }), async (req, res) => {
  const player = getPlayer(req);
  const { query } = validated<unknown, z.infer<typeof historyQuery>>(req);
  res.json(await market.tradeHistory(player.id, Boolean(query?.me)));
});
