-- CreateEnum
CREATE TYPE "VisualizationApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'ARCHIVED');

-- AlterTable VisualizationRender: approval workflow
ALTER TABLE "VisualizationRender"
  ADD COLUMN "approvalStatus" "VisualizationApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VisualizationRender_visualizationId_approvalStatus_idx" ON "VisualizationRender"("visualizationId", "approvalStatus");

-- AlterTable Estimate: optional attached visualizations
ALTER TABLE "Estimate"
  ADD COLUMN "attachedVisualizationIds" JSONB;
