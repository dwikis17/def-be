import { AppError, Err } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { balanceOf, writeLedger, writeTreasury } from '../../lib/ledger.js';
import { prisma, type Tx } from '../../db/prisma.js';
import { calculateMarketplaceFees, XP_REWARDS, levelFromXp } from '../../game/index.js';
import { publishBroadcast } from '../../realtime/pubsub.js';

/** GET /market/listings — active listings, filterable + paginated. */
export async function listListings(opts: {
  crop?: string;
  tier?: string;
  sort?: 'price_asc' | 'price_desc' | 'newest';
  cursor?: string;
  take?: number;
}) {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
  const orderBy =
    opts.sort === 'price_asc'
      ? { pricePerUnit: 'asc' as const }
      : opts.sort === 'price_desc'
        ? { pricePerUnit: 'desc' as const }
        : { listedAt: 'desc' as const };

  const rows = await prisma.listing.findMany({
    where: {
      status: 'active',
      ...(opts.crop ? { cropId: opts.crop } : {}),
      ...(opts.tier ? { mutationKey: opts.tier } : {}),
    },
    orderBy,
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return { listings: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

/**
 * POST /market/listings — list an NFT or a stack of harvested produce.
 * Verifies the seller owns the asset; moves it out of the seller's holdings so
 * it can't be double-listed.
 */
export async function createListing(
  sellerId: string,
  key: string,
  input: {
    nftId?: string;
    cropId?: string;
    mutationTier?: string;
    quantity?: number;
    pricePerUnit: number;
  },
) {
  if (input.pricePerUnit <= 0) throw Err.validation('pricePerUnit must be positive');
  const price = BigInt(input.pricePerUnit);

  return withIdempotency(sellerId, key, async (tx) => {
    if (input.nftId) {
      const nft = await tx.nft.findUnique({ where: { id: input.nftId } });
      if (!nft || nft.playerId !== sellerId) throw new AppError('NOT_OWNER', 'You do not own this NFT');
      const activeForNft = await tx.listing.findFirst({
        where: { nftId: input.nftId, status: 'active' },
      });
      if (activeForNft) throw new AppError('CONFLICT', 'NFT is already listed');

      const listing = await tx.listing.create({
        data: {
          sellerId,
          nftId: nft.id,
          cropId: nft.cropId,
          mutationKey: nft.mutationKey,
          quantity: 1,
          pricePerUnit: price,
        },
      });
      publishBroadcast({ type: 'market.new', listing });
      return { listing };
    }

    // Fungible produce path (from Inventory kind 'harvest').
    if (!input.cropId || !input.mutationTier) throw Err.validation('cropId and mutationTier required');
    const qty = input.quantity ?? 1;
    if (qty <= 0) throw Err.validation('quantity must be positive');

    const inv = await tx.inventory.findUnique({
      where: {
        playerId_kind_itemId_mutationKey: {
          playerId: sellerId,
          kind: 'harvest',
          itemId: input.cropId,
          mutationKey: input.mutationTier,
        },
      },
    });
    if (!inv || inv.quantity < qty) throw new AppError('NOT_OWNER', 'Insufficient items to list');
    await tx.inventory.update({ where: { id: inv.id }, data: { quantity: { decrement: qty } } });

    const listing = await tx.listing.create({
      data: {
        sellerId,
        cropId: input.cropId,
        mutationKey: input.mutationTier,
        quantity: qty,
        pricePerUnit: price,
      },
    });
    publishBroadcast({ type: 'market.new', listing });
    return { listing };
  });
}

/**
 * POST /market/listings/:id/buy — lock the listing, charge the buyer, apply the
 * 3% fee split, pay the seller the net, transfer the asset, record the trade.
 */
export async function buyListing(buyerId: string, key: string, listingId: string) {
  return withIdempotency(buyerId, key, async (tx) => {
    // Lock the listing row so two buyers can't both win it.
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== 'active') throw new AppError('LISTING_GONE', 'Listing no longer available');
    if (listing.sellerId === buyerId) throw Err.validation('Cannot buy your own listing');

    const price = listing.pricePerUnit * BigInt(listing.quantity);
    const balance = await balanceOf(buyerId, tx);
    if (balance < price) throw Err.insufficientBalance();

    const fees = calculateMarketplaceFees(Number(price));
    const sellerNet = BigInt(fees.sellerReceives);

    // Ledger: buyer debited full price; seller credited net.
    await writeLedger(tx, [
      { playerId: buyerId, amount: -price, reason: 'market_buy', refType: 'listing', refId: listing.id },
      { playerId: listing.sellerId, amount: sellerNet, reason: 'market_sell_net', refType: 'listing', refId: listing.id },
    ]);
    await writeTreasury(tx, [
      { kind: 'burn', amount: BigInt(fees.burn), ref: 'market' },
      { kind: 'reward_pool', amount: BigInt(fees.reward), ref: 'market' },
      { kind: 'treasury', amount: BigInt(fees.treasury), ref: 'market' },
    ]);

    // Transfer the asset.
    await transferAsset(tx, listing, buyerId);

    const trade = await tx.trade.create({
      data: {
        listingId: listing.id,
        buyerId,
        sellerId: listing.sellerId,
        cropId: listing.cropId,
        mutationKey: listing.mutationKey,
        nftId: listing.nftId,
        price,
        feeBurn: BigInt(fees.burn),
        feeReward: BigInt(fees.reward),
        feeTreasury: BigInt(fees.treasury),
      },
    });
    await tx.listing.update({ where: { id: listing.id }, data: { status: 'sold' } });

    // Seller earns marketplace-sell XP.
    const seller = await tx.player.findUniqueOrThrow({ where: { id: listing.sellerId } });
    const newXp = seller.xp + XP_REWARDS.marketSell;
    await tx.player.update({
      where: { id: seller.id },
      data: { xp: newXp, level: levelFromXp(newXp).level },
    });

    publishBroadcast({ type: 'market.sold', listingId: listing.id });
    return { trade, balance: balance - price };
  });
}

async function transferAsset(
  tx: Tx,
  listing: { nftId: string | null; cropId: string | null; mutationKey: string | null; quantity: number },
  buyerId: string,
): Promise<void> {
  if (listing.nftId) {
    await tx.nft.update({ where: { id: listing.nftId }, data: { playerId: buyerId } });
    return;
  }
  // Fungible produce → buyer inventory.
  if (listing.cropId && listing.mutationKey) {
    await tx.inventory.upsert({
      where: {
        playerId_kind_itemId_mutationKey: {
          playerId: buyerId,
          kind: 'harvest',
          itemId: listing.cropId,
          mutationKey: listing.mutationKey,
        },
      },
      create: {
        playerId: buyerId,
        kind: 'harvest',
        itemId: listing.cropId,
        mutationKey: listing.mutationKey,
        quantity: listing.quantity,
      },
      update: { quantity: { increment: listing.quantity } },
    });
  }
}

/** DELETE /market/listings/:id — cancel & return the asset to the seller. */
export async function cancelListing(sellerId: string, listingId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.sellerId !== sellerId) throw Err.notFound('Listing not found');
    if (listing.status !== 'active') throw new AppError('LISTING_GONE', 'Listing is not active');

    // Return fungible produce to inventory (NFTs never left the seller's record).
    if (!listing.nftId && listing.cropId && listing.mutationKey) {
      await tx.inventory.upsert({
        where: {
          playerId_kind_itemId_mutationKey: {
            playerId: sellerId,
            kind: 'harvest',
            itemId: listing.cropId,
            mutationKey: listing.mutationKey,
          },
        },
        create: {
          playerId: sellerId,
          kind: 'harvest',
          itemId: listing.cropId,
          mutationKey: listing.mutationKey,
          quantity: listing.quantity,
        },
        update: { quantity: { increment: listing.quantity } },
      });
    }
    await tx.listing.update({ where: { id: listing.id }, data: { status: 'cancelled' } });
    return { ok: true };
  });
}

/** GET /market/history?me=true — a player's trades (as buyer or seller). */
export async function tradeHistory(playerId: string, mineOnly: boolean) {
  const where = mineOnly ? { OR: [{ buyerId: playerId }, { sellerId: playerId }] } : {};
  const trades = await prisma.trade.findMany({ where, orderBy: { tradedAt: 'desc' }, take: 100 });
  return { trades };
}
