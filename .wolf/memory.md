# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.

## Session: 2026-06-26 09:44

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:12 | Drafted resume bullet points + prerequisite skill list from project context (Turborepo monorepo, Next.js 16, Express, Prisma 7, BullMQ, YouTube OAuth, AES-256-GCM) | .wolf/memory.md | Delivered 8 bullets + skills checklist | ~3.5k |

## Session: 2026-06-26 09:44

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:47 | Edited apps/api/src/modules/videos/videos.schemas.ts | modified parseInt() | ~702 |
| 09:47 | Edited apps/api/src/modules/videos/videos.service.ts | 24→29 lines | ~251 |
| 09:48 | Edited apps/api/src/modules/videos/videos.service.ts | added nullish coalescing | ~1212 |
| 09:48 | Edited apps/api/src/modules/videos/videos.controller.ts | 3→7 lines | ~56 |
| 09:48 | Edited apps/api/src/modules/videos/videos.controller.ts | modified async() | ~461 |
| 09:49 | Edited apps/api/src/modules/videos/videos.routes.ts | 6→7 lines | ~50 |
| 09:49 | Edited apps/api/src/modules/videos/videos.routes.ts | 3→8 lines | ~77 |
| 09:49 | Edited apps/api/src/modules/videos/videos.service.test.ts | expanded (+98 lines) | ~1281 |
| 09:49 | Edited apps/api/src/modules/videos/videos.service.test.ts | 15→16 lines | ~90 |
| 09:49 | Edited packages/types/src/index.ts | expanded (+48 lines) | ~457 |
| 09:50 | Edited apps/web/lib/api-client.ts | 25→27 lines | ~158 |
| 09:50 | Edited apps/web/lib/api-client.ts | modified createVideo() | ~356 |
| 09:50 | Edited apps/web/lib/api-client.ts | added 7 condition(s) | ~232 |
| 09:50 | Edited apps/web/lib/query-keys.ts | expanded (+8 lines) | ~219 |
| 09:51 | Edited apps/web/hooks/use-videos.ts | added nullish coalescing | ~456 |
| 09:51 | Edited apps/web/hooks/use-videos.ts | added nullish coalescing | ~200 |
| 09:51 | Edited apps/web/app/dashboard/dashboard-content.tsx | modified DashboardContent() | ~690 |
| 09:51 | Edited apps/web/hooks/use-videos.ts | list() → slot() | ~527 |
| 09:52 | Edited apps/web/hooks/use-videos.ts | modified useUnpublishVideo() | ~202 |
| 09:53 | Created apps/web/components/dashboard/published-video-card.tsx | — | ~3157 |
| 09:53 | Edited apps/web/components/dashboard/published-video-card.tsx | 14→13 lines | ~71 |
| 09:53 | Edited apps/web/components/dashboard/published-video-card.tsx | reduced (-6 lines) | ~107 |
| 09:53 | Edited apps/web/components/dashboard/published-video-card.tsx | modified PrivacyPill() | ~174 |
| 09:54 | Edited apps/web/app/layout.tsx | CSS: axes | ~644 |
| 09:54 | Edited apps/web/app/globals.css | CSS: --font-serif | ~185 |
| 09:55 | Created apps/web/components/dashboard/published-video-list.tsx | — | ~3262 |
| 09:56 | Created apps/web/app/dashboard/published/page.tsx | — | ~709 |
| 09:56 | Edited apps/web/components/dashboard/published-video-list.tsx | CSS: placeholderData | ~105 |
| 09:56 | Edited apps/web/hooks/use-videos.ts | added optional chaining | ~125 |
| 09:56 | Edited apps/web/hooks/use-videos.ts | inline fix | ~28 |
| 09:57 | Edited apps/web/lib/query-keys.ts | 17→20 lines | ~264 |
| 09:58 | Edited apps/web/app/layout.tsx | 7→6 lines | ~36 |
| 09:58 | Edited apps/api/src/modules/videos/videos.controller.ts | modified async() | ~175 |
| 09:59 | Edited apps/api/src/modules/videos/videos.controller.ts | modified async() | ~132 |
| 09:59 | Edited apps/api/src/modules/videos/videos.service.ts | modified async() | ~169 |
| 09:59 | Edited apps/api/src/modules/videos/videos.service.ts | modified async() | ~112 |
| 10:00 | Edited apps/api/src/modules/videos/videos.service.test.ts | expanded (+7 lines) | ~242 |
| 10:00 | Edited apps/api/src/modules/videos/videos.service.test.ts | 13→16 lines | ~161 |
| 10:03 | Edited apps/web/components/dashboard/published-video-card.tsx | "absolute inset-x-0 bottom" → "absolute inset-x-0 bottom" | ~41 |
| 10:02 | Built new PublishedVideoCard + PublishedVideoList + search/pagination; backend now owns filter+search+pagination | web + api | green tests; 0 new lint warnings | ~5200 |

