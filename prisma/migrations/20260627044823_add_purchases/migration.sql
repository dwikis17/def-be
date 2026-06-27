-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txSignature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_txSignature_key" ON "purchases"("txSignature");

-- CreateIndex
CREATE INDEX "purchases_playerId_createdAt_idx" ON "purchases"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

