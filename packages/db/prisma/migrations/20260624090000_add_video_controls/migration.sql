-- Add the YouTube status-block controls that the Data API v3 accepts
-- in videos.insert. Defaults match the upload-time defaults so the
-- API can omit any field a creator doesn't touch.
--
-- Values stored as TEXT (not Postgres enums) for two reasons:
--   1. YouTube's own set of accepted values changes occasionally
--      (e.g. ageRestriction gained "21+" in some regions); a TEXT
--      column doesn't require a migration to add a new value.
--   2. We validate against the application-level union in zod so
--      a new field can ship without coordinating a DB migration.

ALTER TABLE "videos"
  ADD COLUMN "madeForKids"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ageRestriction"      TEXT    NOT NULL DEFAULT 'none',
  ADD COLUMN "embeddable"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "license"             TEXT    NOT NULL DEFAULT 'standard',
  ADD COLUMN "publicStatsViewable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "commentPolicy"       TEXT    NOT NULL DEFAULT 'allowAll';
