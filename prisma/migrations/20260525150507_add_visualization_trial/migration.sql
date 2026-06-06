-- AlterTable: триал-биллинг для AI-визуализации.
-- trialEndAt — когда заканчивается период «5 рендеров в первый месяц».
-- trialRendersUsed — счётчик использованных триал-рендеров (НЕ ресетится календарно,
-- защита от регистрации 28-го числа = двойного триала в двух месяцах подряд).
ALTER TABLE "Master" ADD COLUMN "trialEndAt" TIMESTAMP(3);
ALTER TABLE "Master" ADD COLUMN "trialRendersUsed" INTEGER NOT NULL DEFAULT 0;

-- Backfill: всем существующим мастерам выставить trialEndAt = createdAt + 30 дней.
-- Если мастер уже старше 30 дней — триал считается закончившимся, останутся 1 рендер/мес.
UPDATE "Master" SET "trialEndAt" = "createdAt" + INTERVAL '30 days' WHERE "trialEndAt" IS NULL;
