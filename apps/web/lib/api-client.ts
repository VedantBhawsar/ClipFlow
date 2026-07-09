/**
 * Typed API surface for talking to the Express backend.
 *
 * Auth model: NextAuth stores the short-lived access JWT (15 min) and
 * the long-lived refresh token (7 d) inside its own httpOnly session
 * cookie. Components get the access token via the `useApi()` hook,
 * which feeds it into the methods on `api`. The api-client itself is
 * a factory (`createApiClient`) — there is no shared module-level
 * instance with token state, because the token only exists inside
 * NextAuth's session React context.
 *
 * The refresh flow lives entirely inside `auth.ts`'s `jwt` callback;
 * by the time a request leaves the browser the access token is
 * always fresh. Components never see a 401 from token expiry — they
 * only see 401s that mean "your refresh token is dead, you need to
 * sign in again", and those surface as `SessionExpiredError`.
 *
 * Wire contract: every response is the centralized envelope
 * `{ success, message, data }` (success) or `{ success: false,
 * message, data: null, error?, details? }` (failure). This module
 * unwraps `data` on success and reads `message`/`error` on failure so
 * the rest of the web app can keep working with flat DTOs.
 */
import { env } from "@/lib/env";
import type {
  ApiFailure,
  ApiResponse,
  AuthResponse,
  ChangePasswordRequest,
  ChannelRecentThumbnailsResponse,
  CheckoutSessionResponse,
  CreateCheckoutRequest,
  CreateVideoRequest,
  CreateVideoResponse,
  CustomerPortalResponse,
  ForgotPasswordRequest,
  ListPublishedVideosParams,
  ListVideosParams,
  LoginRequest,
  LogoutRequest,
  OnboardingStatusResponse,
  PaginatedVideos,
  PatchProfileRequest,
  PlanDto,
  PublishVideoRequest,
  RefreshRequest,
  RefreshResponse,
  RegenerateThumbnailsRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SettingsResponse,
  SubscriptionDto,
  SubscriptionResponse,
  ThumbnailDto,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  UpdateVideoRequest,
  UploadUrlResponse,
  UsageDto,
  UserPreferences,
  UserProfile,
  Video,
  YouTubeConnection,
} from "@clipflow/types";

/**
 * Distinct error type thrown by the api-client on 401. The QueryCache
 * / MutationCache global handlers `instanceof`-check this so a future
 * refactor of the error message can't silently break session-end
 * handling (the previous implementation matched on the message
 * string — fragile).
 */
export class SessionExpiredError extends Error {
  constructor(message = "Your session expired. Sign in again to continue.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * Server-side fetch (RSC).
 *
 * `request()` below reads the JWT from `document.cookie` (browser-only).
 * Server components pass the token explicitly via `cookies()` from
 * `next/headers`. This helper mirrors `request()`'s shape so a server
 * component and a client component can hit the same endpoint with
 * matching error semantics, but skips the 401-redirect path (the
 * dashboard's own auth middleware handles missing-token via
 * `redirect("/signin")`).
 */
export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServerApiError";
  }
}

/**
 * Client-side counterpart of `ServerApiError`. Carries the HTTP status,
 * the machine-readable `code` from the backend's failure envelope, and
 * any `details` the server chose to include (e.g. Zod issues, YouTube
 * reason codes). Callers that only need a user-facing string can still
 * read `error.message`; hooks that want to branch on the failure can
 * `instanceof`-check and read `error.code`.
 *
 * `SessionExpiredError` remains a distinct type so the global
 * QueryCache handler can identify session death without string-matching.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Read the failure envelope from a non-2xx response.
 *
 * Falls back to a generic message + `UNKNOWN` code when the body
 * isn't JSON, doesn't match the envelope, or is missing fields —
 * so a buggy proxy / HTML error page never throws inside this
 * function.
 */
