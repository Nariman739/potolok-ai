-- Акт приёмки работ (27.09.2026): два состояния приёмки (без замечаний /
-- с замечаниями), замечания клиента с публичной страницы, особенности
-- объекта, фото результата, замороженный текст при подписи, способ подписи.
-- Все колонки пустые по умолчанию — старые акты не меняются.
ALTER TABLE "Estimate"
  ADD COLUMN IF NOT EXISTS "actRemarks" JSONB,
  ADD COLUMN IF NOT EXISTS "actRemarksDueDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "actClientRemarks" TEXT,
  ADD COLUMN IF NOT EXISTS "actClientRemarksAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actObjectNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "actPhotos" JSONB,
  ADD COLUMN IF NOT EXISTS "actTextSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "actSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actSignMethod" TEXT;
