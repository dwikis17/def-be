import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlayer } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { validate, validated } from '../../middleware/validate.js';
import { prisma } from '../../db/prisma.js';
import { Err } from '../../lib/errors.js';

export const nftRouter: Router = Router();

const metaParams = z.object({ id: z.string().uuid() });
// Public Metaplex-format metadata (the cNFT's on-chain `uri` points here).
nftRouter.get('/:id/metadata', validate({ params: metaParams }), async (req, res) => {
  const { params: p } = validated<unknown, unknown, z.infer<typeof metaParams>>(req);
  const nft = await prisma.nft.findUnique({ where: { id: p!.id } });
  if (!nft) throw Err.notFound('NFT not found');
  res.json(nft.metadata);
});

nftRouter.use(requireAuth, generalLimiter);

nftRouter.get('/', async (req, res) => {
  const player = getPlayer(req);
  const nfts = await prisma.nft.findMany({
    where: { playerId: player.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ nfts });
});

const params = z.object({ id: z.string().uuid() });
nftRouter.get('/:id', validate({ params }), async (req, res) => {
  const player = getPlayer(req);
  const { params: p } = validated<unknown, unknown, z.infer<typeof params>>(req);
  const nft = await prisma.nft.findUnique({ where: { id: p!.id } });
  if (!nft || nft.playerId !== player.id) throw Err.notFound('NFT not found');
  res.json(nft);
});
