-- «Мой прайс» (01.10.2026): одна таблица PriceItem вместо MasterPrice + PriceVariant + CustomItem.
-- Сгенерировано scratchpad/gen-price-items-migration.ts из src/lib/price-roles.ts и constants.ts.
-- Идемпотентна: повторный прогон ничего не дублирует (ON CONFLICT DO NOTHING).
-- Старые таблицы НЕ удаляются — код их больше не читает, дроп отдельной миграцией после OTA-окна.

CREATE TABLE IF NOT EXISTS "PriceItem" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "templateCode" TEXT,
  "role" TEXT NOT NULL,
  "appliesTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "wallKind" JSONB,
  "category" TEXT,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "installerPrice" DOUBLE PRECISION,
  "photoUrl" TEXT,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "physicalWidthMm" INTEGER,
  "physicalHeightMm" INTEGER,
  "colorHex" TEXT,
  "mountingType" TEXT,
  "glbModelUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceItem_companyId_code_key" ON "PriceItem"("companyId", "code");
CREATE INDEX IF NOT EXISTS "PriceItem_companyId_role_deletedAt_idx" ON "PriceItem"("companyId", "role", "deletedAt");
CREATE INDEX IF NOT EXISTS "PriceItem_companyId_category_deletedAt_idx" ON "PriceItem"("companyId", "category", "deletedAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceItem_companyId_fkey') THEN
    ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Компания есть у каждого мастера (миграция 20260920170000_companies + ensureOwnCompany).
-- На случай мастера без компании — создаём, иначе его прайс потерялся бы.
INSERT INTO "Company" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, COALESCE(NULLIF(TRIM(m."companyName"), ''), m."firstName"), m.id, NOW(), NOW()
FROM "Master" m WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."ownerId" = m.id);
INSERT INTO "Member" ("id", "companyId", "masterId", "name", "phone", "role", "createdAt", "joinedAt")
SELECT gen_random_uuid()::text, c.id, m.id, TRIM(CONCAT(m."firstName", ' ', COALESCE(m."lastName", ''))), m.phone, 'owner', NOW(), NOW()
FROM "Company" c JOIN "Master" m ON m.id = c."ownerId"
WHERE NOT EXISTS (SELECT 1 FROM "Member" mb WHERE mb."companyId" = c.id AND mb."masterId" = m.id);

