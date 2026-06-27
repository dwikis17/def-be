import { Router } from 'express';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import * as shop from './shop.service.js';

export const shopRouter: Router = Router();

shopRouter.use(requireAuth);

shopRouter.get('/catalog', generalLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json(await shop.getCatalog(player.id));
});
