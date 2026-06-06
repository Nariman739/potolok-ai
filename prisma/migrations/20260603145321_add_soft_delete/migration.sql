-- Soft-delete: добавляем deletedAt + индекс для быстрой фильтрации
-- LIST-запросов (по masterId, deletedAt IS NULL) и для /dashboard/trash
-- (по masterId, deletedAt IS NOT NULL).
--
-- Закрывает блокер из аудита 2026-06-01: сейчас DELETE на Estimate /
-- Client / MeasurementObject / PriceVariant необратим. На фесте с
-- наплывом юзеров случайные удаления гарантированы.
--
-- MasterPrice НЕ трогаем — там уже есть Boolean isHidden, который
-- семантически идентичен soft-delete (мастер скрывает позицию, она
-- не показывается в прайсе/КП, но restorable выставлением isHidden=false).

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "MeasurementObject" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "PriceVariant" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Estimate_masterId_deletedAt_idx" ON "Estimate"("masterId", "deletedAt");
CREATE INDEX "Client_masterId_deletedAt_idx" ON "Client"("masterId", "deletedAt");
CREATE INDEX "MeasurementObject_masterId_deletedAt_idx" ON "MeasurementObject"("masterId", "deletedAt");
CREATE INDEX "PriceVariant_masterId_deletedAt_idx" ON "PriceVariant"("masterId", "deletedAt");
