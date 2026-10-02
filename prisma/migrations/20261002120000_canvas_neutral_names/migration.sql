-- Полотно без «матовое/сатин/глянец» (Нариман 02.10.2026): мастер сам называет плёнку.
-- Меняем только строки, которые ещё носят каталожное имя (переименованные мастером не трогаем).
UPDATE "PriceItem" SET name = 'Полотно (до 3,2 м)', "updatedAt" = NOW()
 WHERE "templateCode" = 'canvas_320' AND name IN ('Полотно матовое (до 3,2 м)', 'Полотно матовое 320см');
UPDATE "PriceItem" SET name = 'Полотно (до 5,5 м)', "updatedAt" = NOW()
 WHERE "templateCode" = 'canvas_550' AND name IN ('Полотно сатиновое (до 5,5 м)', 'Полотно сатиновое 550см');
UPDATE "PriceItem" SET name = 'Полотно (любая ширина)', "updatedAt" = NOW()
 WHERE "templateCode" = 'canvas_over' AND name IN ('Полотно глянцевое/цветное (любая ширина)', 'Полотно глянцевое/цветное');
