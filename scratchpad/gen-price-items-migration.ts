// Генерирует SQL миграции PriceItem из единого источника ролей (price-roles.ts) и каталога.
import { PRODUCT_ITEMS, LOWERED_DEFAULTS_2026_10 } from "../src/lib/constants";
import { TEMPLATE_ROLES, CATEGORY_ROLES, templateRole } from "../src/lib/price-roles";
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a?: string[]) => a && a.length ? `ARRAY[${a.map(q).join(",")}]::text[]` : `ARRAY[]::text[]`;
const js = (o?: object) => o ? `${q(JSON.stringify(o))}::jsonb` : "NULL";
const tplRows = PRODUCT_ITEMS.map((t) => { const m = templateRole(t.code); return `(${q(t.code)}, ${q(m.role)}, ${arr(m.appliesTo)}, ${js(m.wallKind)}, ${q(t.category)}, ${q(t.name)}, ${q(t.unit)}, ${t.defaultPrice})`; });
const catRows = Object.entries(CATEGORY_ROLES).map(([c, m]) => `(${q(c)}, ${q(m.role)}, ${arr(m.appliesTo)}, ${js(m.wallKind)})`);
const lowered = Object.entries(LOWERED_DEFAULTS_2026_10).map(([c, v]) => `(${q(c)}, ${v.from}, ${v.to})`);
void TEMPLATE_ROLES;
const sql = `-- «Мой прайс» (01.10.2026): одна таблица PriceItem вместо MasterPrice + PriceVariant + CustomItem.
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
${tplRows.join(",\n")}
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
  AND mp."itemCode" NOT IN (${PRODUCT_ITEMS.map((t) => q(t.code)).join(", ")})
ON CONFLICT ("companyId", "code") DO NOTHING;

-- 2. Свои варианты: PriceVariant → PriceItem С ТЕМ ЖЕ id (на него ссылаются комнаты и снапшоты КП).
--    Роль — по категории; имена штучных допработ (диффузор, вентиляция, пожарка, трубопровод,
--    демонтаж, блок питания, лайтбокс, радиус) → extra с needsReview, в какой бы категории ни лежали.
WITH cat("category", "role", "appliesTo", "wallKind") AS (VALUES
${catRows.join(",\n")}
)
INSERT INTO "PriceItem" ("id", "companyId", "code", "templateCode", "role", "appliesTo", "wallKind", "category", "name", "unit", "price", "installerPrice", "photoUrl", "isHidden", "needsReview", "sortOrder",
                         "physicalWidthMm", "physicalHeightMm", "colorHex", "mountingType", "glbModelUrl", "createdAt", "updatedAt", "deletedAt")
SELECT pv.id, c.id, 'own:' || pv.id, NULL,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN 'extra' ELSE COALESCE(cat."role", 'extra') END,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN ARRAY[]::text[] ELSE COALESCE(cat."appliesTo", ARRAY[]::text[]) END,
       CASE WHEN pv.name ~* '(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)' THEN NULL
            WHEN COALESCE(cat."role", '') = 'wall' THEN COALESCE(cat."wallKind", '{}'::jsonb) || jsonb_build_object('noInsert', pv."noInsert", 'withInsert', (pv.category = 'profile' AND NOT pv."noInsert"))
            ELSE cat."wallKind" END,
       pv.category,
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
${lowered.join(",\n")}
)
UPDATE "PriceItem" p SET "price" = low."to", "updatedAt" = NOW()
FROM low WHERE p."templateCode" = low."code" AND p."price" = low."from";
`;
process.stdout.write(sql);
