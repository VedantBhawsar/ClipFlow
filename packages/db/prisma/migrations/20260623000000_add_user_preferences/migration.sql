-- CreateEnum
CREATE TYPE "ChapterBehavior" AS ENUM ('ALWAYS_REVIEW', 'AUTO_APPLY_IF_VALID');

-- CreateEnum
CREATE TYPE "ThumbnailStyleOverride" AS ENUM ('AUTO', 'BOLD', 'MINIMAL', 'TEXT_FORWARD');

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifyProcessingComplete" BOOLEAN NOT NULL DEFAULT true,
    "notifyPublished" BOOLEAN NOT NULL DEFAULT true,
    "notifyPublishFailed" BOOLEAN NOT NULL DEFAULT true,
    "notifyNeedsReauth" BOOLEAN NOT NULL DEFAULT true,
    "notifyWeeklySummary" BOOLEAN NOT NULL DEFAULT false,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultPublishTime" TEXT NOT NULL DEFAULT '18:00',
    "chapterBehavior" "ChapterBehavior" NOT NULL DEFAULT 'ALWAYS_REVIEW',
    "thumbnailStyle" "ThumbnailStyleOverride" NOT NULL DEFAULT 'AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;