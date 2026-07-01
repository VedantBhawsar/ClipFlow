-- Add transcript + LLM-driven highlight artefacts to the videos table.
--
-- These six columns back the v1.5 "topic-aware highlight selection" pipeline
-- (audio extract → AssemblyAI transcript → LLM picks highlight timestamps).
-- All six are nullable so existing rows (status = UPLOADED / EXTRACTING /
-- TRANSCRIBING etc.) keep working — they get populated as the new `transcription`
-- and `generate` workers fire. None are indexed: they are always read alongside
-- the parent Video row, and the dashboard's hot path is the
-- (userId, status) / (userId, createdAt DESC) composite indexes that already
-- exist.
--
-- transcriptS3Key + transcriptLanguage + transcriptDurationMs are populated by
-- the `transcription` worker (today: never — those jobs don't exist yet).
-- highlightsS3Prefix + highlightsCount + chaptersJson are populated by the
-- `generate` worker (also future work).
--
-- chaptersJson uses JSONB (not JSON) — Postgres' binary form is indexable and
-- picks up `@>` containment operators if we ever want to query "which videos
-- mention X topic." Prisma's `Json?` maps to JSONB for Postgres.

-- AlterTable
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "transcriptS3Key" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "transcriptLanguage" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "transcriptDurationMs" INTEGER;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "highlightsS3Prefix" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "highlightsCount" INTEGER;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "chaptersJson" JSONB;
