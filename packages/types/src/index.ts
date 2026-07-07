/**
 * @clipflow/types
 *
 * Shared DTOs and enums between apps/web (Next.js) and apps/api (Express).
 * Kept dependency-free so it can be consumed by both runtimes without dragging
 * Node-only or DOM-only types into the other.
 */

// ---------- Enums (mirror Prisma enums in packages/db) ----------

export const CONTENT_NICHES = [
  "GAMING",
  "TECH_EDUCATION",
  "VLOG_LIFESTYLE",
  "BUSINESS_FINANCE",
  "ENTERTAINMENT_COMEDY",
  "OTHER",
] as const;
export type ContentNiche = (typeof CONTENT_NICHES)[number];

export const UPLOAD_FREQUENCIES = [
  "ONE_TO_FOUR",
  "FIVE_TO_TEN",
  "ELEVEN_TO_TWENTY",
  "TWENTY_PLUS",
] as const;
export type UploadFrequency = (typeof UPLOAD_FREQUENCIES)[number];

export const PRIMARY_GOALS = [
  "SAVE_TIME_EDITING",
  "BETTER_THUMBNAILS_CTR",
  "CONSISTENT_SCHEDULE",
  "GROW_VIEWS",
] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export const AUTH_PROVIDERS = ["EMAIL", "GOOGLE"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// ---------- Preferences / Settings ----------

/**
 * How the app should treat generated chapters before publishing.
 * Mirrors the Prisma `ChapterBehavior` enum in packages/db.
 */
export const CHAPTER_BEHAVIORS = [
  "ALWAYS_REVIEW",
  "AUTO_APPLY_IF_VALID",
] as const;
export type ChapterBehavior = (typeof CHAPTER_BEHAVIORS)[number];

/**
 * Per-user override for thumbnail style. AUTO means "use the niche
 * default"; the other values force a specific treatment for creators
 * whose content doesn't fit a single niche.
 */
export const THUMBNAIL_STYLES = [
  "AUTO",
  "BOLD",
  "MINIMAL",
  "TEXT_FORWARD",
] as const;
export type ThumbnailStyle = (typeof THUMBNAIL_STYLES)[number];

/**
 * A small, curated set of common IANA timezones. We don't ship every
 * IANA zone (there are hundreds); the API additionally accepts any
 * string that looks like a valid IANA zone via the regex in the
 * zod schema. The list is for the settings UI's quick-pick dropdown.
 *
 * Sort order is intentional: UTC first, then alphabetical by region.
 */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;
export type CommonTimezone = (typeof COMMON_TIMEZONES)[number];

// ---------- Auth ----------

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  authProvider: AuthProvider;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  /**
   * Short-lived (15-minute) JWT. Sent in `Authorization: Bearer <accessToken>`
   * on every authenticated request. Frontend stores inside NextAuth's
   * session cookie via the Credentials provider.
   */
  accessToken: string;
  /**
   * Long-lived (7-day) opaque token used to mint fresh access tokens via
   * `POST /api/auth/refresh`. Stored as a SHA-256 hash server-side.
   * Rotation: each successful refresh invalidates the presented token and
   * returns a new pair. Reuse detection: presenting a revoked refresh
   * token revokes the entire family.
   */
  refreshToken: string;
  /** Unix-ms timestamp at which `accessToken` expires. */
  accessTokenExpiresAt: number;
  /** Unix-ms timestamp at which `refreshToken` expires. */
  refreshTokenExpiresAt: number;
  /**
   * Whether the user has finished the onboarding wizard. Baked into the
   * NextAuth session cookie on first sign-in so `<OnboardingGuard>` can
   * route the user without an API round-trip.
   */
  onboardingCompleted: boolean;
  /**
   * The user's chosen display name from `UserProfile.displayName`, or
   * null if they haven't completed onboarding yet. Mirrored into the
   * session cookie so the dashboard chrome can greet them by name
   * without re-fetching the profile.
   */
  displayName: string | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  /**
   * Latest `onboardingCompleted` from the DB, refreshed on every token
   * rotation. Lets a long-lived session pick up onboarding completion
   * without forcing a re-login.
   */
  onboardingCompleted: boolean;
  /**
   * Latest `displayName` from the DB, refreshed on every token rotation.
   */
  displayName: string | null;
}

