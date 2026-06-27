import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireWallet, getPlayer } from '../../middleware/auth.js';
import { generalLimiter, valueActionLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import * as purchase from './purchase.service.js';

export const purchaseRouter: Router = Router();

purchaseRouter.use(requireAuth);

// Intent-first (Solana Pay): the backend creates the pending purchase + reference
// BEFORE any payment, so a payment is recoverable even if the client dies after
// paying. The client attaches the reference to its $BLOOM transfer.
const seedBody = z.object({ cropId: z.string(), qty: z.number().int().positive().max(99) });
purchaseRouter.post(
  '/seed/intent',
  requireWallet,
  valueActionLimiter,
  requireIdempotency,
  validate({ body: seedBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof seedBody>>(req);
    res.json(await purchase.createSeedIntent(player.id, req.idempotencyKey!, body!.cropId, body!.qty));
  },
);

const expandBody = z.object({ gridSize: z.number().int().min(4).max(6) });
purchaseRouter.post(
  '/expand/intent',
  requireWallet,
  valueActionLimiter,
  requireIdempotency,
  validate({ body: expandBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof expandBody>>(req);
    res.json(await purchase.createExpandIntent(player.id, req.idempotencyKey!, body!.gridSize));
  },
);

// Client reports payment. `signature` is optional — even without it, the verify
// job discovers the tx by reference.
const submitParams = z.object({ id: z.string().uuid() });
const submitBody = z.object({ signature: z.string().min(64).optional() });
purchaseRouter.post(
  '/:id/submit',
  requireWallet,
  valueActionLimiter,
  validate({ params: submitParams, body: submitBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { params, body } = validated<z.infer<typeof submitBody>, unknown, z.infer<typeof submitParams>>(req);
    res.json(await purchase.attachSignature(player.id, params!.id, body?.signature));
  },
);

const idParams = z.object({ id: z.string().uuid() });
purchaseRouter.get('/:id', generalLimiter, validate({ params: idParams }), async (req, res) => {
  const player = getPlayer(req);
  const { params } = validated<unknown, unknown, z.infer<typeof idParams>>(req);
  res.json(await purchase.getPurchase(player.id, params!.id));
});