## Session: 2026-06-26 10:04

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 10:06 | Created apps/web/app/dashboard/published/page.tsx | — | ~513 |
| 10:08 | Created apps/web/components/dashboard/published-video-card.tsx | — | ~1380 |
| 10:08 | Created apps/web/components/dashboard/published-video-list.tsx | — | ~3136 |
| 10:08 | Edited apps/web/components/dashboard/published-video-list.tsx | added 1 import(s) | ~51 |
| 10:08 | Edited apps/web/components/dashboard/published-video-list.tsx | 8→8 lines | ~105 |
| 10:09 | Rewrote apps/web/app/dashboard/published/page.tsx + published-video-list.tsx + published-video-card.tsx to match design.md + dashboard patterns (drop editorial-archive aesthetic, align with VideoCard, use text-2xl h1, single-column list, rounded-xl card sections) | apps/web/app + components/dashboard | check-types + lint clean on changed files | ~3200 |
| 10:10 | Session end: 5 writes across 3 files (page.tsx, published-video-card.tsx, published-video-list.tsx) | 13 reads | ~22189 tok |
| 10:11 | Edited apps/web/components/dashboard/published-video-card.tsx | modified PublishedVideoCard() | ~1111 |
| 10:11 | Session end: 6 writes across 3 files (page.tsx, published-video-card.tsx, published-video-list.tsx) | 13 reads | ~23300 tok |
| 10:13 | Edited apps/web/components/dashboard/published-video-card.tsx | added nullish coalescing | ~1874 |
| 10:13 | Edited apps/web/components/dashboard/published-video-card.tsx | reduced (-27 lines) | ~57 |
| 10:13 | Session end: 8 writes across 3 files (page.tsx, published-video-card.tsx, published-video-list.tsx) | 14 reads | ~29031 tok |
| 10:17 | Edited apps/api/src/modules/videos/videos.schemas.ts | expanded (+15 lines) | ~322 |
| 10:18 | Edited apps/api/src/modules/videos/videos.service.ts | added 2 condition(s) | ~270 |
| 10:18 | Edited apps/api/src/modules/videos/videos.service.ts | modified async() | ~212 |
| 10:18 | Edited packages/types/src/index.ts | expanded (+12 lines) | ~157 |
| 10:19 | Created apps/web/components/dashboard/published-video-list.tsx | — | ~4279 |
| 10:19 | Edited apps/web/components/dashboard/published-video-list.tsx | 2→2 lines | ~28 |
| 10:19 | Edited apps/web/components/dashboard/published-video-list.tsx | added optional chaining | ~37 |
| 10:20 | Edited apps/web/components/dashboard/published-video-list.tsx | 7→6 lines | ~24 |
| 10:21 | Session end: 16 writes across 6 files (page.tsx, published-video-card.tsx, published-video-list.tsx, videos.schemas.ts, videos.service.ts) | 21 reads | ~51575 tok |

## Session: 2026-06-26 10:23

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 10:25 | Edited packages/db/schema.prisma | expanded (+9 lines) | ~146 |
| 10:26 | Created packages/db/prisma/migrations/20260626000000_add_video_thumbnail/migration.sql | — | ~156 |
| 10:26 | Edited packages/types/src/index.ts | expanded (+18 lines) | ~469 |
| 10:26 | Edited packages/types/src/index.ts | expanded (+13 lines) | ~215 |
| 10:26 | Edited packages/types/src/index.ts | 5→9 lines | ~97 |
| 10:26 | Edited apps/api/src/modules/videos/videos.schemas.ts | added 2 condition(s) | ~622 |
| 10:26 | Edited apps/api/src/modules/videos/videos.schemas.ts | 11→14 lines | ~146 |
| 10:28 | Edited apps/api/src/modules/videos/videos.service.ts | expanded (+12 lines) | ~332 |
| 10:28 | Edited apps/api/src/modules/videos/videos.service.ts | added 1 condition(s) | ~1080 |
| 10:28 | Edited apps/api/src/modules/videos/videos.service.ts | added 4 condition(s) | ~875 |
| 10:28 | Edited apps/api/src/modules/videos/videos.service.ts | added 1 condition(s) | ~223 |
| 10:29 | Edited apps/api/src/modules/videos/videos.service.ts | expanded (+8 lines) | ~124 |
| 10:29 | Edited apps/api/src/modules/videos/videos.service.ts | added 1 condition(s) | ~132 |
| 10:29 | Edited apps/api/src/modules/videos/videos.service.ts | added 3 condition(s) | ~307 |
| 10:29 | Edited apps/api/src/modules/videos/videos.types.ts | 49→53 lines | ~471 |
| 10:30 | Edited packages/youtube-upload/src/youtube-api.ts | 4→7 lines | ~77 |
| 10:30 | Edited packages/youtube-upload/src/youtube-api.ts | added error handling | ~834 |
| 10:30 | Edited packages/youtube-upload/src/publish-video.ts | 12→13 lines | ~134 |
| 10:30 | Edited packages/youtube-upload/src/publish-video.ts | added error handling | ~754 |
| 10:31 | Edited apps/web/hooks/use-videos.ts | modified that() | ~984 |
| 10:31 | Edited apps/web/components/dashboard/create-video-dialog.tsx | expanded (+7 lines) | ~405 |
| 10:31 | Edited apps/web/components/dashboard/create-video-dialog.tsx | CSS: thumbnail | ~307 |
| 10:31 | Edited apps/web/components/dashboard/create-video-dialog.tsx | expanded (+7 lines) | ~392 |
| 10:32 | Edited apps/web/components/dashboard/create-video-dialog.tsx | CSS: thumbnail | ~133 |
| 10:32 | Edited apps/web/components/dashboard/create-video-dialog.tsx | 16→18 lines | ~170 |
| 10:32 | Edited apps/web/components/dashboard/create-video-dialog.tsx | added optional chaining | ~911 |
| 10:32 | Edited apps/web/components/dashboard/create-video-dialog.tsx | added nullish coalescing | ~98 |
| 10:33 | Edited apps/web/components/dashboard/create-video-dialog.tsx | CSS: thumbnail, thumbnail | ~588 |
| 10:33 | Edited apps/web/components/dashboard/create-video-dialog.tsx | modified if() | ~139 |
| 10:33 | Edited apps/web/components/dashboard/create-video-dialog.tsx | expanded (+37 lines) | ~858 |
| 10:33 | Edited apps/web/components/dashboard/create-video-dialog.tsx | CSS: Video, Thumbnail | ~894 |
| 10:34 | Edited apps/web/components/dashboard/create-video-dialog.tsx | expanded (+9 lines) | ~369 |
| 10:34 | Edited apps/api/src/modules/videos/videos.schemas.ts | added 3 condition(s) | ~335 |
| 10:34 | Edited apps/api/src/modules/videos/videos.service.test.ts | 62→66 lines | ~537 |
| 10:35 | Wired custom-thumbnail upload end-to-end (schema + migration + types + API service + YouTube upload pkg + web dialog + hooks). 28/28 videos.service tests green, 75/75 web tests green, web + worker + youtube-upload typecheck clean. 2 pre-existing youtube.service.test failures unchanged (cerebrum:res.text vs res.json). | 11 files | green typecheck + tests | ~5100 |