export interface LogoutRequest {
  /** Refresh token to revoke. Optional — omitting it revokes nothing
   * server-side and only clears the client session. */
  refreshToken?: string;
}

// ---------- Password reset ----------

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ---------- Onboarding ----------

export interface UserProfile {
  id: string;
  displayName: string | null;
  niche: ContentNiche | null;
  uploadFrequency: UploadFrequency | null;
  primaryGoal: PrimaryGoal | null;
  recommendedPlanId: string | null;
  onboardingCompletedAt: string | null;
}

export interface UpdateProfileRequest {
  displayName?: string;
  niche: ContentNiche;
  uploadFrequency: UploadFrequency;
  primaryGoal: PrimaryGoal;
}

/**
 * Partial update shape used by `PATCH /api/onboarding/profile`.
 * Any of the four fields may be omitted; the service layer merges on
 * top of the existing row.
 */
export interface PatchProfileRequest {
  displayName?: string | null;
  niche?: ContentNiche;
  uploadFrequency?: UploadFrequency;
  primaryGoal?: PrimaryGoal;
}

export interface OnboardingStatusResponse {
  completed: boolean;
  profile: UserProfile | null;
}

// ---------- User Preferences / Settings ----------

/**
 * Runtime user preferences. Row is created on first read with sensible
 * defaults, so the API contract is "if you PATCH one field, the rest
 * stay as-is" (see server-side zod schema partial-merge).
 */
export interface UserPreferences {
  id: string;
  notifyProcessingComplete: boolean;
  notifyPublished: boolean;
  notifyPublishFailed: boolean;
  notifyNeedsReauth: boolean;
  notifyWeeklySummary: boolean;
  defaultTimezone: string;
  defaultPublishTime: string;
  chapterBehavior: ChapterBehavior;
  thumbnailStyle: ThumbnailStyle;
  createdAt: string;
  updatedAt: string;
}

/**
 * Partial-update payload for PATCH /api/settings/preferences. Any
 * subset of the fields may be provided; the server merges on top of
 * the existing row and rejects empty bodies.
 */
export interface UpdatePreferencesRequest {
  notifyProcessingComplete?: boolean;
  notifyPublished?: boolean;
  notifyPublishFailed?: boolean;
  notifyNeedsReauth?: boolean;
  notifyWeeklySummary?: boolean;
  defaultTimezone?: string;
  defaultPublishTime?: string;
  chapterBehavior?: ChapterBehavior;
  thumbnailStyle?: ThumbnailStyle;
}

/**
 * Body for POST /api/settings/change-password. The server verifies
 * the current password before accepting the new one.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------- YouTube connection (read-side; OAuth not yet wired) ----------

export const CHANNEL_CONNECTION_STATUSES = [
  "CONNECTED",
  "NEEDS_REAUTH",
  "DISCONNECTED",
] as const;
export type ChannelConnectionStatus = (typeof CHANNEL_CONNECTION_STATUSES)[number];

export type YouTubeConnectionStatus = "connected" | "needs_reauth" | "disconnected";

export interface YouTubeConnection {
  status: YouTubeConnectionStatus;
  channelId: string | null;
  channelTitle: string | null;
  channelThumbnailUrl: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
}

// ---------- /api/settings read (lazy, dashboard chrome no longer needs it) ----------

/**
 * Lazy read of the user's settings-shaped data — profile fields, runtime
 * preferences, and the YouTube connection. Fetched only by the settings
 * pages and the YouTube connection card; the dashboard chrome no longer
 * hydrates from this on every render (it reads identity + onboarding
 * status directly from the NextAuth session JWT).
 */
export interface SettingsResponse {
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  youtubeConnection: YouTubeConnection;
}

// ---------- API response envelope ----------

/**
 * Successful API response shape. Every endpoint returns this wrapper on
 * 2xx so the frontend has a single, predictable contract:
 *
 *   { success: true, message: string, data: <payload> }
 *
 * For endpoints that don't carry a payload (logout, change-password,
 * disconnect, cancel upload, delete video), `data` is `null`.
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * Failed API response shape. Every endpoint — and the central error
 * middleware — returns this wrapper on non-2xx so the frontend has a
 * single, predictable contract:
 *
 *   { success: false, message: string, data: null, error?, details? }
 *
 * `error` is a stable machine-readable code (e.g. `EMAIL_TAKEN`,
 * `INVALID_CREDENTIALS`) for programmatic UI handling; `message` is
 * the human-friendly text safe to show to the user. `details` is an
 * optional structured payload (validation issues, request id, etc.).
 */
