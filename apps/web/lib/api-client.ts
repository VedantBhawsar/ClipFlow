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
  CreateVideoRequest,
  CreateVideoResponse,
  LoginRequest,
  LogoutRequest,
  MeResponse,
  OnboardingStatusResponse,
  PatchProfileRequest,
  RefreshRequest,
  RefreshResponse,
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
  me(): Promise<MeResponse>;

  getOnboardingStatus(): Promise<OnboardingStatusResponse>;
  submitOnboardingProfile(body: UpdateProfileRequest): Promise<UserProfile>;
  patchOnboardingProfile(body: PatchProfileRequest): Promise<UserProfile>;

  getUserBundle(): Promise<UserBundleResponse>;
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
  listVideos(params?: { status?: VideoStatus }): Promise<{ videos: Video[] }>;
  listPublishedVideos(): Promise<{ videos: Video[] }>;
  getVideo(id: string): Promise<Video>;
  deleteVideo(id: string): Promise<void>;
  unpublishVideo(id: string): Promise<Video>;
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
      let message = "Something went wrong. Try again.";
      const failure = await readFailureBody(response);
      if (failure?.message) message = failure.message;
      throw new Error(message);
    }

    // All success paths return the standard envelope; unwrap `data`.
    const envelope = (await response.json()) as ApiResponse<T>;
    if (!envelope.success) {
      // Server sent a 2xx with a failure body — defensive guard so the
      // frontend never hands a `{ success: false }` payload up to a hook.
      throw new Error(envelope.message || "Unexpected response from server.");
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
    me() {
      return request("GET", "/api/auth/me");
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

    getUserBundle() {
      return request("GET", "/api/user/profile");
    },
    getYouTubeConnection() {
      return request("GET", "/api/user/youtube-connection");
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
      return request("GET", "/api/user/preferences");
    },
    updatePreferences(body) {
      return request("PATCH", "/api/user/preferences", body);
    },
    changePassword(body) {
      return request<void>("POST", "/api/user/change-password", body);
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
      const qs = params?.status ? `?status=${encodeURIComponent(params.status)}` : "";
      return request("GET", `/api/videos${qs}`);
    },
    listPublishedVideos() {
      return request("GET", "/api/videos/published");
    },
    getVideo(id) {
      return request("GET", `/api/videos/${id}`);
    },
    deleteVideo(id) {
      return request<void>("DELETE", `/api/videos/${id}`);
    },
    unpublishVideo(id) {
      return request("POST", `/api/videos/${id}/unpublish`);
    },
  };
}