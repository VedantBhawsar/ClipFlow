-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADED', 'READY', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED');

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "categoryId" TEXT NOT NULL DEFAULT '22',
    "privacyStatus" TEXT NOT NULL DEFAULT 'private',
    "originalFilename" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'video/mp4',
    "s3KeyOriginal" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureReason" TEXT,
    "scheduledPublishAt" TIMESTAMP(3),
    "youtubeVideoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_s3KeyOriginal_key" ON "videos"("s3KeyOriginal");

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtubeVideoId_key" ON "videos"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "videos_userId_status_idx" ON "videos"("userId", "status");

-- CreateIndex
CREATE INDEX "videos_scheduledPublishAt_idx" ON "videos"("scheduledPublishAt");

-- CreateIndex
CREATE INDEX "videos_status_scheduledPublishAt_idx" ON "videos"("status", "scheduledPublishAt");

-- CreateIndex
CREATE INDEX "users_id_idx" ON "users"("id");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "youtube_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
