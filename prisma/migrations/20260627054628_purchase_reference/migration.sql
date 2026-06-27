-- Add the reference column nullable first, backfill existing rows (pre-reference
-- purchases get their own id as a placeholder reference), then enforce NOT NULL.
ALTER TABLE "purchases" ADD COLUMN "reference" TEXT;
UPDATE "purchases" SET "reference" = "id"::text WHERE "reference" IS NULL;
ALTER TABLE "purchases" ALTER COLUMN "reference" SET NOT NULL;

-- txSignature is no longer known at row-creation time (intent-first flow).
ALTER TABLE "purchases" ALTER COLUMN "txSignature" DROP NOT NULL;

CREATE UNIQUE INDEX "purchases_reference_key" ON "purchases"("reference");
