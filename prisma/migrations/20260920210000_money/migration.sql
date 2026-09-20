-- AlterTable
ALTER TABLE "MeasurementObject" ADD COLUMN "materialCost" INTEGER,
ADD COLUMN "installerPaidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Master" ADD COLUMN "materialPercent" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "measurementObjectId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_measurementObjectId_paidAt_idx" ON "Payment"("measurementObjectId", "paidAt");
CREATE INDEX "Payment_masterId_paidAt_idx" ON "Payment"("masterId", "paidAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_measurementObjectId_fkey" FOREIGN KEY ("measurementObjectId") REFERENCES "MeasurementObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
