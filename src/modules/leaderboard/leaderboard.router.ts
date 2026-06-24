import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { validate, validated } from '../../middleware/validate.js';
import { getLeaderboard } from '../../services/leaderboard.service.js';

export const leaderboardRouter: Router = Router();

const query = z.object({ board: z.enum(['harvestValue', 'mutationHunter']).default('harvestValue') });

leaderboardRouter.get(
  '/',
  requireAuth,
  generalLimiter,
  validate({ query }),
  async (req, res) => {
    const player = getPlayer(req);
    const { query: q } = validated<unknown, z.infer<typeof query>>(req);
    res.json(await getLeaderboard(q!.board, player.id));
  },
);
