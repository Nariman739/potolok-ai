-- Свой договор мастера (26.09.2026). Правится разговором с помощником,
-- каждая правка — новая версия, старые остаются для отката.
-- На подписанные договоры смена шаблона не влияет: там текст заморожен
-- в Estimate.contractTextSnapshot на момент создания.
CREATE TABLE IF NOT EXISTS "MasterContract" (
  "id"        TEXT NOT NULL,
  "masterId"  TEXT NOT NULL,
  "companyId" TEXT,
  "kind"      TEXT NOT NULL DEFAULT 'contract',
  "language"  TEXT NOT NULL DEFAULT 'ru',
  "version"   INTEGER NOT NULL DEFAULT 1,
  "body"      TEXT NOT NULL,
  "note"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterContract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MasterContract_masterId_kind_language_isActive_idx"
  ON "MasterContract"("masterId", "kind", "language", "isActive");
CREATE INDEX IF NOT EXISTS "MasterContract_masterId_createdAt_idx"
  ON "MasterContract"("masterId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "MasterContract" ADD CONSTRAINT "MasterContract_masterId_fkey"
    FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
