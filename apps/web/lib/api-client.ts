import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  OnboardingStatusResponse,
  PatchProfileRequest,
  RegisterRequest,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  UserBundleResponse,
  UserPreferences,
  UserProfile,
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
} as const;
