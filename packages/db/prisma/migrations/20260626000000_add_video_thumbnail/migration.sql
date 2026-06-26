-- Add custom-thumbnail support to the videos table.
--
-- Both columns are nullable so existing rows continue to work — only
-- rows created via the create-video form when the user picks an
-- image will populate these. The publish path reads `s3KeyThumbnail`
-- and forwards the S3 object to YouTube's `thumbnails.set` endpoint.
--
-- No index is added: the column is never used as a filter or join
-- key, only as a single-row read at publish time.

-- AlterTable
ALTER TABLE "videos" ADD COLUMN "s3KeyThumbnail" TEXT;
ALTER TABLE "videos" ADD COLUMN "thumbnailContentType" TEXT;
