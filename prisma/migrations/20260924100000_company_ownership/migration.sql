-- Данные принадлежат КОМПАНИИ, а не автору записи (24.09.2026).
-- До этого видимость считалась по masterId: убрали сотрудника из «Людей» —
-- его объекты, КП, клиенты и оплаты исчезали из ленты владельца, а уволенный
-- уносил клиентскую базу с телефонами.
--
-- Колонка добавляется как nullable и заполняется по текущей принадлежности:
-- активная компания мастера, иначе его собственная. Старый путь по masterId
-- продолжает работать — код читает по обоим признакам, пока переход не улёгся.

ALTER TABLE "MeasurementObject" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Estimate"          ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Client"            ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Payment"           ADD COLUMN IF NOT EXISTS "companyId" TEXT;

UPDATE "MeasurementObject" t SET "companyId" = COALESCE(
  (SELECT m."activeCompanyId" FROM "Master" m WHERE m.id = t."masterId"),
  (SELECT c.id FROM "Company" c WHERE c."ownerId" = t."masterId")
) WHERE t."companyId" IS NULL;

UPDATE "Estimate" t SET "companyId" = COALESCE(
  (SELECT m."activeCompanyId" FROM "Master" m WHERE m.id = t."masterId"),
  (SELECT c.id FROM "Company" c WHERE c."ownerId" = t."masterId")
) WHERE t."companyId" IS NULL;

UPDATE "Client" t SET "companyId" = COALESCE(
  (SELECT m."activeCompanyId" FROM "Master" m WHERE m.id = t."masterId"),
  (SELECT c.id FROM "Company" c WHERE c."ownerId" = t."masterId")
) WHERE t."companyId" IS NULL;

UPDATE "Payment" t SET "companyId" = COALESCE(
  (SELECT m."activeCompanyId" FROM "Master" m WHERE m.id = t."masterId"),
  (SELECT c.id FROM "Company" c WHERE c."ownerId" = t."masterId")
) WHERE t."companyId" IS NULL;

CREATE INDEX IF NOT EXISTS "MeasurementObject_companyId_idx" ON "MeasurementObject"("companyId");
CREATE INDEX IF NOT EXISTS "Estimate_companyId_idx"          ON "Estimate"("companyId");
CREATE INDEX IF NOT EXISTS "Client_companyId_idx"            ON "Client"("companyId");
CREATE INDEX IF NOT EXISTS "Payment_companyId_idx"           ON "Payment"("companyId");
