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

- [2026-06-27] Worker startup-recovery runs in two passes. First pass reconciles rows orphaned in `PUBLISHING` by a crashed worker: if `youtubeVideoId` is set, finalize to `PUBLISHED` (upload likely completed on YouTube's side, only the DB flip was lost); if not, reset to `READY` so the standard recovery re-enqueues it. Only AFTER orphans are reconciled does the `READY`/`SCHEDULED` re-enqueue pass run. Rationale: a `PUBLISHING` row that gets reset to `READY` becomes eligible for the second pass in the same boot, so a crashed-mid-upload job is recovered without waiting for the next failure tick.

- [2026-06-27] When wiring a new filter / search / sort param through the web stack, ALL four layers need an explicit change: (1) server schema (`zod` query), (2) service-layer Prisma `where`, (3) shared type (`ListXParams`), (4) web `api-client.ts` query-string builder. A working (1)+(2)+(3) with a missing `search.set(...)` in (4) silently passes the empty filter to the server — the user sees the unfiltered list and assumes the filter is broken. Always grep for `if (params?.X) search.set` in `api-client.ts` when adding a filter param.

- [2026-06-28] Cache abstraction uses two backends (Redis when REDIS_URL is set, in-memory fallback). The exported `cache` singleton is a delegating object — `get/set/del` forward to whichever backend `initCache(env)` selected — so every service call site (`cache.get("settings:${userId}")` in settings/youtube/videos) keeps working unchanged. Tests that `vi.mock("../../lib/cache.js", () => ({ cache: { get, set, del } }))` still work because the mock replaces the whole module surface. New lifecycle: `initCache(env)` (boot, idempotent) → `verifyCache(env)` (PINGs Redis, returns latency) → `disposeCache()` (async; calls `redis.quit()` for Redis backend, clears the in-memory sweeper for the fallback). Boot-time service banner in both `apps/api/src/index.ts` and `apps/worker/src/index.ts` runs Database (`SELECT 1`) + Cache (Redis PING) + Queue (BullMQ PING) probes BEFORE `listen()`, prints ✓/✗ with latency, and exits non-zero if a required service is unreachable. Optional services (in-memory cache, queue when REDIS_URL unset) show as "skipped". Worker side opens a fresh `ioredis` probe connection (separate from the BullMQ one) so the PING is independent of queue lifecycle.

- [2026-06-28] ioredis needs `lazyConnect: true` when you want to control connection timing at boot. Combined with `maxRetriesPerRequest: null` (required for BullMQ compatibility), this lets you call `redis.connect()` + `redis.ping()` once at startup, fail fast if Redis is unreachable, and never accidentally issue a command before the socket is up. The `error` event handler must be a no-op (or log) — ioredis will emit errors mid-reconnect and you don't want them to crash the process.

- [2026-06-30] **pnpm + Docker pitfall.** pnpm uses isolated mode by default — each workspace package's direct deps live under `apps/<pkg>/node_modules/<dep>` as *relative symlinks* into the virtual store at `node_modules/.pnpm/`. A Dockerfile that copies only the root `/app/node_modules` (without `apps/<pkg>/node_modules`) will let the runtime process find `.pnpm/<dep>` but NOT `<dep>` itself — Node walks up looking for `node_modules/<dep>` from the entrypoint and finds nothing. Symptom: `ERR_MODULE_NOT_FOUND: Cannot find package '<dep>'`. Fix: every Dockerfile runtime stage that runs a pnpm-managed workspace package must `COPY --from=build apps/<pkg>/node_modules ./apps/<pkg>/node_modules` alongside the root `node_modules`. Either that, or `pnpm deploy` (single self-contained output dir), or `.npmrc` `public-hoist-pattern[]=<dep>` to hoist specific runtime deps to the root. The bug is latent until the package gains a direct import of one of its deps — BullMQ was previously imported indirectly (BullMQ's own nested node_modules carried `ioredis`), so it shipped fine without the apps/worker/node_modules layer; once apps/worker/src/index.ts started doing `import { Redis } from "ioredis"` directly, the missing COPY became fatal.

- [2026-06-30] **Worker BullMQ broker split (silent).** API on host + worker in compose must share the same BullMQ broker. `apps/api/.env` and `apps/worker/.env.docker` both point at Redis Cloud (`db.redis.io:10367`); the compose worker's `environment:` block has an explicit `REDIS_URL:` override as a belt-and-braces. Do NOT change that override to `redis://redis:6379` (the local compose Redis). Symptom of the split: video row sits in `EXTRACTING` forever, worker logs show zero job activity (not even a job pull attempt), `clipflow:video-ingest:wait` is empty on the worker's broker but populated on the API's. Diagnostic: `docker compose config | grep -A 12 worker:` and compare `REDIS_URL` to `apps/api/.env`. If they don't match, jobs are stranded on the wrong broker — there is no log signal of the split on either side.

- [2026-07-01] Auth.js v5 middleware default-export typing: the inferred return type of `NextAuth(config).auth` references next-auth's private `lib/` and `lib/types` subpaths, which TS2742 cannot name portably. Always export as `NextAuth(authConfig).auth as NextMiddleware` (importing `NextMiddleware` from `next/server`). The cast is purely structural — runtime contract is identical, but TypeScript stays happy. Documented alongside the do-not-repeat for `headers()` out of scope.

- [2026-07-01] `apps/web/middleware.ts` must export `NextAuth(authConfig).auth` as a function reference, NOT invoked (no `()`). Next.js 16 + Turbopack bundles middleware.ts with the RSC path, so calling `.auth()` eagerly dispatches into Auth.js v5 code that calls `next/headers`'s `headers()` — which only works inside a request scope. Eager invocation crashes at module load with `` `headers` was called outside a request scope ``. Fix: `export default NextAuth(authConfig).auth as NextMiddleware;`. The `as NextMiddleware` cast is required because the inferred type of `.auth` can't be named without referencing next-auth's private `lib/` and `lib/types` subpaths (TS2742).