## Session: 2026-06-26 10:38

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-26 10:41

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 10:43 | Edited apps/worker/src/startup-recovery.ts | expanded (+6 lines) | ~180 |
| 10:44 | Added explicit `publishedAt: null` filter to startup-recovery's where clause so the "videos that haven't been published yet" intent is clear in the query (not just implicit from the status filter). No behavior change for existing READY/SCHEDULED rows. | apps/worker/src/startup-recovery.ts | literal interpretation of "requeue videos where publish date is null" — defensive belt-and-braces | ~150 |
| 10:44 | Session end: 1 write to apps/worker/src/startup-recovery.ts | 5 reads (anatomy, cerebrum, index, startup-recovery, queue, env, youtube-publish, schema, buglog, memory) | ~4200 tok |
| 10:44 | Session end: 1 writes across 1 files (startup-recovery.ts) | 6 reads | ~5885 tok |

## Session: 2026-06-27 20:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-27 20:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-27 20:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-27 20:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 20:28 | Created apps/worker/src/startup-recovery.ts | — | ~1313 |
| 20:28 | Edited apps/worker/src/index.ts | 1→4 lines | ~30 |
| 20:28 | Edited apps/worker/src/index.ts | expanded (+12 lines) | ~188 |
| 20:30 | Edited apps/worker/src/startup-recovery.ts | added recoverOrphanedPublishingJobs() | ~1313 |
| 20:30 | Edited apps/worker/src/index.ts | added recoverOrphanedPublishingJobs() | ~672 |
| 20:30 | Wired worker startup recovery into 2 passes: recoverOrphanedPublishingJobs (PUBLISHING→PUBLISHED if youtubeVideoId set, else READY) runs BEFORE recoverMissedScheduledJobs. Orphan + re-enqueue counts both logged from index.ts. | apps/worker/src/startup-recovery.ts + index.ts | orphan reconciliation now happens before READY/SCHEDULED re-enqueue | ~1450 |
| 20:29 | Session end: 3 writes across 2 files (startup-recovery.ts, index.ts) | 6 reads | ~12488 tok |

## Session: 2026-06-27 20:45

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 20:46 | Edited apps/web/lib/api-client.ts | added 2 condition(s) | ~281 |
| 20:48 | Fixed `/dashboard/published` privacy + date filters: api-client's `listPublishedVideos()` was dropping `privacy` and `since` from the query string. Server schema + types already supported both; only the wire layer was missing the `search.set(...)` calls. | apps/web/lib/api-client.ts | check-types clean; filters now reach the API | ~900 |
| 20:47 | Session end: 1 writes across 1 files (api-client.ts) | 7 reads | ~11318 tok |

## Session: 2026-06-27 22:19

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-28 09:18

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:24 | Created apps/api/src/lib/cache.ts | — | ~2537 |
| 09:24 | Created apps/api/src/lib/queue.ts | — | ~1321 |
| 09:25 | Created apps/api/src/index.ts | — | ~1813 |
| 09:25 | Edited apps/api/src/config/env.ts | added 2 condition(s) | ~317 |
| 09:25 | Created apps/worker/src/index.ts | — | ~1534 |
| 09:25 | Edited apps/worker/src/index.ts | added nullish coalescing | ~18 |
| 09:26 | Edited apps/worker/src/index.ts | modified verifyRedis() | ~104 |
| 09:30 | Migrated cache from in-memory to Redis: added RedisCacheClient (ioredis, lazyConnect + PING verify) in apps/api/src/lib/cache.ts; initCache(env)/verifyCache(env)/disposeCache() lifecycle; existing `cache` singleton now delegates to active backend so all 4 service call sites + 1 test mock are untouched. Added boot-time service-check banner (Database + Cache + Queue with ✓/✗ + latency) in both apps/api/src/index.ts and apps/worker/src/index.ts. Production-aware warnings in apps/api/src/config/env.ts when DATABASE_URL or REDIS_URL is unset. | 5 files (cache.ts, queue.ts, index.ts × 2, env.ts) + 4 anatomy descriptions | api + worker typecheck clean; videos.service.test green; 2 pre-existing youtube.service.test failures unchanged | ~3800 |
| 09:29 | Session end: 7 writes across 4 files (cache.ts, queue.ts, index.ts, env.ts) | 12 reads | ~16873 tok |
| 09:32 | Session end: 7 writes across 4 files (cache.ts, queue.ts, index.ts, env.ts) | 12 reads | ~17155 tok |
| 09:34 | designqc: captured 2 screenshots (62KB, ~5000 tok) | / | ready for eval | ~0 |

## Session: 2026-06-28 09:37

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:37 | Read & evaluate designqc screenshots | .wolf/designqc-captures/root_desktop_top.jpg, root_mobile_top.jpg | Findings: mobile footer avatar overlap bug; empty hero (no product visual); no nav links; no social proof; CTA pair disjoint; sage-green on dark works well | ~0 tokens (read-only)
| 09:39 | Edited apps/web/app/globals.css | modified media() | ~1558 |
| 09:39 | designqc: captured 2 screenshots (30KB, ~5000 tok) | / | ready for eval | ~0 |

