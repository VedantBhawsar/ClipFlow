-- DropIndex
DROP INDEX "users_id_idx";

-- CreateIndex
CREATE INDEX "videos_userId_createdAt_idx" ON "videos"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "youtube_channels_youtubeChannelId_idx" ON "youtube_channels"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "youtube_channels_status_idx" ON "youtube_channels"("status");
