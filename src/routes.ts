import type { Express } from 'express';
import { authRouter } from './modules/auth/auth.router.js';
import { meRouter } from './modules/player/player.router.js';
import { economyRouter } from './modules/economy/economy.router.js';
import { gardenRouter } from './modules/garden/garden.router.js';
import { shopRouter } from './modules/shop/shop.router.js';
import { marketRouter } from './modules/market/market.router.js';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.router.js';
import { walletRouter } from './modules/wallet/wallet.router.js';
import { nftRouter } from './modules/nft/nft.router.js';

/**
 * Mounts all domain routers. Kept in one place so the API surface is easy to
 * audit. See docs/backend/04-api-and-data-model.md for the endpoint contract.
 */
export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/economy', economyRouter);
  app.use('/garden', gardenRouter);
  app.use('/shop', shopRouter);
  app.use('/market', marketRouter);
  app.use('/leaderboard', leaderboardRouter);
  app.use('/wallet', walletRouter);
  app.use('/nfts', nftRouter);
}
