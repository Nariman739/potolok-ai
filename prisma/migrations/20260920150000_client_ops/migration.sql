-- CreateTable
CREATE TABLE "ClientOp" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientOp_masterId_createdAt_idx" ON "ClientOp"("masterId", "createdAt");
