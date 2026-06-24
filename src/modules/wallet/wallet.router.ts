import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireWallet, getPlayer } from '../../middleware/auth.js';
import { valueActionLimiter, generalLimiter } from '../../middleware/rateLimit.js';
import { requireIdempotency } from '../../middleware/idempotencyKey.js';
import { validate, validated } from '../../middleware/validate.js';
import * as wallet from './wallet.service.js';

export const walletRouter: Router = Router();

walletRouter.use(requireAuth);

const claimBody = z.object({ amount: z.number().int().positive() });
walletRouter.post(
  '/claim',
  requireWallet,
  valueActionLimiter,
  requireIdempotency,
  validate({ body: claimBody }),
  async (req, res) => {
    const player = getPlayer(req);
    const { body } = validated<z.infer<typeof claimBody>>(req);
    res.json(await wallet.createClaim(player.id, req.idempotencyKey!, body!.amount));
  },
);

const claimParams = z.object({ id: z.string().uuid() });
walletRouter.get('/claim/:id', generalLimiter, validate({ params: claimParams }), async (req, res) => {
  const player = getPlayer(req);
  const { params } = validated<unknown, unknown, z.infer<typeof claimParams>>(req);
  res.json(await wallet.getClaim(player.id, params!.id));
});
