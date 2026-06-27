import { Router } from 'express';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { getInventory } from '../../services/inventory.service.js';

export const inventoryRouter: Router = Router();

inventoryRouter.use(requireAuth);

// Read-only: the player's owned seeds. Seeds are bought on-chain (/purchase/seed)
// and consumed at plant time — there is no in-game selling.
inventoryRouter.get('/', generalLimiter, async (req, res) => {
  const player = getPlayer(req);
  res.json({ items: await getInventory(player.id) });
});
