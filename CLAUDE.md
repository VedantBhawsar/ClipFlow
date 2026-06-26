# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

ClipFlow is a SaaS platform for YouTube creators that automates video scheduling, thumbnail generation, and chapter-timestamp generation. A creator uploads a finished video once and ClipFlow handles the rest. The full product design, schema, and architecture spec live in `docs/PRD.md`, `docs/TechSpec.md`, `docs/Schema.md`, `docs/AppFlow.md`, and `docs/Design.md` — **read those first** when working on a slice, they are the source of truth for what is in scope and out of scope.

**Important — current scope.** The repo currently contains the v1 *onboarding* slice only. The Prisma schema (`packages/db/schema.prisma`) deliberately declares only `User` and `UserProfile`; `YouTubeChannel`, `Video`, `Plan`, `Subscription`, `WebhookEvent`, and the BullMQ worker app are **not yet built**. The schema's top-of-file comment calls this out explicitly so future slices add tables when they're actually needed (see that comment before adding models). The original `README.md` is the unmodified Turborepo starter and is not project documentation — use `docs/` instead.

## Repo layout

Turborepo + pnpm workspaces (`pnpm-workspace.yaml`). Two deployable units today, one planned:

- `apps/web` — Next.js 16 (App Router, RSC) + React 19 + Tailwind v4 + shadcn/ui (new-york style).
- `apps/api` — Express 4 + TypeScript. **Not NestJS** despite `docs/TechSpec.md` saying NestJS — the implementation chose plain Express for the v1 slice.
- `apps/worker` — referenced in the spec but **not yet scaffolded**. Build when the video-processing pipeline lands.
- `packages/db` — Prisma schema + generated client (Prisma 7 with `@prisma/adapter-pg`).
- `packages/config` — Zod-validated env (`loadEnv`, `loadPublicEnv`). Imported by both apps.
- `packages/types` — dependency-free DTOs / enum tuples shared between web and api.
- `packages/ui` — shared React component stubs (button/card/code); local UI lives in `apps/web/components/ui`.
- `packages/eslint-config`, `packages/typescript-config` — shared lint/tsconfig.

## Commands

Use pnpm (the workspace declares `packageManager: pnpm@9.0.0`). Run from repo root unless noted.

### Workspace-wide (Turbo)

| Command | What it does |
| --- | --- |
| `pnpm dev` | `turbo run dev` — runs `dev` in every package/app with caching off and `persistent: true` |
| `pnpm build` | `turbo run build` — builds every package/app with dependency-ordered tasks |
| `pnpm lint` | `turbo run lint` — runs each package's `lint` script |
| `pnpm check-types` | `turbo run check-types` — runs each package's TypeScript check |
| `pnpm format` | Prettier write across `**/*.{ts,tsx,md}` |

Filter to a single package with `pnpm --filter <name> <script>` or `turbo run <script> --filter=<name>` (e.g. `pnpm --filter web dev`, `pnpm --filter api lint`).

### `apps/api`

| Script | Use |
| --- | --- |
| `pnpm --filter api dev` | `tsx watch src/index.ts` — hot-reload dev server on `:4000` |
| `pnpm --filter api build` | `tsc` → `dist/` |
| `pnpm --filter api start` | `node dist/index.js` — production entry |
| `pnpm --filter api test` | `vitest` (watch mode) |
| `pnpm --filter api test:ci` | `vitest run` (single pass, CI mode) |
| `pnpm --filter api crypto:self-test` | Round-trips AES-256-GCM encrypt/decrypt — run after rotating `ENCRYPTION_KEY` |

Run a single test file: `pnpm --filter api test:ci -- src/modules/auth/auth.service.test.ts` (vitest positional arg).

### `apps/web`

| Script | Use |
| --- | --- |
| `pnpm --filter web dev` | `next dev --port 3000` |
| `pnpm --filter web build` | `next build` |
| `pnpm --filter web start` | `next start` |
| `pnpm --filter web test` | `vitest` (jsdom) — files matching `lib/**`, `components/**`, `hooks/**` |
| `pnpm --filter web test:ci` | `vitest run` |
| `pnpm --filter web check-types` | `next typegen && tsc --noEmit` — note `next typegen` is part of the type check |

Single test: `pnpm --filter web test:ci -- lib/auth-guard.test.tsx`.

### `packages/db`

| Script | Use |
| --- | --- |
| `pnpm --filter @clipflow/db prisma:generate` | `prisma generate` |
| `pnpm --filter @clipflow/db prisma:migrate` | `prisma migrate dev` |
| `pnpm --filter @clipflow/db prisma:studio` | Local DB browser |

`postinstall` runs `prisma generate` and symlinks the generated client into `node_modules/.prisma` — don't skip it after schema changes.

## Environment

