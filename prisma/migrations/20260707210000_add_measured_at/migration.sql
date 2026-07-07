-- «Дата замера»: когда мастер физически замерял на объекте (= момент
-- создания 1-й комнаты на клиенте). НЕ меняется при пересчёте/правках дома,
-- в отличие от updatedAt. null у существующих записей → клиент делает
-- fallback на createdAt. Фидбек мастера 07.07.2026.

-- AlterTable
ALTER TABLE "MeasurementObject" ADD COLUMN "measuredAt" TIMESTAMP(3);
