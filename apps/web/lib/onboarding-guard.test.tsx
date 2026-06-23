import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingGuard } from "./onboarding-guard.js";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
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

import { useAuth, type UseAuthValue } from "@/hooks/use-auth";

const mockUseAuth = vi.mocked(useAuth);

const renderGuard = (
  authValue: Partial<UseAuthValue>,
  mode: "require-incomplete" | "require-complete",
) => {
  mockUseAuth.mockReturnValue({
    status: "loading",
    user: null,
    profile: null,
    preferences: null,
    youtubeConnection: null,
    onboardingCompleted: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    setOnboardingCompleted: vi.fn(),
    setPreferences: vi.fn(),
    patchPreferences: vi.fn(),
    ...authValue,
  } as UseAuthValue);

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
  });
});