## Session: 2026-06-28 09:42

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-28 09:44

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-28 11:06

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-28 11:06

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 17:27

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 17:27

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 17:27

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 17:30 | Created apps/worker/src/lib/ffmpeg.ts | — | ~1482 |
| 17:30 | Created apps/worker/src/lib/ffmpeg-errors.ts | — | ~1170 |
| 17:31 | Created apps/worker/src/lib/ffmpeg.test.ts | — | ~1490 |
| 17:31 | Created apps/worker/src/lib/ffmpeg-errors.test.ts | — | ~1018 |
| 17:31 | Edited packages/s3/src/operations.ts | added 2 import(s) | ~100 |
| 17:31 | Edited packages/s3/src/operations.ts | modified async() | ~277 |
| 17:32 | Edited packages/s3/src/index.ts | 6→7 lines | ~36 |
| 17:32 | Edited packages/config/src/index.ts | 3→7 lines | ~79 |
| 17:32 | Edited packages/db/schema.prisma | expanded (+12 lines) | ~315 |
| 17:33 | Edited packages/db/schema.prisma | expanded (+13 lines) | ~213 |
| 17:33 | Created packages/db/prisma/migrations/20260630000000_add_video_ingest_pipeline/migration.sql | — | ~252 |
| 17:34 | Created apps/worker/src/jobs/video-ingest.ts | — | ~2860 |
| 17:34 | Edited apps/worker/src/config/queue.ts | added error handling | ~1452 |
| 17:35 | Edited apps/worker/src/config/queue.ts | added 1 import(s) | ~130 |
| 17:35 | Edited apps/worker/src/config/queue.ts | removed 13 lines | ~27 |
| 17:35 | Edited apps/worker/src/startup-recovery.ts | expanded (+10 lines) | ~549 |
| 17:35 | Edited apps/worker/src/startup-recovery.ts | modified async() | ~40 |
| 17:36 | Edited apps/worker/src/startup-recovery.ts | added 2 condition(s) | ~644 |
| 17:36 | Edited apps/worker/src/index.ts | 6→7 lines | ~76 |
| 17:36 | Edited apps/worker/src/index.ts | modified async() | ~517 |
| 17:37 | Edited apps/api/src/lib/queue.ts | added 8 condition(s) | ~1684 |
| 17:37 | Edited apps/api/src/index.ts | inline fix | ~26 |
| 17:37 | Edited apps/api/src/index.ts | expanded (+12 lines) | ~301 |
| 17:37 | Edited apps/api/src/modules/videos/videos.service.ts | inline fix | ~16 |
| 17:37 | Edited apps/api/src/modules/videos/videos.service.ts | 6→10 lines | ~58 |
| 17:38 | Edited apps/api/src/modules/videos/videos.service.ts | modified Date() | ~562 |
| 17:38 | Edited apps/api/src/modules/videos/videos.service.test.ts | 3→3 lines | ~31 |
| 17:38 | Edited apps/api/src/modules/videos/videos.service.test.ts | inline fix | ~16 |
| 17:38 | Edited apps/api/src/modules/videos/videos.service.test.ts | inline fix | ~14 |
| 17:38 | Edited apps/api/src/modules/videos/videos.service.test.ts | 18→22 lines | ~301 |
| 17:39 | Edited apps/api/src/modules/videos/videos.service.test.ts | expanded (+8 lines) | ~420 |
| 17:39 | Edited apps/api/src/modules/auth/auth.service.test.ts | 3→4 lines | ~33 |
| 17:39 | Created apps/worker/src/jobs/video-ingest.test.ts | — | ~1911 |
| 17:40 | Edited apps/worker/package.json | 7→9 lines | ~68 |
| 17:40 | Edited apps/worker/package.json | 8→9 lines | ~72 |
| 17:40 | Created apps/worker/vitest.config.ts | — | ~45 |
| 17:41 | Edited apps/worker/src/jobs/video-ingest.test.ts | 2→2 lines | ~29 |
| 17:41 | Edited apps/worker/src/jobs/video-ingest.test.ts | 5→5 lines | ~58 |
| 17:41 | Edited apps/worker/src/jobs/video-ingest.test.ts | 4→4 lines | ~45 |
| 17:41 | Edited apps/worker/src/jobs/video-ingest.test.ts | 4→4 lines | ~45 |
| 17:42 | Edited apps/api/src/modules/videos/videos.service.test.ts | 29→33 lines | ~281 |
| 17:42 | Edited apps/api/src/modules/videos/videos.service.test.ts | 4→8 lines | ~61 |
| 17:43 | Edited apps/worker/src/lib/ffmpeg.ts | 3→3 lines | ~35 |
| 17:43 | Edited apps/worker/src/lib/ffmpeg.ts | 3→3 lines | ~27 |
| 17:43 | Edited apps/worker/src/lib/ffmpeg.ts | modified async() | ~30 |

## Session: 2026-06-30 21:12

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 21:12

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:17 | Created apps/worker/Dockerfile | — | ~1022 |
| 21:18 | Created apps/worker/.dockerignore | — | ~80 |
| 21:18 | Created .dockerignore | — | ~136 |
| 21:18 | Edited docker-compose.yml | 27→30 lines | ~440 |
| 21:18 | Edited docker-compose.yml | expanded (+35 lines) | ~575 |

## Session: 2026-06-30 21:21

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 21:26

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:29 | Edited apps/worker/Dockerfile | expanded (+8 lines) | ~291 |

## Session: 2026-06-30 21:33

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-06-30 21:34

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:37 | Edited docker-compose.yml | expanded (+10 lines) | ~318 |
| 09:55 | Reapplied broker-split warning to docker-compose.yml worker service REDIS_URL line. User had restructured to use apps/worker/.env.docker env_file + explicit env overrides; preserved their structure and reattached the "do not change to redis://redis:6379" comment to prevent regression. | docker-compose.yml, .wolf/cerebrum.md, .wolf/memory.md | Comment + Do-Not-Repeat entry restored | ~1.6k |
| 21:39 | Session end: 1 writes across 1 files (docker-compose.yml) | 2 reads | ~2134 tok |
| 21:41 | Session end: 1 writes across 1 files (docker-compose.yml) | 3 reads | ~3297 tok |

