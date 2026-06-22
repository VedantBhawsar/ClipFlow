# TechSpec.md — ClipFlow (placeholder name)

## 1. Architecture overview

Monorepo (Turborepo) containing three deployable units, all running on a single VPS via Docker Compose for v1:

1. **`apps/web`** — Next.js (TypeScript) frontend. Upload UI, review UI, scheduling UI, billing UI.
2. **`apps/api`** — NestJS (TypeScript) backend. Auth, REST API, job enqueueing, webhook receivers (YouTube OAuth callback, Dodo Payments webhooks).
3. **`apps/worker`** — Node.js worker process (NestJS standalone or plain Node + BullMQ). Consumes the job queue, runs FFmpeg, calls AssemblyAI/LLM/Imagen APIs, calls YouTube Data API for publish.

Shared packages: `packages/db` (Prisma schema + client), `packages/types` (shared DTOs/types between api and worker), `packages/config` (env validation).

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15+, TypeScript, Tailwind, shadcn/ui | Matches existing stack |
| Backend API | NestJS, TypeScript | Matches DocSense pattern |
| ORM / DB | Prisma + PostgreSQL | |
| Queue | BullMQ + Redis | |
| Object storage | AWS S3 (or S3-compatible — Cloudflare R2 is a cheaper drop-in alternative, flag for cost review) | Raw video, processed thumbnails, extracted frames |
| Video processing | FFmpeg, installed on the worker container/VM | Frame extraction, audio extraction; reel cutting is v2 only |
| Transcription | AssemblyAI | Word-level timestamps, has native chapter-detection features that can supplement the LLM step |
| LLM (chapter generation) | Claude API (Haiku-class model) or GPT-4o-mini | Cheap, structured JSON output over transcript |
| Image generation (thumbnails) | Google Imagen API (primary), Grok Imagine as fallback/alternate | Composited with extracted video frame via `sharp` |
| Auth (app login) | NextAuth (Auth.js) or Clerk | Decide based on whether Google OAuth for login and Google OAuth for YouTube scope can be cleanly separated — see Section 5 |
| Auth (YouTube) | Google OAuth 2.0, `youtube.upload` + `youtube.readonly` scopes | Separate consent flow from app login if needed |
| Payments | Dodo Payments | Hosted checkout + subscription webhooks |
| Deployment | Docker Compose on a single VPS (DigitalOcean or Hetzner) | Single droplet for v1; documented upgrade path to split worker onto its own VM if FFmpeg load contends with API responsiveness |
| Monitoring | Basic: container logs + a lightweight uptime check (e.g. Better Stack / UptimeRobot free tier) | Defer full observability stack (Grafana etc.) past MVP |

## 3. Service responsibilities

### `apps/api`
- User auth (signup/login) and session management.
- Google OAuth flow for YouTube channel connection; stores encrypted refresh token.
- Video upload endpoint: issues a pre-signed S3 upload URL to the frontend (direct browser-to-S3 upload, not proxied through the API, to avoid loading large files through the Node process).
- On upload-complete callback, creates a `Video` record and enqueues a processing job to BullMQ.
- REST endpoints for: video list/status, chapter edit/approve, thumbnail selection, schedule set/update.
- Dodo Payments webhook receiver: verifies HMAC SHA256 signature (`webhook-id`, `webhook-signature`, `webhook-timestamp` headers), updates subscription state in DB.
- Enforces usage limits (videos/month per tier) before allowing new uploads.

### `apps/worker`
- Consumes jobs from BullMQ queues. Recommended queue separation:
  - `video-ingest` — extract audio, extract candidate frames via FFmpeg.
  - `transcription` — call AssemblyAI, store transcript + timestamps.
  - `chapters` — call LLM with transcript, store structured chapter list.
  - `thumbnails` — call Imagen, composite with extracted frame via `sharp`, upload results to S3.
  - `youtube-publish` — at scheduled time, call YouTube Data API `videos.insert` (or `videos.update` if already uploaded in private state) with final thumbnail + chapters baked into the description.
