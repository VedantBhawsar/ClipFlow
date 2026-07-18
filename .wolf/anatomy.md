# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-18T03:26:38.427Z
> Files: 404 tracked | Anatomy hits: 0 | Misses: 0

## ../../../../../tmp/

- `add_bugs.jq` — Declares on (~818 tok)
- `append-bug-128.cjs` — Declares fs (~555 tok)
- `append-bug-138.cjs` — Declares fs (~613 tok)

## ../../../../../tmp/pw-capture/

- `capture.mjs` — Declares __dirname (~363 tok)

## ../../../.claude/plans/

- `i-want-you-to-expressive-quail.md` — ClipFlow — Dodo Payments Implementation Plan (India Region) (~10356 tok)
- `i-want-you-to-precious-hopcroft.md` — Plan: Personalized Thumbnail Style — Onboarding Step 5 + Settings Re-entry (~3683 tok)
- `memoized-floating-dijkstra.md` — ClipFlow Dashboard UI Polish — Plan (~2700 tok)
- `quirky-giggling-blanket.md` — Plan: In-place editing for video metadata + chapters (~2106 tok)
- `radiant-prancing-quail.md` — Plan: Migrate image-gen-client to `@google/genai` SDK (~1818 tok)
- `shimmying-nibbling-cosmos.md` — Plan: Run Prisma migrations before API/worker start in docker-compose (~1488 tok)
- `witty-snuggling-seal.md` — Plan: Add Publish / Schedule UI for READY_FOR_REVIEW videos (~4526 tok)
- `wondrous-meandering-diffie.md` — Plan: Show AI-generated thumbnails on the video detail page and wire selection (~1979 tok)
- `zazzy-plotting-peacock.md` — Audio + Frame Extraction (`video-ingest` queue) (~3360 tok)

## ../../../.claude/projects/-Users-vedant-Documents-projects-ClipFlow/

- `new-bugs.json` — Declares undefined (~1964 tok)

## ./