## Session: 2026-07-01 08:24

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 08:32 | Edited packages/config/package.json | 8→13 lines | ~80 |
| 08:32 | Edited packages/db/package.json | 12→17 lines | ~180 |
| 08:32 | Edited packages/s3/package.json | 9→14 lines | ~92 |
| 08:32 | Edited packages/crypto/package.json | 10→15 lines | ~105 |
| 08:32 | Edited packages/types/package.json | 9→14 lines | ~94 |
| 08:32 | Edited packages/youtube-upload/package.json | 11→16 lines | ~107 |
| 08:32 | Edited turbo.json | 9→9 lines | ~76 |
| 08:32 | Edited turbo.json | 3→4 lines | ~25 |

## Session: 2026-07-01 08:40

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:02 | Edited apps/web/middleware.ts | modified reference() | ~171 |
| 09:02 | Edited apps/web/middleware.ts | modified reference() | ~272 |
| 09:03 | Edited apps/web/middleware.ts | added 1 import(s) | ~279 |
| 09:05 | Fixed Next.js 16 + Auth.js v5 middleware runtime crash: `headers` was called outside a request scope. Cause: `export default NextAuth(authConfig).auth()` invoked the auth handler at module-evaluation time, which dispatches into code that calls `next/headers`'s `headers()`. Fix: export `.auth` as a function reference + cast to `NextMiddleware` to suppress TS2742. check-types + lint clean. | apps/web/middleware.ts, .wolf/cerebrum.md, .wolf/buglog.json | web typecheck + lint green | ~1900 |
| 09:07 | Session end: 1 write to apps/web/middleware.ts + cerebrum + buglog + memory | 5 reads (anatomy, cerebrum, buglog, package.json, auth.config.ts, auth.ts, middleware.ts, route.ts) | ~2100 tok |
| 09:09 | Session end: 3 writes across 1 files (middleware.ts) | 5 reads | ~4826 tok |
| 09:18 | Created apps/web/components/dashboard/processing-substeps.tsx | — | ~1804 |
| 09:18 | Edited apps/web/app/dashboard/published/[id]/page.tsx | added 1 import(s) | ~78 |
| 09:18 | Edited apps/web/app/dashboard/published/[id]/page.tsx | 2→3 lines | ~43 |
| 09:19 | Edited apps/web/components/dashboard/processing-substeps.tsx | 21→21 lines | ~152 |

## Session: 2026-07-01 09:42

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 09:58 | Created README.md | — | ~7470 |
| 09:58 | Rewrote README.md to match current shipped state + add a "Next slice: AI processing pipeline" section (transcription → chapters + thumbnails → review screen; TRANSCRIBING → GENERATING → READY_FOR_REVIEW). Added a "Pipeline status" summary table so shipped-vs-coming is obvious at a glance. Updated sequence diagram + state machine to the target end state (transcription/chapters/thumbnails jobs shown in their final shape). | README.md | green — gitignored diff would still parse cleanly | ~5.2k |
| 09:58 | Session end: 1 writes across 1 files (README.md) | 12 reads | ~37262 tok |
| 10:08 | Edited README.md | expanded (+25 lines) | ~1178 |
| 10:08 | Converted the "Sequence diagram (target end state)" from `flowchart TD` to a proper mermaid `sequenceDiagram` with lifelines + phase backgrounds (rect) + par/alt blocks. Added init directive to bump fontSize to 18px and lift message/actor margins. Diagram now renders tall and reads as a sequence diagram instead of a flowchart. | README.md | green — mermaid syntax validates locally (lint of syntax only) | ~3.5k |
| 10:09 | Session end: 2 writes across 1 files (README.md) | 12 reads | ~38524 tok |

