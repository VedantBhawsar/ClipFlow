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
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

export interface LogoutRequest {
  /** Refresh token to revoke. Optional — omitting it revokes nothing
   * server-side and only clears the client session. */
  refreshToken?: string;
}

export interface MeResponse {
  user: AuthUser;
  profile: UserProfile | null;
  onboardingCompleted: boolean;
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
 * Partial update shape used by PATCH /api/onboarding/profile and
 * PATCH /api/user/profile. Any of the four fields may be omitted; the
 * service layer merges on top of the existing row.
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
 * Partial-update payload for PATCH /api/user/preferences. Any subset
 * of the fields may be provided; the server merges on top of the
 * existing row and rejects empty bodies.
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
 * Body for POST /api/user/change-password. The server verifies the
 * current password before accepting the new one.
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

// ---------- Combined /user/profile read ----------

/**
 * Single round-trip read used by the web client on hydration. Returns
 * everything the dashboard chrome needs in one call, behind a 30s
 * server-side cache (see `apps/api/src/lib/cache.ts`).
 */
export interface UserBundleResponse {
  user: AuthUser;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  onboardingCompleted: boolean;
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
 * Lifecycle states for an uploaded video. Six values for the
 * upload-publish slice; the transcript / thumbnail / chapter slice
 * extends this enum via a follow-up migration. Mirrors the Prisma
 * `VideoStatus` enum in packages/db.
 */
export const VIDEO_STATUSES = [
  "UPLOADED",
  "READY",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PUBLISH_FAILED",
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
}

export interface UploadUrlResponse {
  postUrl: string;
  fields: Record<string, string>;
  contentLengthMaxBytes: number;
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
  failureReason: string | null;
  scheduledPublishAt: string | null;
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}