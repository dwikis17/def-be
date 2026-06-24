import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { economyTotals } from '../../lib/ledger.js';

export const economyRouter: Router = Router();

// Economy stats are auditable sums over the ledgers (docs §02/§04).
economyRouter.get('/stats', requireAuth, generalLimiter, async (_req, res) => {
  const totals = await economyTotals();
  res.json({
    totalBurned: totals.totalBurned,
    rewardPool: totals.rewardPool,
    treasury: totals.treasury,
    circulating: totals.circulating,
  });
});