export interface ApiFailure {
  success: false;
  message: string;
  data: null;
  error?: string;
  details?: Record<string, unknown>;
}

/** Discriminated union of the two envelope shapes. */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * @deprecated Use {@link ApiFailure} (and {@link ApiResponse}) instead.
 * Kept as an alias so older consumers that imported `ApiErrorBody`
 * keep compiling during the migration.
 */
export type ApiErrorBody = ApiFailure;

// ---------- Video upload → publish ----------

/**
 * Lifecycle states for an uploaded video.
 *
 * The current Prisma enum is a 6-value subset (UPLOADED / READY /
 * SCHEDULED / PUBLISHING / PUBLISHED / PUBLISH_FAILED) for the
 * upload-publish slice. The transcript / thumbnail / chapter slice
 * will add EXTRACTING / TRANSCRIBING / GENERATING / READY_FOR_REVIEW /
 * FAILED via a follow-up migration. The type is forward-declared here
 * so the frontend can handle all pipeline stages before the migration
 * lands.
 */
export const VIDEO_STATUSES = [
  "UPLOADED",
  "READY",
  "EXTRACTING",
  "TRANSCRIBING",
  "GENERATING",
  "READY_FOR_REVIEW",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PUBLISH_FAILED",
  "FAILED",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const VIDEO_PRIVACY_STATUSES = [
  "private",
  "unlisted",
  "public",
] as const;
export type VideoPrivacyStatus = (typeof VIDEO_PRIVACY_STATUSES)[number];

/**
 * YouTube content rating. `none` = no restriction (default).
 * The 18+ rating covers the v1 surface; YouTube's regional systems
 * add more values which we'll model when a customer needs them.
 */
export const VIDEO_AGE_RESTRICTIONS = ["none", "18+"] as const;
export type VideoAgeRestriction = (typeof VIDEO_AGE_RESTRICTIONS)[number];

/**
 * YouTube video license. `standard` = default YouTube license;
 * `creativeCommon` = CC BY (the only CC flavor YouTube offers).
 */
export const VIDEO_LICENSES = ["standard", "creativeCommon"] as const;
export type VideoLicense = (typeof VIDEO_LICENSES)[number];

/**
 * YouTube comment policy. `allowAll` = default. `holdAll` = every
 * comment held for review. `disable` = comments off.
 */
export const VIDEO_COMMENT_POLICIES = ["allowAll", "holdAll", "disable"] as const;
export type VideoCommentPolicy = (typeof VIDEO_COMMENT_POLICIES)[number];

/**
 * Body for `POST /api/videos`. The metadata the user submits when
 * creating a new video. The actual file bytes are uploaded directly
 * to S3/MinIO via the presigned URL returned by that endpoint — the
 * API never sees the bytes.
 *
 * Every field after `fileSizeBytes` is optional and has a sensible
 * default that matches YouTube's own default behavior. They're
 * surfaced in the create-video form so the creator doesn't have to
 * bounce to YouTube Studio to set made-for-kids, age restriction,
 * embeddable, license, public stats viewable, or comment policy.
 */
export interface CreateVideoRequest {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: VideoPrivacyStatus;
  /** ISO8601 string. Omit for immediate publish. */
  scheduledPublishAt?: string;
  /** COPPA self-declaration. Default false. */
  madeForKids?: boolean;
  /** YouTube content rating. Default "none". */
  ageRestriction?: VideoAgeRestriction;
  /** Allow other sites to embed this video. Default true. */
  embeddable?: boolean;
  /** Default "standard". */
  license?: VideoLicense;
  /** Show the public view count on the watch page. Default true. */
  publicStatsViewable?: boolean;
  /** Default "allowAll". */
  commentPolicy?: VideoCommentPolicy;
  originalFilename: string;
  contentType?: string;
  /** Client-declared byte size. Server re-checks on finalize. */
  fileSizeBytes: number;
  /**
   * Optional custom thumbnail. The server mints a second presigned
   * POST URL so the browser can upload the image alongside the video;
   * after the video publishes, the worker forwards it to YouTube's
   * `thumbnails.set` endpoint.
   *
   * YouTube's hard cap is 2 MB and only JPEG / PNG are accepted.
   * The dropzone in the create dialog enforces both client-side;
   * the server mirrors them so a hand-rolled client can't bypass.
   */
  thumbnailContentType?: string;
  /** Client-declared thumbnail byte size. Server re-checks on finalize. */
  thumbnailFileSizeBytes?: number;
  /**
   * Original filename of the thumbnail. Used to infer the S3 key
   * extension when the content type is ambiguous; not persisted.
   */
  thumbnailOriginalFilename?: string;
}

/**
 * Body for `POST /api/videos/:id/publish`. Used by the "Publish"
 * button on the video detail page once the user has finished editing
 * a `READY_FOR_REVIEW` (or `PUBLISH_FAILED` retry) row.
 *
 * - Omit `scheduledPublishAt` to publish immediately. The service
 *   delegates to the existing `publishVideoNow` path so YouTube gets
 *   the row's already-saved metadata via `buildStatusFromVideo` —
 *   there's no second layer of metadata passing through this body.
 * - Set `scheduledPublishAt` to a future ISO 8601 instant (≥15 min
 *   out, ≤60 days — YouTube's own window) and the service flips the
 *   row to `SCHEDULED` and enqueues a delayed `youtube-publish` job.
 *   The worker startup-recovery pass picks up the job even if the API
 *   or worker was offline at the scheduled time.
 */
export interface PublishVideoRequest {
  /**
   * ISO 8601 string for the desired publish time. Omit for an
   * immediate publish. The server validates the 15-min / 60-day
   * window — clients should mirror the same bounds so the user
   * gets instant feedback, but the server is the source of truth.
   */
  scheduledPublishAt?: string;
}

/**
 * Body for `PATCH /api/videos/:id`. Used by the in-place editor on the
 * review screen to fix up AI-generated metadata and chapters before
 * publishing. All fields optional — the service merges on top of the
 * existing row.
 *
 * The metadata fields (title/description/tags) + the YouTube status
 * block (privacyStatus/madeForKids/embeddable/license/publicStatsViewable/
 * commentPolicy) all flow into the same partial-merge on the row — the
 * publish worker reads them off the row at publish time, so a save here
 * is the source of truth for what gets sent to YouTube.
 *
 * The API enforces the same shape + YouTube-rule invariants that the
 * LLM uses on initial generation (first startMs=0, ≥10 s gap, ≤100 char
 * chapter titles, ≥3 chapters, etc.) so anything that publishes through
 * this endpoint satisfies YouTube's chapter marker requirements.
 *
 * Editing is only allowed when the row is in `READY_FOR_REVIEW`. After
 * the user schedules or publishes, the editor surface disappears and
 * the API rejects PATCHes with 409 `NOT_EDITABLE`.
 */
export interface UpdateVideoRequest {
  title?: string;
  description?: string | null;
  tags?: string[];
  /** Replaces the LLM-generated summary. ≤280 chars. */
  summary?: string;
  /**
   * Replaces the LLM-generated chapter list. Must satisfy the YouTube
   * invariants — first chapter starts at 0 ms, consecutive chapters are
   * ≥10 s apart, titles ≤100 chars, between 3 and 12 chapters.
   */
  chapters?: { startMs: number; title: string }[];
  // ---- YouTube status block ----
  //
  // All optional. Mirrors the fields `videos.insert` accepts under
  // `status.*`. Defaults match YouTube's own defaults; the create-time
  // zod schema applies them, so omitting all six leaves the row at its
  // already-saved state.
  privacyStatus?: VideoPrivacyStatus;
  /** COPPA self-declaration. */
  madeForKids?: boolean;
  /** Allow other sites to embed this video. */
  embeddable?: boolean;
  /** Standard YouTube license vs Creative Commons — Attribution. */
  license?: VideoLicense;
  /** Show the public view count on the watch page. */
  publicStatsViewable?: boolean;
  /** Comments: allow all, hold all for review, or disable. */
  commentPolicy?: VideoCommentPolicy;
}

/**
 * Response from `POST /api/videos`. The browser uses `postUrl` + `fields`
 * to submit the file via multipart/form-data.
 *
 * The server does NOT create a `Video` row at this point. The returned
 * `pendingUploadId` is the handle for the in-flight upload; a row only
 * gets committed after the browser PUTs the file and the server confirms
 * it via `POST /api/videos/pending/:id/finalize`. If the user never
 * finalizes (closes the tab, network dies, etc.) the row simply never
 * exists — no cleanup needed.
 */
export interface CreateVideoResponse {
  pendingUploadId: string;
  s3KeyOriginal: string;
  postUrl: string;
  fields: Record<string, string>;
  /** Hard cap the presigned POST will accept (== env.YOUTUBE_MAX_VIDEO_BYTES). */
  contentLengthMaxBytes: number;
  /**
   * Presigned POST for the custom thumbnail. Present only when the
   * client supplied `thumbnailContentType` + `thumbnailFileSizeBytes`
   * in the create request — otherwise `null` and the browser skips
   * the thumbnail PUT. The video PUT can still proceed regardless.
   */
  thumbnail: {
    s3KeyThumbnail: string;
    postUrl: string;
    fields: Record<string, string>;
    /** Hard cap == YouTube's 2 MB thumbnail limit. */
    contentLengthMaxBytes: number;
  } | null;
}

export interface UploadUrlResponse {
  postUrl: string;
  fields: Record<string, string>;
  contentLengthMaxBytes: number;
}

/**
 * Paginated envelope returned by every list endpoint
 * (`/api/videos` and `/api/videos/published`).
 *
 * - `videos` is the current page slice (size <= pageSize).
 * - `total` is the total number of rows matching the filter
 *   (BEFORE pagination). The client uses this to render a page
 *   count and "X of Y" counters.
 * - `page` is the 1-indexed page that produced this slice — useful
 *   for echoing back in the UI without re-parsing query strings.
 * - `pageSize` echoes the requested page size (already capped
 *   server-side).
 * - `totalPages` is `ceil(total / pageSize)`, floored at 1 so the
 *   client never has to guard against "0 pages" while rendering.
 */
export interface PaginatedVideos {
  videos: Video[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Query params accepted by `/api/videos`. Mirrors the zod schema in
 * `apps/api/src/modules/videos/videos.schemas.ts`. Empty / omitted
 * fields are equivalent to their defaults.
 *
 * `status` includes the virtual `NOT_PUBLISHED` sentinel which the
 * service translates into a `status: { not: "PUBLISHED" }` filter —
 * used by the dashboard so it doesn't have to mirror the lifecycle
 * union client-side.
 */
export interface ListVideosParams {
  status?:
    | VideoStatus
    | "NOT_PUBLISHED";
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPublishedVideosParams {
  q?: string;
  /**
   * Narrow the list to public / unlisted / private rows. Omit (or
   * send "all") for no privacy filter — it's a fan-out filter, not a
   * default that hides rows the user might want to see.
   */
  privacy?: VideoPrivacyStatus | "all";
  /**
   * ISO8601 date string. The service translates it into a
   * `publishedAt: { gte: since }` filter — useful for "last 30 days
   * / last year" chips on the published page.
   */
  since?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Wire DTO for a Video row. Dates are ISO strings; the BigInt
 * `fileSizeBytes` is serialized to a number (still safe — 5GB ≈ 5.4e9,
 * well under 2^53).
 */
export interface Video {
  id: string;
  status: VideoStatus;
  title: string;
  description: string | null;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  madeForKids: boolean;
  ageRestriction: VideoAgeRestriction;
  embeddable: boolean;
  license: VideoLicense;
  publicStatsViewable: boolean;
  commentPolicy: VideoCommentPolicy;
  originalFilename: string;
  fileSizeBytes: number;
  contentType: string;
  s3KeyOriginal: string;
  /** Custom thumbnail S3 key. The publish path forwards this to YouTube
   *  when no AI candidate has been picked (see `selectedThumbnailId`). */
  s3KeyThumbnail: string | null;
  /** Original content type of the uploaded thumbnail. */
  thumbnailContentType: string | null;
  /** AI thumbnail the user picked on the review screen. Takes
   *  precedence over `s3KeyThumbnail` in the publish path. */
  selectedThumbnailId: string | null;
  /** AI-generated candidates + the user's own upload (if any), each
   *  with a presigned GET URL ready for `<img src>`. */
  thumbnails: ThumbnailWithUrl[];
  /** Probed video duration in seconds (set by EXTRACTING worker). */
  durationSeconds: number | null;
  /** S3 key for the extracted audio (set by EXTRACTING worker). */
  s3KeyAudio: string | null;
  /** LLM-generated chapters + summary (set by GENERATING worker). */
  chaptersJson: ChaptersJson | null;
  failureReason: string | null;
  scheduledPublishAt: string | null;
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/**
 * LLM-generated chapters and summary. Persisted as `chaptersJson` on
 * the Video row. The publish path reads `chapters` to write YouTube
 * chapter markers and `summary` to seed the description.
 */
export interface ChaptersJson {
  summary: string;
  chapters: { startMs: number; title: string }[];
}

// ---------- SSE event types ----------

export interface SseStatusUpdateEvent {
  type: "STATUS_UPDATE";
  videoId: string;
  userId: string;
  status: string;
  timestamp: string;
}

export interface SseProgressEvent {
  type: "PROGRESS";
  videoId: string;
  userId: string;
  progress: number;
  stage: string;
  timestamp: string;
}

export interface SseErrorEvent {
  type: "ERROR";
  videoId: string;
  userId: string;
  error: string;
  timestamp: string;
}

export type SseVideoEvent = SseStatusUpdateEvent | SseProgressEvent | SseErrorEvent;

// ---------- Thumbnail generation ----------

export const THUMBNAIL_SOURCES = ["AI_GENERATED", "USER_UPLOADED"] as const;
export type ThumbnailSource = (typeof THUMBNAIL_SOURCES)[number];

export const THUMBNAIL_GEN_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type ThumbnailGenStatus = (typeof THUMBNAIL_GEN_STATUSES)[number];

/**
 * One generated thumbnail candidate for a video.
 */
export interface ThumbnailDto {
  id: string;
  videoId: string;
  s3Key: string;
  source: ThumbnailSource;
  generationIndex: number;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

/**
 * Thumbnail row + a fresh presigned GET URL for browser display.
 *
 * The API mints the URL on every `GET /api/videos/:id` call (15-min
 * expiry, mirroring the playback-URL pattern). The web layer doesn't
 * need to know about S3 presigning — it can drop the `url` straight
 * into an `<img src>`.
 *
 * `label` is precomputed server-side so the UI doesn't have to
 * translate `ThumbnailSource` ("AI candidate 1", "Your upload", etc.).
 */
export interface ThumbnailWithUrl {
  id: string;
  source: ThumbnailSource;
  generationIndex: number;
  width: number | null;
  height: number | null;
  /** Short user-facing description ("AI candidate 1", "Your upload"). */
  label: string;
  /** Presigned GET URL. Always populated when present in the API. */
  url: string;
  createdAt: string;
}

/**
 * A thumbnail generation attempt with full context (prompt, models, references).
 */
export interface ThumbnailGenerationDto {
  id: string;
  videoId: string;
  status: ThumbnailGenStatus;
  promptText: string;
  modelUsed: string;
  chapterRefs: Array<{ startMs: number; title: string }> | null;
  frameRefs: string[] | null;
  channelStyleId: string | null;
  generatedIds: string[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Cached vision analysis of a creator's existing YouTube thumbnails.
 */
export interface ChannelThumbnailStyleDto {
  id: string;
  dominantColors: string[] | null;
  textPlacement: string | null;
  compositionStyle: string | null;
  facePresence: string | null;
  brandElements: string[] | null;
  analysisRaw: string | null;
  styleOverride: ThumbnailStyle;
  thumbnailCount: number;
  lastAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for PATCH /api/thumbnail-style (manual style override).
 */
export interface UpdateThumbnailStyleRequest {
  styleOverride: ThumbnailStyle;
}

/**
 * Request body for POST /api/videos/:id/thumbnails/regenerate.
 */
export interface RegenerateThumbnailsRequest {
  /** Optional: specific chapter timestamps to focus on. Empty = all chapters. */
  chapterTimestamps?: number[];
  /** Optional: override the generation prompt. */
  customPrompt?: string;
}