## Session: 2026-07-01 17:56

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 18:01 | Created .claude/plans/topic-shaping-summit.md | — | ~4594 |
| 18:05 | Delivered topic-aware highlight pipeline plan + my thoughts (pros/cons/risk register/open questions) to the user; user requested details, not implementation yet | .claude/plans/topic-shaping-summit.md, .wolf/memory.md | awaiting direction on open questions | ~1k |
| 18:43 | Edited .claude/plans/topic-shaping-summit.md | 18→19 lines | ~344 |
| 18:43 | Session end: 2 writes across 1 files (topic-shaping-summit.md) | 9 reads | ~26677 tok |
| 18:45 | Edited packages/db/schema.prisma | expanded (+51 lines, 6 nullable cols) | ~600 |
| 18:46 | Created packages/db/prisma/migrations/20260701000000_add_video_transcript_highlights/migration.sql | — | ~419 |
| 18:46 | Edited apps/api/src/modules/videos/videos.service.test.ts | StubVideo +6 nullable fields | ~250 |
| 18:48 | Edited packages/config/src/index.ts | expanded (+30 lines, 7 env vars) | ~340 |
| 18:53 | Created apps/worker/src/lib/transcription/assemblyai-errors.ts | — | ~1320 |
| 18:53 | Created apps/worker/src/lib/transcription/assemblyai.ts | — | ~2283 |
| 18:55 | Created apps/worker/src/lib/transcription/assemblyai-errors.test.ts | — | ~1154 |
| 18:55 | Created apps/worker/src/lib/transcription/assemblyai.test.ts | — | ~1674 |
| 18:55 | Edited apps/api/src/modules/auth/auth.service.test.ts | mockEnv +7 v1.5 env fields | ~180 |
| 19:00 | Steps 1-3 of topic-aware-highlight pipeline shipped: (1) schema+6 nullable cols+migration+StubVideo patch, (2) 7 env vars in @clipflow/config, (3) AssemblyAI wrapper+error class+25 unit tests; assemblyai dep installed; pre-existing 4 lint warn + 7 test failures (ffmpeg/video-ingest) confirmed unrelated; pnpm check-types 9/9, api 147/147 tests pass, worker transcription lib 25/25 tests pass. | 6 files | green | ~8.5k |
| 18:45 | Edited packages/db/schema.prisma | expanded (+29 lines) | ~640 |
| 18:45 | Created packages/db/prisma/migrations/20260701000000_add_video_transcript_highlights/migration.sql | — | ~419 |
| 18:46 | Edited apps/api/src/modules/videos/videos.service.test.ts | expanded (+13 lines) | ~295 |
| 18:46 | Edited apps/api/src/modules/videos/videos.service.test.ts | expanded (+6 lines) | ~64 |
| 18:46 | Edited apps/api/src/modules/videos/videos.service.test.ts | added 1 import(s) | ~47 |
| 18:46 | Edited apps/api/src/modules/videos/videos.service.test.ts | 5→3 lines | ~62 |
| 18:47 | Edited packages/config/src/index.ts | expanded (+29 lines) | ~536 |
| 18:49 | Created apps/worker/src/lib/transcription/assemblyai-errors.ts | — | ~1320 |
| 18:50 | Created apps/worker/src/lib/transcription/assemblyai.ts | — | ~2262 |
| 18:50 | Edited apps/worker/src/lib/transcription/assemblyai.ts | 27→27 lines | ~260 |
| 18:51 | Edited apps/worker/src/lib/transcription/assemblyai.ts | 28→31 lines | ~238 |
| 18:52 | Edited apps/worker/src/lib/transcription/assemblyai.ts | added 1 import(s) | ~51 |
| 18:52 | Edited apps/worker/src/lib/transcription/assemblyai.ts | reduced (-26 lines) | ~174 |
| 18:52 | Edited apps/worker/src/lib/transcription/assemblyai.ts | added nullish coalescing | ~144 |
| 18:53 | Created apps/worker/src/lib/transcription/assemblyai-errors.test.ts | — | ~1169 |
| 18:53 | Edited apps/worker/src/lib/transcription/assemblyai.ts | 27→30 lines | ~467 |
| 18:53 | Edited apps/worker/src/lib/transcription/assemblyai.ts | expanded (+6 lines) | ~279 |
| 18:54 | Created apps/worker/src/lib/transcription/assemblyai.test.ts | — | ~1571 |
| 18:54 | Edited apps/worker/src/lib/transcription/assemblyai-errors.test.ts | modified for() | ~116 |
| 18:55 | Edited apps/worker/src/lib/transcription/assemblyai.test.ts | expanded (+7 lines) | ~220 |
| 18:55 | Edited apps/worker/src/lib/transcription/assemblyai.test.ts | 6→6 lines | ~55 |
| 18:55 | Edited apps/worker/src/lib/transcription/assemblyai.test.ts | 14→15 lines | ~124 |
| 18:56 | Edited apps/worker/src/lib/transcription/assemblyai.ts | 5→4 lines | ~50 |
| 18:57 | Edited apps/api/src/modules/auth/auth.service.test.ts | expanded (+9 lines) | ~113 |
| 18:58 | Session end: 26 writes across 10 files (topic-shaping-summit.md, schema.prisma, migration.sql, videos.service.test.ts, index.ts) | 24 reads | ~54266 tok |

## Session: 2026-07-01 19:23

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 19:31 | Created apps/worker/src/jobs/transcription.ts | — | ~3842 |
| 19:31 | Edited apps/worker/src/config/queue.ts | expanded (+14 lines) | ~537 |
| 19:32 | Edited apps/worker/src/config/queue.ts | 2→3 lines | ~44 |
| 19:32 | Edited apps/worker/src/config/queue.ts | added error handling | ~640 |
| 19:32 | Edited apps/worker/src/index.ts | 8→13 lines | ~110 |
| 19:32 | Edited apps/worker/src/index.ts | modified async() | ~719 |
| 19:32 | Edited apps/worker/src/startup-recovery.ts | expanded (+13 lines) | ~767 |
| 19:32 | Edited apps/worker/src/startup-recovery.ts | added 2 condition(s) | ~801 |
| 19:33 | Edited apps/worker/src/jobs/video-ingest.ts | expanded (+15 lines) | ~802 |
| 19:33 | Edited apps/worker/src/jobs/video-ingest.ts | added error handling | ~494 |
| 19:33 | Edited apps/worker/src/config/queue.ts | expanded (+11 lines) | ~369 |
| 19:33 | Edited apps/worker/src/index.ts | modified async() | ~282 |
| 19:34 | Edited apps/api/src/lib/queue.ts | added 3 condition(s) | ~1393 |
| 19:34 | Edited apps/api/src/lib/queue.ts | added 2 condition(s) | ~798 |
| 19:34 | Edited apps/api/src/index.ts | 1→6 lines | ~36 |
| 19:34 | Edited apps/api/src/index.ts | expanded (+11 lines) | ~226 |
| 19:35 | Created apps/worker/src/jobs/transcription.test.ts | — | ~3563 |
| 19:35 | Edited apps/worker/src/jobs/transcription.test.ts | inline fix | ~21 |
| 19:36 | Edited apps/worker/src/jobs/transcription.test.ts | expanded (+14 lines) | ~193 |

## Session: 2026-07-01 19:37

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 19:37 | Built transcription job + queue wiring end-to-end: jobs/transcription.ts + queue wiring + worker enqueue + startup-recovery + tests. 7/7 transcription tests pass; full API 147/147; worker 60/66 (6 pre-existing ffmpeg failures match buglog 035-039); 0 new lint warnings. Step 4 complete. | worker jobs + queue + startup-recovery + tests + API queue + API index | green | ~11500 |
| 19:40 | Session end: 19 writes across 6 files (transcription.ts, queue.ts, index.ts, startup-recovery.ts, video-ingest.ts) | 13 reads | ~43276 tok |
| 19:54 | Session end: 19 writes across 6 files (transcription.ts, queue.ts, index.ts, startup-recovery.ts, video-ingest.ts) | 13 reads | ~43276 tok |

