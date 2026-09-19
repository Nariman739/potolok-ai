-- Связь КП → объект (замер). До 19.09.2026 замер при создании КП уходил
-- в корзину, из-за чего ломался сценарий «через 2-3 дня отправить в цех»
-- (кнопка «В цех» работает только с живым замером). Потеряно было 128 из 478.
-- Колонка nullable: старые КП остаются без связи, ничего не теряется.

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "measurementObjectId" TEXT;

-- CreateIndex
CREATE INDEX "Estimate_measurementObjectId_idx" ON "Estimate"("measurementObjectId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_measurementObjectId_fkey" FOREIGN KEY ("measurementObjectId") REFERENCES "MeasurementObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
