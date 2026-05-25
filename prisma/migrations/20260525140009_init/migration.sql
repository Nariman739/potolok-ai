[dotenv@17.3.1] injecting env (12) from .env.local -- tip: 🔐 prevent committing .env to code: https://dotenvx.com/precommit
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'PROPLUS');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'CONFIRMED', 'REJECTED', 'REVISED');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "InstagramPostStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('INSTAGRAM', 'WHATSAPP', 'REFERRAL', 'SITE', 'KASPI', 'OTHER');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'WHATSAPP', 'MEASUREMENT', 'INSTALL', 'KP_CREATED', 'KP_VIEWED', 'KP_CONFIRMED', 'KP_REJECTED', 'STATUS_CHANGE', 'CONTRACT_CREATED', 'CONTRACT_SIGNED', 'ACT_CREATED', 'ACT_SIGNED', 'PHOTO_ADDED');

-- CreateEnum
CREATE TYPE "ObjectPhotoCategory" AS ENUM ('BEFORE', 'PROCESS', 'AFTER', 'MEASUREMENT', 'DEMOLITION', 'OTHER');

-- CreateEnum
CREATE TYPE "RangefinderStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ACTIVATED', 'SOLD');

-- CreateTable
CREATE TABLE "Master" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "companyName" TEXT,
    "logoUrl" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#1e3a5f',
    "instagramUrl" TEXT,
    "whatsappPhone" TEXT,
    "address" TEXT,
    "telegramChatId" TEXT,
    "telegramLinkCode" TEXT,
    "resetOtp" TEXT,
    "resetOtpExpiresAt" TIMESTAMP(3),
    "contractType" TEXT,
    "bin" TEXT,
    "iin" TEXT,
    "legalName" TEXT,
    "legalAddress" TEXT,
    "bankName" TEXT,
    "iban" TEXT,
    "kbe" TEXT,
    "bik" TEXT,
    "passportData" TEXT,
    "prepaymentPercent" INTEGER NOT NULL DEFAULT 50,
    "warrantyMaterials" INTEGER NOT NULL DEFAULT 10,
    "warrantyInstall" INTEGER NOT NULL DEFAULT 2,
    "contractCity" TEXT,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "kpGeneratedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "kpMonthReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidUntil" TIMESTAMP(3),
    "billingNotes" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "notifyDealWon" BOOLEAN NOT NULL DEFAULT true,
    "notifyDealLost" BOOLEAN NOT NULL DEFAULT false,
    "smmPostsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "smmMonthReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoGenerationsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "logoMonthReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoBrief" JSONB,
    "visualizationCredits" INTEGER NOT NULL DEFAULT 3,
    "visualizationsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "visualizationMonthReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "smmProfile" JSONB,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "portfolioSlug" TEXT,
    "portfolioBio" TEXT,

    CONSTRAINT "Master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterPrice" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "photoUrl" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MasterPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomItem" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceVariant" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseCode" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "photoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "noInsert" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "clientId" TEXT,
    "contractPublicId" TEXT,
    "contractTextSnapshot" JSONB,
    "contractCreatedAt" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "contractSignerName" TEXT,
    "contractSignerPassport" TEXT,
    "contractSignerIp" TEXT,
    "contractSignerUserAgent" TEXT,
    "workStartDate" TIMESTAMP(3),
    "workDurationDays" INTEGER,
    "paymentSchedule" JSONB,
    "actPublicId" TEXT,
    "actCreatedAt" TIMESTAMP(3),
    "actSignedAt" TIMESTAMP(3),
    "actSignerName" TEXT,
    "actSignerIp" TEXT,
    "actSignerUserAgent" TEXT,
    "actCompletionDate" TIMESTAMP(3),
    "roomsData" JSONB NOT NULL,
    "calculationData" JSONB NOT NULL,
    "totalArea" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "economyTotal" DOUBLE PRECISION,
    "standardTotal" DOUBLE PRECISION,
    "premiumTotal" DOUBLE PRECISION,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "recommendedVariant" TEXT,
    "confirmedVariant" TEXT,
    "pdfUrl" TEXT,
    "room3dPreviewUrl" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedRooms" JSONB,
    "calculationData" JSONB,
    "estimateId" TEXT,
    "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementObject" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "clientId" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "totalArea" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementRoom" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "walls" JSONB NOT NULL,
    "normalCorners" JSONB NOT NULL,
    "angles" JSONB,
    "arcBulges" JSONB,
    "columns" JSONB,
    "area" DOUBLE PRECISION NOT NULL,
    "perimeter" DOUBLE PRECISION NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previewUrl3d" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRenderLog" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "estimateId" TEXT,
    "renderUrl" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'black-forest-labs/flux-fill-pro',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRenderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visualization" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "objectId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "referenceUrl" TEXT,
    "markup" JSONB,
    "publicHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visualization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeilingElement" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "defaultQty" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeilingElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualizationElement" (
    "id" TEXT NOT NULL,
    "visualizationId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisualizationElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualizationRender" (
    "id" TEXT NOT NULL,
    "visualizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variantName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisualizationRender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioWork" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "ceilingType" TEXT,
    "area" DOUBLE PRECISION,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediaType" TEXT NOT NULL DEFAULT 'CAROUSEL',
    "coverIndex" INTEGER NOT NULL DEFAULT 0,
    "agentAnalysis" JSONB,
    "postType" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "instagramMediaId" TEXT,
    "status" "InstagramPostStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramSession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "mediaItems" JSONB NOT NULL DEFAULT '[]',
    "userContext" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "source" "ClientSource",
    "status" "DealStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectPhoto" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "clientId" TEXT,
    "estimateId" TEXT,
    "category" "ObjectPhotoCategory" NOT NULL DEFAULT 'PROCESS',
    "blobUrl" TEXT NOT NULL,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rangefinder" (
    "id" TEXT NOT NULL,
    "serial" TEXT,
    "name" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bleKey" TEXT,
    "qrCode" TEXT,
    "status" "RangefinderStatus" NOT NULL DEFAULT 'AVAILABLE',
    "ownerId" TEXT,
    "note" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rangefinder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogoGeneration" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "promptUsed" TEXT NOT NULL,
    "brief" JSONB,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Master_phone_key" ON "Master"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Master_email_key" ON "Master"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Master_telegramChatId_key" ON "Master"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Master_telegramLinkCode_key" ON "Master"("telegramLinkCode");

-- CreateIndex
CREATE UNIQUE INDEX "Master_portfolioSlug_key" ON "Master"("portfolioSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MasterPrice_masterId_itemCode_key" ON "MasterPrice"("masterId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "CustomItem_masterId_code_key" ON "CustomItem"("masterId", "code");

-- CreateIndex
CREATE INDEX "PriceVariant_masterId_category_idx" ON "PriceVariant"("masterId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_publicId_key" ON "Estimate"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_contractPublicId_key" ON "Estimate"("contractPublicId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_actPublicId_key" ON "Estimate"("actPublicId");

-- CreateIndex
CREATE INDEX "Estimate_clientId_idx" ON "Estimate"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_estimateId_key" ON "ChatSession"("estimateId");

-- CreateIndex
CREATE INDEX "MeasurementObject_masterId_status_idx" ON "MeasurementObject"("masterId", "status");

-- CreateIndex
CREATE INDEX "MeasurementObject_masterId_createdAt_idx" ON "MeasurementObject"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "MeasurementObject_clientId_idx" ON "MeasurementObject"("clientId");

-- CreateIndex
CREATE INDEX "MeasurementRoom_objectId_idx" ON "MeasurementRoom"("objectId");

-- CreateIndex
CREATE INDEX "AiRenderLog_masterId_createdAt_idx" ON "AiRenderLog"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRenderLog_estimateId_idx" ON "AiRenderLog"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "Visualization_publicHash_key" ON "Visualization"("publicHash");

-- CreateIndex
CREATE INDEX "Visualization_masterId_createdAt_idx" ON "Visualization"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "Visualization_objectId_idx" ON "Visualization"("objectId");

-- CreateIndex
CREATE INDEX "CeilingElement_masterId_category_idx" ON "CeilingElement"("masterId", "category");

-- CreateIndex
CREATE INDEX "CeilingElement_masterId_isHidden_idx" ON "CeilingElement"("masterId", "isHidden");

-- CreateIndex
CREATE INDEX "VisualizationElement_visualizationId_idx" ON "VisualizationElement"("visualizationId");

-- CreateIndex
CREATE INDEX "VisualizationElement_elementId_idx" ON "VisualizationElement"("elementId");

-- CreateIndex
CREATE INDEX "VisualizationRender_visualizationId_createdAt_idx" ON "VisualizationRender"("visualizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_masterId_key" ON "InstagramAccount"("masterId");

-- CreateIndex
CREATE INDEX "InstagramPost_instagramAccountId_status_idx" ON "InstagramPost"("instagramAccountId", "status");

-- CreateIndex
CREATE INDEX "InstagramPost_status_scheduledAt_idx" ON "InstagramPost"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramSession_chatId_key" ON "InstagramSession"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramSession_masterId_key" ON "InstagramSession"("masterId");

-- CreateIndex
CREATE INDEX "Client_masterId_status_idx" ON "Client"("masterId", "status");

-- CreateIndex
CREATE INDEX "Client_masterId_phone_idx" ON "Client"("masterId", "phone");

-- CreateIndex
CREATE INDEX "Client_masterId_createdAt_idx" ON "Client"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientEvent_clientId_createdAt_idx" ON "ClientEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ObjectPhoto_masterId_clientId_createdAt_idx" ON "ObjectPhoto"("masterId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ObjectPhoto_clientId_category_idx" ON "ObjectPhoto"("clientId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Rangefinder_serial_key" ON "Rangefinder"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Rangefinder_mac_key" ON "Rangefinder"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "Rangefinder_qrCode_key" ON "Rangefinder"("qrCode");

-- CreateIndex
CREATE INDEX "Rangefinder_ownerId_idx" ON "Rangefinder"("ownerId");

-- CreateIndex
CREATE INDEX "Rangefinder_status_idx" ON "Rangefinder"("status");

-- CreateIndex
CREATE INDEX "LogoGeneration_masterId_createdAt_idx" ON "LogoGeneration"("masterId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterPrice" ADD CONSTRAINT "MasterPrice_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceVariant" ADD CONSTRAINT "PriceVariant_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementObject" ADD CONSTRAINT "MeasurementObject_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementObject" ADD CONSTRAINT "MeasurementObject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementRoom" ADD CONSTRAINT "MeasurementRoom_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "MeasurementObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "MeasurementObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeilingElement" ADD CONSTRAINT "CeilingElement_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualizationElement" ADD CONSTRAINT "VisualizationElement_visualizationId_fkey" FOREIGN KEY ("visualizationId") REFERENCES "Visualization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualizationElement" ADD CONSTRAINT "VisualizationElement_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CeilingElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualizationRender" ADD CONSTRAINT "VisualizationRender_visualizationId_fkey" FOREIGN KEY ("visualizationId") REFERENCES "Visualization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioWork" ADD CONSTRAINT "PortfolioWork_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramSession" ADD CONSTRAINT "InstagramSession_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEvent" ADD CONSTRAINT "ClientEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectPhoto" ADD CONSTRAINT "ObjectPhoto_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectPhoto" ADD CONSTRAINT "ObjectPhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rangefinder" ADD CONSTRAINT "Rangefinder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogoGeneration" ADD CONSTRAINT "LogoGeneration_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

