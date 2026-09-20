-- AlterTable
ALTER TABLE "MeasurementObject" ADD COLUMN "measuredByMemberId" TEXT,
ADD COLUMN "installerMemberId" TEXT,
ADD COLUMN "installerFee" INTEGER,
ADD COLUMN "installAt" TIMESTAMP(3),
ADD COLUMN "workOrderToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementObject_workOrderToken_key" ON "MeasurementObject"("workOrderToken");

-- AddForeignKey
ALTER TABLE "MeasurementObject" ADD CONSTRAINT "MeasurementObject_measuredByMemberId_fkey" FOREIGN KEY ("measuredByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeasurementObject" ADD CONSTRAINT "MeasurementObject_installerMemberId_fkey" FOREIGN KEY ("installerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
