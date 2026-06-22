# Schema.md — ClipFlow (placeholder name)

Database: PostgreSQL, accessed via Prisma. This doc is written close to Prisma schema syntax so it can be lifted almost directly into `packages/db/schema.prisma`.

## 1. Entity overview

```
User ──1:1── YouTubeChannel
User ──1:1── UserProfile    (onboarding answers — niche, frequency, goal)
User ──1:N── Video
User ──1:1── Subscription
Video ──1:1── Transcript
Video ──1:N── Chapter
Video ──1:N── Thumbnail
Video ──1:1── ScheduleInfo  (folded into Video directly, see below)
Video ──1:1── VideoStats     (v1.5 — cached YouTube Analytics data, see Section 2a)
Subscription ──N:1── Plan
WebhookEvent  (standalone audit/idempotency table for Dodo events)
```

v1 deliberately models **one YouTubeChannel per User** (1:1, not 1:N) — this is a known, intentional limitation per the PRD's non-goals. Revisit as 1:N when multi-channel ships in v2; flagged here so the migration path is anticipated rather than a surprise.

## 2. Tables

### User

Deliberately lean — auth identity only. Onboarding/preference data lives in `UserProfile` (below), kept separate so this table never needs to grow every time a new onboarding question gets added, and so "logged in" stays a simple, fast check independent of profile completeness.

```prisma
enum AuthProvider {
  EMAIL
  GOOGLE
}

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  passwordHash  String?      // null if authProvider is GOOGLE-only
  name          String?
  authProvider  AuthProvider @default(EMAIL)
  googleId      String?      @unique  // populated if they ever use "Continue with Google", even if they also have a password
  emailVerifiedAt DateTime?  // set on signup confirmation (email/password) or immediately on Google sign-in (Google already verifies email)

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  profile        UserProfile?
  youtubeChannel YouTubeChannel?
  videos         Video[]
  subscription   Subscription?

  @@map("users")
}
```

Note on `authProvider` + `googleId` together: a user might sign up with email/password and *later* click "Continue with Google" using the same email — that should link to the same account (match on email, set `googleId`), not create a duplicate. This account-linking behavior is a deliberate decision to make explicit in the auth implementation, not an edge case to discover later — a creator ending up with two separate ClipFlow accounts because they used different login methods on different days is a real, avoidable bug.

### UserProfile

Captures the onboarding questions. One-to-one with `User`, but modeled separately so it's optional/nullable until onboarding completes, and so it can grow over time (new onboarding questions, future preference settings) without touching the auth-critical `User` table.

```prisma
enum ContentNiche {
  GAMING
  TECH_EDUCATION
  VLOG_LIFESTYLE
  BUSINESS_FINANCE
  ENTERTAINMENT_COMEDY
  OTHER
}

enum UploadFrequency {
  ONE_TO_FOUR        // per month
  FIVE_TO_TEN
  ELEVEN_TO_TWENTY
  TWENTY_PLUS
}

enum PrimaryGoal {
  SAVE_TIME_EDITING
  BETTER_THUMBNAILS_CTR
  CONSISTENT_SCHEDULE
  GROW_VIEWS
}

model UserProfile {
  id              String           @id @default(cuid())
  userId          String           @unique
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  niche           ContentNiche?
  uploadFrequency UploadFrequency?
  primaryGoal     PrimaryGoal?

  recommendedPlanId String?        // computed from uploadFrequency at onboarding time, shown on the billing screen as a suggestion — not enforced, just a nudge
  onboardingCompletedAt DateTime?  // null until all required steps are done; used to decide whether to show the onboarding flow or skip straight to dashboard on login

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@map("user_profiles")
}
```

