-- Personalized thumbnail-style analysis (onboarding step 5 + settings re-entry).
--
-- Adds three columns to channel_thumbnail_styles:
--   selectedThumbnailUrls — the user's explicit picks (1-4). Empty = worker auto-picked.
--   confidence            — HIGH/LOW flag for downstream fallback behavior.
--   lowConfidenceReason   — machine-readable prefix when Gemini returns malformed JSON.
--
-- The thumbnail worker (apps/worker/src/jobs/thumbnails.ts) reads confidence
-- and short-circuits buildStyleDescription when LOW (decides not to invent a
-- style the creator didn't have).

-- CreateEnum
CREATE TYPE "ChannelStyleConfidence" AS ENUM ('HIGH', 'LOW');

-- AlterTable: channel_thumbnail_styles
ALTER TABLE "channel_thumbnail_styles"
    ADD COLUMN "selectedThumbnailUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "confidence" "ChannelStyleConfidence" NOT NULL DEFAULT 'HIGH',
    ADD COLUMN "lowConfidenceReason" TEXT;
