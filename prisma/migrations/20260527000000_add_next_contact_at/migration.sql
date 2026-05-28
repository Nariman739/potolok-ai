-- AlterEnum
-- IF NOT EXISTS на случай повторного применения (если _prisma_migrations не зафиксировал)
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "nextContactAt" TIMESTAMP(3);

-- CreateIndex (partial — только строки с заполненным nextContactAt)
-- Prisma @@index не умеет partial, поэтому SQL вручную.
-- Партиал-индекс нужен потому что в большинстве клиентов nextContactAt = NULL,
-- а лента "Что делать" фильтрует именно по непустым значениям.
CREATE INDEX "Client_master_nextContact_partial_idx"
  ON "Client"("masterId", "nextContactAt")
  WHERE "nextContactAt" IS NOT NULL;