- Each queue is a separate BullMQ queue so retry/backoff policies and concurrency can be tuned independently (e.g. `youtube-publish` should have low concurrency and strict retry given quota cost; `thumbnails` can run with higher concurrency).
- Worker should be horizontally scalable in principle (stateless, queue-driven) even though v1 deploys a single instance.

### `apps/web`
- Upload flow, dashboard (video list with status), review screens (chapters editor, thumbnail picker), schedule picker, billing/plan management page, YouTube connect/reconnect flow.

## 4. External integrations — details engineering needs

### YouTube Data API v3
- Scopes: `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube.readonly` (for channel info display).
- Upload: `videos.insert` with `status.privacyStatus = "private"` and `status.publishAt = <ISO8601 timestamp>`. YouTube auto-transitions the video to public at that time.
- **Quota**: default 10,000 units/day; a single upload costs ~1600 units (~6 uploads/day ceiling). **Action item, week 1**: submit the YouTube API quota increase + audit application. This is an external dependency outside engineering's control and should be tracked as a project-level blocking risk, not a sprint task.
- Refresh tokens: store encrypted (e.g. KMS-encrypted column, consistent with the per-tenant KMS pattern already used in DocSense) per user. Build a "reconnect channel" flow — detect `invalid_grant` errors on token refresh and flag the user's connection as `needs_reauth` rather than silently failing scheduled jobs.

### AssemblyAI
- Submit extracted audio (not full video) for transcription to reduce upload size/cost.
- Request word-level timestamps.
- Store full transcript JSON (timestamps + text) — needed for both chapters now and reels in v2, so don't discard it after chapter generation.

### LLM chapter generation
- Input: transcript with timestamps.
- Prompt for structured JSON output: `[{ "timestamp_seconds": number, "title": string }]`.
- Enforce YouTube's chapter rules server-side regardless of what the LLM returns: first timestamp must be `0`, minimum 3 chapters, minimum 10 seconds between chapters. Validate and auto-correct/filter before showing to the user.

### Google Imagen (thumbnails)
- Pipeline: FFmpeg extracts N candidate frames (scene-change detection or fixed interval) → score for sharpness/face presence → pick best base frame → generate a complementary background/style image via Imagen based on video title/transcript summary → composite via `sharp` (text overlay, background blend) → output at YouTube's required 1280x720.
- Cap generations per video according to plan tier (3/5/10) — this is the primary lever on per-user AI cost, enforce it server-side in `apps/api` before enqueueing, not just in the UI.