**How `niche` and `primaryGoal` actually get used, so this isn't just collected-and-ignored data:**
- `niche` maps to a thumbnail style preset passed into the Imagen prompt template (TechSpec.md Section 4's thumbnail pipeline) — e.g. `GAMING` biases toward high-contrast/bold text treatments, `TECH_EDUCATION` biases toward cleaner, more text-forward layouts. This is a lookup table in application code (`niche → style preset`), not a schema concern beyond storing the enum.
- `primaryGoal` doesn't change generation behavior in v1, but is read by the dashboard to decide which feature gets the most prominent placement/tour callout for that user (e.g. `BETTER_THUMBNAILS_CTR` → dashboard leads with thumbnail review; `GROW_VIEWS` → a clear candidate signal for prioritizing that user toward the v1.5 analytics feature once it ships).
- `uploadFrequency` feeds `recommendedPlanId`, shown as a soft suggestion ("Based on your answer, Creator looks like a good fit") on the billing screen — never auto-selected or charged, just a recommendation per PRD.md's existing non-coercive approach to plan selection.

### YouTubeChannel

Stores the connection between a User and their YouTube channel. Token is encrypted at rest (KMS or equivalent, consistent with the existing per-tenant encryption pattern) — never store the raw refresh token in plaintext.

```prisma
enum ChannelConnectionStatus {
  CONNECTED
  NEEDS_REAUTH
  DISCONNECTED
}

model YouTubeChannel {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  youtubeChannelId  String   // the actual channel ID from Google
  channelTitle      String
  channelThumbnailUrl String?

  refreshTokenEncrypted String  // encrypted at rest
  scopes                String  // space-delimited scopes granted

  status            ChannelConnectionStatus @default(CONNECTED)
  lastVerifiedAt    DateTime @default(now())

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("youtube_channels")
}
```

### Video

The central entity. `status` drives almost all of AppFlow.md's UI states.

```prisma
enum VideoStatus {
  UPLOADED
  EXTRACTING        // FFmpeg: audio + frame extraction in progress
  TRANSCRIBING
  GENERATING         // chapters + thumbnails generation in progress
  READY_FOR_REVIEW
  SCHEDULED
  PUBLISHING         // youtube-publish job actively running
  PUBLISHED
  PUBLISH_FAILED
  FAILED             // unrecoverable failure earlier in the pipeline
}

model Video {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  title           String
  description     String?     @db.Text   // pre-filled, editable; chapters get appended here before publish
  originalFilename String
  fileSizeBytes   BigInt
  durationSeconds Int?        // populated after FFmpeg extraction

  s3KeyOriginal   String      // raw uploaded file
  s3KeyAudio      String?     // extracted audio, used for transcription

  status          VideoStatus @default(UPLOADED)
  failureReason   String?     @db.Text  // human-readable, set when status is FAILED or PUBLISH_FAILED

  // scheduling
  scheduledPublishAt DateTime?
  timezone           String?            // IANA tz string, e.g. "Asia/Kolkata", for display purposes
  youtubeVideoId     String?            // populated once uploaded to YouTube (even if not yet public)

  selectedThumbnailId String?  @unique

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  transcript      Transcript?
  chapters        Chapter[]
  thumbnails      Thumbnail[]

  @@index([userId, status])
  @@index([scheduledPublishAt])
  @@map("videos")
}
```

Note on `selectedThumbnailId`: rather than a separate join table for "which thumbnail is chosen," it's a direct nullable FK-like field on `Video` pointing at one of its own `Thumbnail` rows. Simpler for v1's single-selection use case than a join table.

### Transcript

Stored separately from `Video` since it's a large text blob and is also the input needed for v2's reels feature — kept intact rather than discarded after chapter generation, per TechSpec.md.

```prisma
model Transcript {
  id            String   @id @default(cuid())
  videoId       String   @unique
  video         Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  fullText      String   @db.Text
  wordTimestamps Json    // array of { word, startMs, endMs } from AssemblyAI
  provider      String   @default("assemblyai")

  createdAt     DateTime @default(now())

  @@map("transcripts")
}
```

### Chapter

```prisma
model Chapter {
  id              String   @id @default(cuid())
  videoId         String
  video           Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  timestampSeconds Int
  title            String
  order            Int      // explicit ordering, independent of timestamp sort, to support drag-reorder in the UI

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([videoId, order])
  @@map("chapters")
}
```

Validation rules (first chapter = 0, min 3 chapters, min 10s apart) are enforced in application code at write-time, not as DB constraints — they're business rules that may evolve, and DB-level constraints would make iterating on them harder than necessary.

### Thumbnail

```prisma
enum ThumbnailSource {
  AI_GENERATED
  USER_UPLOADED   // fallback path if generation fails or user prefers their own
}

model Thumbnail {
  id          String          @id @default(cuid())
  videoId     String
  video       Video           @relation(fields: [videoId], references: [id], onDelete: Cascade)

  s3Key       String
  source      ThumbnailSource @default(AI_GENERATED)
  generationIndex Int         // which generation attempt this belongs to, for the "X of Y regenerations used" UI

  createdAt   DateTime        @default(now())

  @@index([videoId])
  @@map("thumbnails")
}
```

### Plan

Reference table, seeded once, not user-editable. Matches the pricing tiers from PRD.md.

```prisma
model Plan {
  id                  String  @id @default(cuid())
  name                String  @unique  // "starter" | "creator" | "pro"
  priceCents          Int
  videosPerMonth      Int
  thumbnailsPerVideo  Int
  dodoProductId       String  // maps to the product/price ID in Dodo Payments

  subscriptions       Subscription[]

  @@map("plans")
}
```

### Subscription

Mirrors Dodo Payments' subscription state locally — this is the source of truth the API checks against for usage-limit enforcement, kept in sync via webhooks (see TechSpec.md Section 4).

```prisma
enum SubscriptionStatus {
  ACTIVE
  ON_HOLD
  CANCELED
  NONE          // no active subscription (e.g. before first purchase, or free tier if one ships)
}

model Subscription {
  id                    String             @id @default(cuid())
  userId                String             @unique
  user                  User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  planId                String?
  plan                  Plan?              @relation(fields: [planId], references: [id])

  status                SubscriptionStatus @default(NONE)
  dodoSubscriptionId    String?            @unique
  dodoCustomerId        String?

  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?

  videosUsedThisPeriod  Int                @default(0)  // reset on period rollover, checked against plan.videosPerMonth

  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@map("subscriptions")
}
```

### WebhookEvent

Idempotency/audit log for incoming Dodo Payments webhooks — required because payment providers retry deliveries, and processing the same event twice (e.g. double-incrementing a usage reset) is a real bug class to design against from day one.

```prisma
model WebhookEvent {
  id            String   @id @default(cuid())
  provider      String   @default("dodo_payments")
  eventId       String   @unique   // the provider's own event/webhook-id, used for de-duplication
  eventType     String              // e.g. "subscription.active"
  payload       Json
  processedAt   DateTime?           // null until successfully handled
  createdAt     DateTime @default(now())

  @@map("webhook_events")
}
```

## 2a. VideoStats (v1.5 — not built in v1, but documented here so the FK shape is known in advance)

Cached per-video YouTube Analytics data. This table exists specifically so the `analytics-sync` worker (TechSpec.md Section 4a) never calls the YouTube Analytics API live on a page load — it writes here on a daily schedule, and the API/frontend only ever reads from this table. One row per video, overwritten on each daily sync (not an append-only history table in v1.5 — a time-series history is a reasonable v2 expansion once trends-over-time is in scope, see PRD.md Section 7a).

```prisma
model VideoStats {
  id                    String   @id @default(cuid())
  videoId               String   @unique
  video                 Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  views                 Int      @default(0)
  impressions           Int?     // nullable — not always available depending on API metric coverage at sync time
  clickThroughRate      Float?   // stored as a percentage, e.g. 4.8 means 4.8%
  averageViewDurationSeconds Int?
  averageViewPercentage Float?   // % of video watched on average
  subscribersGained     Int      @default(0)
  retentionCurve        Json?    // array of 100 { elapsedRatio, retentionPercent } points, per YouTube's normalized retention format

  lastSyncedAt          DateTime @default(now())
  syncFailedAt          DateTime? // set if the most recent sync attempt failed, so a stale-data banner can be shown instead of silently displaying old numbers as current

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@map("video_stats")
}
```

Add to `Video`:

```prisma
model Video {
  // ...existing fields unchanged...
  stats           VideoStats?
}
```

Note on `retentionCurve`: stored as `Json` rather than a normalized child table, since it's always read and written as one complete 100-point array per sync (per TechSpec.md's note on YouTube's `elapsedVideoTimeRatio` dimension) and is never queried point-by-point — a JSON blob is simpler here than 100 child rows per video with no query benefit.



| From | To | Cardinality | Notes |
|---|---|---|---|
| User | YouTubeChannel | 1:1 | Intentional v1 limitation; becomes 1:N in v2 |
| User | UserProfile | 1:1 (nullable) | Null/incomplete until onboarding finishes |
| User | Video | 1:N | |
| User | Subscription | 1:1 | |
| Video | Transcript | 1:1 | |
| Video | Chapter | 1:N | |
| Video | Thumbnail | 1:N | |
| Video | Thumbnail (selected) | 1:1 (nullable) | Via `selectedThumbnailId` |
| Video | VideoStats | 1:1 (nullable) | v1.5; null until first analytics sync completes |
| Plan | Subscription | 1:N | |

## 4. Indexing notes

- `videos(userId, status)` — supports the dashboard's primary query (a user's videos, filterable/sortable by status).
- `videos(scheduledPublishAt)` — supports the worker's query for "what needs to be published soon," used by the `youtube-publish` queue scheduler.
- `chapters(videoId, order)` — supports fetching a video's chapters in display order efficiently.
- `webhook_events(eventId)` unique constraint is the actual idempotency mechanism — any webhook handler must check-and-insert here before doing real work.
- `video_stats(videoId)` unique constraint (v1.5) is what makes the daily sync job an upsert rather than an insert — each sync overwrites the existing row for that video rather than accumulating history.

## 5. Fields deliberately deferred (not in v1 schema)

- Anything reel/Shorts-related (clip boundaries, vertical-crop metadata, per-clip captions) — out of scope per PRD.md; will need its own `ReelClip` model in v2, likely related to `Transcript` (highlight timestamps are derived from the same transcript already stored).
- Multi-channel support — would require `YouTubeChannel` to become `userId` 1:N instead of 1:1, and `Video` would need an explicit `channelId` FK instead of implicitly using the user's single channel.
- Team/seat models — no `Organization` or `TeamMember` concept exists in this schema; flagged in PRD.md as not currently planned.
- Analytics history-over-time (a `VideoStatsSnapshot` table tracking how stats change day over day, rather than `VideoStats`' single overwritten row) — deferred until channel-level trends/comparisons are in scope, per PRD.md Section 7a's note that v1.5 is per-video-only, not trend-over-time.
- Layer 2 analytics correlation fields (e.g. a denormalized link from `VideoStats` back to "which thumbnail variant was live") — not needed as new schema, since `VideoStats.videoId` already joins to `Video.selectedThumbnailId` and `Video.chapters`; Layer 2 is a query/reporting concern on top of existing tables, not a schema change.
