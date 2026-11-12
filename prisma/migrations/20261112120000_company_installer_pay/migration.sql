-- Оплата монтажнику процентом от КП (12.11.2026): умолчание на компанию.
-- IF NOT EXISTS — колонки применяются к проду заранее (prisma db execute), migrate deploy при выкате их не споткнётся.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "installerPayMode" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "installerPayPercent" DOUBLE PRECISION;