`@clipflow/config` (`packages/config/src/index.ts`) is the single source of truth for env vars. Validation runs at boot and **fails fast** with a field-level error dump. Required: `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `ENCRYPTION_KEY` (≥32 chars). Optional: `REDIS_URL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`. `apps/web` only consumes `NEXT_PUBLIC_API_BASE_URL` via `loadPublicEnv()`.

`apps/api/src/config/env.ts` has a dev-only fallback that stubs `DATABASE_URL` to `postgresql://stub:stub@localhost:5432/stub` so the API process can boot for a frontend sanity check; routes that touch Prisma return `503 DATABASE_UNAVAILABLE` (via `requireDatabase()` from `src/lib/db-guard.ts`) instead of crashing. The `.env.example` at `apps/api/.env.example` documents the local-dev shape.

## Architecture: `apps/api`

Layered module structure; everything is plain Express, not NestJS:

- **`src/index.ts`** — entrypoint. Loads env, builds logger, calls `createApp()`, `startServer()`, wires SIGTERM/SIGINT graceful shutdown (15 s cap, then `closeAllConnections`).
- **`src/app.ts`** — `createApp({ env, logger })` factory. Wires helmet (CSP off — JSON API), compression, CORS scoped to `env.WEB_ORIGIN`, request-id, pino-http, JSON body limit 1 MB, global rate limit, then mounts routers. Returns the `Application` without `listen()` so tests can spin it up against `supertest` or a real socket.
- **`src/server.ts`** — owns the `http.Server` handle so we can drain in-flight requests on shutdown.
- **`src/middleware/`** — `request-id` (UUID + `X-Request-Id` header), `validate` (zod for `body`/`params`/`query`, attaches parsed values back to `req`), `error` (central handler; maps `ZodError` → 400 with field details, `AppError` → declared status, unknown → 500 with `requestId`), `rate-limit` (global + stricter auth limiter, both emit `ApiErrorBody`), `auth` (`requireAuth(env)` → reads `Authorization: Bearer`, verifies HS256 JWT, attaches `req.user`).
- **`src/lib/`** — `prisma` (re-export + `setDatabaseAvailable` / `isDatabaseAvailable`), `jwt` (sign/verify wrappers around `jsonwebtoken`), `password` (bcrypt, 12 rounds — don't lower), `crypto` (AES-256-GCM for future refresh-token storage; format is `base64(iv).base64(authTag).base64(ciphertext)`), `cache` (`CacheClient` interface, in-memory `Map`+TTL+`unref`'d sweeper today, Redis-ready), `logger` (pino, pretty in dev / JSON in prod, base `service: clipflow-api`), `db-guard` (throws `503 DATABASE_UNAVAILABLE`).
- **`src/modules/<feature>/`** — each module has `routes.ts`, `controller.ts`, `service.ts`, `schemas.ts`, and `types.ts`. Controllers stay thin (HTTP shape); services own the Prisma calls and throw typed `AppError`s. Examples: `modules/auth/` (register/login/logout/me/google-stub), `modules/onboarding/` (`statusController`, full `POST` + partial `PATCH` profile update, `recommendPlan()` mapping upload frequency → plan id), `modules/health/`.
- **`src/errors/AppError.ts`** — typed `{ statusCode, code, message, details? }`. Every thrown error in service code is an `AppError`; the central handler converts it to `ApiErrorBody`.

The `controller.ts → service.ts → prisma` flow with zod-validated bodies and central error mapping is the dominant pattern — follow it when adding endpoints.

## Architecture: `apps/web`

Next.js 16 App Router. Server components by default; client components marked `"use client"` and concentrated in `components/` and `lib/`.

