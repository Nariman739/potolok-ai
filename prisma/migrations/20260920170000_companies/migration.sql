-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "masterId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "defaultFee" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Master" ADD COLUMN "activeCompanyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerId_key" ON "Company"("ownerId");
CREATE INDEX "Member_companyId_removedAt_idx" ON "Member"("companyId", "removedAt");
CREATE INDEX "Member_masterId_idx" ON "Member"("masterId");
CREATE INDEX "Member_phone_idx" ON "Member"("phone");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Member" ADD CONSTRAINT "Member_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Member" ADD CONSTRAINT "Member_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Данные: каждый существующий мастер тихо становится компанией из себя одного
INSERT INTO "Company" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, COALESCE(NULLIF(trim("companyName"), ''), "firstName"), "id", now(), now()
FROM "Master";

INSERT INTO "Member" ("id", "companyId", "masterId", "name", "phone", "role", "createdAt", "joinedAt")
SELECT gen_random_uuid()::text, c."id", m."id", trim(m."firstName" || ' ' || COALESCE(m."lastName", '')), m."phone", 'owner', now(), now()
FROM "Master" m JOIN "Company" c ON c."ownerId" = m."id";
