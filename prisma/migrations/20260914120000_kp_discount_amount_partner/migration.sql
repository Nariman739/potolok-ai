-- Скидка в тенге (источник истины) + посредник в отдельной таблице
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Бэкфилл: старые КП хранили скидку только в %, а total — уже со скидкой.
-- Восстанавливаем сумму так же, как это делали PDF и мобилка: total / (1 - dp/100) - total.
UPDATE "Estimate"
SET "discountAmount" = ROUND(("total" / (1 - "discountPercent" / 100.0)) - "total")
WHERE "discountPercent" > 0 AND "discountPercent" < 100 AND "discountAmount" = 0;

CREATE TABLE IF NOT EXISTS "EstimatePartner" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "percent" DOUBLE PRECISION,
    "coef" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstimatePartner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EstimatePartner_estimateId_key" ON "EstimatePartner"("estimateId");

ALTER TABLE "EstimatePartner" ADD CONSTRAINT "EstimatePartner_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
