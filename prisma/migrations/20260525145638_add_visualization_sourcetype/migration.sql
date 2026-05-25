-- AlterTable
-- Добавляем sourceType для различения источника: фото клиента + разметка (reference),
-- снимок 3D-сцены конструктора (scene3d), 2D-план + RoomElement[] для mobile (scene2d).
-- Все существующие записи получают reference (старый flow).
ALTER TABLE "Visualization" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'reference';
