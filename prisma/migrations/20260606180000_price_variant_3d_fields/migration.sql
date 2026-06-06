-- AlterTable PriceVariant: добавить поля для 3D-рендера и AI-привязки
ALTER TABLE "PriceVariant"
  ADD COLUMN "physicalWidthMm"  INTEGER,
  ADD COLUMN "physicalHeightMm" INTEGER,
  ADD COLUMN "colorHex"         TEXT,
  ADD COLUMN "mountingType"     TEXT,
  ADD COLUMN "glbModelUrl"      TEXT;
