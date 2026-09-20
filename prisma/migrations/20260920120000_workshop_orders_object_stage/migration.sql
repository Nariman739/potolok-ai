-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'WORKSHOP_SENT';

-- AlterTable
ALTER TABLE "MeasurementObject" ADD COLUMN "manualStage" TEXT;

-- CreateTable
CREATE TABLE "WorkshopOrder" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "measurementObjectId" TEXT NOT NULL,
    "roomIds" JSONB NOT NULL,
    "roomsCount" INTEGER NOT NULL DEFAULT 0,
    "area" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopOrder_measurementObjectId_sentAt_idx" ON "WorkshopOrder"("measurementObjectId", "sentAt");

-- CreateIndex
CREATE INDEX "WorkshopOrder_masterId_sentAt_idx" ON "WorkshopOrder"("masterId", "sentAt");

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_measurementObjectId_fkey" FOREIGN KEY ("measurementObjectId") REFERENCES "MeasurementObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
