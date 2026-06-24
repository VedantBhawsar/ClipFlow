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
  token: string;
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

// ---------- Errors ----------

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

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
 * Body for `POST /api/videos`. The metadata the user submits when
 * creating a new video. The actual file bytes are uploaded directly
 * to S3/MinIO via the presigned URL returned by that endpoint — the
 * API never sees the bytes.
 */
export interface CreateVideoRequest {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: VideoPrivacyStatus;
  /** ISO8601 string. Omit for immediate publish. */
  scheduledPublishAt?: string;
  originalFilename: string;
  contentType?: string;
  /** Client-declared byte size. Server re-checks on finalize. */
  fileSizeBytes: number;
}

/**
 * Response from `POST /api/videos`. The browser uses `postUrl` + `fields`
 * to submit the file via multipart/form-data.
 */
export interface CreateVideoResponse {
  id: string;
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