const readFailureBody = async (res: Response): Promise<ApiFailure | null> => {
  try {
    const body = (await res.json()) as Partial<ApiResponse<unknown>>;
    if (body && body.success === false && typeof body.message === "string") {
      return {
        success: false,
        message: body.message,
        data: null,
        ...(body.error ? { error: body.error } : {}),
        ...(body.details ? { details: body.details } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
};

export async function serverFetch<T>(
  token: string,
  path: string,
  init?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
  const url = `${env.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const failure = await readFailureBody(res);
    const code = failure?.error ?? "UNKNOWN";
    const message = failure?.message ?? `Request failed: ${res.status}`;
    throw new ServerApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ServerApiError(
      res.status,
      body.error ?? "UNKNOWN",
      body.message || "Unexpected response from server.",
    );
  }
  return body.data;
}

// ---------- Client-side fetch (factory) ----------

export interface ApiClient {
  register(body: RegisterRequest): Promise<AuthResponse>;
  login(body: LoginRequest): Promise<AuthResponse>;
  logout(body: LogoutRequest): Promise<void>;
  refresh(body: RefreshRequest): Promise<RefreshResponse>;
  forgotPassword(body: ForgotPasswordRequest): Promise<void>;
  resetPassword(body: ResetPasswordRequest): Promise<void>;

  getOnboardingStatus(): Promise<OnboardingStatusResponse>;
  submitOnboardingProfile(body: UpdateProfileRequest): Promise<UserProfile>;
  patchOnboardingProfile(body: PatchProfileRequest): Promise<UserProfile>;

  getSettings(): Promise<SettingsResponse>;
  getYouTubeConnection(): Promise<YouTubeConnection>;
  getYouTubeOAuthUrl(): Promise<{ url: string }>;
  connectYouTube(code: string): Promise<YouTubeConnection>;
  disconnectYouTube(): Promise<void>;

  getPreferences(): Promise<UserPreferences>;
  updatePreferences(body: UpdatePreferencesRequest): Promise<UserPreferences>;
  changePassword(body: ChangePasswordRequest): Promise<void>;

  createVideo(body: CreateVideoRequest): Promise<CreateVideoResponse>;
  getUploadUrl(pendingUploadId: string): Promise<UploadUrlResponse>;
  finalizeUpload(pendingUploadId: string): Promise<Video>;
  cancelPendingUpload(pendingUploadId: string): Promise<void>;
  /**
   * List the current user's committed videos, paginated.
   *
   * The optional `status` filter accepts the lifecycle enum OR the
   * virtual `"NOT_PUBLISHED"` sentinel — the dashboard uses that to
   * ask for "everything except PUBLISHED" without mirroring the
   * union client-side.
   *
   * Returns the full paginated envelope (`videos + total + page +
   * pageSize + totalPages`) so the client doesn't need a second
   * round-trip to know how many pages exist.
   */
  listVideos(params?: ListVideosParams): Promise<PaginatedVideos>;
  /**
   * List the current user's PUBLISHED videos, paginated.
   *
   * Always filtered to `status: "PUBLISHED"` server-side; the
   * `publishedAt desc` ordering is a hard contract for this endpoint.
   */
  listPublishedVideos(
    params?: ListPublishedVideosParams,
  ): Promise<PaginatedVideos>;
  getVideo(id: string): Promise<Video>;
  /**
   * In-place update of a video's metadata + chapters during the review
   * window. Server enforces `status === READY_FOR_REVIEW`; any other
   * status returns 409 `NOT_EDITABLE`. All fields are optional —
   * omitted fields are preserved on the row.
   */
  updateVideo(id: string, body: UpdateVideoRequest): Promise<Video>;
  getPlaybackUrl(id: string): Promise<{ url: string }>;
  deleteVideo(id: string): Promise<void>;
  unpublishVideo(id: string): Promise<Video>;
  /**
   * Publish a `READY_FOR_REVIEW` (or `PUBLISH_FAILED` retry) video.
   * Pass an ISO 8601 `scheduledPublishAt` to schedule; omit it to
   * publish now. The server enforces the 15-min / 60-day window.
   */
  publishVideo(id: string, body?: PublishVideoRequest): Promise<Video>;
  /**
   * Retry a `FAILED` video. Resets the row to `EXTRACTING` and
   * re-enqueues the ingest job. Server returns 409 `NOT_RETRYABLE`
   * for any non-FAILED status.
   */
  retryVideo(id: string): Promise<Video>;

  /**
   * List every persisted thumbnail for a video (AI candidates + the
   * user's own upload, if any). Server returns the rows with
   * presigned GET URLs already attached so the web can drop them
   * straight into `<img src>`.
   */
  listThumbnails(videoId: string): Promise<ThumbnailDto[]>;
  /**
   * Mark an existing thumbnail row as the video's selected one. The
   * publish path uses this over the user's own upload (if any). The
   * server only accepts ids that belong to the same video.
   */
  selectThumbnail(videoId: string, thumbnailId: string): Promise<ThumbnailDto>;
  /**
   * Enqueue a fresh thumbnail generation. The job runs in the
   * worker; the SSE stream on the detail page will deliver the new
   * rows when they land. Body is optional — the server defaults
   * the prompt + model from `IMAGE_GEN_PROVIDER` env when omitted.
   */
  regenerateThumbnails(
    videoId: string,
    body?: RegenerateThumbnailsRequest,
  ): Promise<{ generationId: string }>;

  /**
   * Fetch up to 8 of the connected YouTube channel's most recent video
   * thumbnails. Used by the onboarding wizard's step 5 and the settings
   * "Refresh my channel style" CTA to populate the 4×2 selection grid.
   * 412 if the channel isn't connected — the wizard handles that with
   * an inline "Connect YouTube first" prompt.
   */
  fetchChannelRecentThumbnails(
    limit?: number,
  ): Promise<ChannelRecentThumbnailsResponse>;

  /**
   * Kick off a personalized channel-style analysis using the user's
   * hand-picked thumbnail URLs. Returns immediately; the worker
   * produces the analysis asynchronously and the dashboard re-reads
   * the settings bundle on the next render.
   *
   * Empty body / omitted → fall back to the auto-pick flow (the worker's
   * `search.list` chooses the thumbnails).
   */
  triggerPersonalizedStyleAnalysis(body?: {
    selectedThumbnailUrls?: string[];
  }): Promise<{ jobId: string } | null>;

  getPlans(): Promise<PlanDto[]>;
  getSubscription(): Promise<SubscriptionResponse>;
  createCheckoutSession(body: CreateCheckoutRequest): Promise<CheckoutSessionResponse>;
  openCustomerPortal(): Promise<CustomerPortalResponse | { available: false }>;
  cancelScheduled(): Promise<SubscriptionDto>;
}

/**
 * Build a typed `api` surface bound to a specific access token.
 *
 * The factory pattern lets us reconstruct the client whenever the
 * token changes (NextAuth refresh) without exposing a mutable global.
 * `useApi()` wraps this in a `useMemo` keyed on the token so React
 * re-renders don't churn the request handlers.
 */
export function createApiClient(accessToken: string | null): ApiClient {
  async function request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${env.apiBaseUrl}${path}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new Error(
        "Couldn't reach ClipFlow. Check your connection and try again.",
      );
    }

    if (response.status === 401) {
      // The session is dead — NextAuth's `jwt` callback already tried
      // to refresh and failed, so sign-out is the only path forward.
      // We throw a typed error; the global QueryCache handler is
      // responsible for the actual sign-out (it has access to the
      // router and the auth context).
      let message = "Your session expired. Sign in again to continue.";
      const failure = await readFailureBody(response);
      if (failure?.message) message = failure.message;
      throw new SessionExpiredError(message);
    }

    if (!response.ok) {
      const failure = await readFailureBody(response);
      const message = failure?.message ?? "Something went wrong. Try again.";
      const code = failure?.error ?? "UNKNOWN";
      throw new ApiError(response.status, code, message, failure?.details);
    }

    // 204 No Content — no envelope to unwrap. Cast is safe because
    // void-returning methods thread `T = void` through here.
    if (response.status === 204) return undefined as T;

    // All success paths return the standard envelope; unwrap `data`.
    const envelope = (await response.json()) as ApiResponse<T>;
    if (!envelope.success) {
      // Server sent a 2xx with a failure body — defensive guard so the
      // frontend never hands a `{ success: false }` payload up to a hook.
      throw new ApiError(
        response.status,
        envelope.error ?? "UNKNOWN",
        envelope.message || "Unexpected response from server.",
        envelope.details,
      );
    }
    return envelope.data;
  }

  return {
    register(body) {
      return request("POST", "/api/auth/register", body);
    },
    login(body) {
      return request("POST", "/api/auth/login", body);
    },
    logout(body) {
      return request<void>("POST", "/api/auth/logout", body);
    },
    refresh(body) {
      return request("POST", "/api/auth/refresh", body);
    },
    forgotPassword(body) {
      return request<void>("POST", "/api/auth/forgot-password", body);
    },
    resetPassword(body) {
      return request<void>("POST", "/api/auth/reset-password", body);
    },

    getOnboardingStatus() {
      return request("GET", "/api/onboarding/status");
    },
    submitOnboardingProfile(body) {
      return request("POST", "/api/onboarding/profile", body);
    },
    patchOnboardingProfile(body) {
      return request("PATCH", "/api/onboarding/profile", body);
    },

    getSettings() {
      return request("GET", "/api/settings");
    },
    getYouTubeConnection() {
      return request("GET", "/api/youtube/connection");
    },
    getYouTubeOAuthUrl() {
      return request("GET", "/api/youtube/oauth/url");
    },
    connectYouTube(code) {
      return request("POST", "/api/youtube/connect", { code });
    },
    disconnectYouTube() {
      return request<void>("DELETE", "/api/youtube/disconnect");
    },

    getPreferences() {
      return request("GET", "/api/settings/preferences");
    },
    updatePreferences(body) {
      return request("PATCH", "/api/settings/preferences", body);
    },
    changePassword(body) {
      return request<void>("POST", "/api/settings/change-password", body);
    },

    createVideo(body) {
      return request("POST", "/api/videos", body);
    },
    getUploadUrl(pendingUploadId) {
      return request(
        "POST",
        `/api/videos/pending/${pendingUploadId}/upload-url`,
      );
    },
    finalizeUpload(pendingUploadId) {
      return request("POST", `/api/videos/pending/${pendingUploadId}/finalize`);
    },
    cancelPendingUpload(pendingUploadId) {
      return request<void>("DELETE", `/api/videos/pending/${pendingUploadId}`);
    },
    listVideos(params) {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.q) search.set("q", params.q);
      if (params?.page) search.set("page", String(params.page));
      if (params?.pageSize) search.set("pageSize", String(params.pageSize));
      const qs = search.toString();
      return request("GET", `/api/videos${qs ? `?${qs}` : ""}`);
    },
    listPublishedVideos(params) {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      // The published page's privacy segmented control and date-range
      // select flow through `ListPublishedVideosParams` and the hook
      // forwards them here — but if we don't actually serialize them
      // into the query string the server sees an empty filter and
      // returns the unfiltered list regardless of which button the
      // user clicked. The server schema accepts "all" and transforms
      // it to undefined, so passing the raw value is fine.
      if (params?.privacy) search.set("privacy", params.privacy);
      if (params?.since) search.set("since", params.since);
      if (params?.page) search.set("page", String(params.page));
      if (params?.pageSize) search.set("pageSize", String(params.pageSize));
      const qs = search.toString();
      return request("GET", `/api/videos/published${qs ? `?${qs}` : ""}`);
    },
    getVideo(id) {
      return request("GET", `/api/videos/${id}`);
    },
    updateVideo(id, body) {
      return request("PATCH", `/api/videos/${id}`, body);
    },
    getPlaybackUrl(id) {
      return request("GET", `/api/videos/${id}/playback-url`);
    },
    deleteVideo(id) {
      return request<void>("DELETE", `/api/videos/${id}`);
    },
    unpublishVideo(id) {
      return request("POST", `/api/videos/${id}/unpublish`);
    },
    publishVideo(id, body) {
      return request("POST", `/api/videos/${id}/publish`, body ?? {});
    },
    retryVideo(id) {
      return request("POST", `/api/videos/${id}/retry`);
    },
    listThumbnails(videoId) {
      return request("GET", `/api/videos/${videoId}/thumbnails`);
    },
    selectThumbnail(videoId, thumbnailId) {
      return request(
        "POST",
        `/api/videos/${videoId}/thumbnails/${thumbnailId}/select`,
      );
    },
    regenerateThumbnails(videoId, body) {
      return request(
        "POST",
        `/api/videos/${videoId}/thumbnails/regenerate`,
        body ?? {},
      );
    },
    fetchChannelRecentThumbnails(limit) {
      const qs = limit ? `?limit=${limit}` : "";
      return request(
        "GET",
        `/api/youtube/channel-recent-thumbnails${qs}`,
      );
    },
    triggerPersonalizedStyleAnalysis(body) {
      return request("POST", `/api/thumbnail-style/analyze`, body ?? {});
    },

    getPlans() {
      return request("GET", "/api/billing/plans");
    },
    getSubscription() {
      return request("GET", "/api/billing/subscription");
    },
    createCheckoutSession(body) {
      return request("POST", "/api/billing/checkout", body);
    },
    openCustomerPortal() {
      return request("POST", "/api/billing/customer-portal");
    },
    cancelScheduled() {
      return request("POST", "/api/billing/cancel-scheduled");
    },
  };
}