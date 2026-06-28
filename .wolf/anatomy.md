# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-28T03:56:03.194Z
> Files: 271 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.DS_Store` (~1640 tok)
- `.gitignore` — Git ignore rules (~107 tok)
- `.npmrc` (~0 tok)
- `CLAUDE.md` — OpenWolf (~3549 tok)
- `docker-compose.yml` — Docker Compose services (~1162 tok)
- `neon_backup.sql` — PostgreSQL database dump (~6500 tok)
- `package.json` — Node.js package manifest (~123 tok)
- `pnpm-lock.yaml` — pnpm lock file (~99856 tok)
- `pnpm-workspace.yaml` (~12 tok)
- `README.md` — Project documentation (~3869 tok)
- `turbo.json` — Turborepo configuration (~271 tok)
- `z.mjs` — Declares args (~84 tok)

## .claude/

- `settings.json` (~441 tok)
- `settings.local.json` (~263 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## apps/api/

- `.gitignore` — Git ignore rules (~36 tok)
- `eslint.config.mjs` — ESLint flat configuration (~50 tok)
- `package.json` — Node.js package manifest (~435 tok)
- `tsconfig.json` — TypeScript configuration (~124 tok)
- `vitest.config.ts` — Vitest test configuration (~117 tok)

## apps/api/scripts/

- `crypto-self-test.ts` — AES-256-GCM round-trip self-test. (~159 tok)

## apps/api/src/

- `app.ts` — Express app factory. (~1395 tok)
- `index.ts` — Entrypoint. Loads env, runs boot-time service checks (Database Postgres + Cache Redis/in-memory + Queue BullMQ) with a ✓/✗ banner, then starts the HTTP server and wires SIGTERM/SIGINT graceful shutdown. (~1813 tok)
- `server.ts` — HTTP server lifecycle. (~844 tok)

## apps/api/src/config/

- `env.ts` — Environment configuration loader. Loads .env, calls @clipflow/config.loadEnv, warns when DATABASE_URL or REDIS_URL is unset (louder in production). (~1141 tok)

## apps/api/src/errors/

- `AppError.ts` — Typed application error used across the API. Services/controllers throw (~374 tok)

## apps/api/src/lib/

- `cache.ts` — Cache abstraction. Two backends (RedisCacheClient via ioredis when REDIS_URL is set, InMemoryCache fallback) share the CacheClient interface. `cache` singleton delegates to the active backend. `initCache(env)` / `verifyCache(env)` / `disposeCache()` are the lifecycle hooks called from index.ts at boot.
- `crypto.ts` — AES-256-GCM at-rest encryption helper. (~102 tok)
- `db-guard.ts` — Database availability guard. (~210 tok)
- `jwt.ts` — JWT helpers. (~583 tok)
- `logger.ts` — Structured logger (pino). The single source of truth for application (~306 tok)
- `password.ts` — Password hashing helpers. (~264 tok)
- `prisma.ts` — Prisma client re-export. (~328 tok)
- `queue.ts` — BullMQ enqueue helpers. `getPublishQueue(env)` builds a lazy Redis-backed Queue, `enqueuePublishJob` is called from videos.service, `verifyPublishQueue(env)` PINGs the connection for the boot banner, `closePublishQueue` runs on SIGTERM. Returns null when REDIS_URL is unset. (~1321 tok)
- `refresh-token.test.ts` — Declares prismaMock (~2701 tok)
- `refresh-token.ts` — Refresh-token rotation primitives. (~2158 tok)
- `response.test.ts` — Unit tests for the centralized response helpers. (~926 tok)
- `response.ts` — Centralized response helpers for the Express API. (~547 tok)

## apps/api/src/middleware/

- `auth.ts` — Authentication middleware. (~584 tok)
- `error.ts` — Central error handler. (~966 tok)
- `rate-limit.ts` — Rate limiting middleware. (~1210 tok)
- `request-id.ts` — Request-ID middleware. (~298 tok)
- `validate.ts` — Request validation middleware. (~593 tok)

## apps/api/src/modules/auth/

- `auth.controller.ts` — Auth controller. (~766 tok)
- `auth.routes.ts` — Auth route definitions. (~532 tok)
- `auth.schemas.test.ts` — Declares result (~1693 tok)
- `auth.schemas.ts` — Zod schemas for auth routes. (~717 tok)
- `auth.service.test.ts` — Declares mockEnv (~2510 tok)
- `auth.service.ts` — Auth service. (~2359 tok)
- `auth.types.ts` — Auth-module-specific type helpers. (~87 tok)

## apps/api/src/modules/health/

- `health.routes.ts` — Health check routes. (~621 tok)

## apps/api/src/modules/onboarding/

- `onboarding.controller.ts` — Onboarding controller. (~545 tok)
- `onboarding.routes.ts` — Onboarding route definitions. (~315 tok)
- `onboarding.schemas.test.ts` — Declares result (~1241 tok)
- `onboarding.schemas.ts` — Zod schemas for onboarding routes. (~512 tok)
- `onboarding.service.test.ts` — Declares mockProfile (~2036 tok)
- `onboarding.service.ts` — Onboarding service. (~1295 tok)
- `plan-recommendation.test.ts` (~175 tok)
- `plan-recommendation.ts` — Plan recommendation logic. (~278 tok)

## apps/api/src/modules/preferences/

- `preferences.controller.ts` — Preferences controller. (~696 tok)
- `preferences.routes.ts` — Preferences route definitions. (~511 tok)
- `preferences.schemas.test.ts` — Declares result (~864 tok)
- `preferences.schemas.ts` — Zod schemas for the preferences + security routes. (~1083 tok)
- `preferences.service.test.ts` — Declares mockUpsert (~1800 tok)
- `preferences.service.ts` — Preferences service. (~1892 tok)

## apps/api/src/modules/settings/

- `settings.controller.ts` — Settings controller. (~412 tok)
- `settings.routes.ts` — Settings route definitions. (~219 tok)
- `settings.service.ts` — Settings service. (~1160 tok)

## apps/api/src/modules/videos/

- `videos.controller.ts` — Videos controller. (~2220 tok)
- `videos.routes.ts` — Videos route definitions. (~1141 tok)
- `videos.schemas.ts` — Zod schemas for the videos module. Now includes optional thumbnail content-type / size / filename block + superRefine that requires all three or none. (~2702 tok)
- `videos.service.test.ts` — Tests for the videos service. StubVideo includes nullable s3KeyThumbnail + thumbnailContentType. (~6640 tok)
- `videos.service.ts` — Videos service — owns all DB + S3 + YouTube-publish enqueue logic. Mints a second presigned POST URL for the optional custom thumbnail and HEADs the S3 object on finalize before persisting the key. (~8496 tok)
- `videos.types.ts` — Module-internal types for the videos module. toVideoDto surfaces nullable s3KeyThumbnail + thumbnailContentType. (~615 tok)

## apps/api/src/modules/youtube/

- `youtube.controller.ts` — YouTube OAuth controller. (~1427 tok)
- `youtube.routes.ts` — YouTube OAuth route definitions. (~594 tok)
- `youtube.schemas.ts` — Zod schemas for YouTube module request/response validation. (~372 tok)
- `youtube.service.test.ts` — Declares PermanentPublishError (~3078 tok)
- `youtube.service.ts` — YouTube OAuth service. (~2546 tok)
- `youtube.types.ts` — YouTube module types. (~365 tok)

## apps/api/src/scripts/

- `crypto-self-test.js` — Crypto self-test. (~855 tok)
- `crypto-self-test.ts` — Crypto self-test. (~784 tok)

## apps/api/src/types/

- `express.d.ts` — Express Request type augmentations for the API. (~405 tok)

## apps/web/

- `.gitignore` — Git ignore rules (~112 tok)
- `auth.config.ts` — Edge-safe NextAuth config. (~1671 tok)
- `auth.ts` — Full NextAuth (Auth.js v5) configuration. (~3420 tok)
- `components.json` (~122 tok)
- `eslint.config.js` — ESLint flat configuration (~41 tok)
- `middleware.ts` — Edge middleware. (~548 tok)
- `next-env.d.ts` — / <reference types="next" /> (~72 tok)
- `next.config.js` — Next.js configuration (~34 tok)
- `package.json` — Node.js package manifest (~471 tok)
- `postcss.config.mjs` — Declares config (~26 tok)
- `README.md` — Project documentation (~353 tok)
- `tsconfig.json` — TypeScript configuration (~114 tok)
- `vitest.config.ts` — Vitest test configuration (~256 tok)
- `vitest.setup.ts` (~11 tok)

## apps/web/app/

- `globals.css` — Styles: 6 rules, 89 vars (~1590 tok)
- `layout.tsx` — interTight (~479 tok)
- `page.tsx` — Marketing landing. (~833 tok)

## apps/web/app/(auth)/

- `layout.tsx` — Auth shell: no top nav, centered card. The Logo in the corner is the (~220 tok)

## apps/web/app/(auth)/signin/

- `page.tsx` — metadata — uses useSearchParams (~282 tok)

## apps/web/app/(auth)/signup/

- `page.tsx` — metadata (~203 tok)

## apps/web/app/api/auth/[...nextauth]/

- `route.ts` — NextAuth (Auth.js v5) route handler. (~169 tok)

## apps/web/app/dashboard/

- `dashboard-content.tsx` — Dashboard home (client component). (~1275 tok)
- `layout.tsx` — Dashboard chrome. The sidebar is rendered server-side and the (~314 tok)
- `page.tsx` — Dashboard route entry. Stays a server component so we can export (~190 tok)

## apps/web/app/dashboard/published/

- `page.tsx` — `/dashboard/published` — the user's library of videos already on (~513 tok)

## apps/web/app/dashboard/published/[id]/

- `cancel-button.tsx` — Cancel action for the video detail page. Calls (~430 tok)
- `page.tsx` — Same mapping the dashboard's `VideoCard` uses — keep the visual (~3152 tok)
- `unpublish-button.tsx` — Unpublish action for the video detail page. Calls (~426 tok)

## apps/web/app/dashboard/settings/

- `layout.tsx` — Settings chrome. Same dashboard shell (sidebar + main content) so the (~284 tok)
- `page.tsx` — Settings index. Redirects to the Profile section — that's the most (~98 tok)

## apps/web/app/dashboard/settings/appearance/

- `appearance-form.tsx` — Three-option segmented control for theme selection. Each option (~1012 tok)
- `page.tsx` — metadata (~161 tok)

## apps/web/app/dashboard/settings/connected/

- `page.tsx` — ConnectedSettingsPage (~726 tok)

## apps/web/app/dashboard/settings/generation/

- `generation-form.tsx` — CHAPTER_BEHAVIOR_OPTIONS — renders form — uses useEffect (~1504 tok)
- `page.tsx` — metadata (~172 tok)

## apps/web/app/dashboard/settings/notifications/

- `notifications-form.test.tsx` — mockUseSettings (~944 tok)
- `notifications-form.tsx` — Optional override — when provided, the form renders against this (~1674 tok)
- `page.tsx` — metadata (~197 tok)

## apps/web/app/dashboard/settings/profile/

- `page.tsx` — metadata (~157 tok)
- `profile-form.tsx` — Editable profile form. Reuses the same fields as the onboarding (~1794 tok)

## apps/web/app/dashboard/settings/scheduling/

- `page.tsx` — metadata (~158 tok)
- `scheduling-form.tsx` — Best-effort "detect my timezone" helper. Uses the browser's (~1416 tok)

## apps/web/app/dashboard/settings/security/

- `change-password-form.test.tsx` — mockUseChangePassword (~993 tok)
- `change-password-form.tsx` — Live password rule checkers. Reused from the signup form so the (~1643 tok)
- `page.tsx` — metadata (~162 tok)

## apps/web/app/onboarding/

- `layout.tsx` — Onboarding shell. No app sidebar yet (the user isn't in the app (~324 tok)

## apps/web/app/onboarding/profile/

- `page.tsx` — metadata (~101 tok)

## apps/web/app/youtube-connect/callback/

- `page.tsx` — CallbackContent — uses useSearchParams, useRouter, useEffect (~385 tok)

## apps/web/components/auth/

- `google-button.tsx` — Label override. Defaults to "Continue with Google" per the design (~713 tok)
- `password-input.tsx` — Accessible label for the toggle button. Override per-locale. (~497 tok)
- `signin-form.test.tsx` — mockPush (~1809 tok)
- `signin-form.tsx` — Email + password sign-in form. Delegates to NextAuth's Credentials (~1313 tok)
- `signup-form.test.tsx` — mockPush (~1844 tok)
- `signup-form.tsx` — Password rule checkers. Split out so the live hints under the password (~2147 tok)

## apps/web/components/dashboard/

- `create-video-dialog.tsx` — Optional custom thumbnail. JPEG / PNG only, 2 MB max — matches (~14698 tok)
- `empty-state.test.tsx` (~328 tok)
- `empty-state.tsx` — Whether the user has connected a YouTube channel. When `false`, (~607 tok)
- `published-video-card.tsx` — One row in the `/dashboard/published` library. (~1874 tok)
- `published-video-list.tsx` — Date-range buckets shown in the Select. Each maps to a `since` ISO (~4280 tok)
- `sidebar.test.tsx` — mockUseSession (~1377 tok)
- `sidebar.tsx` — Show as a real link vs. a "coming soon" placeholder. (~1933 tok)
- `status-timeline.tsx` — Video status values — narrow, semantic subset of the full VideoStatus (~1042 tok)
- `video-card.tsx` — Map a server-side VideoStatus to the timeline's narrow `TimelineStatus` (~1703 tok)
- `video-list.tsx` — The already-fetched videos to render. In the SSR dashboard flow (~1191 tok)
- `youtube-connect-card.tsx` — Persistent channel-connection card. Per Design.md, channel-connection (~2582 tok)

## apps/web/components/onboarding/

- `profile-wizard.test.tsx` — mockRouterPush (~2815 tok)
- `profile-wizard.tsx` — Four-step wizard for the onboarding profile questions. Each step owns (~1908 tok)
- `progress-dots.tsx` — Optional labels per step; shown above the dots when provided. (~591 tok)
- `question-display-name.tsx` — Step 1 — channel / display name. Free text and explicitly optional (~388 tok)
- `question-frequency.tsx` — Step 3 — upload frequency. Four single-select cards stacked vertically (~888 tok)
- `question-goal.tsx` — Step 4 — primary goal. Four single-select cards. Drives which feature (~912 tok)
- `question-niche.tsx` — One-line description shown under the label on the card. (~1064 tok)

## apps/web/components/settings/

- `settings-layout.tsx` — Two-column layout for the settings area. (~301 tok)
- `settings-nav.test.tsx` — mockUsePathname (~512 tok)
- `settings-nav.tsx` — Inner sidebar for the settings area. Renders a vertical list of (~1005 tok)
- `settings-page-header.tsx` — Consistent page header for every settings page. Keeps the heading (~226 tok)

## apps/web/components/shared/

- `BackButton.tsx` — BackButton — uses useRouter (~120 tok)
- `logo.tsx` — "wordmark" includes the wordmark, "mark" is just the icon. (~466 tok)
- `protected-shell.tsx` — Wrap page contents that need an authenticated user but want to stay (~212 tok)
- `query-provider.tsx` — App-wide TanStack Query provider. (~243 tok)
- `theme-provider.tsx` — Theme provider wrapper around next-themes. Defaults to the system (~180 tok)
- `toaster.tsx` — Mount-once toast container. `richColors` is off — we want ClipFlow's (~255 tok)

## apps/web/components/ui/

- `badge.tsx` — badgeVariants (~508 tok)
- `button.tsx` — Standard shadcn/ui Button — "new-york" style, neutral base, CSS variables. (~628 tok)
- `card.tsx` — Card (~550 tok)
- `dialog.tsx` — Dialog — renders modal (~1230 tok)
- `file-dropzone.tsx` — Drag-and-drop file picker styled to match the rest of the (~3311 tok)
- `form-field.tsx` — Standardized settings form field. (~949 tok)
- `input.tsx` — Standard shadcn/ui Input. Plain wrapper around <input> so any (~269 tok)
- `label.tsx` — labelVariants (~210 tok)
- `select.tsx` — Select (~1816 tok)
- `skeleton.tsx` — Skeleton (~79 tok)
- `switch.test.tsx` — el (~364 tok)
- `switch.tsx` — Minimal accessible switch. (~539 tok)
- `textarea.tsx` — Textarea (~217 tok)

## apps/web/hooks/

- `use-api.test.ts` — Behavioral test for `useApi()` — the critical contract that pulls (~1325 tok)
- `use-api.ts` — Hook that returns a typed `api` surface bound to the current session's (~356 tok)
- `use-auth.ts` — Identity hook for components. (~821 tok)
- `use-change-password.ts` — Change the authenticated user's password. The server returns 204; (~194 tok)
- `use-connect-youtube.ts` — Connect the authenticated user's YouTube channel by exchanging an (~417 tok)
- `use-disconnect-youtube.ts` — Disconnect the authenticated user's YouTube channel. Optimistic: we (~766 tok)
- `use-onboarding-status.ts` — Onboarding-completion status. Used by /onboarding routes to decide (~245 tok)
- `use-settings.ts` — Lazy settings-shaped read for the settings pages and the YouTube (~253 tok)
- `use-sign-in.ts` — Sign in via NextAuth's Credentials provider. (~788 tok)
- `use-sign-out.ts` — Sign out via NextAuth. (~500 tok)
- `use-sign-up.ts` — Sign up. (~734 tok)
- `use-update-preferences.ts` — Partial update of the authenticated user's preferences. The server (~330 tok)
- `use-update-profile.ts` — Update the authenticated user's profile. Two flavors: (~474 tok)
- `use-youtube-connection.ts` — Narrow YouTube-connection read for /settings/connected. The (~203 tok)

## apps/web/lib/

- `api-client.ts` — Typed API surface for talking to the Express backend. (~3714 tok)
- `auth-guard.test.tsx` — mockReplace (~700 tok)
- `auth-guard.tsx` — Where to send unauthenticated users. Defaults to /signin. (~521 tok)
- `env.ts` — Centralized access to NEXT_PUBLIC_* env vars. (~184 tok)
- `format.ts` — Small formatting helpers used across the dashboard / video list / review (~718 tok)
- `onboarding-guard.test.tsx` — mockReplace (~1034 tok)
- `onboarding-guard.tsx` — "require-incomplete": only render for users who haven't finished (~616 tok)
- `profile-options.ts` — Static option lists for the onboarding wizard + settings profile form. (~432 tok)
- `query-client.ts` — Create a fresh QueryClient with the app's defaults. (~773 tok)
- `query-keys.ts` — Centralized, type-safe query key factory. (~596 tok)
- `utils.ts` — Conditionally join class names then run them through tailwind-merge (~98 tok)

## apps/worker/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~262 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)

## apps/worker/src/

- `env.ts` — Worker environment loader. (~504 tok)
- `index.ts` — Worker entrypoint. Loads env, runs boot-time service checks (Postgres + Redis PING), builds the BullMQ Queue + Worker, runs the 2-pass startup-recovery scan (orphaned PUBLISHING rows → READY/SCHEDULED re-enqueue), wires SIGTERM/SIGINT graceful shutdown. (~1622 tok)
- `startup-recovery.ts` — Worker startup-recovery scan. Two passes: recoverOrphanedPublishingJobs (reconciles rows left in PUBLISHING by a crashed worker) runs BEFORE recoverMissedScheduledJobs (re-enqueues due READY/SCHEDULED rows). (~1313 tok)

## apps/worker/src/config/

- `logger.ts` — Pino logger factory for the worker. Mirrors apps/api's logger shape (~209 tok)
- `queue.ts` — BullMQ queue + worker construction. (~626 tok)

## apps/worker/src/jobs/

- `youtube-publish.ts` — Worker job: publish a Video row to YouTube. (~733 tok)

## docker/postgres/init/

- `00-create-neondb-owner.sql` — Pre-init script for the local-dev postgres container. (~335 tok)

## docs/

- `AppFlow.md` — AppFlow.md — ClipFlow (placeholder name) (~3137 tok)
- `Design.md` — Design.md — ClipFlow (placeholder name) (~2626 tok)
- `PRD.md` — PRD.md — ClipFlow (placeholder name) (~2874 tok)
- `Schema.md` — Schema.md — ClipFlow (placeholder name) (~4312 tok)
- `TechSpec.md` — TechSpec.md — ClipFlow (placeholder name) (~3221 tok)

## packages/config/

- `package.json` — Node.js package manifest (~124 tok)
- `tsconfig.json` — TypeScript configuration (~70 tok)

## packages/config/src/

- `index.ts` — Zod schemas: envSchema, publicEnvSchema (~1208 tok)

## packages/crypto/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~180 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)

## packages/crypto/scripts/

- `self-test.ts` — Self-test: round-trip AES-256-GCM encrypt/decrypt. (~274 tok)

## packages/crypto/src/

- `index.ts` — Exports CryptoError, encryptToken, decryptToken (~906 tok)

## packages/db/

- `package.json` — Node.js package manifest (~277 tok)
- `prisma.config.ts` (~89 tok)
- `schema.prisma` — packages/db/schema.prisma (~3431 tok)
- `tsconfig.json` — TypeScript configuration (~75 tok)

## packages/db/prisma/migrations/

- `migration_lock.toml` — Please do not edit this file manually (~37 tok)

## packages/db/prisma/migrations/20260622055536_init/

- `migration.sql` — CreateEnum (~504 tok)

## packages/db/prisma/migrations/20260622142741_added_youtubw/

- `migration.sql` — CreateEnum (~277 tok)

## packages/db/prisma/migrations/20260623000000_add_user_preferences/

- `migration.sql` — CreateEnum (~367 tok)

## packages/db/prisma/migrations/20260623065310_add_video_model/

- `migration.sql` — CreateEnum (~522 tok)

## packages/db/prisma/migrations/20260624041459_add_performance_indexes/

- `migration.sql` — DropIndex (~99 tok)

## packages/db/prisma/migrations/20260624090000_add_video_controls/

- `migration.sql` — Add the YouTube status-block controls that the Data API v3 accepts (~291 tok)

## packages/db/prisma/migrations/20260624152240_add_token_rotation_in_athentication/

- `migration.sql` — CreateTable (~270 tok)

## packages/db/prisma/migrations/20260625130052_add_indexing_in_user_table/

- `migration.sql` — CreateIndex (~22 tok)

## packages/db/prisma/migrations/20260626000000_add_video_thumbnail/

- `migration.sql` — AlterTable — adds nullable s3KeyThumbnail + thumbnailContentType columns on videos. (~146 tok)
- `migration.sql` — Add custom-thumbnail support to the videos table. (~156 tok)

## packages/db/src/

- `index.ts` — Exports prisma (~300 tok)

## packages/eslint-config/

- `base.js` — A shared ESLint configuration for the repository. (~187 tok)
- `next.js` — A custom ESLint configuration for libraries that use Next.js. (~428 tok)
- `package.json` — Node.js package manifest (~183 tok)
- `react-internal.js` — A custom ESLint configuration for libraries that use React. (~312 tok)
- `README.md` — Project documentation (~18 tok)

## packages/s3/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~198 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)

## packages/s3/src/

- `client.ts` — Exports S3Config, buildS3Config, getS3Client (~577 tok)
- `index.ts` — Declares S3Config (~97 tok)
- `operations.ts` — Object operations used by the API (finalize, delete) and the worker (~752 tok)
- `presign.ts` — Presigned upload helpers. (~720 tok)

## packages/types/

- `package.json` — Node.js package manifest (~115 tok)
- `tsconfig.json` — TypeScript configuration (~64 tok)

## packages/types/src/

- `index.ts` — ---------- Enums (mirror Prisma enums in packages/db) ---------- (~5148 tok)

## packages/typescript-config/

- `base.json` (~143 tok)
- `nextjs.json` (~78 tok)
- `package.json` — Node.js package manifest (~44 tok)
- `react-library.json` (~39 tok)

## packages/youtube-upload/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~242 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)
- `vitest.config.ts` — Vitest test configuration (~45 tok)

## packages/youtube-upload/src/

- `errors.ts` — Typed errors thrown by `publishVideo` and its collaborators. The (~588 tok)
- `index.ts` — Declares PublishVideoContext (~212 tok)
- `publish-video.ts` — Publish a Video row to YouTube. After videos.insert succeeds, streams the row's s3KeyThumbnail (if any) to thumbnails.set. Transient thumbnail errors get retried; permanent errors are logged but don't fail the publish. (~3413 tok)
- `token-refresh.ts` — Token refresh for a stored YouTube connection. (~945 tok)
- `youtube-api.test.ts` — Unit tests for the internal-license → YouTube-API license translator. (~559 tok)
- `youtube-api.ts` — YouTube Data API v3 — two-step resumable upload for videos.insert + setYouTubeThumbnail() helper that PUTs image bytes to /upload/youtube/v3/thumbnails/set. (~3839 tok)