- `.dockerignore` (~136 tok)
- `.DS_Store` (~1640 tok)
- `.gitignore` — Git ignore rules (~136 tok)
- `.npmrc` (~0 tok)
- `CLAUDE.md` — OpenWolf (~3549 tok)
- `docker-compose.yml` — Docker Compose services (~2275 tok)
- `neon_backup.sql` — PostgreSQL database dump (~6500 tok)
- `package.json` — Node.js package manifest (~123 tok)
- `pnpm-lock.yaml` — pnpm lock file (~100120 tok)
- `pnpm-workspace.yaml` (~12 tok)
- `README.md` — Project documentation (~7104 tok)
- `turbo.json` — ", ".next/**", "!.next/cache/**", "!.next/dev/**"] (~560 tok)
- `z.mjs` — Declares args (~84 tok)

## .claude/

- `settings.json` (~441 tok)
- `settings.local.json` (~263 tok)

## .claude/plans/

- `topic-shaping-summit.md` — Plan: Topic-aware highlight selection for ClipFlow's ingest pipeline (~4346 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .github/workflows/

- `pr.yml` — CI: PR Checks (~369 tok)

## apps/api/

- `.dockerignore` — Production-ready ignore file for the Express+TS API. Build artifacts (`dist/`, `*.tsbuildinfo`), tests (`*.test.*`, `vitest.config.*`), editor/OS noise, env files, Docker + CI configs, AI tool metadata (`.cursor/`, `.claude/`, `wolf/`, etc.). Mirrors the shape of `apps/web/.dockerignore` minus Next.js entries. (~580 tok)
- `.gitignore` — Git ignore rules (~36 tok)
- `eslint.config.mjs` — ESLint flat configuration (~50 tok)
- `package.json` — Node.js package manifest (~435 tok)
- `tsconfig.json` — TypeScript configuration (~124 tok)
- `vitest.config.ts` — Vitest test configuration (~117 tok)

## apps/api/scripts/

- `crypto-self-test.ts` — AES-256-GCM round-trip self-test. (~159 tok)

## apps/api/src/

- `app.ts` — Express app factory. (~1564 tok)
- `index.ts` — Entrypoint. (~2421 tok)
- `server.ts` — HTTP server lifecycle. (~844 tok)

## apps/api/src/config/

- `env.ts` — Environment configuration loader. (~1142 tok)

## apps/api/src/errors/

- `AppError.ts` — Typed application error used across the API. Services/controllers throw (~374 tok)

## apps/api/src/lib/

- `async-handler.ts` — Patch Express 4's `Layer.handle_request` so a rejection in an async (~1007 tok)
- `cache.ts` — Cache abstraction. (~2524 tok)
- `crypto.ts` — AES-256-GCM at-rest encryption helper. (~102 tok)
- `db-guard.ts` — Database availability guard. (~210 tok)
- `events.ts` — Event bus for video processing progress. (~1658 tok)
- `jwt.ts` — JWT helpers. (~583 tok)
- `logger.ts` — Structured logger (pino). The single source of truth for application (~306 tok)
- `password.ts` — Password hashing helpers. (~264 tok)
- `prisma.ts` — Prisma client re-export. (~328 tok)
- `queue.ts` — BullMQ enqueue helpers. (~3943 tok)
- `refresh-token.test.ts` — Declares prismaMock (~2701 tok)
- `refresh-token.ts` — Refresh-token rotation primitives. (~2161 tok)
- `response.test.ts` — Unit tests for the centralized response helpers. (~924 tok)
- `response.ts` — Centralized response helpers for the Express API. (~547 tok)
- `sse.ts` — Write an SSE event to the response stream. (~116 tok)

## apps/api/src/middleware/

- `auth.ts` — Authentication middleware. (~584 tok)
- `error.ts` — Central error handler. (~966 tok)
- `rate-limit.ts` — Rate limiting middleware. (~1210 tok)
- `request-id.ts` — Request-ID middleware. (~298 tok)
- `sse-auth.ts` — SSE authentication middleware. (~362 tok)
- `validate.ts` — Request validation middleware. (~593 tok)

## apps/api/src/modules/auth/

- `auth.controller.ts` — Auth controller. (~770 tok)
- `auth.routes.ts` — Auth route definitions. (~532 tok)
- `auth.schemas.test.ts` — Declares result (~1693 tok)
- `auth.schemas.ts` — Zod schemas for auth routes. (~717 tok)
- `auth.service.test.ts` — Declares mockEnv (~2648 tok)
- `auth.service.ts` — Auth service. (~2107 tok)
- `auth.types.ts` — Auth-module-specific type helpers. (~87 tok)

## apps/api/src/modules/health/

- `health.routes.ts` — Health check routes. (~621 tok)

## apps/api/src/modules/onboarding/

- `onboarding.controller.ts` — Onboarding controller. (~545 tok)
- `onboarding.routes.ts` — Onboarding route definitions. (~315 tok)
- `onboarding.schemas.test.ts` — Declares result (~1241 tok)
- `onboarding.schemas.ts` — Zod schemas for onboarding routes. (~512 tok)
- `onboarding.service.test.ts` — Declares mockProfile (~2103 tok)
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
- `settings.service.ts` — Settings service. (~1278 tok)

## apps/api/src/modules/thumbnails/

- `thumbnails.controller.ts` — API routes: GET (1 endpoints) (~1067 tok)
- `thumbnails.routes.ts` — Router for user-level thumbnail style operations: /api/thumbnail-style (~551 tok)
- `thumbnails.schemas.ts` — Body for POST /api/thumbnail-style/analyze. (~632 tok)
- `thumbnails.service.ts` — List all thumbnails for a video. (~1679 tok)
- `thumbnails.types.ts` — Exports toThumbnailDto, toStyleDto (~538 tok)

## apps/api/src/modules/videos/

- `videos.controller.ts` — Videos controller. (~3989 tok)
- `videos.routes.ts` — Videos route definitions. (~1578 tok)
- `videos.schemas.ts` — Zod schemas for the videos module. (~4468 tok)
- `videos.service.test.ts` — Tests for the videos service. (~12754 tok)
- `videos.service.ts` — Videos service — owns all DB + S3 + YouTube-publish enqueue logic (~12814 tok)
- `videos.types.ts` — Module-internal types for the videos module. (~1301 tok)

## apps/api/src/modules/youtube/

- `youtube.controller.ts` — YouTube OAuth controller. (~1758 tok)
- `youtube.routes.ts` — YouTube OAuth route definitions. (~766 tok)
- `youtube.schemas.ts` — Zod schemas for YouTube module request/response validation. (~496 tok)
- `youtube.service.test.ts` — Declares PermanentPublishError (~2929 tok)
- `youtube.service.ts` — YouTube OAuth service. (~3366 tok)
- `youtube.types.ts` — YouTube module types. (~365 tok)

## apps/api/src/scripts/

- `crypto-self-test.js` — Crypto self-test. (~735 tok)
- `crypto-self-test.ts` — Crypto self-test. (~671 tok)

## apps/api/src/types/

- `express.d.ts` — Express Request type augmentations for the API. (~405 tok)

## apps/web/

- `.gitignore` — Git ignore rules (~112 tok)
- `auth.config.ts` — Edge-safe NextAuth config. (~1671 tok)
- `auth.ts` — Full NextAuth (Auth.js v5) configuration. (~3420 tok)
- `components.json` (~122 tok)
- `eslint.config.js` — ESLint flat configuration (~41 tok)
- `middleware.ts` — Export `.auth` as a function reference, NOT invoked. (~392 tok)
- `next-env.d.ts` — / <reference types="next" /> (~71 tok)
- `next.config.js` — Declares nextConfig + `output: "standalone"` (Dockerfile depends on it) + `outputFileTracingRoot: path.join(import.meta.dirname, "../../")` so Next can trace @clipflow/* workspace packages from packages/. (~700 tok)
- `package.json` — Node.js package manifest (~481 tok)
- `postcss.config.mjs` — Declares config (~26 tok)
- `README.md` — Project documentation (~353 tok)
- `tsconfig.json` — TypeScript configuration (~114 tok)
- `vitest.config.ts` — /*.test.ts", (~272 tok)
- `vitest.setup.ts` (~11 tok)

## apps/web/app/

- `globals.css` — Styles: 23 rules, 110 vars (~3167 tok)
- `layout.tsx` — interTight (~506 tok)
- `page.tsx` — Marketing landing. (~845 tok)

## apps/web/app/(auth)/

- `layout.tsx` — Auth shell: no top nav, centered card. The Logo in the corner is the (~220 tok)

## apps/web/app/(auth)/signin/

- `page.tsx` — metadata — uses useSearchParams (~282 tok)

## apps/web/app/(auth)/signup/

- `page.tsx` — metadata (~203 tok)

## apps/web/app/api/auth/[...nextauth]/

- `route.ts` — NextAuth (Auth.js v5) route handler. (~169 tok)

## apps/web/app/billing/

- `page.tsx` — dynamic (~946 tok)

## apps/web/app/billing/success/

- `page.tsx` — BillingSuccessPage (~705 tok)

## apps/web/app/dashboard/

- `dashboard-content.tsx` — Dashboard home (client component). (~2977 tok)
- `layout.tsx` — Dashboard chrome. Desktop fixed sidebar (`lg+`) + sticky mobile top bar (`<lg`) with `<MobileNav>`. Body scroll on mobile, `min-h-svh`, content capped at `max-w-5xl`. (~582 tok)
- `page.tsx` — Dashboard route entry. Stays a server component so we can export (~190 tok)

## apps/web/app/dashboard/published/

- `page.tsx` — `/dashboard/published` — the user's library of videos already on (~513 tok)

## apps/web/app/dashboard/published/[id]/

- `cancel-button.tsx` — Cancel action for the video detail page. Calls (~436 tok)
- `edit-details-button.tsx` — Thin client island that keeps the Sheet open-state and renders the (~344 tok)
- `page.tsx` — `/dashboard/published/:id` — full detail view for a single video. (~4749 tok)
- `publish-button.test.tsx` — Tests for `<PublishButton>` + the `<PublishSheet>` it opens. (~3080 tok)
- `publish-button.tsx` — Header "Publish" button for a `READY_FOR_REVIEW` (or (~304 tok)
- `retry-button.tsx` — Title used in the confirm prompt and the aria-label. (~625 tok)
- `unpublish-button.tsx` — Unpublish action for the video detail page. Calls (~426 tok)

## apps/web/app/dashboard/settings/

- `layout.tsx` — Settings chrome. Same dashboard shell (sidebar + main content) so the (~251 tok)
- `page.tsx` — Settings index. Redirects to the Profile section — that's the most (~98 tok)

## apps/web/app/dashboard/settings/appearance/

- `appearance-form.tsx` — Three-option segmented control for theme selection. Each option (~1012 tok)
- `page.tsx` — metadata (~161 tok)

## apps/web/app/dashboard/settings/connected/

- `page.tsx` — ConnectedSettingsPage — renders modal (~1838 tok)

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

## apps/web/app/dashboard/thumbnail-style/

- `page.tsx` — Full page (not a Dialog) for already-onboarded users who want to (~387 tok)

## apps/web/app/onboarding/

- `layout.tsx` — Onboarding shell. No app sidebar yet (the user isn't in the app (~324 tok)

## apps/web/app/onboarding/profile/

- `page.tsx` — metadata (~101 tok)

## apps/web/app/onboarding/thumbnail-style/

- `page.tsx` — Standalone mount of the wizard's step 5 for users who finished the (~477 tok)

## apps/web/app/youtube-connect/callback/

- `page.tsx` — CallbackContent — uses useSearchParams, useRouter, useEffect (~385 tok)

## apps/web/components/auth/

- `google-button.tsx` — Label override. Defaults to "Continue with Google" per the design (~713 tok)
- `password-input.tsx` — Accessible label for the toggle button. Override per-locale. (~497 tok)
- `signin-form.test.tsx` — mockPush (~1809 tok)
- `signin-form.tsx` — Email + password sign-in form. Delegates to NextAuth's Credentials (~1301 tok)
- `signup-form.test.tsx` — mockPush (~1844 tok)
- `signup-form.tsx` — Password rule checkers. Split out so the live hints under the password (~2147 tok)

## apps/web/components/dashboard/

- `create-video-dialog.tsx` — Optional custom thumbnail. JPEG / PNG only, 2 MB max — matches (~14698 tok)
- `dashboard-stats.tsx` — Rows the worker is still actively processing or hasn't yet been (~2170 tok)
- `detail-row.tsx` — Definition-list row used by the video detail page's metadata block. `span={2}` for free-form fields, `muted` for technical block. (~355 tok)
- `mobile-nav.tsx` — Mobile navigation — left-edge drawer containing the same `<SidebarContent>` (~703 tok)
- `processing-substeps.tsx` — Sub-stage breakdown for the "Processing" bucket of the 5-stage (~1804 tok)
- `publish-sheet.tsx` — Which fields the sheet needs off the `Video` row. The page passes (~2743 tok)
- `published-video-card.tsx` — One row in the `/dashboard/published` library. Tags + filename + privacy pill + audience flags. Token-only — "private" uses `--status-scheduled` deliberately. (~2035 tok)
- `published-video-list.tsx` — `/dashboard/published` — interactive library view with client-side search + filters + pagination. Token-only empty states (`--surface` + dashed `--line`). (~4376 tok)
- `sidebar-content.tsx` — Show as a real link vs. a "coming soon" placeholder. (~2164 tok)
- `sidebar.test.tsx` — mockUseSession (~1377 tok)
- `sidebar.tsx` — Desktop dashboard sidebar shell (`hidden lg:flex`) wrapping `<SidebarContent>`. (~200 tok)
- `status-pill.tsx` — Status chip using Design.md's `--status-*` tokens — no ad-hoc colors. Processing tone gets a `motion-safe:animate-pulse` dot. (~512 tok)
- `status-timeline.tsx` — Visual pipeline stages shown in the timeline strip — the signature (~1429 tok)
- `video-card.tsx` — Latest SSE events for real-time progress display (~2595 tok)
- `video-detail-live-progress.tsx` — Ambient real-time progress strip for the detail page. Per Design.md (~627 tok)
- `video-details-dialog.tsx` — Which fields can be patched via PATCH /api/videos/:id. (~4494 tok)
- `video-list.tsx` — The already-fetched videos to render. In the SSR dashboard flow (~1424 tok)
- `video-metadata-editor.test.tsx` — Tests for `<VideoMetadataEditor>` — the in-place title/description/tags (~1916 tok)
- `video-metadata-editor.test.tsx` — Tests for the in-place title/description/tags editor. (~4300 tok)
- `video-metadata-editor.tsx` — In-place editor for the user-supplied metadata on the review screen (~2854 tok)
- `video-metadata-editor.tsx` — In-place title/description/tags editor for the review screen. Per-section dirty state + Save. Calls useUpdateVideo + router.refresh. (~3550 tok)
- `youtube-connect-card.tsx` — Persistent channel-connection card. Per Design.md, channel-connection (~2943 tok)

## apps/web/components/landing/

- `creator-voice.tsx` — Single testimonial + 2x2 stats grid + marquee strip of channel handles. (~1700 tok)
- `creator-voice.tsx` — Creator voice — a single, strong testimonial centered, with a quiet (~1200 tok)
- `cta-band.tsx` — Final conversion card. Ambient radial gradient + primary CTA + sign-in escape. (~980 tok)
- `cta-band.tsx` — CTA band — sits above the footer. Asks the page's last conversion (~663 tok)
- `feature-trio.tsx` — Three feature cards (Schedule / Thumbnail / Chapters) each with a small product visual (calendar grid / stacked thumbnails / transcript). (~3600 tok)
- `feature-trio.tsx` — Feature trio — Schedule / Thumbnail / Chapters. (~2164 tok)
- `hero-product-card.tsx` — Faux product UI in the hero — tilted, glowing card showing "Ready to publish" with a designed thumbnail, schedule, chapter list, and Confirm/Edit buttons. (~2900 tok)
- `hero-product-card.tsx` — Faux product UI used as the hero visual. (~1980 tok)
- `hero.tsx` — Asymmetric hero with eyebrow + Fraunces display headline + product card + CTA pair + logline stats strip. (~2400 tok)
- `hero.tsx` — Hero — asymmetric, two-column on desktop, stacked on mobile. (~1383 tok)
- `how-it-works.tsx` — Three-step timeline (Upload → Review → Confirm) with hairline connectors. (~1700 tok)
- `how-it-works.tsx` — How it works — three numbered steps rendered as a horizontal timeline. (~922 tok)
- `site-footer.tsx` — Three-column nav (Product / Resources / Company) + brand block + copyright. Includes a reserved bottom strip so the Next.js dev indicator never overlaps footer content. (~1300 tok)
- `site-footer.tsx` — Marketing footer — three nav columns + brand block + bottom line. (~859 tok)
- `site-header.tsx` — Marketing site header. Logo + three nav links (hidden on mobile) + sign-in / start-free pair. (~940 tok)
- `site-header.tsx` — Marketing site header. (~484 tok)

## apps/web/components/marketing/

- `DifferentiatorSection.tsx` — DifferentiatorSection — the "one tool, not three" comparison. (~1897 tok)
- `FaqSection.tsx` — FaqSection — the small objections a creator still has at the bottom (~1454 tok)
- `FeatureTrio.tsx` — FeatureTrio — the automations named by PRD §3 Goal 1, plus one (~4052 tok)
- `FinalCta.tsx` — FinalCta — the page's last beat, before the footer. (~907 tok)
- `Hero.tsx` — Hero — the highest-leverage section on the page. (~3087 tok)
- `HowItWorks.tsx` — HowItWorks — the 4-step pipeline that maps to AppFlow §2-§5. (~1100 tok)
- `PricingSection.tsx` — PricingSection — three tiers, figures straight from PRD §8. (~1928 tok)
- `ProblemSection.tsx` — ProblemSection — names the workflow before pitching the fix. (~1192 tok)
- `ReassuranceStrip.tsx` — ReassuranceStrip — 3 short factual claims right under the hero. (~716 tok)
- `SiteFooter.tsx` — Marketing footer. (~837 tok)
- `SiteHeader.tsx` — Marketing site header. (~720 tok)
- `SocialProofSection.tsx` — SocialProofSection — placeholder-safe by design. (~1159 tok)
- `TrustCallout.tsx` — TrustCallout — a named product decision, given its own section. (~1436 tok)

## apps/web/components/onboarding/

- `profile-wizard.test.tsx` — Wrapper that exposes a fresh QueryClient per render. Step 5 mounts (~4384 tok)
- `profile-wizard.tsx` — Four-step wizard for the onboarding profile questions. Each step owns (~2408 tok)
- `progress-dots.tsx` — Optional labels per step; shown above the dots when provided. (~591 tok)
- `question-display-name.tsx` — Step 1 — channel / display name. Free text and explicitly optional (~388 tok)
- `question-frequency.tsx` — Step 3 — upload frequency. Four single-select cards stacked vertically (~888 tok)
- `question-goal.tsx` — Step 4 — primary goal. Four single-select cards. Drives which feature (~912 tok)
- `question-niche.tsx` — One-line description shown under the label on the card. (~1064 tok)
- `question-thumbnail-style.tsx` — Step 5 of the onboarding wizard (and the same component reused in a (~3908 tok)

## apps/web/components/review/

- `chapter-edit-dialog.tsx` — 0-based index of the chapter being edited, used only for the heading. (~2198 tok)
- `chapters-review.test.tsx` — Tests for the controlled `<ChaptersReview>` component. (~1689 tok)
- `chapters-review.tsx` — Fired whenever the user mutates the chapter list or summary. (~4682 tok)
- `thumbnail-card.tsx` — Shape for a single thumbnail candidate rendered by (~1242 tok)
- `thumbnail-review-panel.test.tsx` — Tests for `<ThumbnailReviewPanel>` — the client-side wrapper around (~1406 tok)
- `thumbnail-review-panel.tsx` — Client-side wrapper around `<ThumbnailReview>` that owns the (~1370 tok)
- `thumbnail-review.tsx` — id of the currently active option — falls back to `options[0]`. (~953 tok)
- `video-review-panel.tsx` — Review screen for the AI-generated chapter list + summary. Owned by (~1647 tok)

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
- `sheet.tsx` — Right-edge Sheet (shadcn new-york) — side-variant styling via class-variance-authority. Wraps radix-ui DialogPrimitive (Sheet is a Dialog with directional animations). Use for side panels instead of centered modals when forms get taller than ~5 fields. (~1329 tok)
- `skeleton.tsx` — Skeleton (~79 tok)
- `switch.test.tsx` — el (~364 tok)
- `switch.tsx` — Minimal accessible switch. (~539 tok)
- `textarea.tsx` — Textarea (~217 tok)

## apps/web/hooks/

- `use-api.test.ts` — Behavioral test for `useApi()` — the critical contract that pulls (~1325 tok)
- `use-api.ts` — Hook that returns a typed `api` surface bound to the current session's (~356 tok)
- `use-auth.ts` — Identity hook for components. (~858 tok)
- `use-change-password.ts` — Change the authenticated user's password. The server returns 204; (~194 tok)
- `use-channel-thumbnails.ts` — Hooks for the personalized-thumbnail-style onboarding step 5 and the (~693 tok)
- `use-connect-youtube.ts` — Connect the authenticated user's YouTube channel by exchanging an (~417 tok)
- `use-disconnect-youtube.ts` — Disconnect the authenticated user's YouTube channel. Optimistic: we (~766 tok)
- `use-onboarding-status.ts` — Onboarding-completion status. Used by /onboarding routes to decide (~245 tok)
- `use-settings.ts` — Lazy settings-shaped read for the settings pages and the YouTube (~253 tok)
- `use-sign-in.ts` — Sign in via NextAuth's Credentials provider. (~781 tok)
- `use-sign-out.ts` — Sign out via NextAuth. (~500 tok)
- `use-sign-up.ts` — Sign up. (~734 tok)
- `use-update-preferences.ts` — Partial update of the authenticated user's preferences. The server (~330 tok)
- `use-update-profile.ts` — Update the authenticated user's profile. Two flavors: (~474 tok)
- `use-video-sse.ts` — Subscribe to SSE events for video processing. (~847 tok)
- `use-videos.ts` — TanStack Query hooks + an XHR-based upload helper for the (~4604 tok)
- `use-youtube-connection.ts` — Narrow YouTube-connection read for /settings/connected. The (~203 tok)
- `use-youtube-oauth-popup.ts` — Open the Google OAuth URL in a centered popup and listen for the (~1419 tok)

## apps/web/lib/

- `api-client.ts` — Typed API surface for talking to the Express backend. (~5330 tok)
- `auth-guard.test.tsx` — mockReplace (~700 tok)
- `auth-guard.tsx` — Where to send unauthenticated users. Defaults to /signin. (~521 tok)
- `env.ts` — Centralized access to NEXT_PUBLIC_* env vars. (~184 tok)
- `format.ts` — Small formatting helpers used across the dashboard / video list / review (~718 tok)
- `friendly-error.ts` — Translate raw upstream error strings (Replicate / Gemini / AssemblyAI / (~1779 tok)
- `onboarding-guard.test.tsx` — mockReplace (~1034 tok)
- `onboarding-guard.tsx` — "require-incomplete": only render for users who haven't finished (~616 tok)
- `profile-options.ts` — Static option lists for the onboarding wizard + settings profile form. (~432 tok)
- `query-client.ts` — Create a fresh QueryClient with the app's defaults. (~773 tok)
- `query-keys.ts` — Centralized, type-safe query key factory. (~722 tok)
- `utils.ts` — Conditionally join class names then run them through tailwind-merge (~98 tok)
- `video-status.ts` — Single source of truth for video-status presentation. (~1246 tok)
- `voice.test.ts` — Tests for the voice formatters. Lifted from the video detail page (~849 tok)
- `voice.ts` — User-facing formatters (Voice + Copy, Design.md Section 4). (~800 tok)

## apps/web/lib/marketing/

- `faq.ts` — FAQ entries — the section exists to pre-empt the specific objections (~934 tok)
- `pricing.ts` — Pricing config — the single source of truth for the marketing (~1076 tok)

## apps/worker/

- `.dockerignore` — Build artifacts (~80 tok)
- `Dockerfile` — Docker container definition (~1163 tok)
- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~344 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)
- `vitest.config.ts` — /*.test.ts"], (~45 tok)

## apps/worker/scripts/

- `test-image-gen.ts` — Smoke test for `ImageGenClient`. Hits the real Gemini (or Replicate) endpoint with a default prompt ("a red apple on a white background") and writes the resulting image(s) to `.image-gen-smoke/<timestamp>.png`. Accepts `--prompt "..."` and `--provider gemini|replicate` CLI overrides. Loads `.env`, validates via `@clipflow/config.loadEnv`, classifies failures with `classifyImageGenError`, exits non-zero on any error. NOT part of vitest (vitest include is `src/**/*.test.ts`). Run via `pnpm --filter worker test:image-gen`. (~1600 tok)

## apps/worker/src/

- `env.ts` — Worker environment loader. (~504 tok)
- `index.ts` — Worker entrypoint. (~2586 tok)
- `startup-recovery.ts` — Worker startup-recovery scan. (~4006 tok)

## apps/worker/src/config/

- `logger.ts` — Pino logger factory for the worker. Mirrors apps/api's logger shape (~209 tok)
- `queue.ts` — BullMQ queue + worker construction. (~2976 tok)

## apps/worker/src/jobs/

- `channel-style-analyze.ts` — Worker job: analyze a creator's existing YouTube thumbnails to detect (~3952 tok)
- `generate.test.ts` — Unit tests for the `generate` BullMQ job. (~5508 tok)
- `generate.ts` — Worker job: LLM-driven chapter + summary generation. (~3836 tok)
- `thumbnails.ts` — Worker job: generate thumbnails for a video using chapter context, (~4241 tok)
- `transcription.test.ts` — Unit tests for the `transcription` BullMQ job. (~3704 tok)
- `transcription.ts` — Worker job: transcribe an extracted audio file with AssemblyAI. (~4301 tok)
- `video-ingest.test.ts` — Integration test for the video-ingest BullMQ job. (~1919 tok)
- `video-ingest.ts` — Worker job: extract audio + candidate frames from an uploaded video. (~3446 tok)
- `youtube-publish.ts` — Worker job: publish a Video row to YouTube. (~1482 tok)

## apps/worker/src/lib/

- `events.ts` — Worker event publisher. (~572 tok)
- `ffmpeg-errors.test.ts` — Unit tests for FFmpeg error classification. (~1018 tok)
- `ffmpeg-errors.ts` — Classify FFmpeg errors into permanent vs transient. (~1170 tok)
- `ffmpeg.test.ts` — Unit tests for FFmpeg arg construction and error classification. (~1490 tok)
- `ffmpeg.ts` — Thin FFmpeg wrapper for the `video-ingest` BullMQ job. (~1478 tok)

## apps/worker/src/lib/image-gen/

- `image-gen-client.test.ts` — Unit tests for `ImageGenClient` (Gemini path via `@google/genai` and (~5797 tok)
- `image-gen-client.ts` — Negative prompt (Replicate only — ignored by Gemini). (~4004 tok)
- `image-gen-errors.ts` — `ImageGenError` class + `classifyImageGenError(err)` returning `{kind: "permanent"|"transient", reasonCode, message}`. `mapSdkApiError(err)` translates `@google/genai` `ApiError` shapes (numeric `.status` field) to ImageGenError codes (401/403→AUTH, 404→MODEL_NOT_FOUND, 429→RATE_LIMIT, >=500→UPSTREAM). Shape-based detection (bug-141), not `instanceof`. (~1100 tok)
- `index.ts` — Declares ImageGenOptions (~129 tok)

## apps/worker/src/lib/llm/

- `index.ts` — Public surface of the LLM library. (~331 tok)
- `llm-client.test.ts` — Unit tests for `OpenAICompatLlmClient`. (~2570 tok)
- `llm-client.ts` — LLM client — OpenAI-compatible. (~1842 tok)
- `llm-errors.test.ts` — Unit tests for `classifyLlmError`. (~2018 tok)
- `schemas.test.ts` — Unit tests for `LlmOutputSchema` + `parseLlmOutput`. (~2186 tok)
- `schemas.ts` — Zod schemas for the `generate` job's LLM output. (~1100 tok)
- `validate-with-retry.test.ts` — Unit tests for `validateWithRetry`. (~1650 tok)
- `validate-with-retry.ts` — `validateWithRetry` — turn the LLM's "I tried, here is something (~1092 tok)

## apps/worker/src/lib/llm/prompts/

- `select-highlights.ts` — `select-highlights` prompt — single joint LLM call that produces (~1633 tok)

## apps/worker/src/lib/transcription/

- `assemblyai-errors.test.ts` — Unit tests for AssemblyAI error classification. (~1154 tok)
- `assemblyai-errors.ts` — Classify AssemblyAI errors into permanent vs transient. (~1320 tok)
- `assemblyai.test.ts` — Unit tests for the AssemblyAI wrapper. (~1674 tok)
- `assemblyai.ts` — Thin AssemblyAI wrapper for the `transcription` BullMQ job. (~2283 tok)

## docker/postgres/init/

- `00-create-neondb-owner.sql` — Pre-init script for the local-dev postgres container. (~335 tok)

## docs/

- `AppFlow.md` — AppFlow.md — ClipFlow (placeholder name) (~3137 tok)
- `Design.md` — Design.md — ClipFlow (placeholder name) (~2626 tok)
- `PRD.md` — PRD.md — ClipFlow (placeholder name) (~2874 tok)
- `Schema.md` — Schema.md — ClipFlow (placeholder name) (~4312 tok)
- `TechSpec.md` — TechSpec.md — ClipFlow (placeholder name) (~3221 tok)

## packages/config/

- `package.json` — Node.js package manifest (~160 tok)
- `tsconfig.json` — TypeScript configuration (~70 tok)

## packages/config/src/

- `index.ts` — Zod schemas: envSchema, publicEnvSchema (~2623 tok)

## packages/crypto/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~216 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)

## packages/crypto/scripts/

- `self-test.ts` — Self-test: round-trip AES-256-GCM encrypt/decrypt. (~274 tok)

## packages/crypto/src/

- `index.ts` — Exports CryptoError, encryptToken, decryptToken (~906 tok)

## packages/db/

- `package.json` — Node.js package manifest (~313 tok)
- `prisma.config.ts` (~89 tok)
- `schema.prisma` — packages/db/schema.prisma (~5957 tok)
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

- `migration.sql` — Add custom-thumbnail support to the videos table. (~167 tok)

## packages/db/prisma/migrations/20260629000000_add_video_ingest_pipeline/

- `migration.sql` — Add the audio/frame extraction pipeline to the video lifecycle. (~443 tok)

## packages/db/prisma/migrations/20260630000000_add_video_ingest_pipeline/

- `migration.sql` — Add new pipeline statuses to VideoStatus enum (~252 tok)

## packages/db/prisma/migrations/20260701000000_add_video_transcript_highlights/

- `migration.sql` — Add transcript + LLM-driven highlight artefacts to the videos table. (~419 tok)

## packages/db/prisma/migrations/20260708_personalized_thumbnail_style/

- `migration.sql` — Personalized thumbnail-style analysis (onboarding step 5 + settings re-entry). (~252 tok)

## packages/db/scripts/


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
- `package.json` — Node.js package manifest (~234 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)

## packages/s3/src/

- `client.ts` — Exports S3Config, buildS3Config, getS3Client (~577 tok)
- `index.ts` — Declares S3Config (~103 tok)
- `operations.ts` — Object operations used by the API (finalize, delete) and the worker (~1037 tok)
- `presign.ts` — Presigned upload helpers. (~720 tok)

## packages/types/

- `package.json` — Node.js package manifest (~151 tok)
- `tsconfig.json` — TypeScript configuration (~64 tok)

## packages/types/src/

- `index.ts` — ---------- Enums (mirror Prisma enums in packages/db) ---------- (~8029 tok)

## packages/typescript-config/

- `base.json` (~143 tok)
- `nextjs.json` (~78 tok)
- `package.json` — Node.js package manifest (~44 tok)
- `react-library.json` (~39 tok)

## packages/youtube-upload/

- `eslint.config.mjs` — ESLint flat configuration (~34 tok)
- `package.json` — Node.js package manifest (~278 tok)
- `tsconfig.json` — TypeScript configuration (~57 tok)
- `vitest.config.ts` — Vitest test configuration (~45 tok)

## packages/youtube-upload/src/

- `errors.ts` — Typed errors thrown by `publishVideo` and its collaborators. The (~588 tok)
- `index.ts` — Declares PublishVideoContext (~282 tok)
- `publish-video.ts` — Publish a Video row to YouTube. Used by both the API (immediate path (~4838 tok)
- `token-refresh.ts` — Token refresh for a stored YouTube connection. (~945 tok)
- `youtube-api.test.ts` — Unit tests for the internal-license → YouTube-API license translator. (~2000 tok)
- `youtube-api.ts` — YouTube Data API v3 — two-step resumable upload for videos.insert (~6047 tok)

## scripts/

- `check-videos.ts` — Declares main (~358 tok)
