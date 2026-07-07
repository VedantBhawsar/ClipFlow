-- Add thumbnail generation models + selectedThumbnailId to videos.
--
-- Four new tables:
--   thumbnails                  — generated thumbnail candidates per video
--   thumbnail_generations       — per-attempt generation logs with prompt/error context
--   channel_thumbnail_styles    — cached vision analysis of a creator's existing thumbnails
--
-- One new column on videos:
--   selectedThumbnailId         — the user's chosen thumbnail (nullable, unique)

-- CreateEnum
CREATE TYPE "ThumbnailSource" AS ENUM ('AI_GENERATED', 'USER_UPLOADED');

-- CreateEnum
CREATE TYPE "ThumbnailGenStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable: thumbnails
CREATE TABLE "thumbnails" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "source" "ThumbnailSource" NOT NULL DEFAULT 'AI_GENERATED',
    "generationIndex" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thumbnails_videoId_idx" ON "thumbnails"("videoId");

-- AddForeignKey
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: thumbnail_generations
CREATE TABLE "thumbnail_generations" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" "ThumbnailGenStatus" NOT NULL DEFAULT 'PENDING',
    "promptText" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "chapterRefs" JSONB,
    "frameRefs" JSONB,
    "channelStyleId" TEXT,
    "generatedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "thumbnail_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thumbnail_generations_videoId_idx" ON "thumbnail_generations"("videoId");

-- AddForeignKey
ALTER TABLE "thumbnail_generations" ADD CONSTRAINT "thumbnail_generations_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: channel_thumbnail_styles
CREATE TABLE "channel_thumbnail_styles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dominantColors" JSONB,
    "textPlacement" TEXT,
    "compositionStyle" TEXT,
    "facePresence" TEXT,
    "brandElements" JSONB,
    "analysisRaw" TEXT,
    "styleOverride" "ThumbnailStyleOverride" NOT NULL DEFAULT 'AUTO',
    "thumbnailCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_thumbnail_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_thumbnail_styles_userId_key" ON "channel_thumbnail_styles"("userId");

-- AddForeignKey
ALTER TABLE "channel_thumbnail_styles" ADD CONSTRAINT "channel_thumbnail_styles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: videos — add selectedThumbnailId
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "selectedThumbnailId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "videos_selectedThumbnailId_key" ON "videos"("selectedThumbnailId");
