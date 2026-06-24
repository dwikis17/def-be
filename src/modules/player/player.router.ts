import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { validate, validated } from '../../middleware/validate.js';
import { getMeSnapshot, getLedgerPage } from '../../services/player.service.js';

export const meRouter: Router = Router();

meRouter.use(requireAuth, generalLimiter);

meRouter.get('/', async (req, res) => {
  const player = getPlayer(req);
  res.json(await getMeSnapshot(player.id));
});

const ledgerQuery = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).optional(),
});
meRouter.get('/ledger', validate({ query: ledgerQuery }), async (req, res) => {
  const player = getPlayer(req);
  const { query } = validated<unknown, z.infer<typeof ledgerQuery>>(req);
  res.json(await getLedgerPage(player.id, query?.cursor, query?.take));
});
