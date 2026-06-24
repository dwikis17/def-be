import { prisma } from '../src/db/prisma.js';
import { initialPlots, STARTING_BLOOM, STARTING_GRID_SIZE } from '../src/services/garden.state.js';

/**
 * Optional dev seed: a demo guest player with a starting balance. Run with
 * `npm run db:seed` against a dev database.
 */
async function main() {
  const player = await prisma.player.create({
    data: { isGuest: true, displayName: 'Demo Gardener' },
  });
  await prisma.garden.create({
    data: {
      playerId: player.id,
      gridSize: STARTING_GRID_SIZE,
      plots: initialPlots(STARTING_GRID_SIZE) as object[],
    },
  });
  await prisma.ledger.create({
    data: { playerId: player.id, amount: STARTING_BLOOM, reason: 'signup_bonus' },
  });
  console.log(`Seeded demo player ${player.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
