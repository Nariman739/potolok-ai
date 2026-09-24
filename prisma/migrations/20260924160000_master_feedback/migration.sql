-- Пожелания мастеров (24.09.2026): ассистент спрашивает, чего не хватает,
-- и складывает ответы сюда. До этого обратная связь оставалась в чатах.
CREATE TABLE IF NOT EXISTS "MasterFeedback" (
  "id"        TEXT NOT NULL,
  "masterId"  TEXT NOT NULL,
  "companyId" TEXT,
  "topic"     TEXT NOT NULL DEFAULT 'другое',
  "text"      TEXT NOT NULL,
  "source"    TEXT NOT NULL DEFAULT 'assistant',
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MasterFeedback_createdAt_idx" ON "MasterFeedback"("createdAt");
CREATE INDEX IF NOT EXISTS "MasterFeedback_masterId_idx"  ON "MasterFeedback"("masterId");
CREATE INDEX IF NOT EXISTS "MasterFeedback_handledAt_idx" ON "MasterFeedback"("handledAt");

DO $$ BEGIN
  ALTER TABLE "MasterFeedback" ADD CONSTRAINT "MasterFeedback_masterId_fkey"
    FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
