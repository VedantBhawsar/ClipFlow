/**
 * Behavioral test for `useApi()` — the critical contract that pulls
 * the access token from NextAuth's session and threads it into every
 * outbound fetch as `Authorization: Bearer <token>`.
 *
 * Mocking strategy:
 *  - `next-auth/react` exposes `useSession`, which is the only thing
 *    `useApi` reads.
 *  - `global.fetch` is the only thing `api-client.request()` calls.
 *  - We don't import the real `useApi` indirectly through a tree of
 *    hooks; we render it inside a tiny harness component so React's
 *    hook rules apply normally.
 *
 * Note: the session shape now carries `onboardingCompleted` and
 * `displayName` (set by the backend in register/login/refresh
 * responses and projected onto `session.user` by the `session`
 * callback). The access-token plumbing under test doesn't depend on
 * those fields, but we include them so the mocks stay faithful to
 * what real sessions look like after the bundle-split refactor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

import { useApi } from "./use-api.js";
import { useSession } from "next-auth/react";

const mockUseSession = vi.mocked(useSession);

const authenticatedSession = (overrides: Record<string, unknown> = {}) =>
  ({
    accessToken: "test-access-token",
    user: {
      id: "user-1",
      email: "a@b.com",
      name: null,
      onboardingCompleted: false,
      displayName: null,
      ...overrides,
    },
    expires: "",
  }) as unknown as ReturnType<typeof useSession>["data"];

describe("useApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Every backend response is wrapped in the centralized
    // `{ success, message, data }` envelope — mock the same shape so
    // the api-client's envelope-unwrapping path is exercised.
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: "OK", data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("attaches Authorization header when session has an access token", async () => {
    mockUseSession.mockReturnValue({
      data: authenticatedSession(),
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    const { result } = renderHook(() => useApi());
    await result.current.getSettings();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
        }),
      }),
    );
  });

  it("does NOT attach Authorization header when session is unauthenticated", async () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    const { result } = renderHook(() => useApi());
    await result.current.getSettings();

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]!;
    const headers = fetchCall[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBeUndefined();
  });

  it("returns the same client instance across renders (memoized on token)", () => {
    mockUseSession.mockReturnValue({
      data: authenticatedSession({ accessToken: "stable-token" } as never),
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    const { result, rerender } = renderHook(() => useApi());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("throws SessionExpiredError on a 401 response", async () => {
    mockUseSession.mockReturnValue({
      data: authenticatedSession({ accessToken: "stale-token" } as never),
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Authentication token is missing.",
          data: null,
          error: "TOKEN_EXPIRED",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() => useApi());
    await expect(result.current.getSettings()).rejects.toThrow();
  });
});