- **`app/`** — file-system routing. Route groups: `(auth)` for signin/signup, `onboarding/` (uses `<OnboardingGuard mode="require-incomplete">`), `dashboard/` (uses `<OnboardingGuard mode="require-complete">` + sidebar), `youtube-connect/` (placeholder for the next slice). Each protected page is wrapped in `<ProtectedShell>` (server component → `<AuthGuard>` client component) so we keep server-side `metadata` exports.
- **`middleware.ts`** — Edge middleware. Reads the `clipflow_token` cookie; bounces unauthenticated users away from `/dashboard`, `/onboarding`, `/youtube-connect` to `/signin?next=...`; bounces already-authed users off `/signin` and `/signup`. **Token-existence only** — finer routing is client-side (see below), because the JWT lives in a regular (non-httpOnly) cookie (trade-off documented in `lib/api-client.ts`).
- **`lib/api-client.ts`** — typed `api` surface (`api.register/login/logout/me/getOnboardingStatus/submitOnboardingProfile`). Reads token from cookie, attaches `Authorization: Bearer`, parses `ApiErrorBody` for error messages, clears cookie + redirects to `/signin` on 401. The token cookie (`AUTH_TOKEN_COOKIE = "clipflow_token"`) is set with `SameSite=Strict` and 30-day `Max-Age`; `Secure` only in production (otherwise dev sign-in silently fails).
- **`lib/auth-context.tsx`** — `<AuthProvider>` wraps the app in `app/layout.tsx`. Holds `status` (`loading`/`authenticated`/`unauthenticated`), `user`, `profile`, `onboardingCompleted`. On mount calls `api.me()` exactly once (in-flight ref deduplicates concurrent callers); `signIn`/`signUp` set the cookie then call `refresh()`; `signOut` calls API then clears local state and `router.push("/signin")`. After onboarding submits successfully, the wizard calls `refresh()` so `OnboardingGuard` doesn't bounce the user back.
- **`lib/auth-guard.tsx`** (`<AuthGuard>`) — client guard: while `status === "loading"` renders a placeholder, when `unauthenticated` redirects to `/signin?next=<current>` (suppressing the redirect on `/signin`/`/signup` to avoid loops).
- **`lib/onboarding-guard.tsx`** (`<OnboardingGuard mode="...">`) — two modes: `require-incomplete` (used inside `/onboarding/*`) sends completed users to `/dashboard`; `require-complete` (used inside `/dashboard`) sends incomplete users to `/onboarding/profile`. Pair with `<AuthGuard>` (via `<ProtectedShell>`).
- **`hooks/use-auth.ts`** — convenience re-export of `useAuthContext()`.
- **`lib/env.ts`** — single import point for `NEXT_PUBLIC_*` vars; validates via `loadPublicEnv()`.
- **`components/`** — organized by feature: `auth/` (forms + `google-button.tsx` placeholder), `onboarding/` (4-step `profile-wizard.tsx` with per-step components, `progress-dots.tsx`), `dashboard/` (`sidebar.tsx`, `youtube-connect-card.tsx`, `empty-state.tsx`, `status-timeline.tsx`), `shared/` (logo, theme provider, toaster, `ProtectedShell`), `ui/` (shadcn primitives). shadcn config in `components.json` (new-york style, neutral base color, lucide icons).

Test files (`*.test.ts` / `*.test.tsx`) live next to their source under `components/` and `lib/`. The vitest setup file just imports `@testing-library/jest-dom`.

## Architecture: `packages/db`

- **`schema.prisma`** — provider `postgresql`, generator `prisma-client-js`. Currently only `User` + `UserProfile` and four enums (`AuthProvider`, `ContentNiche`, `UploadFrequency`, `PrimaryGoal`). The schema's own header comment is the authoritative note on why other tables aren't here yet — read it before adding models.
- **`prisma.config.ts`** — `prisma.config.ts` (the new v7 shape) pulls `DATABASE_URL` from `prisma.config`'s `env()` helper; this is what `prisma migrate`/`generate` consults.
- **`src/index.ts`** — builds a singleton `PrismaClient` with the `pg`/`PrismaPg` adapter; stashes it on `globalThis.__clipflowPrisma` in non-production so `tsx watch` doesn't leak connections. **Re-exports `@prisma/client`** so consumers don't need a direct dep.
- **`package.json`** — note `postinstall` runs `prisma generate` AND symlinks the generated `.prisma` directory into `node_modules/.prisma`; if you change the schema and see type errors in api/web, run `pnpm --filter @clipflow/db prisma:generate` first.

## Conventions / patterns worth preserving

- **Env validation is the source of truth.** Add new vars to `packages/config/src/index.ts` (and `loadPublicEnv` if browser-visible), not inline in app code.
- **Throw `AppError(statusCode, code, message)`, never raw `Error`, from services.** The central middleware maps to `ApiErrorBody` and chooses log level (warn vs error) from the status code.
- **Validate at the edge with zod.** Define schemas in `modules/<feature>/<feature>.schemas.ts`, attach via `validate({ body: schema })`. Parsed values come back on `req.body`.
- **Cache invalidation on writes.** Both auth and onboarding controllers call `cache.del(\`me:${userId}\`)` after register/login/profile updates; follow the pattern for any new write that affects `/api/auth/me`.
- **DTO mapping.** Services map Prisma rows → DTOs via small `toProfileDto`/`toAuthUser` helpers; never leak Prisma types past the service layer (the casts on enums are intentional — Prisma returns enum values as strings, DTOs accept string unions).
- **Idempotent webhooks** are a hard requirement (see `docs/TechSpec.md` Section 6); the `WebhookEvent` table arrives with the billing slice — keep that requirement in mind when designing payment handlers.
- **Cost guards in API, not UI.** Tier limits (videos/month, thumbnails/video) are enforced server-side before enqueueing — UI hints are advisory only.
- **One channel per user (v1).** `User` has a 1:1 `YouTubeChannel` in the spec'd schema (not yet in `schema.prisma`); don't model 1:N until v2.
- **YouTube OAuth scope request is a sequencing decision.** Request `youtube.upload` + `youtube.readonly` + `yt-analytics.readonly` together at first connect — the analytics scope goes unused until v1.5 but avoids a second re-consent. See `docs/PRD.md` Section 6a.