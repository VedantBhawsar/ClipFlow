import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGuard } from "./auth-guard.js";
import type { AuthContextValue } from "./auth-context.js";

vi.mock("./auth-context.js", () => ({
  useAuthContext: vi.fn(),
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
  usePathname: vi.fn(() => "/dashboard"),
}));

import { useAuthContext } from "./auth-context.js";
import { usePathname } from "next/navigation";

const mockUseAuthContext = vi.mocked(useAuthContext);

const renderGuard = (authValue: Partial<AuthContextValue>) => {
  mockUseAuthContext.mockReturnValue({
    status: "loading",
    user: null,
    profile: null,
    onboardingCompleted: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    setOnboardingCompleted: vi.fn(),
    ...authValue,
  } as AuthContextValue);

  return render(<AuthGuard>Protected Content</AuthGuard>);
};

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  it("shows loading state while auth is hydrating", () => {
    renderGuard({ status: "loading" });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    renderGuard({
      status: "authenticated",
    });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("returns null when unauthenticated (redirect handled by useEffect)", () => {
    const { container } = renderGuard({ status: "unauthenticated" });
    expect(container).toBeEmptyDOMElement();
  });

  it("does not redirect when already on /signin", () => {
    vi.mocked(usePathname).mockReturnValue("/signin");
    const { container } = renderGuard({ status: "unauthenticated" });
    expect(container).toBeEmptyDOMElement();
  });

  it("does not redirect when already on /signup", () => {
    vi.mocked(usePathname).mockReturnValue("/signup");
    const { container } = renderGuard({ status: "unauthenticated" });
    expect(container).toBeEmptyDOMElement();
  });
});