-- 1. Каталожные позиции: MasterPrice → PriceItem (одна строка на компанию и код).
WITH tpl("code", "role", "appliesTo", "wallKind", "category", "name", "unit", "defaultPrice") AS (VALUES
('canvas_320', 'canvas', ARRAY[]::text[], NULL, 'canvas', 'Полотно матовое 320см', 'м²', 1500),
('canvas_550', 'canvas', ARRAY[]::text[], NULL, 'canvas', 'Полотно сатиновое 550см', 'м²', 2700),
('canvas_over', 'canvas', ARRAY[]::text[], NULL, 'canvas', 'Полотно глянцевое/цветное', 'м²', 3700),
('profile_plastic', 'wall', ARRAY['pvc_insert','pvc']::text[], '{"withInsert":true}'::jsonb, 'profile', 'Пластиковый профиль', 'м.п.', 500),
('insert', 'wall', ARRAY['pvc_insert','aluminum_insert']::text[], '{"companion":true}'::jsonb, 'profile', 'Вставка', 'м.п.', 600),
('profile_shadow', 'wall', ARRAY['shadow']::text[], '{"aluminumCorners":true}'::jsonb, 'profile', 'Теневой профиль', 'м.п.', 5000),
('profile_floating', 'wall', ARRAY['floating']::text[], '{"aluminumCorners":true}'::jsonb, 'profile', 'Парящий профиль', 'м.п.', 9000),
('profile_aluminum', 'wall', ARRAY['aluminum_insert','aluminum']::text[], '{"withInsert":true,"aluminumCorners":true}'::jsonb, 'profile', 'Алюминиевый профиль', 'м.п.', 3000),
('led_strip', 'wall', ARRAY['subcurtain_light']::text[], '{"companion":true}'::jsonb, 'profile', 'LED-подсветка по периметру', 'м.п.', 4500),
('spot_client', 'point', ARRAY['spot']::text[], NULL, 'spot', 'Софиты клиентские (установка)', 'шт.', 2500),
('spot_ours', 'point', ARRAY['spot']::text[], NULL, 'spot', 'Софиты GX53 с установкой', 'шт.', 3500),
('spot_pair_client', 'point', ARRAY['spot_pair']::text[], NULL, 'spot_pair', 'Двойной софит клиентский (установка)', 'пара', 4500),
('spot_pair_ours', 'point', ARRAY['spot_pair']::text[], NULL, 'spot_pair', 'Двойной софит с установкой', 'пара', 9000),
('pendant', 'point', ARRAY['pendant']::text[], NULL, 'spot', 'Закладная под бра / подвес', 'шт.', 1500),
('pendant_install', 'point', ARRAY['pendant']::text[], NULL, 'spot', 'Установка подвесного светильника', 'шт.', 3000),
('chandelier', 'point', ARRAY['chandelier']::text[], NULL, 'chandelier', 'Закладная под люстру', 'шт.', 2000),
('chandelier_install', 'point', ARRAY['chandelier']::text[], NULL, 'chandelier', 'Установка люстры', 'шт.', 5000),
('transformer', 'point', ARRAY['chandelier']::text[], NULL, 'chandelier', 'Трансформатор', 'шт.', 10000),
('track_magnetic', 'linear', ARRAY['track']::text[], NULL, 'track', 'Трек магнитный', 'м.п.', 20000),
('light_line', 'linear', ARRAY['lightline']::text[], NULL, 'lightline', 'Световая линия', 'м.п.', 15000),
('curtain_ldsp', 'linear', ARRAY['curtain']::text[], NULL, 'curtain', 'Карниз ЛДСП', 'м.п.', 3500),
('curtain_aluminum', 'linear', ARRAY['curtain']::text[], NULL, 'curtain', 'Карниз алюминиевый', 'м.п.', 5000),
('gardina_plastic', 'linear', ARRAY['gardina']::text[], NULL, 'gardina', 'Пластиковая гардина на потолок', 'м.п.', 5000),
('gardina_aluminum', 'linear', ARRAY['gardina']::text[], NULL, 'gardina', 'Встроенная гардина в потолок', 'м.п.', 10000),
('pk14', 'linear', ARRAY['gardina']::text[], NULL, 'gardina', 'Карниз ПК-14', 'м.п.', 15000),
('podshtornik_plastic', 'wall', ARRAY['subcurtain','subcurtain_light']::text[], '{"endsCeiling":true}'::jsonb, 'podshtornik', 'Подшторник пластиковый (брус)', 'м.п.', 2500),
('podshtornik_ldsp', 'wall', ARRAY['ldsp']::text[], '{"endsCeiling":true}'::jsonb, 'podshtornik', 'Подшторник ЛДСП (под галтели)', 'м.п.', 5500),
('podshtornik_aluminum', 'wall', ARRAY['subcurtain','subcurtain_light']::text[], '{"endsCeiling":true}'::jsonb, 'podshtornik', 'Подшторник алюминиевый', 'м.п.', 8000),
('corner_plastic', 'corner', ARRAY[]::text[], NULL, 'corner', 'Угол пластик', 'шт.', 1000),
('corner_aluminum', 'corner', ARRAY[]::text[], NULL, 'corner', 'Угол алюминий', 'шт.', 5000),
('corner_rounded', 'corner', ARRAY[]::text[], NULL, 'corner', 'Скруглённый угол', 'шт.', 5000),
('corner_furniture_bypass', 'corner', ARRAY[]::text[], NULL, 'corner', 'Обвод мебели до потолка', 'м.п.', 2000),
('corner_furniture_planned', 'corner', ARRAY[]::text[], NULL, 'corner', 'Уголок под будущую мебель', 'шт.', 1500),
('pipe_bypass', 'extra', ARRAY[]::text[], NULL, 'other', 'Обход трубы', 'шт.', 2000),
('eurobrus', 'wall', ARRAY['eurobrus']::text[], '{"endsCeiling":true}'::jsonb, 'other', 'Евробрус', 'м.п.', 5500),
('diffuser', 'extra', ARRAY[]::text[], NULL, 'other', 'Диффузор (установка)', 'шт.', 15000),
('vent_grille', 'extra', ARRAY[]::text[], NULL, 'other', 'Вентиляционная решётка', 'шт.', 15000),
('demontage', 'extra', ARRAY[]::text[], NULL, 'other', 'Демонтаж старого потолка', 'м²', 500),
('min_order', 'param', ARRAY[]::text[], NULL, 'special', 'Минимальный заказ', '₸', 90000),
('height_coefficient', 'param', ARRAY[]::text[], NULL, 'special', 'Коэффициент высоты (>3м)', '×', 1.3),
('install_canvas', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж полотна', 'м²', 800),
('install_profile', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж профиля', 'м.п.', 300),
('install_spot', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж софита', 'шт.', 1000),
('install_chandelier', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж люстры', 'шт.', 3000),
('install_track', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж трека', 'м.п.', 5000),
('install_lightline', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж световой линии', 'м.п.', 4000),
('install_curtain', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж карниза', 'м.п.', 1500),
('install_gardina', 'install', ARRAY[]::text[], NULL, 'install', 'Монтаж гардины', 'м.п.', 2000),
('install_corner', 'install', ARRAY[]::text[], NULL, 'install', 'Обработка угла', 'шт.', 500),
('install_pipe', 'install', ARRAY[]::text[], NULL, 'install', 'Обход трубы (работа)', 'шт.', 1000)
)
INSERT INTO "PriceItem" ("id", "companyId", "code", "templateCode", "role", "appliesTo", "wallKind", "category", "name", "unit", "price", "installerPrice", "photoUrl", "isHidden", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, mp."itemCode", mp."itemCode", tpl."role", tpl."appliesTo", tpl."wallKind", tpl."category", tpl."name", tpl."unit",
       mp.price, mp."installerPrice", mp."photoUrl", mp."isHidden", NOW(), NOW()
FROM "MasterPrice" mp
JOIN "Company" c ON c."ownerId" = mp."masterId"
JOIN tpl ON tpl."code" = mp."itemCode"
ON CONFLICT ("companyId", "code") DO NOTHING;

-- 1a. Коды вне каталога (spot_gu10, spot_double… — 34 мастера, невидимы и сейчас): переносим скрытыми, чтобы не потерять.
INSERT INTO "PriceItem" ("id", "companyId", "code", "templateCode", "role", "appliesTo", "category", "name", "unit", "price", "installerPrice", "photoUrl", "isHidden", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, mp."itemCode", NULL, 'extra', ARRAY[]::text[], 'legacy', mp."itemCode", 'шт.',
       mp.price, mp."installerPrice", mp."photoUrl", true, NOW(), NOW()
FROM "MasterPrice" mp
JOIN "Company" c ON c."ownerId" = mp."masterId"
WHERE NOT EXISTS (SELECT 1 FROM "PriceItem" p WHERE p."companyId" = c.id AND p."code" = mp."itemCode")
  AND mp."itemCode" NOT IN ('canvas_320', 'canvas_550', 'canvas_over', 'profile_plastic', 'insert', 'profile_shadow', 'profile_floating', 'profile_aluminum', 'led_strip', 'spot_client', 'spot_ours', 'spot_pair_client', 'spot_pair_ours', 'pendant', 'pendant_install', 'chandelier', 'chandelier_install', 'transformer', 'track_magnetic', 'light_line', 'curtain_ldsp', 'curtain_aluminum', 'gardina_plastic', 'gardina_aluminum', 'pk14', 'podshtornik_plastic', 'podshtornik_ldsp', 'podshtornik_aluminum', 'corner_plastic', 'corner_aluminum', 'corner_rounded', 'corner_furniture_bypass', 'corner_furniture_planned', 'pipe_bypass', 'eurobrus', 'diffuser', 'vent_grille', 'demontage', 'min_order', 'height_coefficient', 'install_canvas', 'install_profile', 'install_spot', 'install_chandelier', 'install_track', 'install_lightline', 'install_curtain', 'install_gardina', 'install_corner', 'install_pipe')
ON CONFLICT ("companyId", "code") DO NOTHING;

-- 2. Свои варианты: PriceVariant → PriceItem С ТЕМ ЖЕ id (на него ссылаются комнаты и снапшоты КП).
--    Роль — по категории; имена штучных допработ (диффузор, вентиляция, пожарка, трубопровод,
--    демонтаж, блок питания, лайтбокс, радиус) → extra с needsReview, в какой бы категории ни лежали.
WITH cat("category", "role", "appliesTo", "wallKind") AS (VALUES
('canvas', 'canvas', ARRAY[]::text[], NULL),
('profile', 'wall', ARRAY[]::text[], NULL),
('podshtornik', 'wall', ARRAY[]::text[], '{"endsCeiling":true}'::jsonb),
('spot', 'point', ARRAY['spot']::text[], NULL),
('spot_pair', 'point', ARRAY['spot_pair']::text[], NULL),
('chandelier', 'point', ARRAY['chandelier']::text[], NULL),
('track', 'linear', ARRAY['track']::text[], NULL),
('lightline', 'linear', ARRAY['lightline']::text[], NULL),
('curtain', 'linear', ARRAY['curtain']::text[], NULL),
('gardina', 'linear', ARRAY['gardina']::text[], NULL),
('corner', 'corner', ARRAY[]::text[], NULL),
('other', 'extra', ARRAY[]::text[], NULL),
('custom', 'extra', ARRAY[]::text[], NULL)
)
INSERT INTO "PriceItem" ("id", "companyId", "code", "templateCode", "role", "appliesTo", "wallKind", "category", "name", "unit", "price", "installerPrice", "photoUrl", "isHidden", "needsReview", "sortOrder",
                         "physicalWidthMm", "physicalHeightMm", "colorHex", "mountingType", "glbModelUrl", "createdAt", "updatedAt", "deletedAt")
SELECT pv.id, c.id, 'own:' || pv.id, NULL,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN 'extra' ELSE COALESCE(cat."role", 'extra') END,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN ARRAY[]::text[] ELSE COALESCE(cat."appliesTo", ARRAY[]::text[]) END,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN NULL
            WHEN COALESCE(cat."role", '') = 'wall' THEN COALESCE(cat."wallKind", '{}'::jsonb) || jsonb_build_object('noInsert', pv."noInsert", 'withInsert', (pv.category = 'profile' AND NOT pv."noInsert"))
            ELSE cat."wallKind" END,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN 'other' ELSE pv.category END,
       pv.name, pv.unit, pv.price, pv."installerPrice", pv."photoUrl", false,
       (pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' AND pv.category NOT IN ('other')),
       pv."sortOrder", pv."physicalWidthMm", pv."physicalHeightMm", pv."colorHex", pv."mountingType", pv."glbModelUrl", pv."createdAt", pv."updatedAt", pv."deletedAt"
FROM "PriceVariant" pv
JOIN "Company" c ON c."ownerId" = pv."masterId"
LEFT JOIN cat ON cat."category" = pv.category
ON CONFLICT ("companyId", "code") DO NOTHING;

-- 3. CustomItem (веб-калькулятор) → extra со своим кодом (на него ссылаются room.customItems).
INSERT INTO "PriceItem" ("id", "companyId", "code", "templateCode", "role", "appliesTo", "category", "name", "unit", "price", "createdAt", "updatedAt")
SELECT ci.id, c.id, ci.code, NULL, 'extra', ARRAY[]::text[], 'custom', ci.name, ci.unit, ci.price, ci."createdAt", ci."updatedAt"
FROM "CustomItem" ci JOIN "Company" c ON c."ownerId" = ci."masterId"
ON CONFLICT ("companyId", "code") DO NOTHING;

-- 4. Дефолты понижены до медиан активных мастеров (аудит 01.10.2026). Строка, равная СТАРОМУ
--    дефолту, = мастер её не трогал → ставим новый дефолт. Кто выставил своё — не меняется.
WITH low("code", "from", "to") AS (VALUES
('canvas_320', 2000, 1500),
('insert', 1000, 600),
('profile_shadow', 7000, 5000),
('profile_floating', 14000, 9000),
('spot_ours', 5000, 3500),
('track_magnetic', 27000, 20000),
('gardina_aluminum', 17000, 10000)
)
UPDATE "PriceItem" p SET "price" = low."to", "updatedAt" = NOW()
FROM low WHERE p."templateCode" = low."code" AND p."price" = low."from";
