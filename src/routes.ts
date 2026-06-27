import type { Express } from 'express';
import { authRouter } from './modules/auth/auth.router.js';
import { meRouter } from './modules/player/player.router.js';
import { gardenRouter } from './modules/garden/garden.router.js';
import { shopRouter } from './modules/shop/shop.router.js';
import { inventoryRouter } from './modules/inventory/inventory.router.js';
import { purchaseRouter } from './modules/purchase/purchase.router.js';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.router.js';
import { nftRouter } from './modules/nft/nft.router.js';

/**
 * Mounts all domain routers. Kept in one place so the API surface is easy to
 * audit. See docs/backend/04-api-and-data-model.md for the endpoint contract.
 */
export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/garden', gardenRouter);
  app.use('/shop', shopRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/purchase', purchaseRouter);
  app.use('/leaderboard', leaderboardRouter);
  app.use('/nfts', nftRouter);
}
