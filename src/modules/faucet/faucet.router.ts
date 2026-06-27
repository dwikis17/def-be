import { Router } from 'express';
import { requireAuth, requireWallet, getPlayer } from '../../middleware/auth.js';
import { faucetLimiter } from '../../middleware/rateLimit.js';
import * as faucet from './faucet.service.js';

export const faucetRouter: Router = Router();

faucetRouter.use(requireAuth);

// Config so the client can show/hide the claim button (and the amount).
faucetRouter.get('/', (_req, res) => {
  res.json(faucet.faucetConfig());
});

// Claim FAUCET_AMOUNT $BLOOM to the caller's wallet. Repeatable; requires a
// wallet-bound account and is rate-limited (each claim is an on-chain mint).
faucetRouter.post('/claim', requireWallet, faucetLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json(await faucet.claimFaucet(player.id));
});
