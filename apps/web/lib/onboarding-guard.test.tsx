import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingGuard } from "./onboarding-guard.js";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: mockReplace,
    push: mockPush,
    refresh: mockRefresh,
  })),
}));

import { useSession, type SessionContextValue } from "next-auth/react";

const mockUseSession = vi.mocked(useSession);

const renderGuard = (
  sessionOverride: Partial<SessionContextValue> | null,
  mode: "require-incomplete" | "require-complete",
) => {
  mockUseSession.mockReturnValue({
    status: "loading",
    data: null,
    update: vi.fn(),
    ...(sessionOverride ?? {}),
  } as SessionContextValue);

  return render(<OnboardingGuard mode={mode}>Protected Content</OnboardingGuard>);
};

describe("OnboardingGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  describe('mode="require-incomplete"', () => {
    it("shows loading while auth is hydrating", () => {
      renderGuard({ status: "loading" }, "require-incomplete");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("renders children when not authenticated (auth check is separate)", () => {
      renderGuard({ status: "unauthenticated" }, "require-incomplete");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("redirects completed users to /dashboard", () => {
      renderGuard(
        {
          status: "authenticated",
          data: {
            user: { onboardingCompleted: true } as never,
            expires: "",
          } as never,
        },
        "require-incomplete",
      );
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    it("renders children when onboarding is not yet completed", () => {
      renderGuard(
        {
          status: "authenticated",
          data: {
            user: { onboardingCompleted: false } as never,
            expires: "",
          } as never,
        },
        "require-incomplete",
      );
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe('mode="require-complete"', () => {
    it("shows loading while auth is hydrating", () => {
      renderGuard({ status: "loading" }, "require-complete");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("renders children when not authenticated (auth check is separate)", () => {
      renderGuard({ status: "unauthenticated" }, "require-complete");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("redirects incomplete users to /onboarding/profile", () => {
      renderGuard(
        {
          status: "authenticated",
          data: {
            user: { onboardingCompleted: false } as never,
            expires: "",
          } as never,
        },
        "require-complete",
      );
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/profile");
    });

    it("renders children when onboarding is completed", () => {
      renderGuard(
        {
          status: "authenticated",
          data: {
            user: { onboardingCompleted: true } as never,
            expires: "",
          } as never,
        },
        "require-complete",
      );
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });
});
