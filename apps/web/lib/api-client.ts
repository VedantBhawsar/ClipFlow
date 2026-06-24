import type {
  AuthResponse,
  ChangePasswordRequest,
  CreateVideoRequest,
  CreateVideoResponse,
  LoginRequest,
  MeResponse,
  OnboardingStatusResponse,
  PatchProfileRequest,
  RegisterRequest,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  UploadUrlResponse,
  UserBundleResponse,
  UserPreferences,
  UserProfile,
  Video,
  VideoStatus,
  YouTubeConnection,
  ApiErrorBody,
} from "@clipflow/types";
import { env } from "@/lib/env";

/**
 * Name of the cookie we use to keep the JWT available to both the client
 * (for fetch Authorization header) and middleware (for redirect gating).
 *
 * NOTE: this is set as a regular (non-httpOnly) cookie via document.cookie.
 * That is a deliberate trade-off for v1: a true httpOnly cookie would require
 * a Next.js server route handler that proxies auth, which is more wiring than
 * this slice needs. The risk surface (an XSS exfiltrating the token) is
 * mitigated by:
 *   - same-site=strict so it isn't sent on cross-site navigations
 *   - reasonable token TTL on the backend (TODO: confirm with backend)
 *   - clearing the cookie on logout / 401
 * If/when we need stricter isolation we should swap to a server route that
 * reads the httpOnly cookie and sets it during register/login.
 */
export const AUTH_TOKEN_COOKIE = "clipflow_token";

function readTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${AUTH_TOKEN_COOKIE}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Cheap cookie-presence check for "is there a token at all?". Used as
 * the `enabled` flag for queries that need auth — without this, calling
 * the bundle from /signin would 401, fire the global error handler,
 * and bounce back to /signin in an infinite loop.
 */
export function hasAuthTokenCookie(): boolean {
  return readTokenFromCookie() !== null;
}

export function setAuthTokenCookie(token: string): void {
  if (typeof document === "undefined") return;
  // 30 days; same-site strict so it isn't leaked on cross-site requests.
  // Secure is only set in production — over HTTP localhost the browser
  // would refuse to set the cookie and the dev sign-in flow would silently
  // fail.
  const maxAge = 60 * 60 * 24 * 30;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

export function clearAuthTokenCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}

/**
 * Low-level fetch wrapper. Reads the JWT from the cookie, attaches the
 * Authorization header, throws an Error with a user-friendly message on
 * failure, and on 401 clears the cookie + redirects to /signin.
 */
async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${env.apiBaseUrl}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = readTokenFromCookie();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    // Network failure (server down, CORS, etc).
    throw new Error(
      "Couldn't reach ClipFlow. Check your connection and try again.",
    );
  }

  if (response.status === 401) {
    clearAuthTokenCookie();
    if (typeof window !== "undefined" && window.location.pathname !== "/signin") {
      window.location.href = "/signin";
    }
    throw new Error("Your session expired. Sign in again to continue.");
  }

  if (!response.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const data = (await response.json()) as Partial<ApiErrorBody>;
      if (data && typeof data.message === "string" && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // Body wasn't JSON; keep the generic message.
    }
    throw new Error(message);
  }

  // 204 / empty body — return undefined cast to T; callers that hit this
  // path don't read the result.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------- Server-side fetch (RSC) ----------
//
// `request()` above reads the JWT from `document.cookie` (browser-only).
// Server components pass the token explicitly via `cookies()` from
// `next/headers`. This helper mirrors `request()`'s shape so a server
// component and a client component can hit the same endpoint with
// matching error semantics, but skips the 401-redirect path (the
// dashboard's own auth middleware handles missing-token via
// `redirect("/signin")`).
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
    let code = "UNKNOWN";
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as Partial<ApiErrorBody>;
      if (data?.error) code = data.error;
      if (data?.message) message = data.message;
    } catch {
      // body wasn't JSON; keep the generic message
    }
    throw new ServerApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Public typed API surface ----------