## Session: 2026-07-01 19:56

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-01 20:56

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-01 20:56

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 20:56 | Edited packages/config/src/index.ts | expanded (+19 lines) | ~439 |
| 20:57 | Created apps/worker/src/lib/llm/llm-client.ts | — | ~1842 |
| 20:58 | Created apps/llm/llm-errors.ts | — | ~1511 |
| 20:58 | Created apps/worker/src/lib/llm/prompts/select-highlights.ts | — | ~1633 |
| 20:58 | Created apps/worker/src/lib/llm/schemas.ts | — | ~1100 |
| 20:59 | Created apps/worker/src/lib/llm/validate-with-retry.ts | — | ~1092 |
| 20:59 | Created apps/worker/src/lib/llm/index.ts | — | ~250 |
| 21:00 | Created apps/worker/src/jobs/generate.ts | — | ~3775 |
| 21:00 | Edited apps/worker/src/config/queue.ts | expanded (+10 lines) | ~375 |
| 21:00 | Edited apps/worker/src/config/queue.ts | added 1 condition(s) | ~1994 |
| 21:00 | Edited apps/worker/src/jobs/transcription.ts | expanded (+7 lines) | ~133 |
| 21:00 | Edited apps/worker/src/jobs/transcription.ts | added 1 condition(s) | ~506 |
| 21:01 | Edited apps/worker/src/startup-recovery.ts | expanded (+13 lines) | ~971 |
| 21:01 | Edited apps/worker/src/startup-recovery.ts | added 2 condition(s) | ~806 |
| 21:01 | Edited apps/worker/src/index.ts | 16→18 lines | ~158 |
| 21:01 | Edited apps/worker/src/index.ts | modified async() | ~1155 |
| 21:02 | Edited apps/api/src/lib/queue.ts | 32→36 lines | ~431 |
| 21:02 | Edited apps/api/src/lib/queue.ts | added 3 condition(s) | ~290 |
| 21:02 | Edited apps/api/src/lib/queue.ts | 8→11 lines | ~176 |
| 21:02 | Edited apps/api/src/lib/queue.ts | added 2 condition(s) | ~744 |
| 21:02 | Edited apps/api/src/index.ts | 3→4 lines | ~27 |
| 21:02 | Edited apps/api/src/index.ts | expanded (+11 lines) | ~231 |
| 21:03 | Edited apps/web/app/dashboard/dashboard-content.tsx | CSS: polling, same, polling | ~2342 |

## Session: 2026-07-01 21:04

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:05 | Created apps/worker/src/lib/llm/llm-errors.test.ts | — | ~1800 |
| 21:05 | Created apps/worker/src/lib/llm/schemas.test.ts | — | ~2186 |
| 21:06 | Created apps/worker/src/lib/llm/validate-with-retry.test.ts | — | ~1650 |
| 21:06 | Created apps/worker/src/lib/llm/llm-client.test.ts | — | ~2570 |
| 21:07 | Created apps/worker/src/jobs/generate.test.ts | — | ~5509 |
| 21:07 | Edited apps/worker/package.json | 2→3 lines | ~19 |
| 21:07 | Edited apps/worker/src/jobs/generate.test.ts | 5→5 lines | ~70 |
| 21:07 | Edited apps/worker/src/jobs/generate.test.ts | 7→7 lines | ~86 |
| 21:07 | Edited apps/worker/src/lib/llm/llm-errors.test.ts | expanded (+6 lines) | ~223 |
| 21:08 | Edited apps/worker/src/lib/llm/index.ts | 30→34 lines | ~331 |
| 21:09 | Edited apps/worker/src/jobs/generate.ts | 11→15 lines | ~188 |
| 21:09 | Edited apps/worker/src/lib/llm/llm-errors.test.ts | 11→8 lines | ~97 |
| 21:09 | Created apps/worker/src/lib/llm/llm-errors.test.ts | — | ~2018 |
| 21:09 | Edited apps/worker/src/jobs/transcription.test.ts | 5→7 lines | ~80 |
| 21:10 | Edited apps/worker/src/jobs/generate.ts | 4→3 lines | ~32 |
| 21:10 | Edited apps/web/app/dashboard/dashboard-content.tsx | expanded (+6 lines) | ~318 |
| 21:10 | Edited apps/api/src/modules/auth/auth.service.test.ts | 7→9 lines | ~111 |

## Session: 2026-07-01 21:12

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:12 | Edited .wolf/anatomy.md | dropped apps/llm/ section (stale leftover from earlier path typo) | ~-22 |
| 21:12 | Removed apps/llm/ directory (stale leftover from path typo) | rmdir | ~0 |
| 21:12 | Verified lint/typecheck/test pipeline | web/api/worker all clean (LLM/generate suites added) | ~0 |
| 21:12 | Created ../../../.claude/projects/-Users-vedant-Documents-projects-ClipFlow/new-bugs.json | — | ~1964 |
| 21:14 | Session end: 18 writes across 12 files (llm-errors.test.ts, schemas.test.ts, validate-with-retry.test.ts, llm-client.test.ts, generate.test.ts) | 14 reads | ~41629 tok |

## Session: 2026-07-01 21:25

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:31 | Created scripts/check-videos.ts | — | ~311 |
| 21:32 | Created scripts/check-videos.ts | — | ~358 |

