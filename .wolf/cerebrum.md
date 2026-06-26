# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-26

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** ClipFlow
- **Description:** A SaaS platform for YouTube creators that automates video scheduling, thumbnail generation, and chapter-timestamp generation. A creator uploads a finished video once and ClipFlow handles the rest — ex

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-26] Don't introduce an "editorial-archive" visual idiom (Vol · 003 issue numbers, font-serif headings, "Ref" labels, animated accent rails) on dashboard sub-pages. Design.md mandates grotesque-leaning sans, max ~28px headings, single-column lists. Match the existing VideoCard pattern instead.

- [2026-06-26] Don't add a "Back to dashboard" button on dashboard sub-pages. The sidebar handles that navigation — adding a one-off button at the page level breaks the established pattern.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-06-26] /dashboard/published was rewritten to mirror the dashboard's row style (thumbnail + title + meta line + "View on YouTube" button) rather than a custom 4-column editorial grid. Rationale: design.md says single-column, max-width ~960px for text/list content. The StatusTimeline strip is the signature element on the in-flight dashboard, but the published library lists *finished* work — a filled timeline is noise here, so we drop it and rely on the privacy pill + published date.

- [2026-06-26] Don't render the StatusTimeline strip on views where every video is at the final stage (e.g. /dashboard/published, where status === "PUBLISHED" by definition). Show pipeline progress only where progress is actually happening.

- [2026-06-26] Custom-thumbnail upload is wired end-to-end: user picks a JPEG/PNG (≤2 MB) in the create-video dialog → `POST /api/videos` mints a second presigned POST URL → browser uploads in parallel with the video bytes → `finalizeUpload` HEADs both objects and persists `s3KeyThumbnail` + `thumbnailContentType` on the row → after the worker calls `videos.insert` successfully, it streams the S3 object to `POST /upload/youtube/v3/thumbnails/set`. The thumbnail block in `CreateVideoResponse` is `null` when the user didn't pick one — the rest of the pipeline is unchanged for that path.

- [2026-06-26] The `youtube.service.test.ts` failures (`TypeError: res.text is not a function`) are pre-existing — the mock chain uses `res.json` where the production code calls `res.text`. Unrelated to anything in the videos module. Don't touch it as part of a videos-task fix.

- [2026-06-26] Zod `superRefine` functions must avoid indexing the typed input by a string key — TS7053. Use explicit `if (data.x !== undefined) …` per field instead of `data[k]` or `present.includes(k)`. Future zod refinements in this codebase: no string-keyed access.

- [2026-06-26] Custom thumbnail is OPTIONAL on the Video row (`s3KeyThumbnail`, `thumbnailContentType` both nullable). When the user skips it, the publish path falls back to YouTube's generated frame. Don't gate the publish flow on having a thumbnail — a partial upload of just a video must still succeed.

- [2026-06-26] YouTube `thumbnails.set` accepts ONLY JPEG/PNG up to 2 MB. Both bounds are enforced at the create edge (`videos.schemas.ts`), the runtime (`videos.service.ts` — caps the presigned POST to `YOUTUBE_MAX_THUMBNAIL_BYTES`), and the client form (zod `.refine()`). Mirror any new image-upload bound in all three layers.

- [2026-06-26] Thumbnail upload failures (transient OR permanent) are logged but do NOT fail the publish — the video is live with YouTube's default frame, which is a valid outcome. Only re-throw transient errors so BullMQ retries; permanent errors get swallowed after logging.