export const api = {
  register(body: RegisterRequest): Promise<AuthResponse> {
    return request("POST", "/api/auth/register", body);
  },

  login(body: LoginRequest): Promise<AuthResponse> {
    return request("POST", "/api/auth/login", body);
  },

  logout(): Promise<void> {
    return request<void>("POST", "/api/auth/logout");
  },

  me(): Promise<MeResponse> {
    return request("GET", "/api/auth/me");
  },

  getOnboardingStatus(): Promise<OnboardingStatusResponse> {
    return request("GET", "/api/onboarding/status");
  },

  submitOnboardingProfile(body: UpdateProfileRequest): Promise<UserProfile> {
    return request("POST", "/api/onboarding/profile", body);
  },

  /**
   * Partial update of the onboarding profile. Use for settings-page
   * edits where the user is just changing one or two fields; the
   * onboarding-completion timestamp is not touched.
   */
  patchOnboardingProfile(body: PatchProfileRequest): Promise<UserProfile> {
    return request("PATCH", "/api/onboarding/profile", body);
  },

  // ---------- User bundle (profile + preferences + YouTube) ----------

  /**
   * Single round-trip read of user + profile + preferences + YouTube
   * connection. Returns everything the dashboard chrome needs in one
   * call, used by the auth context on hydration.
   */
  getUserBundle(): Promise<UserBundleResponse> {
    return request("GET", "/api/user/profile");
  },

  /**
   * Narrow YouTube-connection read. Used by /settings/connected so the
   * page can refresh just the connection status without paying for
   * the full bundle.
   */
  getYouTubeConnection(): Promise<YouTubeConnection> {
    return request("GET", "/api/user/youtube-connection");
  },

  /**
   * Get the Google OAuth authorization URL for connecting YouTube.
   */
  getYouTubeOAuthUrl(): Promise<{ url: string }> {
    return request("GET", "/api/youtube/oauth/url");
  },

  /**
   * Connect a YouTube channel by exchanging an OAuth authorization code.
   */
  connectYouTube(code: string): Promise<YouTubeConnection> {
    return request("POST", "/api/youtube/connect", { code });
  },

  /**
   * Disconnect the authenticated user's YouTube channel.
   */
  disconnectYouTube(): Promise<void> {
    return request<void>("DELETE", "/api/youtube/disconnect");
  },

  // ---------- Preferences ----------

  getPreferences(): Promise<UserPreferences> {
    return request("GET", "/api/user/preferences");
  },

  updatePreferences(body: UpdatePreferencesRequest): Promise<UserPreferences> {
    return request("PATCH", "/api/user/preferences", body);
  },

  /**
   * Change the authenticated user's password. Returns void on
   * success; the server responds with 204.
   */
  changePassword(body: ChangePasswordRequest): Promise<void> {
    return request<void>("POST", "/api/user/change-password", body);
  },

  // ---------- Videos (upload → publish) ----------

  /**
   * Mint a `pendingUploadId` and a presigned POST URL the browser uses
   * to upload the file directly to S3/MinIO. **No `Video` row is
   * created at this point** — the row only gets committed after the
   * API confirms the upload via `finalizeUpload` (so an abandoned
   * upload never leaves a row in the DB).
   */
  createVideo(body: CreateVideoRequest): Promise<CreateVideoResponse> {
    return request("POST", "/api/videos", body);
  },

  /**
   * Mint a fresh presigned POST URL for an in-flight upload whose
   * original URL has expired (15 min default).
   */
  getUploadUrl(pendingUploadId: string): Promise<UploadUrlResponse> {
    return request("POST", `/api/videos/pending/${pendingUploadId}/upload-url`);
  },

  /**
   * Notify the API that the browser has finished uploading to S3.
   * The API HEADs the object, validates the size matches the declared
   * size, then creates the `Video` row and (for immediate publishes)
   * enqueues the BullMQ publish job. No row is created if the upload
   * is missing or partial.
   */
  finalizeUpload(pendingUploadId: string): Promise<Video> {
    return request("POST", `/api/videos/pending/${pendingUploadId}/finalize`);
  },

  /**
   * Cancel an in-flight upload: best-effort S3 delete + cache eviction.
   * Idempotent — a missing pending upload returns 204.
   */
  cancelPendingUpload(pendingUploadId: string): Promise<void> {
    return request<void>("DELETE", `/api/videos/pending/${pendingUploadId}`);
  },

  /**
   * List the current user's committed videos, newest first.
   * Pending uploads (in-flight, no row yet) are intentionally not
   * included.
   *
   * `status` is optional; omitting it returns every status. The
   * server validates the value against the `VideoStatus` enum.
   */
  listVideos(params?: { status?: VideoStatus }): Promise<{videos: Video[]}> {
    const qs = params?.status ? `?status=${encodeURIComponent(params.status)}` : "";
    return request("GET", `/api/videos${qs}`);
  },

  /**
   * List the current user's PUBLISHED videos, newest published first.
   * Powers the `/dashboard/published` page. Kept distinct from
   * `listVideos({ status: "PUBLISHED" })` so a future published-only
   * join (e.g. synced stats) can land here without disturbing the
   * generic list path.
   */
  listPublishedVideos(): Promise<{videos: Video[]}> {
    return request("GET", "/api/videos/published");
  },

  /**
   * Read a single committed video.
   */
  getVideo(id: string): Promise<Video> {
    return request("GET", `/api/videos/${id}`);
  },

  /**
   * Cancel + delete a committed, not-yet-published video.
   */
  deleteVideo(id: string): Promise<void> {
    return request<void>("DELETE", `/api/videos/${id}`);
  },

  /**
   * Unpublish a live video: flips `privacyStatus` back to `private`
   * on YouTube and mirrors the change on the row. The row keeps
   * `status = "PUBLISHED"` (a live-but-private video is still a
   * published video from ClipFlow's POV). Returns the updated DTO.
   */
  unpublishVideo(id: string): Promise<Video> {
    return request("POST", `/api/videos/${id}/unpublish`);
  },
} as const;
