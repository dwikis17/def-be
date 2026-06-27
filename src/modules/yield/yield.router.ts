import { Router } from 'express';
import { requireAuth, requireWallet, getPlayer } from '../../middleware/auth.js';
import { generalLimiter, faucetLimiter } from '../../middleware/rateLimit.js';
import * as yieldSvc from './yield.service.js';

export const yieldRouter: Router = Router();

yieldRouter.use(requireAuth);

// Current accrual + rate (one DAS lookup) so the client can tick a claimable total.
yieldRouter.get('/', generalLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json(await yieldSvc.quoteYield(player.id));
});

// Mint accrued $BLOOM to the wallet. Requires a wallet; rate-limited like the
// faucet since each claim is an on-chain mint.
yieldRouter.post('/claim', requireWallet, faucetLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json(await yieldSvc.claimYield(player.id));
});
