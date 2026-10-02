-- Ширина рулона у полотна (Нариман 02.10.2026): расчёт берёт самое узкое полотно,
-- перекрывающее комнату по меньшей стороне. Каталожные — 320/550, «любая» — NULL,
-- свои полотна — из названия («до 5 метра», «5,5 м», «320 см», «BAUF 270»).
ALTER TABLE "PriceItem" ADD COLUMN IF NOT EXISTS "maxWidthCm" INTEGER;

UPDATE "PriceItem" SET "maxWidthCm" = 320 WHERE "templateCode" = 'canvas_320' AND "maxWidthCm" IS NULL;
UPDATE "PriceItem" SET "maxWidthCm" = 550 WHERE "templateCode" = 'canvas_550' AND "maxWidthCm" IS NULL;

-- Свои полотна заполняет scratchpad/backfill-roll-width.mjs (парсер parseRollWidthCm — один на сервер и бэкфилл).

-- Имена каталожных позиций в PriceItem были скопированы при миграции 01.10 — подтягиваем к каталогу
-- (мастер каталожные не переименовывает, это безопасно).
UPDATE "PriceItem" SET name = 'Полотно матовое (до 3,2 м)', "updatedAt" = NOW() WHERE "templateCode" = 'canvas_320';
UPDATE "PriceItem" SET name = 'Полотно сатиновое (до 5,5 м)', "updatedAt" = NOW() WHERE "templateCode" = 'canvas_550';
UPDATE "PriceItem" SET name = 'Полотно глянцевое/цветное (любая ширина)', "updatedAt" = NOW() WHERE "templateCode" = 'canvas_over';
UPDATE "PriceItem" SET name = 'Закладная под бра / подвес', "updatedAt" = NOW() WHERE "templateCode" = 'pendant';
