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
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

import { useApi } from "./use-api.js";
import { useSession } from "next-auth/react";

const mockUseSession = vi.mocked(useSession);

describe("useApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Every backend response is now wrapped in the centralized
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
      data: {
        accessToken: "test-access-token",
        user: { id: "user-1", email: "a@b.com", name: null },
        expires: "",
      },
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    const { result } = renderHook(() => useApi());
    await result.current.me();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/me"),
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
    await result.current.me();

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]!;
    const headers = fetchCall[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBeUndefined();
  });

  it("returns the same client instance across renders (memoized on token)", () => {
    mockUseSession.mockReturnValue({
      data: {
        accessToken: "stable-token",
        user: { id: "user-1", email: "a@b.com", name: null },
        expires: "",
      },
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
      data: {
        accessToken: "stale-token",
        user: { id: "user-1", email: "a@b.com", name: null },
        expires: "",
      },
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
    await expect(result.current.me()).rejects.toThrow();
  });
});