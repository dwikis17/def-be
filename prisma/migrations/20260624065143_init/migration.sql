-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "walletPubkey" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gardens" (
    "playerId" UUID NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 2,
    "plots" JSONB NOT NULL,
    "activePet" JSONB,
    "dailyWateringXp" INTEGER NOT NULL DEFAULT 0,
    "dailyWateringDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gardens_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" BIGSERIAL NOT NULL,
    "playerId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_ledger" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvested_items" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "cropId" TEXT NOT NULL,
    "mutationKey" TEXT NOT NULL,
    "mutationLabel" TEXT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "value" BIGINT NOT NULL,
    "weather" TEXT,
    "plotPosition" INTEGER NOT NULL,
    "isNft" BOOLEAN NOT NULL DEFAULT false,
    "harvestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvested_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfts" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "harvestedItemId" UUID NOT NULL,
    "cropId" TEXT NOT NULL,
    "mutationKey" TEXT NOT NULL,
    "mutationLabel" TEXT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "chainStatus" TEXT NOT NULL DEFAULT 'pending',
    "assetId" TEXT,
    "txSignature" TEXT,
    "mintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mutationKey" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "cropId" TEXT,
    "mutationKey" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pricePerUnit" BIGINT NOT NULL,
    "nftId" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "cropId" TEXT,
    "mutationKey" TEXT,
    "nftId" UUID,
    "price" BIGINT NOT NULL,
    "feeBurn" BIGINT NOT NULL,
    "feeReward" BIGINT NOT NULL,
    "feeTreasury" BIGINT NOT NULL,
    "tradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather" (
    "id" BIGSERIAL NOT NULL,
    "event" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weather_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_scores" (
    "playerId" UUID NOT NULL,
    "weekStart" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "score" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "leaderboard_scores_pkey" PRIMARY KEY ("playerId","weekStart","board")
);

-- CreateTable
CREATE TABLE "leaderboard_payouts" (
    "id" UUID NOT NULL,
    "weekStart" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "nonce" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "playerId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("playerId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_walletPubkey_key" ON "players"("walletPubkey");

-- CreateIndex
CREATE INDEX "ledger_playerId_id_idx" ON "ledger"("playerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_playerId_idempotencyKey_key" ON "ledger"("playerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "treasury_ledger_kind_idx" ON "treasury_ledger"("kind");

-- CreateIndex
CREATE INDEX "harvested_items_playerId_harvestedAt_idx" ON "harvested_items"("playerId", "harvestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nfts_harvestedItemId_key" ON "nfts"("harvestedItemId");

-- CreateIndex
CREATE INDEX "nfts_playerId_idx" ON "nfts"("playerId");

-- CreateIndex
CREATE INDEX "nfts_chainStatus_idx" ON "nfts"("chainStatus");

-- CreateIndex
CREATE INDEX "inventory_playerId_idx" ON "inventory"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_playerId_kind_itemId_mutationKey_key" ON "inventory"("playerId", "kind", "itemId", "mutationKey");

-- CreateIndex
CREATE INDEX "listings_status_listedAt_idx" ON "listings"("status", "listedAt");

-- CreateIndex
CREATE INDEX "listings_cropId_mutationKey_idx" ON "listings"("cropId", "mutationKey");

-- CreateIndex
CREATE INDEX "listings_nftId_status_idx" ON "listings"("nftId", "status");

-- CreateIndex
CREATE INDEX "trades_buyerId_tradedAt_idx" ON "trades"("buyerId", "tradedAt");

-- CreateIndex
CREATE INDEX "trades_sellerId_tradedAt_idx" ON "trades"("sellerId", "tradedAt");

-- CreateIndex
CREATE INDEX "weather_endsAt_idx" ON "weather"("endsAt");

-- CreateIndex
CREATE INDEX "leaderboard_scores_weekStart_board_score_idx" ON "leaderboard_scores"("weekStart", "board", "score");

-- CreateIndex
CREATE INDEX "leaderboard_payouts_weekStart_board_idx" ON "leaderboard_payouts"("weekStart", "board");

-- CreateIndex
CREATE INDEX "claims_playerId_createdAt_idx" ON "claims"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "auth_nonces_pubkey_idx" ON "auth_nonces"("pubkey");

-- CreateIndex
CREATE INDEX "auth_nonces_expiresAt_idx" ON "auth_nonces"("expiresAt");

-- AddForeignKey
ALTER TABLE "gardens" ADD CONSTRAINT "gardens_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvested_items" ADD CONSTRAINT "harvested_items_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfts" ADD CONSTRAINT "nfts_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfts" ADD CONSTRAINT "nfts_harvestedItemId_fkey" FOREIGN KEY ("harvestedItemId") REFERENCES "harvested_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_payouts" ADD CONSTRAINT "leaderboard_payouts_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
