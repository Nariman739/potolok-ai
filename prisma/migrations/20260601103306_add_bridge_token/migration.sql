-- CreateTable
CREATE TABLE "BridgeToken" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeToken_token_key" ON "BridgeToken"("token");

-- CreateIndex
CREATE INDEX "BridgeToken_expiresAt_idx" ON "BridgeToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "BridgeToken" ADD CONSTRAINT "BridgeToken_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