### Dodo Payments
- Hosted checkout session for plan purchase (`/checkouts` endpoint pattern).
- Webhook events to handle at minimum: `subscription.active`, `subscription.on_hold`, `subscription.canceled`, `subscription.renewed`, `payment.completed`, `payment.refunded`.
- Verify webhook signature before processing (HMAC SHA256 over `webhook-id` + `webhook-timestamp` + payload, per Dodo's signing scheme) — reject unverified payloads.
- Process webhooks asynchronously where possible (ack fast, update DB state in background) to avoid webhook delivery timeouts/retries piling up.
- Maintain local subscription state as source of truth for usage-limit enforcement; reconcile via Dodo API polling as a fallback if webhooks are missed (standard payment-integration resilience pattern).

### YouTube Analytics API (v1.5 — not built in v1, but the OAuth scope is requested in v1; see PRD.md Section 6a)

- Base URL: `https://youtubeanalytics.googleapis.com/v2/reports`. This is a **separate API from YouTube Data API v3** — different base URL, different client, even though both sit under the same Google Cloud project and quota pool.
- Scope: `https://www.googleapis.com/auth/yt-analytics.readonly`. Do **not** request `yt-analytics-monetary.readonly` (revenue data) — it's not needed for the planned views/CTR/watch-time dashboard, and requesting it raises the OAuth consent screen's sensitivity tier for no product benefit.
- Core query for Layer 1 (per-video surfacing): `reports.query` with `ids=channel==MINE`, `metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained`, filtered by `video==<videoId>` and a date range. Impressions/CTR specifically come from the `cardImpressions`/`cardClickRate`-style metrics or, more reliably for thumbnail CTR, from YouTube Studio's impressions-based metrics where available via the API — confirm exact metric names against the current API reference at implementation time, since metric availability has shifted across API versions historically.
- **Quota sharing risk**: every Analytics API request counts against the *same* per-project daily quota as the Data API v3 calls used for upload/publish. A naive "refresh every open dashboard" implementation can exhaust quota by mid-morning once there are more than a handful of active users — this is a documented failure mode for exactly this kind of app, not a hypothetical. Required mitigations, to be designed before Layer 1 ships:
  - Cache analytics responses (Redis, TTL of several hours — view counts don't need to be real-time).
  - Pull data on a scheduled background job (e.g. once or twice daily per video) rather than on-demand per dashboard load.
  - Request a combined quota increase covering both Data API and Analytics API usage at the same time as the v1 quota increase application, rather than filing a second request later.
- Given the quota and caching considerations above, Layer 1 should be architected as its own BullMQ queue (`analytics-sync`) feeding a cached `VideoStats` table (see Schema.md), not a live pass-through API call from the frontend.

## 5. Auth architecture note (needs a decision during implementation)

There are two distinct OAuth concerns that are easy to conflate:
1. **App login** — how a user signs into ClipFlow itself (can be email/password, or "Sign in with Google").
2. **YouTube channel connection** — a separate OAuth grant specifically for the `youtube.upload` scope, which is a much more sensitive permission than basic profile/email.

Recommendation: keep these separate even if both use Google as the provider. A user should be able to log in without necessarily having granted YouTube upload access yet (e.g., during onboarding, before they've connected a channel). Don't conflate "logged in" with "channel connected" in the session/auth model — track channel connection status as its own piece of state on the user/account record.

## 6. Non-functional requirements

- **Video upload limit (v1)**: cap at 60 minutes / 5GB per file. This is a deliberate constraint for cost predictability (transcription, storage) and should be enforced both client-side (before upload starts) and server-side.
- **Processing SLA (informal target, not contractual)**: a 15-minute video should complete the full pipeline (transcript → chapters → thumbnails ready for review) within ~10 minutes of upload completing. This is a target to design around, not a guarantee to expose to users in v1.
- **Storage lifecycle**: original video files should have an S3 lifecycle rule to transition to lower-cost storage or delete after a configurable retention window (e.g. 30 days) post-publish, since the creator's source of truth is YouTube once published. Generated thumbnails/chapter data are small and can be retained indefinitely.
- **Idempotency**: all webhook handlers (Dodo, and any future YouTube push notifications) must be idempotent — store and check event IDs before processing, since payment providers retry deliveries.

## 7. Deployment

- Docker Compose services: `web`, `api`, `worker`, `postgres`, `redis`, plus a reverse proxy (Caddy or Nginx) for TLS termination.
- Environment config validated at boot (fail fast on missing required env vars) — use `packages/config` shared across `api` and `worker`.
- Backups: scheduled `pg_dump` of Postgres to S3, daily, retained 14 days minimum.
- Upgrade path documented but not built in v1: if the worker's FFmpeg load starts contending with API/web responsiveness on the same VPS, move `worker` to its own VM — the Docker Compose service boundary already makes this a low-effort split later.

## 8. Out of scope for this spec

- Reels/Shorts processing pipeline (vertical reframing, highlight detection) — to be specified in a v2 addendum once core loop ships.
- Multi-channel data model — current schema (see Schema.md) assumes one channel per user; this is a known limitation to revisit, not an oversight.
- Layer 2 analytics (correlating thumbnail/chapter choices with performance, generating insights) — depends on Layer 1 having shipped and accumulated real data first; not specified in detail here, see PRD.md Section 4a.
