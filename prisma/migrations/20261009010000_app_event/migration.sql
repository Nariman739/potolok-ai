-- События приложения (09.10.2026): «открыл 3D», итог 3D-сессии.
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "platform" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppEvent_name_createdAt_idx" ON "AppEvent"("name", "createdAt");
CREATE INDEX "AppEvent_masterId_createdAt_idx" ON "AppEvent"("masterId", "createdAt");
