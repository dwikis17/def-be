import { Router } from 'express';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { getMeSnapshot } from '../../services/player.service.js';

export const meRouter: Router = Router();

meRouter.use(requireAuth, generalLimiter);

meRouter.get('/', async (req, res) => {
  const player = getPlayer(req);
  res.json(await getMeSnapshot(player.id));
});
