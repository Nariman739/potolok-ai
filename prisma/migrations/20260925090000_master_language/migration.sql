-- Язык мастера (25.09.2026): приложение присылает выбор, сервер отвечает
-- на том же языке — ассистент, уведомления и документы клиенту.
ALTER TABLE "Master" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ru';
