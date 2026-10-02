-- Диагонали замера комнаты (03.10.2026): раньше хранились только в черновике
-- мобилки и терялись при загрузке с сервера.
ALTER TABLE "MeasurementRoom" ADD COLUMN "measureDiagonals" JSONB;
ALTER TABLE "MeasurementRoom" ADD COLUMN "obliqueDiagonals" JSONB;
