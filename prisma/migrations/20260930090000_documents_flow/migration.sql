-- «Документы» в карточке объекта (30.09.2026): ИИН заказчика, когда отправлен
-- договор, одно напоминание про неподписанный акт, отметка «без договора».
ALTER TABLE "Estimate"
  ADD COLUMN IF NOT EXISTS "clientIin" TEXT,
  ADD COLUMN IF NOT EXISTS "contractSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actRemindedAt" TIMESTAMP(3);
ALTER TABLE "MeasurementObject"
  ADD COLUMN IF NOT EXISTS "docsDeclinedAt" TIMESTAMP(3);