## Session: 2026-07-01 21:36

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-02 08:43

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 08:50 | Created ../../../.claude/plans/quirky-giggling-blanket.md | — | ~2247 |
| 08:54 | Edited packages/types/src/index.ts | expanded (+29 lines) | ~429 |
| 08:55 | Edited apps/api/src/modules/videos/videos.schemas.ts | added optional chaining | ~1071 |
| 08:55 | Edited apps/api/src/modules/videos/videos.service.ts | 5→6 lines | ~38 |
| 08:55 | Edited apps/api/src/modules/videos/videos.service.ts | added optional chaining | ~897 |
| 08:55 | Edited apps/api/src/modules/videos/videos.controller.ts | 5→6 lines | ~38 |
| 08:56 | Edited apps/api/src/modules/videos/videos.controller.ts | added 1 condition(s) | ~301 |
| 08:56 | Edited apps/api/src/modules/videos/videos.routes.ts | 21→23 lines | ~168 |
| 08:56 | Edited apps/api/src/modules/videos/videos.routes.ts | 4→5 lines | ~107 |
| 08:56 | Edited apps/api/src/modules/videos/videos.routes.ts | expanded (+7 lines) | ~72 |
| 08:56 | Edited apps/api/src/modules/videos/videos.service.test.ts | added optional chaining | ~1011 |
| 08:58 | Edited apps/web/lib/api-client.ts | 2→3 lines | ~21 |
| 08:58 | Edited apps/web/lib/api-client.ts | modified getVideo() | ~148 |
| 08:58 | Edited apps/web/lib/api-client.ts | modified getVideo() | ~74 |
| 08:59 | Edited apps/web/hooks/use-videos.ts | 8→9 lines | ~53 |
| 08:59 | Edited apps/web/hooks/use-videos.ts | modified useUnpublishVideo() | ~390 |
| 09:00 | Created apps/web/components/review/chapters-review.tsx | — | ~4529 |
| 09:01 | Created apps/web/components/review/video-review-panel.tsx | — | ~1654 |
| 09:01 | Created apps/web/components/dashboard/video-metadata-editor.tsx | — | ~2833 |
| 09:02 | Edited apps/web/app/dashboard/published/[id]/page.tsx | added 1 import(s) | ~124 |
| 09:02 | Edited apps/web/app/dashboard/published/[id]/page.tsx | expanded (+16 lines) | ~489 |
| 09:02 | Created apps/web/components/review/chapters-review.test.tsx | — | ~1573 |
| 09:03 | Created apps/web/components/dashboard/video-metadata-editor.test.tsx | — | ~1916 |
| 09:03 | Created apps/web/components/review/chapters-review.test.tsx | — | ~1784 |
| 09:04 | Edited apps/web/components/review/chapters-review.test.tsx | reduced (-8 lines) | ~193 |

## Session: 2026-07-02 09:06

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

| 09:08 | Added UpdateVideoRequest type | packages/types/src/index.ts | exported new DTO | ~120 |
| 09:09 | Built packages/types | packages/types | dist emitted | ~10 |
| 09:09 | Added updateVideoSchema | apps/api/src/modules/videos/videos.schemas.ts | new schema + superRefine | ~480 |
| 09:10 | Added updateVideo service | apps/api/src/modules/videos/videos.service.ts | partial-merge PATCH | ~920 |
| 09:10 | Wired updateVideoController + route | apps/api/src/modules/videos/videos.{controller,routes}.ts | PATCH /api/videos/:id | ~120 |
| 09:11 | Added 6 service tests | apps/api/src/modules/videos/videos.service.test.ts | 153/153 api tests pass | ~1100 |
| 09:12 | Added updateVideo to api-client | apps/web/lib/api-client.ts | method + impl | ~85 |
| 09:12 | Added useUpdateVideo hook | apps/web/hooks/use-videos.ts | mutation + invalidation | ~140 |
| 09:13 | Refactored chapters-review controlled | apps/web/components/review/chapters-review.tsx | add/delete/useTime/sort | ~990 |
| 09:14 | Added Save/Discard to review panel | apps/web/components/review/video-review-panel.tsx | mutation + toast + refresh | ~510 |
| 09:15 | Created metadata editor component | apps/web/components/dashboard/video-metadata-editor.tsx | title/desc/tags per-section save | ~1850 |
| 09:16 | Wired editor into detail page | apps/web/app/dashboard/published/[id]/page.tsx | conditional render | ~210 |
| 09:17 | Created chapter review tests | apps/web/components/review/chapters-review.test.tsx | 12/12 pass via stateful harness | ~1430 |
| 09:18 | Created metadata editor tests | apps/web/components/dashboard/video-metadata-editor.test.tsx | 12/12 pass | ~1640 |
| 09:19 | Verified monorepo typecheck + lint + tests | api/web/worker | 246 tests pass, typecheck/lint clean (excl. pre-existing worker warnings) | ~80 |

## Session End: 2026-07-02 ~09:25 — In-place edit slice complete

Summary of work delivered: full-stack in-place editing of `Video.title/description/tags/summary/chapters` when `status === READY_FOR_REVIEW`. Backend: new `PATCH /api/videos/:id` with strict YouTube-rule mirroring (`first.startMs===0`, `≥10s gap`, `≤12 chapters`, `≤100 char titles`, `≥3 chapters`, `≤280 char summary`), 409 `NOT_EDITABLE` for any other status, partial-merge semantics preserving explicit `null`. Frontend: new `useUpdateVideo` mutation, refactored `chapters-review.tsx` to controlled component supporting add/delete/use-current-time, new `VideoMetadataEditor` for title/description/tags with per-section dirty + save, conditional wiring into the RSC detail page. Tests: 153 API + 93 Web all green; typecheck + lint clean.

**Bugs logged this session:** bug-086 (`updateVideo` partial-merge clarity rule).

**Cerebrum entries added:**
- Partial-update `'key' in input` pattern
- `summary + chapters` travel together in single JSON write
- Controlled-component tests need stateful harness, not bare mock
- Server-rendered detail pages need `router.refresh()` after mutation

Next slice candidates (deferred): retry endpoint (`POST /api/videos/:id/retry`), reorder chapters with drag-handle, in-line chapter timestamp edit (currently requires "Use current time" only).
